import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCartRestoreToken,
  cartRestoreDropped,
  readCartRestoreToken
} from '@/lib/cart-restore';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { rateLimited } from '@/lib/rate-limit';
import { findSize, productSizes, sizeAvailable, sizeChoiceRejected } from '@/lib/product-sizes';
import { absoluteUrl, clampQuantity } from '@/lib/store';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().trim().email().max(254),
  subtotalCents: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  items: z
    .array(
      z.object({
        slug: z.string().max(140),
        quantity: z.coerce.number().int().min(1).max(50),
        size: z.string().max(60).optional()
      })
    )
    .max(50)
    .optional()
    .default([]),
  subscribe: z.boolean().optional().default(false),
  /**
   * Honeypot. Bounded rather than required-empty: `max(0)` made a filled
   * honeypot fail schema validation and return 400, which meant the quiet-success
   * branch below could never run and a bot was told plainly that the field was
   * the problem. The cap keeps it from being used to post a payload.
   */
  website: z.string().max(200).optional().default('')
});

async function emailSavedCart(
  email: string,
  items: Array<{ slug: string; quantity: number; size?: string }>,
  subtotalCents: number
) {
  const token = createCartRestoreToken(email, items);
  if (!token) return { sent: false as const, reason: 'not-configured' as const };

  const restoreUrl = absoluteUrl(`/cart?restore=${encodeURIComponent(token)}`);
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const itemDigest = crypto
    .createHash('sha256')
    .update(
      items
        .map((item) => `${item.slug}:${item.quantity}`)
        .sort()
        .join('|')
    )
    .digest('hex')
    .slice(0, 16);
  return sendEmail({
    to: email,
    kind: 'CART_RECOVERY',
    subject: 'Your saved cart at The Hillside Gardens',
    html: emailShell(
      'Your cart is waiting',
      `<p>You asked us to email this basket so you could come back to it.</p><p>${count} ${count === 1 ? 'item' : 'items'} · about ${(subtotalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} before shipping.</p><p style="margin:24px 0"><a href="${escapeHtml(restoreUrl)}" style="display:inline-block;padding:13px 20px;border-radius:6px;background:#203f2b;color:#ffffff;text-decoration:none;font-weight:700">Restore my cart</a></p><p>The link works for 30 days, on this device or another.</p>`
    ),
    idempotencyKey: `cart-lead/${email}/${itemDigest}`
  });
}

/**
 * Carts live in the browser, so an abandoned one used to be unrecoverable and
 * invisible. Saving the basket against an email address makes a reminder
 * possible and lets a customer pick the cart up on another device.
 */
export async function POST(request: Request) {
  if (rateLimited(request, { name: 'cart-lead', limit: 10, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const input = parsed.data;
    if (input.website) return NextResponse.json({ message: 'Saved.' });

    const email = input.email.toLowerCase();
    const items = input.items.map((item) => ({
      slug: item.slug,
      quantity: Math.max(1, Math.min(20, item.quantity)),
      ...(item.size ? { size: item.size } : {})
    }));

    await db.cartLead.upsert({
      where: { email },
      update: {
        itemsJson: JSON.stringify(items),
        subtotalCents: input.subtotalCents,
        recoveredAt: null
      },
      create: {
        email,
        itemsJson: JSON.stringify(items),
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

    const delivery = await emailSavedCart(email, items, input.subtotalCents);
    if (!delivery.sent) {
      return NextResponse.json({
        message:
          'Saved on this device. We could not email the restore link just now — you can still check out from here.'
      });
    }

    return NextResponse.json({
      message: 'Saved — check your email for a link to restore this cart on any device.'
    });
  } catch (error) {
    console.error('Unable to save cart lead', error);
    return NextResponse.json({ error: 'We could not save your cart right now.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (rateLimited(request, { name: 'cart-restore', limit: 20, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = readCartRestoreToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: 'That restore link is invalid or has expired.' },
      { status: 400 }
    );
  }

  const products = await db.product.findMany({
    where: { active: true, slug: { in: payload.items.map((item) => item.slug) } },
    select: {
      slug: true,
      name: true,
      priceCents: true,
      imageUrl: true,
      inventory: true,
      type: true,
      ships: true,
      pickup: true,
      sizes: true
    }
  });

  const requestedPieces = payload.items;
  const items = payload.items.flatMap((requested) => {
    const product = products.find((candidate) => candidate.slug === requested.slug);
    if (!product || product.inventory <= 0) return [];
    /**
     * A size the shop has since retired cannot be restored: the price behind it
     * is gone, so the line is dropped and counted as dropped rather than
     * silently coming back as a size the customer never chose.
     */
    const sizes = productSizes(product.sizes, product.priceCents);
    if (sizeChoiceRejected(sizes, requested.size)) return [];
    const chosen = findSize(sizes, requested.size);
    // A size that has since sold out comes back as dropped rather than as a
    // line the shopper would only lose again at checkout.
    const available = sizeAvailable(chosen, product.inventory);
    if (available <= 0) return [];
    return [
      {
        slug: product.slug,
        name: product.name,
        priceCents: chosen?.priceCents ?? product.priceCents,
        imageUrl: product.imageUrl,
        inventory: available,
        type: product.type,
        ships: product.ships,
        pickup: product.pickup,
        size: chosen?.label || null,
        quantity: clampQuantity(requested.quantity, available)
      }
    ];
  });

  await db.cartLead.updateMany({
    where: { email: payload.email, recoveredAt: null },
    data: { recoveredAt: new Date() }
  });

  const dropped = cartRestoreDropped(requestedPieces, items);
  return NextResponse.json({
    email: payload.email,
    items,
    dropped,
    message:
      dropped > 0
        ? 'Some saved pieces are no longer on the bench and could not be restored.'
        : undefined
  });
}
