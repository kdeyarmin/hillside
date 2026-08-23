import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  checkoutAdjustments,
  checkoutLineFulfillment,
  discountLinesForCheckout,
  readCheckoutItems,
  resolveCheckoutLines
} from '@/lib/checkout';
import { bundleSaleInclude } from '@/lib/bundle-queries';
import { readDiscountCodes } from '@/lib/discount-request';
import { quoteCartDiscounts } from '@/lib/discount-store';
import { cartFulfillment, readFulfillmentChoice } from '@/lib/fulfillment';
import { rateLimited } from '@/lib/rate-limit';
import { standardShippingCents } from '@/lib/store';

export const runtime = 'nodejs';

/**
 * What a promo code or a gift card is worth against the basket on screen.
 *
 * Read-only, on purpose: nothing here holds a redemption or moves a penny of a
 * card's balance, so a customer may try codes, change their mind and try again
 * without spending anything. The checkout route prices the basket again for
 * itself a moment later, and *that* is the figure charged — this only exists so
 * nobody has to reach a Stripe payment page to find out whether their code
 * worked.
 *
 * It is also a balance check, which is why it is throttled at all: the answer
 * for a gift card code says whether that code exists and what is on it, and a
 * code is a bearer token. Sixteen characters out of a thirty-two letter
 * alphabet is eighty bits, so guessing one is not the risk; being able to ask
 * at speed is, and this is the only route that would answer.
 *
 * The limit is set well above what a shopper can reach, because a basket with a
 * code on it is priced again whenever it changes — every quantity nudged, every
 * line removed — and a customer who edited their order into a refusal to check
 * their own code would be the worse failure.
 */
export async function POST(request: Request) {
  if (rateLimited(request, { name: 'discount-quote', limit: 40, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many code attempts. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const codes = readDiscountCodes(body);
  if (!codes.promoCode && !codes.giftCardCode) {
    return NextResponse.json(
      { error: 'Enter a promo code or a gift card number.' },
      { status: 400 }
    );
  }

  const requested = readCheckoutItems(body);
  if (!requested.length) {
    return NextResponse.json(
      { error: 'Add something to your basket before applying a code.' },
      { status: 400 }
    );
  }

  const productSlugs = requested.filter((item) => item.kind !== 'bundle').map((item) => item.id);
  const bundleSlugs = requested.filter((item) => item.kind === 'bundle').map((item) => item.id);
  const [products, bundles] = await Promise.all([
    db.product.findMany({ where: { slug: { in: productSlugs } } }),
    bundleSlugs.length
      ? db.bundle.findMany({ where: { slug: { in: bundleSlugs } }, include: bundleSaleInclude })
      : Promise.resolve([])
  ]);
  /**
   * The same correction checkout makes, made here too.
   *
   * Without it the resolver would quietly drop a sold-out line or clamp one
   * whose price moved, and answer with a code's worth against *that* basket
   * while the cart went on showing the lines it had — so the total on screen
   * would be for an order the shop was not going to sell. The customer would
   * find out only after pressing the pay button. Same payload and same status
   * as the checkout route, because the cart already knows how to correct itself
   * from it.
   */
  const adjustments = checkoutAdjustments(requested, products, bundles);
  if (adjustments.length) {
    return NextResponse.json({ adjustments }, { status: 409 });
  }

  const items = resolveCheckoutLines(requested, products, bundles);
  if (!items.length) {
    return NextResponse.json(
      { error: 'The items in your basket are unavailable or sold out.' },
      { status: 400 }
    );
  }

  const options = cartFulfillment(items.map(checkoutLineFulfillment));
  const method = options.forced ?? readFulfillmentChoice(body);
  // Only as much fulfillment as the shipping figure needs. Whether the pickup
  // was arranged is checkout's question, not this one's.
  const pickup = method === 'PICKUP' && options.canPickup;

  const subtotalCents = items.reduce((total, item) => total + item.unitCents * item.quantity, 0);
  const shippingCents = standardShippingCents(subtotalCents, { pickup });

  const { quote, promotion, giftCard, promotionError, giftCardError } = await quoteCartDiscounts({
    lines: discountLinesForCheckout(items),
    subtotalCents,
    shippingCents,
    promoCode: codes.promoCode,
    giftCardCode: codes.giftCardCode
  });

  return NextResponse.json({
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    promoDiscountCents: quote.promoDiscountCents,
    giftCardCents: quote.giftCardCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    freeShipping: quote.freeShipping,
    pickup,
    promotion,
    giftCard,
    promotionError,
    giftCardError
  });
}
