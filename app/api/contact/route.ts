import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { rateLimited } from '@/lib/rate-limit';
import { businessEmail as hillsideBusinessEmail } from '@/lib/store';

export const runtime = 'nodejs';

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(5000),
  /**
   * Honeypot. Bounded rather than required-empty: `max(0)` made a filled
   * honeypot fail schema validation and return 400, which meant the quiet-success
   * branch below could never run and a bot was told plainly that the field was
   * the problem. The cap keeps it from being used to post a payload.
   */
  website: z.string().max(200).optional().default('')
});

export async function POST(request: Request) {
  /**
   * This route sends two emails per request — one to the business, one to the
   * address in the request body — through the shop's Resend key. Unthrottled it
   * is an open relay: an anonymous caller could send unlimited mail to arbitrary
   * recipients from the shop's own domain, flood the owner's inbox, and write an
   * unbounded number of rows. The lasting damage is to sender reputation, which
   * would silently take down the order and class-access email the business runs on.
   */
  if (rateLimited(request, { name: 'contact', limit: 5, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many messages sent. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please enter your name, a valid email and a little more detail.' },
        { status: 400 }
      );
    }
    const { name, email, subject, message, website } = parsed.data;
    const phone = parsed.data.phone || null;
    if (website) return NextResponse.json({ message: 'Thanks for your message.' });

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
