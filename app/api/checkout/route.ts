import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  attachStripeSessionToOrder,
  checkoutAdjustments,
  holdExpiryUnix,
  InsufficientStockError,
  readCheckoutItems,
  releaseExpiredProductHolds,
  releaseProductHold,
  reserveProductOrder,
  stripeCheckoutItemsMetadata,
  stripeProductDescription,
  stripeProductImages
} from '@/lib/checkout';
import {
  findSize,
  productSizes,
  sizeAvailable,
  sizeChoiceRejected,
  sizedName
} from '@/lib/product-sizes';
import { rateLimited } from '@/lib/rate-limit';
import {
  checkoutReturnOrigin,
  flatShippingCents,
  freeShippingThresholdCents,
  newInvoiceNumber
} from '@/lib/store';
import {
  cartFulfillment,
  pickupTaxOrigin,
  readFulfillmentChoice,
  readGiftMessage,
  readPickupArranged,
  resolveFulfillment,
  shippingMethodLabel
} from '@/lib/fulfillment';

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
    if (!secret)
      return NextResponse.json({ error: 'Stripe is not configured yet.' }, { status: 503 });

    await releaseExpiredProductHolds();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Your cart could not be read. Please try again.' },
        { status: 400 }
      );
    }
    const requested = readCheckoutItems(body);
    if (!requested.length)
      return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });

    const products = await db.product.findMany({
      where: { slug: { in: requested.map((item) => item.id) } }
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

    /**
     * Prices are taken from the product and its size list, never from the
     * basket: the browser sends what it displayed only so a stale figure can be
     * reported back as an adjustment above, not so it can set the charge.
     */
    const items = requested.flatMap((requestedItem) => {
      const product = products.find((candidate) => candidate.slug === requestedItem.id);
      if (!product || !product.active || product.inventory <= 0) return [];
      const sizes = productSizes(product.sizes, product.priceCents, {
        sku: product.sku,
        imageUrl: product.imageUrl,
        ships: product.ships,
        pickup: product.pickup
      });
      if (sizeChoiceRejected(sizes, requestedItem.size)) return [];
      const chosen = findSize(sizes, requestedItem.size);
      // Against the chosen size's own count where the owner keeps one, so a
      // plant with plenty of 4" pots cannot back a line of 6" ones.
      const available = sizeAvailable(chosen, product.inventory);
      if (available <= 0) return [];
      return [
        {
          product,
          quantity: Math.min(requestedItem.quantity, available),
          size: chosen?.label || null,
          unitCents: chosen?.priceCents ?? product.priceCents,
          /**
           * Resolved here rather than at the product, because a variant may get
           * home differently from the product it belongs to and it is the
           * variant the customer is buying.
           */
          ships: chosen ? chosen.ships : product.ships,
          pickup: chosen ? chosen.pickup : product.pickup,
          imageUrl: chosen?.imageUrl ?? product.imageUrl
        }
      ];
    });

    if (!items.length) {
      return NextResponse.json(
        { error: 'The selected items are unavailable or sold out.' },
        { status: 400 }
      );
    }

    const fulfillment = resolveFulfillment(
      readFulfillmentChoice(body),
      // The lines, not the products: a cart holding a pickup-only specimen and a
      // pot that ships is a conflict even though both come off the same product.
      cartFulfillment(items),
      readPickupArranged(body)
    );
    if (!fulfillment.ok) {
      return NextResponse.json({ error: fulfillment.error }, { status: 400 });
    }

    const giftMessage = readGiftMessage(body);
    const pickup = fulfillment.method === 'PICKUP';

    // Sized lines are charged their size's price, so the subtotal is summed
    // from the resolved unit price rather than from the product's own.
    const subtotalCents = items.reduce((total, item) => total + item.unitCents * item.quantity, 0);
    const freeShippingThreshold = freeShippingThresholdCents();
    const shippingCents = pickup
      ? 0
      : freeShippingThreshold > 0 && subtotalCents >= freeShippingThreshold
        ? 0
        : flatShippingCents();
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
        shippingCents,
        fulfillmentMethod: fulfillment.method,
        giftMessage
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        /**
         * Stock fell between the check above and the reservation. The whole
         * basket is priced against the shelf again rather than only the line
         * that failed: sizes of one product share a stock count, so answering
         * with that product's total would tell a 6" line it could have every
         * jar the 4" line beside it is already claiming, and the correction
         * would bounce straight back.
         */
        const latest = await db.product.findMany({
          where: { slug: { in: requested.map((item) => item.id) } }
        });
        const corrections = checkoutAdjustments(requested, latest);
        if (corrections.length) {
          return NextResponse.json({ adjustments: corrections }, { status: 409 });
        }
        // Stock came back before we could read it. Nothing to correct, so the
        // basket stands and the customer only has to ask again.
        return NextResponse.json(
          {
            error: `${sizedName(
              latest.find((product) => product.slug === error.slug)?.name || 'An item',
              error.size
            )} was claimed while we were reserving your basket. Please try checkout again.`
          },
          { status: 409 }
        );
      }
      throw error;
    }

    const itemsSnapshot = stripeCheckoutItemsMetadata(items);

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: invoiceNumber,
        customer_creation: 'always',
        line_items: items.map(({ product, quantity, size, unitCents, imageUrl }) => ({
          quantity,
          price_data: {
            currency: 'usd',
            unit_amount: unitCents,
            product_data: {
              // The size belongs in the name so it reaches the Stripe receipt,
              // the invoice and the dashboard, none of which read metadata.
              name: sizedName(product.name, size),
              description: stripeProductDescription(
                product.shortDescription || product.description
              ),
              images: stripeProductImages(imageUrl ?? product.imageUrl),
              metadata: {
                hillsideProductId: product.id,
                hillsideSlug: product.slug,
                ...(size ? { hillsideSize: size } : {})
              }
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
        /**
         * Cancel used to land on a bare `/cart` with the hold still live.
         * Stripe does not emit `checkout.session.expired` when the customer
         * clicks Cancel — only when `expires_at` hits — so stock stayed
         * invisible for 35 minutes and a second checkout would 409. The
         * cart page expires this session and releases the hold immediately.
         */
        cancel_url: `${site}/cart?canceled={CHECKOUT_SESSION_ID}`,
        billing_address_collection: pickup ? 'required' : 'auto',
        ...(pickup
          ? {
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: 'fixed_amount' as const,
                    fixed_amount: { amount: 0, currency: 'usd' },
                    display_name: 'Local pickup'
                  }
                }
              ]
            }
          : {
              shipping_address_collection: { allowed_countries: ['US'] as const },
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: 'fixed_amount' as const,
                    fixed_amount: { amount: shippingCents, currency: 'usd' },
                    display_name: shippingMethodLabel('SHIP', shippingCents),
                    delivery_estimate: {
                      minimum: { unit: 'business_day' as const, value: 3 },
                      maximum: { unit: 'business_day' as const, value: 7 }
                    }
                  }
                }
              ]
            }),
        phone_number_collection: { enabled: true },
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
        invoice_creation: { enabled: true },
        allow_promotion_codes: true,
        consent_collection: { promotions: 'auto' },
        payment_intent_data: {
          description: `The Hillside Gardens ${invoiceNumber}`,
          metadata: {
            invoiceNumber,
            kind: 'PRODUCT_ORDER',
            orderId: reservation.order.id,
            fulfillment: fulfillment.method
          }
        },
        custom_text: pickup
          ? {
              submit: {
                message:
                  'Local pickup in Ebensburg, as arranged. We will email when the order is ready — please do not come until you hear from us.'
              }
            }
          : {
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
          fulfillment: fulfillment.method,
          ...(giftMessage ? { gift: giftMessage } : {}),
          /**
           * Compact backup. Fulfillment prefers the reserved order and Stripe
           * line items; this remains so sessions already in flight during a
           * deploy still resolve if the hold row is missing. Omitted when it
           * would exceed Stripe's 500-character metadata cap.
           */
          ...(itemsSnapshot ? { items: itemsSnapshot } : {})
        }
      });

      if (pickup && process.env.STRIPE_AUTOMATIC_TAX === 'true') {
        try {
          const origin = pickupTaxOrigin();
          await stripe.checkout.sessions.update(session.id, {
            collected_information: {
              shipping_details: {
                name: 'Local pickup',
                address: {
                  line1: origin.line1,
                  city: origin.city,
                  state: origin.state,
                  postal_code: origin.postalCode,
                  country: origin.country
                }
              }
            }
          });
        } catch (error) {
          /**
           * Tax origin is a nicety. The session is already paid-ready and stock
           * is held — failing checkout here would leave the customer with a 500
           * after Stripe already created the session.
           */
          console.error('Unable to pin pickup tax origin on Stripe session', error);
        }
      }

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
    return NextResponse.json(
      { error: 'Unable to start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
