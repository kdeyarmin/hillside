import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  attachStripeSessionToOrder,
  checkoutAdjustments,
  checkoutLineFulfillment,
  discountLinesForCheckout,
  holdExpiryUnix,
  InsufficientStockError,
  readCheckoutItems,
  releaseExpiredProductHolds,
  releaseProductHold,
  reserveProductOrder,
  resolveCheckoutLines,
  stripeCheckoutItemsMetadata,
  stripeProductDescription,
  stripeProductImages
} from '@/lib/checkout';
import { bundleSaleInclude } from '@/lib/bundle-queries';
import { readDiscountCodes } from '@/lib/discount-request';
import { discountLabel, discountMetadata, quoteCartDiscounts } from '@/lib/discount-store';
import { sizedName } from '@/lib/product-sizes';
import { rateLimited } from '@/lib/rate-limit';
import { reportError } from '@/lib/report-error';
import { describeStripeFailure } from '@/lib/stripe-health';
import { checkoutReturnOrigin, newInvoiceNumber, standardShippingCents } from '@/lib/store';
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
    if (await rateLimited(request, { name: 'checkout', limit: 8, windowMs: 10 * 60_000 })) {
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

    const productSlugs = requested.filter((item) => item.kind !== 'bundle').map((item) => item.id);
    const bundleSlugs = requested.filter((item) => item.kind === 'bundle').map((item) => item.id);

    const [products, bundles] = await Promise.all([
      db.product.findMany({ where: { slug: { in: productSlugs } } }),
      bundleSlugs.length
        ? db.bundle.findMany({ where: { slug: { in: bundleSlugs } }, include: bundleSaleInclude })
        : Promise.resolve([])
    ]);

    /**
     * Anything the server had to change is reported back rather than applied
     * silently, so the customer confirms the corrected basket before paying.
     * Price changes used to skip this path: the drawer showed the old figure
     * and Stripe charged the new one.
     */
    const adjustments = checkoutAdjustments(requested, products, bundles);
    if (adjustments.length) {
      return NextResponse.json({ adjustments }, { status: 409 });
    }

    /**
     * Prices are taken from the product, its variant list and the bundle row,
     * never from the basket: the browser sends what it displayed only so a
     * stale figure can be reported back as an adjustment above, not so it can
     * set the charge. Resolved through the same helper the cart's discount
     * quote uses, so what a code is worth and what is charged for cannot be
     * worked out from two different readings of the same basket.
     */
    const items = resolveCheckoutLines(requested, products, bundles);

    if (!items.length) {
      return NextResponse.json(
        { error: 'The selected items are unavailable or sold out.' },
        { status: 400 }
      );
    }

    const fulfillment = resolveFulfillment(
      readFulfillmentChoice(body),
      // The lines, not the products: a cart holding a pickup-only variant and a
      // pot that ships is a conflict even though both come off the same product.
      // A set answers for its whole recipe — it ships only if every piece does.
      cartFulfillment(items.map(checkoutLineFulfillment)),
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
    const shippingCents = standardShippingCents(subtotalCents, { pickup });

    /**
     * Priced again here rather than trusted from the basket. The cart shows a
     * quote so the customer knows what a code is worth before they commit, but
     * the browser could send any figure it liked, so what is charged is worked
     * out from the shop's own rows, against the same lines above.
     */
    const codes = readDiscountCodes(body);
    const { quote, plan, promotionError, giftCardError } = await quoteCartDiscounts({
      lines: discountLinesForCheckout(items),
      subtotalCents,
      shippingCents,
      promoCode: codes.promoCode,
      giftCardCode: codes.giftCardCode
    });

    /**
     * A code that stopped working between the cart and this request — it ran
     * out, it expired, the basket changed — sends the customer back rather than
     * on to a Stripe page charging more than the total they were looking at. It
     * is the same contract as a price adjustment above: nothing is reserved and
     * nothing is charged until they have seen the corrected figure.
     */
    if (quote.promotionRefused || quote.giftCardRefused) {
      return NextResponse.json(
        {
          discountErrors: {
            ...(promotionError ? { promoCode: promotionError } : {}),
            ...(giftCardError ? { giftCardCode: giftCardError } : {})
          }
        },
        { status: 409 }
      );
    }

    const invoiceNumber = newInvoiceNumber();
    const site = checkoutReturnOrigin();
    const stripe = new Stripe(secret);

    if (await rateLimited(request, { name: 'checkout-hold', limit: 3, windowMs: 35 * 60_000 })) {
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
        giftMessage,
        discountPlan: plan
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        /**
         * Stock fell between the check above and the reservation. The whole
         * basket is priced against the shelf again rather than only the line
         * that failed: sizes of one product share a stock count — and a set
         * shares its components' counts with the loose products beside it — so
         * answering with one product's total would tell a 6" line it could have
         * every jar the 4" line is already claiming, and the correction would
         * bounce straight back.
         */
        const [latest, latestBundles] = await Promise.all([
          db.product.findMany({ where: { slug: { in: productSlugs } } }),
          bundleSlugs.length
            ? db.bundle.findMany({
                where: { slug: { in: bundleSlugs } },
                include: bundleSaleInclude
              })
            : Promise.resolve([])
        ]);
        const corrections = checkoutAdjustments(requested, latest, latestBundles);
        if (corrections.length) {
          return NextResponse.json({ adjustments: corrections }, { status: 409 });
        }
        // Stock came back before we could read it. Nothing to correct, so the
        // basket stands and the customer only has to ask again.
        const claimed =
          error.label ||
          latest.find((product) => product.slug === error.slug)?.name ||
          latestBundles.find((bundle) => bundle.slug === error.slug)?.title ||
          'An item';
        return NextResponse.json(
          {
            error: `${sizedName(claimed, error.size)} was claimed while we were reserving your basket. Please try checkout again.`
          },
          { status: 409 }
        );
      }
      throw error;
    }

    const itemsSnapshot = stripeCheckoutItemsMetadata(items);
    const applied = reservation.discounts;
    const appliedShipping = applied.freeShipping ? 0 : shippingCents;
    const appliedDiscountCents = applied.promoDiscountCents + applied.giftCardCents;

    let session: Stripe.Checkout.Session;
    /**
     * The coupon below, for as long as nothing is using it. Held outside the
     * try so the failure path can clean it up, and cleared the moment a session
     * takes it on — see both places below.
     */
    let unusedCoupon: Stripe.Coupon | null = null;
    try {
      /**
       * The discount reaches Stripe as a one-shot coupon rather than as reduced
       * line prices, so the receipt, the invoice and the Stripe dashboard all
       * show what the shop charged for the plants and what it took off — which
       * is what the customer needs to see, and what Tammy needs when somebody
       * rings up about a refund.
       *
       * It is created only once the discount is actually held. A coupon minted
       * before the reservation would outlive a basket that failed to reserve.
       */
      const coupon =
        appliedDiscountCents > 0
          ? await stripe.coupons.create({
              amount_off: appliedDiscountCents,
              currency: 'usd',
              duration: 'once',
              max_redemptions: 1,
              name: discountLabel(applied)
            })
          : null;
      unusedCoupon = coupon;

      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: invoiceNumber,
        customer_creation: 'always',
        line_items: items.map((item): Stripe.Checkout.SessionCreateParams.LineItem =>
          item.kind === 'bundle'
            ? {
                quantity: item.quantity,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: item.unitCents,
                  product_data: {
                    name: item.bundle.title,
                    /**
                     * The contents go in the description so the receipt, the
                     * invoice and the Stripe dashboard all say what was in the
                     * box. Stripe charges one line for the set — the components
                     * are inventory, not separate charges — so this is the only
                     * place the customer's paperwork can list them.
                     */
                    description: stripeProductDescription(
                      `Includes ${item.contents}.${
                        item.bundle.tagline ? ` ${item.bundle.tagline}` : ''
                      }`
                    ),
                    images: stripeProductImages(item.bundle.imageUrl),
                    metadata: {
                      hillsideBundleId: item.bundle.id,
                      hillsideSlug: item.bundle.slug
                    }
                  }
                }
              }
            : {
                quantity: item.quantity,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: item.unitCents,
                  product_data: {
                    // The size belongs in the name so it reaches the Stripe
                    // receipt, the invoice and the dashboard, none of which read
                    // metadata.
                    name: sizedName(item.product.name, item.size),
                    description: stripeProductDescription(
                      item.product.shortDescription || item.product.description
                    ),
                    images: stripeProductImages(item.product.imageUrl),
                    metadata: {
                      hillsideProductId: item.product.id,
                      hillsideSlug: item.product.slug,
                      ...(item.size ? { hillsideSize: item.size } : {})
                    }
                  }
                }
              }
        ),
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
                    fixed_amount: { amount: appliedShipping, currency: 'usd' },
                    display_name: shippingMethodLabel('SHIP', appliedShipping),
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
        /**
         * Stripe refuses a session that both carries a discount and offers its
         * own promotion-code box, and the shop's codes are the ones that have
         * been reserved against this basket. So the box is offered only when
         * the customer brought nothing of their own — Stripe's own coupons stay
         * usable for anything Tammy sets up in its dashboard directly.
         *
         * Keyed on whether a shop code was applied at all, not on whether it
         * came to money: a free-shipping code takes nothing off the merchandise
         * and so mints no coupon, and keying on the coupon let that basket keep
         * the box and stack a Stripe discount on top of a promotion the shop
         * had already reserved against it.
         */
        ...(coupon
          ? { discounts: [{ coupon: coupon.id }] }
          : applied.promotionId || applied.giftCardId
            ? {}
            : { allow_promotion_codes: true as const }),
        consent_collection: { promotions: 'auto' },
        payment_intent_data: {
          description: `The Hillside Gardens ${invoiceNumber}`,
          metadata: {
            invoiceNumber,
            kind: 'PRODUCT_ORDER',
            orderId: reservation.order.id,
            fulfillment: fulfillment.method,
            ...discountMetadata(applied)
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
          ...discountMetadata(applied),
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
      /**
       * The session is holding the coupon now, so it is no longer this
       * request's to tidy away — and deleting one a live session references
       * would take the discount off a basket the customer is about to pay for.
       */
      unusedCoupon = null;

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
           *
           * Swallowed but not unnoticed: every pickup order that goes through
           * after this failure is taxed against the wrong locality, and the
           * customer completes checkout with no sign anything was wrong.
           */
          reportError('Unable to pin pickup tax origin on Stripe session', error, {
            sessionId: session.id
          });
        }
      }

      try {
        await attachStripeSessionToOrder(reservation.holdId, session.id);
      } catch (error) {
        /**
         * The session exists and stock is already held against orderId. The
         * webhook looks the order up by metadata.orderId if this attach fails,
         * so the sale survives — but the fallback is the only thing standing
         * between a paid customer and an order the shop cannot match to them,
         * which is not a limb to be walking on unknowingly.
         */
        reportError('Unable to attach Stripe session to reserved order', error, {
          orderId: reservation.holdId,
          sessionId: session.id
        });
      }
    } catch (error) {
      await releaseProductHold(reservation.order.id);
      /**
       * A coupon minted for a session that never came into being. It is already
       * unspendable — nobody outside this request ever learned its id, and it
       * is capped at one redemption — but leaving one behind on every failed
       * checkout would fill the shop's coupon list with clutter Tammy has to
       * scroll past. Best-effort, and never at the expense of the real error:
       * whatever actually went wrong is what gets thrown.
       */
      if (unusedCoupon) {
        try {
          await stripe.coupons.del(unusedCoupon.id);
        } catch (cleanupError) {
          console.error('Unable to delete the unused Stripe coupon', cleanupError);
        }
      }
      throw error;
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    /**
     * The refusal's own words go in the first line of the log entry. A Stripe
     * error logged as an object prints as a stack in the middle of the deploy
     * platform's log stream, and "authentication_error, HTTP 401" — the line
     * that says the deployed key is wrong — was effectively invisible in it.
     * The same line is what the signed-in health view reports.
     *
     * It titles the report as well, on purpose: a revoked key and a Stripe
     * outage both land here, and they are worth being two alerts rather than one
     * that says "checkout broke" a hundred times over.
     */
    reportError(`Unable to create checkout session: ${describeStripeFailure(error)}`, error);
    return NextResponse.json(
      { error: 'Unable to start checkout. Please try again.' },
      { status: 500 }
    );
  }
}
