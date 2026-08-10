import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().trim().email().max(254),
  subtotalCents: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  items: z
    .array(z.object({ slug: z.string().max(140), quantity: z.coerce.number().int().min(1).max(50) }))
    .max(50)
    .optional()
    .default([]),
  subscribe: z.boolean().optional().default(false),
  website: z.string().max(0).optional().default('')
});

/**
 * Carts live in the browser, so an abandoned one used to be unrecoverable and
 * invisible. Saving the basket against an email address makes a reminder
 * possible and lets a customer pick the cart up on another device.
 */
export async function POST(request: Request) {
  if (rateLimited(request, { name: 'cart-lead', limit: 10, windowMs: 15 * 60_000 })) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const input = parsed.data;
    if (input.website) return NextResponse.json({ message: 'Saved.' });

    const email = input.email.toLowerCase();
    await db.cartLead.upsert({
      where: { email },
      update: {
        itemsJson: JSON.stringify(input.items),
        subtotalCents: input.subtotalCents,
        recoveredAt: null
      },
      create: {
        email,
        itemsJson: JSON.stringify(input.items),
        subtotalCents: input.subtotalCents
      }
    });

    if (input.subscribe) {
      await db.newsletterSubscriber.upsert({
        where: { email },
        update: { active: true, unsubscribedAt: null },
        create: { email, source: 'cart' }
      });
    }

    return NextResponse.json({ message: 'Saved — we can send you a reminder if you head off.' });
  } catch (error) {
    console.error('Unable to save cart lead', error);
    return NextResponse.json({ error: 'We could not save your cart right now.' }, { status: 500 });
  }
}
