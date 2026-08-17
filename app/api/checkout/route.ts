import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  attachStripeSessionToOrder,
  checkoutAdjustments,
  encodeCheckoutItems,
  holdExpiryUnix,
  InsufficientStockError,
  readCheckoutItems,
  releaseExpiredProductHolds,
  releaseProductHold,
  reserveProductOrder,
  stripeProductDescription,
  stripeProductImages
} from '@/lib/checkout';
import { rateLimited } from '@/lib/rate-limit';
import { checkoutReturnOrigin, newInvoiceNumber } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // Each call creates a real Stripe Checkout Session. Unthrottled, that is an
    // unbounded write into the shop's Stripe account from an anonymous caller.
    if (rateLimited(request, { name: 'checkout', limit: 8, windowMs: 10 * 60_000 })) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 });

    await releaseExpiredProductHolds();

    const body: unknown = await request.json();
    const requested = readCheckoutItems(body);
    if (!requested.length) return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });

    const products = await db.product.findMany({
      where: { active: true, slug: { in: requested.map((item) => item.id) } }
    });

    /**
     * Anything the server had to change is reported back rather than applied
     * silently, so the customer confirms the corrected basket before paying.
     * Price changes used to skip this path: the drawer showed the old figure
     * and Stripe charged the new one.
     */
    const adjustments = checkoutAdjustments(requested, products);
    if (adjustments.length) {
      return NextResponse.json({ adjustments }, { status: 409 });
    }

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
    const invoiceNumber = newInvoiceNumber();
    const site = checkoutReturnOrigin();
    const stripe = new Stripe(secret);

    if (rateLimited(request, { name: 'checkout-hold', limit: 3, windowMs: 35 * 60_000 })) {
      return NextResponse.json(
        { error: 'Please finish or wait for an open checkout before starting another.' },
        { status: 429 }
      );
    }

    let reservation: Awaited<ReturnType<typeof reserveProductOrder>>;
    try {
      reservation = await reserveProductOrder({
        invoiceNumber,
        items,
        subtotalCents,
        shippingCents
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        const latest = await db.product.findUnique({
          where: { slug: error.slug },
          select: { name: true, inventory: true }
        });
        const requested = items.find((item) => item.product.slug === error.slug);
        return NextResponse.json(
          {
            adjustments: [
              {
                slug: error.slug,
                name: latest?.name || requested?.product.name || 'That item',
                requested: requested?.quantity || 1,
                available: Math.max(0, latest?.inventory ?? 0),
                reason: 'stock' as const
              }
            ]
          },
          { status: 409 }
        );
      }
      throw error;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
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
              description: stripeProductDescription(product.shortDescription || product.description),
              images: stripeProductImages(product.imageUrl),
              metadata: { hillsideProductId: product.id, hillsideSlug: product.slug }
            }
          }
        })),
        /**
         * Expires with the inventory hold. Left at Stripe's 24-hour default, a
         * customer could pay long after abandoned-checkout stock had been
         * returned to the shelf and sold to someone else.
         */
        expires_at: holdExpiryUnix(reservation.expiresAt),
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
        consent_collection: { promotions: 'auto' },
        payment_intent_data: {
          description: `The Hillside Gardens ${invoiceNumber}`,
          metadata: { invoiceNumber, kind: 'PRODUCT_ORDER', orderId: reservation.order.id }
        },
        custom_text: {
          shipping_address: {
            message:
              'Plants and temperature-sensitive goods are packed with care. We may contact you if weather could delay safe shipment.'
          },
          submit: { message: 'You will receive an emailed receipt and invoice after payment.' }
        },
        metadata: {
          kind: 'PRODUCT_ORDER',
          invoiceNumber,
          orderId: reservation.order.id,
          held: '1',
          /**
           * Compact backup. Fulfillment prefers the reserved order and Stripe
           * line items; this remains so sessions already in flight during a
           * deploy still resolve if the hold row is missing.
           */
          items: encodeCheckoutItems(items)
        }
      });

      try {
        await attachStripeSessionToOrder(reservation.holdId, session.id);
      } catch (error) {
        /**
         * The session exists and stock is already held against orderId. The
         * webhook looks the order up by metadata.orderId if this attach fails.
         */
        console.error('Unable to attach Stripe session to reserved order', error);
      }
    } catch (error) {
      await releaseProductHold(reservation.order.id);
      throw error;
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Unable to create checkout session', error);
    return NextResponse.json({ error: 'Unable to start checkout. Please try again.' }, { status: 500 });
  }
}
