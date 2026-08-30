import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { allowedContactSubjects, type ContactSubject } from '@/lib/contact';
import { honeypotFields, honeypotTripped } from '@/lib/honeypot';
import { rateLimited } from '@/lib/rate-limit';
import { reportError } from '@/lib/report-error';
import { ownerNotificationEmails } from '@/lib/store';

export const runtime = 'nodejs';

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine((value): value is ContactSubject =>
      allowedContactSubjects().includes(value as ContactSubject)
    ),
  message: z.string().trim().min(10).max(5000),
  /* Spam honeypot, under a name browsers do not autofill — see lib/honeypot.ts
     for why it must never be called `website` again. The old name is still
     accepted there so a cached page or an old bot still trips it. */
  ...honeypotFields
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
  if (await rateLimited(request, { name: 'contact', limit: 5, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many messages sent. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Please enter your name, a valid email and a little more detail.' },
        { status: 400 }
      );
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please enter your name, a valid email and a little more detail.' },
        { status: 400 }
      );
    }
    const { name, email, subject, message } = parsed.data;
    const phone = parsed.data.phone || null;
    if (honeypotTripped(parsed.data)) {
      return NextResponse.json({ message: 'Thanks for your message.' });
    }

    const saved = await db.contactMessage.create({
      data: { name, email, phone, subject, message }
    });

    await Promise.all([
      sendEmail({
        to: ownerNotificationEmails(),
        kind: 'CONTACT',
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
        kind: 'CONTACT',
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
    // The form is the shop's only inbox for someone who is not yet a customer.
    // A failure here is a message that was never received and never will be:
    // the sender is told to try again, and most of them simply will not.
    reportError('Contact form failed', error);
    return NextResponse.json(
      { error: 'The message could not be sent. Please try again.' },
      { status: 500 }
    );
  }
}
