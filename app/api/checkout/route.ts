import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { normalizeHillsideDomain } from '@/lib/store';

export const runtime = 'nodejs';

type RequestedItem = { id: string; quantity: number };

function readItems(body: unknown): RequestedItem[] {
  if (!body || typeof body !== 'object' || !('items' in body)) return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as { id?: unknown; quantity?: unknown };
    const id = String(raw.id || '').trim();
    if (!id) return [];
    return [{ id, quantity: Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1))) }];
  });
}

export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 });

    const body: unknown = await request.json();
    const requested = readItems(body);
    if (!requested.length) return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });

    const products = await db.product.findMany({
      where: { active: true, slug: { in: requested.map((item) => item.id) } }
    });

    const items = requested.flatMap((requestedItem) => {
      const product = products.find((candidate) => candidate.slug === requestedItem.id);
      if (!product || product.inventory <= 0) return [];
      return [{ product, quantity: Math.min(requestedItem.quantity, product.inventory) }];
    });

    if (!items.length) {
      return NextResponse.json(
        { error: 'The selected items are unavailable or sold out.' },
        { status: 400 }
      );
    }

    const subtotalCents = items.reduce(
      (total, item) => total + item.product.priceCents * item.quantity,
      0
    );
    const freeShippingThreshold = Math.max(
      0,
      Number(process.env.FREE_SHIPPING_THRESHOLD_CENTS || 7500)
    );
    const flatShippingCents = Math.max(0, Number(process.env.FLAT_SHIPPING_CENTS || 895));
    const shippingCents =
      freeShippingThreshold > 0 && subtotalCents >= freeShippingThreshold ? 0 : flatShippingCents;
    const invoiceNumber = `HG-${Date.now().toString().slice(-8)}`;
    const site = normalizeHillsideDomain(
      process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    );
    const stripe = new Stripe(secret);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: invoiceNumber,
      customer_creation: 'always',
      line_items: items.map(({ product, quantity }) => ({
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: product.priceCents,
          product_data: {
            name: product.name,
            description: product.shortDescription || product.description || undefined,
            images: product.imageUrl ? [product.imageUrl] : undefined,
            metadata: { hillsideProductId: product.id, hillsideSlug: product.slug }
          }
        }
      })),
      success_url: `${site}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cart`,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shippingCents, currency: 'usd' },
            display_name: shippingCents === 0 ? 'Free standard shipping' : 'Standard shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 }
            }
          }
        }
      ],
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
      invoice_creation: { enabled: true },
      allow_promotion_codes: true,
      payment_intent_data: {
        description: `The Hillside Gardens ${invoiceNumber}`,
        metadata: { invoiceNumber, kind: 'PRODUCT_ORDER' }
      },
      custom_text: {
        shipping_address: {
          message: 'Plants and temperature-sensitive goods are packed with care. We may contact you if weather could delay safe shipment.'
        },
        submit: { message: 'You will receive an emailed receipt and invoice after payment.' }
      },
      metadata: {
        kind: 'PRODUCT_ORDER',
        invoiceNumber,
        items: JSON.stringify(items.map(({ product, quantity }) => ({ id: product.slug, q: quantity })))
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Unable to create checkout session', error);
    return NextResponse.json({ error: 'Unable to start checkout. Please try again.' }, { status: 500 });
  }
}
