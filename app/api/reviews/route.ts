import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/request-body';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { honeypotFields, honeypotTripped } from '@/lib/honeypot';
import { rateLimited } from '@/lib/rate-limit';
import { ownerNotificationEmails } from '@/lib/store';

export const runtime = 'nodejs';

const schema = z.object({
  slug: z.string().trim().min(1).max(140),
  rating: z.coerce.number().int().min(1).max(5),
  authorName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  title: z.string().trim().max(120).optional().default(''),
  body: z.string().trim().min(15).max(4000),
  /* Spam honeypot, under a name browsers do not autofill — see lib/honeypot.ts
     for why it must never be called `website` again. The old name is still
     accepted there so a cached page or an old bot still trips it. */
  ...honeypotFields
});

export async function POST(request: Request) {
  if (await rateLimited(request, { name: 'reviews', limit: 5, windowMs: 30 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many reviews submitted. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please add your name, a valid email, a rating and a little more detail.' },
        { status: 400 }
      );
    }
    const input = parsed.data;
    if (honeypotTripped(input)) {
      return NextResponse.json({ message: 'Thank you for your review.' });
    }

    const product = await db.product.findFirst({ where: { slug: input.slug, active: true } });
    if (!product)
      return NextResponse.json({ error: 'That product was not found.' }, { status: 404 });

    const email = input.email.toLowerCase();

    /**
     * The badge is never granted from the submitted email alone — nothing proves
     * the reviewer controls that address, so anyone who knew a customer's email
     * could publish a review carrying it. The dashboard shows Tammy whether the
     * address matches a paid order and she applies the badge during moderation.
     */
    const review = await db.review.create({
      data: {
        productId: product.id,
        authorName: input.authorName,
        email,
        rating: input.rating,
        title: input.title || null,
        body: input.body,
        verifiedPurchase: false,
        status: 'PENDING'
      }
    });

    await sendEmail({
      to: ownerNotificationEmails(),
      kind: 'REVIEW',
      subject: `New review awaiting approval: ${product.name}`,
      replyTo: email,
      idempotencyKey: `review-admin/${review.id}`,
      html: emailShell(
        'A review needs your approval',
        `<p><strong>${escapeHtml(input.authorName)}</strong> rated <strong>${escapeHtml(product.name)}</strong> ${input.rating} out of 5.</p>${input.title ? `<p><strong>${escapeHtml(input.title)}</strong></p>` : ''}<p style="white-space:pre-line">${escapeHtml(input.body)}</p><p>Approve or hide it in the owner dashboard.</p>`
      )
    });

    return NextResponse.json({
      message: 'Thank you — your review will appear once we have read it.'
    });
  } catch (error) {
    console.error('Unable to save review', error);
    return NextResponse.json(
      { error: 'We could not save that review right now.' },
      { status: 500 }
    );
  }
}
