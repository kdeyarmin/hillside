/**
 * What a promo code or a gift card is worth against a particular basket.
 *
 * Deliberately free of Prisma, Next and the network — every rule that decides
 * whether a customer is charged less lives here as a plain function, so `npm
 * test` can cover it, the cart can render the same answer the checkout route
 * enforces, and neither of them can quietly disagree with the other about what
 * a code is worth.
 *
 * Two things are worth stating once, because everything below assumes them.
 *
 * A promotion is a *rule* — a percentage, a fixed amount, or free shipping, all
 * subject to whatever conditions the owner set. A gift card is a *balance*: the
 * customer's own money, spent down over as many orders as it takes. So a basket
 * may carry one of each, and they are applied in that order — the promotion
 * first, the card against what is left — because the alternative spends a
 * customer's own money on a discount the shop was giving away anyway.
 *
 * Both come off the merchandise, not off shipping or tax. Stripe applies a
 * coupon to the line items alone, so this is not a policy choice so much as the
 * shape of the thing doing the charging, and the total below is worked out the
 * same way for the same reason. The one exception is a free-shipping
 * promotion, which does not discount anything: it chooses the free shipping
 * rate as the session is created.
 */

export type DiscountKindValue = 'PERCENT' | 'AMOUNT' | 'FREE_SHIPPING';

/** As much of a promotion as deciding what it is worth actually needs. */
export type PromotionRule = {
  id: string;
  code: string;
  kind: DiscountKindValue;
  percentOff: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number;
  categoryId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptionsUsed: number;
  active: boolean;
};

/** As much of a gift card as deciding what it can pay for actually needs. */
export type GiftCardBalance = {
  code: string;
  balanceCents: number;
  reservedCents: number;
  expiresAt: Date | null;
  active: boolean;
};

/**
 * One priced basket line. `categoryId` is what a category-scoped promotion
 * meters against, and is absent on a line whose product was never filed under
 * one — which is to say such a line is never eligible for a scoped code.
 */
export type DiscountLine = {
  unitCents: number;
  quantity: number;
  categoryId?: string | null;
};

export type PromotionRefusal =
  | 'not-found'
  | 'inactive'
  | 'not-started'
  | 'expired'
  | 'used-up'
  | 'minimum'
  | 'not-eligible'
  | 'no-shipping';

export type GiftCardRefusal = 'not-found' | 'inactive' | 'expired' | 'empty' | 'nothing-due';

export type PromotionVerdict =
  | { ok: true; discountCents: number; freeShipping: boolean }
  | { ok: false; reason: PromotionRefusal };

export type GiftCardVerdict =
  { ok: true; spendableCents: number } | { ok: false; reason: GiftCardRefusal };

/** What one gift card may be issued for. Both ends are the owner's guard rail. */
export const GIFT_CARD_MIN_CENTS = 100;
export const GIFT_CARD_MAX_CENTS = 100_000;

/** How many cards or codes one generated batch may mint at once. */
export const DISCOUNT_BATCH_MAX = 100;

/**
 * The smallest amount Stripe will charge a card in USD.
 *
 * It matters here because a discount does not stop at a round number: a $25
 * gift card against a $25.20 pickup order leaves twenty cents to pay, and
 * Stripe refuses the session outright rather than charging it — so a customer
 * doing the most ordinary thing a gift card is for would reach a broken
 * checkout. `quoteDiscounts` therefore never leaves a total in the gap between
 * nothing and this: see the two adjustments there.
 */
export const STRIPE_MINIMUM_CHARGE_CENTS = 50;

/** The printed form's group size, which the search below regroups against. */
const GIFT_CARD_CODE_GROUP = 4;

/** How many gift cards or promo codes one page of the dashboard lists. */
export const DISCOUNT_PAGE_SIZE = 60;

/**
 * The code-shaped things a search box's contents might be looking for.
 *
 * A card number is stored in the grouped form it is printed in, but it gets
 * typed back every which way — off the card with its dashes, pasted bare out of
 * an email, or just the last group, which is how a card is named everywhere the
 * whole number is deliberately not shown. Regrouping the bare characters in
 * fours is what makes `01BT41BVA8Z2Y3TM` find `01BT-41BV-A8Z2-Y3TM`.
 *
 * Returned as terms rather than applied as a predicate, so the dashboard can
 * hand them to Postgres and search every card the shop has ever issued rather
 * than filtering whichever page it happened to load. A query starting partway
 * through a group will not match — nobody reads a number off a card that way.
 */
