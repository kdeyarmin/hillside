import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hasFormBody, readJsonOrFormBody } from '@/lib/request-body';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { honeypotFields, honeypotTripped } from '@/lib/honeypot';
import { unsubscribeUrl } from '@/lib/newsletter';
import { readNewsletterSource, readNewsletterSourceDetail } from '@/lib/newsletter-source';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  /**
   * `nullish`, not `optional`: a client that has no name to send may leave the
   * key out or send it as null, and both mean the same thing here. Refusing the
   * null answered a signup with "please enter a valid email address", naming the
   * one field that was fine.
   */
  name: z.string().trim().max(120).nullish(),
  /* Spam honeypot, under a name browsers do not autofill — see lib/honeypot.ts
     for why it must never be called `website` again. The old name is still
     accepted there so a cached page or an old bot still trips it. */
  ...honeypotFields,
  /**
   * Which form this was, and the page it was on. Both are bounded here and
   * narrowed to a known placement and a plain site path below — they land in a
   * column the owner reads, so neither is stored as posted.
   */
  source: z.string().max(60).optional().default(''),
  sourceDetail: z.string().max(200).optional().default('')
});

const SIGNUP_WINDOW_MS = 15 * 60_000;
const SIGNUP_LIMIT = 30;

type FormResult = 'done' | 'email-delayed' | 'invalid' | 'limited' | 'unavailable';

/** A fixed same-site destination for the native, no-JavaScript form fallback. */
function formReply(request: Request, result: FormResult) {
  const next = new URL(`/newsletter/subscribed?status=${result}`, request.url);
  return NextResponse.redirect(next, 303);
}

export async function POST(request: Request) {
  const nativeForm = hasFormBody(request);
  // Sends a welcome email to whatever address is posted, so the same open-relay
  // reasoning as /api/contact applies. Varying the address defeated the partial
  // self-limiting the "already subscribed" check happened to provide. Thirty
  // still caps that relay, while allowing a table full of people behind the
  // same festival or shop Wi-Fi to join without the sixth person being refused.
  if (
    await rateLimited(request, {
      name: 'newsletter',
      limit: SIGNUP_LIMIT,
      windowMs: SIGNUP_WINDOW_MS
    })
  ) {
    if (nativeForm) return formReply(request, 'limited');
    return NextResponse.json(
      { error: 'Too many signups from this connection. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(SIGNUP_WINDOW_MS / 1000) } }
    );
  }

  try {
    const parsed = requestSchema.safeParse(await readJsonOrFormBody(request));
    if (!parsed.success) {
      if (nativeForm) return formReply(request, 'invalid');
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const { email } = parsed.data;
    const name = parsed.data.name || null;
    if (honeypotTripped(parsed.data)) {
      if (nativeForm) return formReply(request, 'done');
      return NextResponse.json({ message: 'You’re on the list.' });
    }

    const source = readNewsletterSource(parsed.data.source);
    const sourceDetail = readNewsletterSourceDetail(parsed.data.sourceDetail);

    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    const subscriber = await db.newsletterSubscriber.upsert({
      where: { email },
      /**
       * A resubscribe keeps the source it first arrived with. That row is the
       * record of which form won the address; overwriting it with whichever
       * form they happened to use the second time would quietly rewrite the
       * history the breakdown is counted from.
       */
      update: { name: name || existing?.name || null, active: true, unsubscribedAt: null },
      create: { email, name, source, sourceDetail }
    });

    let welcomeDelayed = false;
    if (!existing || !existing.active) {
      const optOut = unsubscribeUrl(email);
      const delivery = await sendEmail({
        to: email,
        kind: 'NEWSLETTER',
        subject: 'Welcome to The Hillside Notes',
        idempotencyKey: `newsletter-welcome/${subscriber.id}`,
        html: emailShell(
          'Welcome to The Hillside Notes',
          `<p>${name ? `Hi ${escapeHtml(name)},` : 'Hello,'}</p><p>You’re on our list for seasonal plant tips, plant care and new arrivals from The Hillside Gardens.</p><p>Messages will be occasional and useful — never a daily flood.</p>`,
          optOut ? { unsubscribeUrl: optOut } : undefined
        )
      });
      welcomeDelayed = !delivery.sent;
    }

    if (nativeForm) return formReply(request, welcomeDelayed ? 'email-delayed' : 'done');
    return NextResponse.json({
      message: welcomeDelayed
        ? 'You’re on the list. Your signup is saved; the welcome email may take a little longer.'
        : 'You’re on the list. Welcome to The Hillside Notes.'
    });
  } catch (error) {
    console.error('Newsletter signup failed', error);
    if (nativeForm) return formReply(request, 'unavailable');
    return NextResponse.json({ error: 'Unable to join the list right now.' }, { status: 500 });
  }
}
