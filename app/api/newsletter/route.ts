import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Please enter an email address.' }, { status: 400 });
    }
    const data = body as { email?: unknown; name?: unknown; website?: unknown };
    if (String(data.website || '').trim()) return NextResponse.json({ message: 'You’re on the list.' });

    const email = String(data.email || '').trim().toLowerCase().slice(0, 254);
    const name = String(data.name || '').trim().slice(0, 120) || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    const subscriber = await db.newsletterSubscriber.upsert({
      where: { email },
      update: { name: name || existing?.name || null, active: true, unsubscribedAt: null },
      create: { email, name, source: 'website' }
    });

    if (!existing || !existing.active) {
      await sendEmail({
        to: email,
        subject: 'Welcome to The Hillside Notes',
        idempotencyKey: `newsletter-welcome/${subscriber.id}`,
        html: emailShell(
          'Welcome to The Hillside Notes',
          `<p>${name ? `Hi ${escapeHtml(name)},` : 'Hello,'}</p><p>You’re on Tammy’s list for seasonal plant tips, class dates and new arrivals from The Hillside Gardens.</p><p>Messages will be occasional and useful — never a daily flood.</p>`
        )
      });
    }

    return NextResponse.json({ message: 'You’re on the list. Welcome to The Hillside Notes.' });
  } catch (error) {
    console.error('Newsletter signup failed', error);
    return NextResponse.json({ error: 'Unable to join the list right now.' }, { status: 500 });
  }
}