export function giftCardSearchTerms(query: string) {
  const raw = query.trim();
  if (!raw) return [];
  const bare = raw.replace(/[^a-zA-Z0-9]/g, '');
  const grouped =
    bare.length > GIFT_CARD_CODE_GROUP ? (bare.match(/.{1,4}/g) || []).join('-') : bare;
  return [...new Set([raw, grouped].filter(Boolean))];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What a date typed into a `type="date"` box means as a gift card's expiry: the
 * *end* of that day, on the shop's clock.
 *
 * Two things go wrong with a bare `new Date(value)`. It reads `2026-08-23` as
 * UTC midnight, and the deploy pins `TZ` to America/New_York — so the instant
 * stored is the evening of the 22nd, and the dashboard and the recipient's
 * email would both show the day before the one that was picked.
 * `lib/inventory.ts` hit the same trap with restock dates.
 *
 * And an expiry is a deadline rather than a moment: `evaluateGiftCard` refuses
 * a card once `expiresAt` has passed, so midnight *at the start* of the 23rd
 * would stop the card working before the 23rd had begun. A card that says it
 * expires on the 23rd should spend all of the 23rd.
 */
export function expiryFromDateInput(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = DATE_ONLY.test(raw)
    ? (() => {
        const [year, month, day] = raw.split('-').map(Number);
        return new Date(year, month - 1, day, 23, 59, 59, 999);
      })()
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eligibleSubtotalCents(lines: DiscountLine[], categoryId: string | null) {
  return lines.reduce((total, line) => {
    if (categoryId && line.categoryId !== categoryId) return total;
    return total + Math.max(0, line.unitCents) * Math.max(0, line.quantity);
  }, 0);
}

/**
 * What a promotion takes off the merchandise, never more than the merchandise
 * it applies to. A $25 code against a $12 basket takes $12, not $25 — Stripe
 * would refuse to hand back the difference in cash and so would we.
 */
export function promotionDiscountCents(promotion: PromotionRule, lines: DiscountLine[]) {
  const eligible = eligibleSubtotalCents(lines, promotion.categoryId);
  if (eligible <= 0) return 0;

  if (promotion.kind === 'PERCENT') {
    const percent = Math.max(0, Math.min(100, promotion.percentOff ?? 0));
    return Math.min(eligible, Math.round((eligible * percent) / 100));
  }
  if (promotion.kind === 'AMOUNT') {
    return Math.min(eligible, Math.max(0, promotion.amountOffCents ?? 0));
  }
  // Free shipping discounts nothing; it changes which shipping rate is charged.
  return 0;
}

/**
 * Whether this code may be used on this basket right now, and what it is worth.
 *
 * The order of the refusals is the order they should be explained in: a code
 * that has expired should say so rather than complain about the basket size,
 * because the customer can do something about one of those and not the other.
 */
export function evaluatePromotion(
  promotion: PromotionRule | null | undefined,
  {
    lines,
    subtotalCents,
    shippingCents = 0,
    now = new Date()
  }: { lines: DiscountLine[]; subtotalCents: number; shippingCents?: number; now?: Date }
): PromotionVerdict {
  if (!promotion) return { ok: false, reason: 'not-found' };
  if (!promotion.active) return { ok: false, reason: 'inactive' };
  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    return { ok: false, reason: 'not-started' };
  }
  if (promotion.endsAt && promotion.endsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (promotion.maxRedemptions != null && promotion.redemptionsUsed >= promotion.maxRedemptions) {
    return { ok: false, reason: 'used-up' };
  }
  if (subtotalCents < promotion.minSubtotalCents) return { ok: false, reason: 'minimum' };

  if (promotion.kind === 'FREE_SHIPPING') {
    // Nothing to give away on a pickup order, or on one that already ships
    // free. Saying so is kinder than accepting the code and changing no figure.
    if (shippingCents <= 0) return { ok: false, reason: 'no-shipping' };
    return { ok: true, discountCents: 0, freeShipping: true };
  }

  const discountCents = promotionDiscountCents(promotion, lines);
  if (discountCents <= 0) return { ok: false, reason: 'not-eligible' };
  return { ok: true, discountCents, freeShipping: false };
}

export function evaluateGiftCard(
  card: GiftCardBalance | null | undefined,
  { now = new Date() }: { now?: Date } = {}
): GiftCardVerdict {
  if (!card) return { ok: false, reason: 'not-found' };
  if (!card.active) return { ok: false, reason: 'inactive' };
  if (card.expiresAt && card.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  const spendableCents = Math.max(0, card.balanceCents);
  if (spendableCents <= 0) return { ok: false, reason: 'empty' };
  return { ok: true, spendableCents };
}

export type DiscountQuote = {
  subtotalCents: number;
  /** Shipping after a free-shipping code has had its say. */
  shippingCents: number;
  promoDiscountCents: number;
  giftCardCents: number;
  /** What comes off the merchandise altogether — the coupon Stripe is handed. */
  discountCents: number;
  /** Merchandise plus shipping, less the discount. Tax is Stripe's to add. */
  totalCents: number;
  freeShipping: boolean;
  promotionRefused?: PromotionRefusal;
  giftCardRefused?: GiftCardRefusal;
};

/**
 * The whole picture for one basket: what each code is worth, what is left to
 * pay, and — where a code was refused — why, so the cart can say so in words.
 *
 * A refusal is never fatal here. Checkout has to go on working when a code has
 * expired between the cart page and the pay button; it just goes on without it.
 */
export function quoteDiscounts({
  lines,
  subtotalCents,
  shippingCents,
  promotion,
  giftCard,
  now = new Date()
}: {
  lines: DiscountLine[];
  subtotalCents: number;
  shippingCents: number;
  /**
   * The rows behind the codes the customer typed. `undefined` means they typed
   * nothing; `null` means they typed something that matched no row.
   *
   * The distinction has to be made here rather than by the caller, because
   * those two cases need opposite answers: a basket with no code on it is
   * quoted in silence, while a code nobody recognises is the one refusal the
   * customer most needs to be told about — they have almost certainly mistyped
   * it, and a cart that quietly ignored it would leave them looking for the
   * discount on the Stripe page.
   */
  promotion?: PromotionRule | null;
  giftCard?: GiftCardBalance | null;
  now?: Date;
}): DiscountQuote {
  const promotionVerdict =
    promotion === undefined
      ? null
      : evaluatePromotion(promotion, { lines, subtotalCents, shippingCents, now });
  const freeShipping = Boolean(promotionVerdict?.ok && promotionVerdict.freeShipping);
  const shippingAfter = freeShipping ? 0 : shippingCents;

  /**
   * A promotion that leaves a few cents behind gives those away too.
   *
   * Stripe will not charge an amount below `STRIPE_MINIMUM_CHARGE_CENTS` — it
   * refuses the whole session — so "$19.70 off" against a $20.00 basket has to
   * resolve one way or the other, and rounding *down* to a free order costs the
   * shop thirty cents where rounding up would cost it the sale. Bounded by the
   * merchandise, because that is all a Stripe coupon can come off.
   */
  const quoted = promotionVerdict?.ok ? promotionVerdict.discountCents : 0;
  const afterPromotion = subtotalCents + shippingAfter - quoted;
  const promoDiscountCents =
    // Only where a code was actually accepted. A basket that is under the floor
    // all by itself is not a discount to round off — it is a basket the shop
    // cannot sell, and quoting it at zero would say the opposite.
    promotionVerdict?.ok && afterPromotion > 0 && afterPromotion < STRIPE_MINIMUM_CHARGE_CENTS
      ? Math.min(subtotalCents, quoted + afterPromotion)
      : quoted;

  const giftCardVerdict = giftCard === undefined ? null : evaluateGiftCard(giftCard, { now });
  const merchandiseDue = Math.max(0, subtotalCents - promoDiscountCents);
  const spendable = giftCardVerdict?.ok
    ? Math.min(giftCardVerdict.spendableCents, merchandiseDue)
    : 0;
  const afterGiftCard = subtotalCents + shippingAfter - promoDiscountCents - spendable;
  /**
   * The same gap, from the other side. A card that cannot cover the basket
   * holds back just enough to leave a payable remainder, rather than being
   * spent down to a total Stripe will not take. The customer keeps the
   * difference on their card, which is the better half of the trade for them.
   *
   * It can always hold back enough: reaching here means the order still owed at
   * least the minimum before the card was applied, so the card's contribution
   * is at least as large as the shortfall it has to give back.
   */
  const giftCardCents =
    afterGiftCard > 0 && afterGiftCard < STRIPE_MINIMUM_CHARGE_CENTS
      ? Math.max(0, spendable - (STRIPE_MINIMUM_CHARGE_CENTS - afterGiftCard))
      : spendable;

  /**
   * A card with money on it that pays for nothing is refused rather than
   * applied at zero, so the cart does not show a gift card line reading $0.00
   * next to a total the customer still owes in full.
   */
  const giftCardRefused: GiftCardRefusal | undefined = giftCardVerdict
    ? giftCardVerdict.ok
      ? giftCardCents > 0
        ? undefined
        : 'nothing-due'
      : giftCardVerdict.reason
    : undefined;

  const discountCents = promoDiscountCents + giftCardCents;
  return {
    subtotalCents,
    shippingCents: shippingAfter,
    promoDiscountCents,
    giftCardCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents + shippingAfter - discountCents),
    freeShipping,
    ...(promotionVerdict && !promotionVerdict.ok
      ? { promotionRefused: promotionVerdict.reason }
      : {}),
    ...(giftCardRefused ? { giftCardRefused } : {})
  };
}

/**
 * Why a code was refused, said to the customer holding it. Deliberately plain
 * about the codes that will never work — an expired code is not going to start
 * working if they try it again — and deliberately vague about nothing: a
 * customer who mistypes a code and is told only "that did not work" retypes the
 * same mistake.
 */
export function promotionRefusalMessage(
  reason: PromotionRefusal,
  promotion?: { minSubtotalCents: number } | null,
  formatCents: (cents: number) => string = defaultMoney
) {
  switch (reason) {
    case 'inactive':
      return 'That promo code is no longer being accepted.';
    case 'not-started':
      return 'That promo code has not started yet.';
    case 'expired':
      return 'That promo code has expired.';
    case 'used-up':
      return 'That promo code has already been fully redeemed.';
    case 'minimum':
      return promotion?.minSubtotalCents
        ? `That code applies to orders of ${formatCents(promotion.minSubtotalCents)} or more.`
        : 'Your basket does not meet the conditions for that code.';
    case 'not-eligible':
      return 'That code does not apply to anything in your basket.';
    case 'no-shipping':
      return 'That code gives free shipping, and this order has none to give away.';
    default:
      return 'We do not recognise that promo code.';
  }
}

export function giftCardRefusalMessage(reason: GiftCardRefusal) {
  switch (reason) {
    case 'inactive':
      return 'That gift card is no longer active. Please contact us and we will sort it out.';
    case 'expired':
      return 'That gift card has expired.';
    case 'empty':
      return 'That gift card has no balance left on it.';
    case 'nothing-due':
      return 'There is nothing left for the gift card to pay — your basket is already covered.';
    default:
      return 'We do not recognise that gift card number.';
  }
}

function defaultMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A promotion in one line — "20% off", "$5.00 off Teas", "Free shipping" — for
 * the dashboard's list and for the cart's applied-code row.
 */
export function promotionSummary(
  promotion: Pick<PromotionRule, 'kind' | 'percentOff' | 'amountOffCents'>,
  {
    categoryTitle,
    formatCents = defaultMoney
  }: { categoryTitle?: string | null; formatCents?: (cents: number) => string } = {}
) {
  const scope = categoryTitle ? ` off ${categoryTitle}` : ' off';
  if (promotion.kind === 'FREE_SHIPPING') return 'Free shipping';
  if (promotion.kind === 'PERCENT') return `${promotion.percentOff ?? 0}%${scope}`;
  return `${formatCents(promotion.amountOffCents ?? 0)}${scope}`;
}

/**
 * The money a ledger row moved, for the column the owner reads down.
 *
 * Usually that is the change in the spendable balance. The exception is an
 * ordinary redemption, which leaves the balance alone — the money came out of
 * it when the checkout opened — and takes the held amount off the card instead,
 * so its figure is the one in the reserved column.
 */
export function giftCardEntryMovementCents(entry: {
  amountCents: number;
  reservedDeltaCents: number;
}) {
  return entry.amountCents !== 0 ? entry.amountCents : entry.reservedDeltaCents;
}

export const GIFT_CARD_ENTRY_LABELS: Record<string, string> = {
  ISSUE: 'Issued',
  HOLD: 'Held for a checkout',
  RELEASE: 'Checkout abandoned',
  REDEEM: 'Spent on an order',
  REFUND: 'Returned by a refund',
  ADJUST: 'Adjusted by the owner'
};

export const DISCOUNT_KIND_LABELS: Record<DiscountKindValue, string> = {
  PERCENT: 'Percentage off',
  AMOUNT: 'Amount off',
  FREE_SHIPPING: 'Free shipping'
};
