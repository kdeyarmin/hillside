import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { unsubscribeUrl } from '@/lib/newsletter';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional().default(''),
  /**
   * Honeypot. Bounded rather than required-empty: `max(0)` made a filled
   * honeypot fail schema validation and return 400, which meant the quiet-success
   * branch below could never run and a bot was told plainly that the field was
   * the problem. The cap keeps it from being used to post a payload.
   */
  website: z.string().max(200).optional().default('')
});

export async function POST(request: Request) {
  // Sends a welcome email to whatever address is posted, so the same open-relay
  // reasoning as /api/contact applies. Varying the address defeated the partial
  // self-limiting the "already subscribed" check happened to provide.
  if (rateLimited(request, { name: 'newsletter', limit: 5, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many signups from this connection. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const { email, website } = parsed.data;
    const name = parsed.data.name || null;
    if (website) return NextResponse.json({ message: 'You’re on the list.' });

    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    const subscriber = await db.newsletterSubscriber.upsert({
      where: { email },
      update: { name: name || existing?.name || null, active: true, unsubscribedAt: null },
      create: { email, name, source: 'website' }
    });

    if (!existing || !existing.active) {
      const optOut = unsubscribeUrl(email);
      await sendEmail({
        to: email,
        subject: 'Welcome to The Hillside Notes',
        idempotencyKey: `newsletter-welcome/${subscriber.id}`,
        html: emailShell(
          'Welcome to The Hillside Notes',
          `<p>${name ? `Hi ${escapeHtml(name)},` : 'Hello,'}</p><p>You’re on our list for seasonal plant tips, plant care and new arrivals from The Hillside Gardens.</p><p>Messages will be occasional and useful — never a daily flood.</p>`,
          optOut ? { unsubscribeUrl: optOut } : undefined
        )
      });
    }

    return NextResponse.json({ message: 'You’re on the list. Welcome to The Hillside Notes.' });
  } catch (error) {
    console.error('Newsletter signup failed', error);
    return NextResponse.json({ error: 'Unable to join the list right now.' }, { status: 500 });
  }
}
