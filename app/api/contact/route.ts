import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { businessEmail as hillsideBusinessEmail } from '@/lib/store';

export const runtime = 'nodejs';

function value(body: Record<string, unknown>, key: string) {
  return String(body[key] || '').trim();
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Please complete the contact form.' }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    if (value(data, 'website')) return NextResponse.json({ message: 'Thanks for your message.' });

    const name = value(data, 'name').slice(0, 120);
    const email = value(data, 'email').toLowerCase().slice(0, 254);
    const phone = value(data, 'phone').slice(0, 40) || null;
    const subject = value(data, 'subject').slice(0, 160);
    const message = value(data, 'message').slice(0, 5000);
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name || !emailLooksValid || !subject || message.length < 10) {
      return NextResponse.json(
        { error: 'Please enter your name, a valid email and a little more detail.' },
        { status: 400 }
      );
    }

    const saved = await db.contactMessage.create({
      data: { name, email, phone, subject, message }
    });

    const businessEmail = hillsideBusinessEmail();
    await Promise.all([
      sendEmail({
        to: businessEmail,
        subject: `Website message: ${subject}`,
        replyTo: email,
        idempotencyKey: `contact-admin/${saved.id}`,
        html: emailShell(
          'New website message',
          `<p><strong>From:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(email)}${phone ? `<br><strong>Phone:</strong> ${escapeHtml(phone)}` : ''}<br><strong>Topic:</strong> ${escapeHtml(subject)}</p><p style="white-space:pre-line">${escapeHtml(message)}</p><p>This message is also saved in the Hillside owner dashboard.</p>`
        )
      }),
      sendEmail({
        to: email,
        subject: 'We received your Hillside Gardens message',
        idempotencyKey: `contact-customer/${saved.id}`,
        html: emailShell(
          'Thanks for reaching out',
          `<p>Hi ${escapeHtml(name)},</p><p>Your message reached The Hillside Gardens. We will review it and respond as soon as we can.</p><p><strong>Your topic:</strong> ${escapeHtml(subject)}</p><p>In the meantime, the website’s plant care library may have a quick answer for common houseplant questions.</p>`
        )
      })
    ]);

    return NextResponse.json({ message: 'Thanks — we received your message.' });
  } catch (error) {
    console.error('Contact form failed', error);
    return NextResponse.json({ error: 'The message could not be sent. Please try again.' }, { status: 500 });
  }
}
