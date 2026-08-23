import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { giftCardTail } from '@/lib/discount-request';
import {
  generateGiftCardCode,
  generatePromoCode,
  generateUniqueCodes,
  maskGiftCardCode,
  normalizeGiftCardCode,
  normalizePromoCode
} from '@/lib/discount-codes';
import {
  giftCardEntryMovementCents,
  giftCardRefusalMessage,
  promotionRefusalMessage,
  promotionSummary,
  quoteDiscounts,
  STRIPE_MINIMUM_CHARGE_CENTS,
  type DiscountLine,
  type DiscountQuote,
  type GiftCardBalance,
  type PromotionRule
} from '@/lib/discounts';
import { formatMoney } from '@/lib/store';

/**
 * The database half of gift cards and promo codes: looking a code up, holding
 * what it is worth while a checkout is open, taking it when the order is paid,
 * and giving it back when the checkout is abandoned.
 *
 * The rules themselves are in `lib/discounts.ts`, which knows nothing about
 * Prisma so that `npm test` can cover them. What lives here is everything that
 * has to survive two customers, a retried webhook and a deploy landing in the
 * same thirty-five minutes.
 *
 * Three shapes recur, and they are all the same shape the shop already uses for
 * inventory: a *hold* taken when the Stripe session is created, a *release*
 * when that session dies, and a *settlement* when it is paid. What makes them
 * safe is that each one is a conditional update — Postgres decides, under the
 * row lock, whether the money or the redemption slot was still there — and that
 * each is claimed exactly once through a marker on the order or a unique
 * reference on the ledger row.
 */

/** What a checkout intends to spend, worked out before the order row exists. */
export type DiscountPlan = {
  promotion: PromotionRule | null;
  promoDiscountCents: number;
  freeShipping: boolean;
  giftCard: (GiftCardBalance & { id: string }) | null;
  giftCardCents: number;
  /**
   * The basket the plan was quoted against, and the postage it would pay with
   * no promotion on it. Carried so that `claimDiscounts` can work out what this
   * order will actually owe once the database has had its say, and keep that
   * figure payable — see the floor it holds there.
   */
  subtotalCents: number;
  baseShippingCents: number;
};

/** What it actually got, once the database had its say. */
export type AppliedDiscounts = {
  promotionId: string | null;
  promoCode: string | null;
  promoDiscountCents: number;
  freeShipping: boolean;
  giftCardId: string | null;
  giftCardCode: string | null;
  giftCardCents: number;
};

export const NO_DISCOUNTS: AppliedDiscounts = {
  promotionId: null,
  promoCode: null,
  promoDiscountCents: 0,
  freeShipping: false,
  giftCardId: null,
  giftCardCode: null,
  giftCardCents: 0
};

const promotionRuleSelect = {
  id: true,
  code: true,
  kind: true,
  percentOff: true,
  amountOffCents: true,
  minSubtotalCents: true,
  categoryId: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  redemptionsUsed: true,
  active: true
} as const;

export async function findPromotionByCode(input: unknown) {
  const code = normalizePromoCode(input);
  if (!code) return null;
  return db.promotion.findUnique({
    where: { code },
    select: { ...promotionRuleSelect, label: true, category: { select: { title: true } } }
  });
}

export async function findGiftCardByCode(input: unknown) {
  const code = normalizeGiftCardCode(input);
  if (!code) return null;
  return db.giftCard.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      balanceCents: true,
      reservedCents: true,
      expiresAt: true,
      active: true
    }
  });
}

export type DiscountQuoteResult = {
  quote: DiscountQuote;
  /**
   * What was actually claimed against, for the caller that goes on to reserve
   * it. Server-side only: it carries the gift card's real number, which is the
   * one thing in here that must not travel back to a browser.
   */
  plan: DiscountPlan;
  /**
   * How the applied codes should read in the cart, and why one was refused.
   *
   * A promo code appears in full because that is what it is for — the customer
   * was given it to type and the cart shows it back to them. A gift card
   * appears only masked: it is a bearer instrument, the holder already has the
   * number, and echoing it into a response body puts spendable money somewhere
   * it did not need to go.
   */
  promotion: { code: string; summary: string; message?: string } | null;
  giftCard: { maskedCode: string; balanceCents: number; message?: string } | null;
  promotionError: string | null;
  giftCardError: string | null;
};

/**
 * Prices one basket against the codes the customer typed.
 *
 * Nothing here writes, which is what lets the cart call it on every keystroke's
 * worth of Apply and the checkout route call it again a moment later without
 * the two spending anything between them. The checkout route deliberately does
 * not trust the cart's copy of the answer: it asks again, against the same
 * products it is about to charge for.
 */
export async function quoteCartDiscounts({
  lines,
  subtotalCents,
  shippingCents,
  promoCode,
  giftCardCode,
  now = new Date()
}: {
  lines: DiscountLine[];
  subtotalCents: number;
  shippingCents: number;
  promoCode?: unknown;
  giftCardCode?: unknown;
  now?: Date;
}): Promise<DiscountQuoteResult> {
  const typedPromo = normalizePromoCode(promoCode);
  const typedGiftCard = String(giftCardCode ?? '').trim();

  const [promotion, giftCard] = await Promise.all([
    typedPromo ? findPromotionByCode(typedPromo) : null,
    typedGiftCard ? findGiftCardByCode(typedGiftCard) : null
  ]);

  /**
   * `undefined` where nothing was typed, the row — or `null` — where something
   * was. See `quoteDiscounts`: that is what tells a quiet basket apart from a
   * code the shop has never heard of.
   */
  const quote = quoteDiscounts({
    lines,
    subtotalCents,
    shippingCents,
    promotion: typedPromo ? promotion : undefined,
    giftCard: typedGiftCard ? giftCard : undefined,
    now
  });

  const promotionError =
    typedPromo && quote.promotionRefused
      ? promotionRefusalMessage(quote.promotionRefused, promotion, formatMoney)
      : null;
  const giftCardError =
    typedGiftCard && quote.giftCardRefused ? giftCardRefusalMessage(quote.giftCardRefused) : null;

  const promoApplied = Boolean(promotion && !quote.promotionRefused);
  const giftCardApplied = Boolean(giftCard && !quote.giftCardRefused);

  return {
    quote,
    plan: {
      promotion: promoApplied ? promotion : null,
      promoDiscountCents: promoApplied ? quote.promoDiscountCents : 0,
      freeShipping: promoApplied && quote.freeShipping,
      giftCard: giftCardApplied ? giftCard : null,
      giftCardCents: giftCardApplied ? quote.giftCardCents : 0,
      subtotalCents,
      baseShippingCents: shippingCents
    },
    promotion:
      promoApplied && promotion
        ? {
            code: promotion.code,
            summary: promotionSummary(promotion, {
              categoryTitle: promotion.category?.title,
              formatCents: formatMoney
            })
          }
        : null,
    giftCard:
      giftCardApplied && giftCard
        ? { maskedCode: maskGiftCardCode(giftCard.code), balanceCents: giftCard.balanceCents }
        : null,
    promotionError,
    giftCardError
  };
}

/**
 * What the discount is called on the Stripe receipt and invoice. Stripe caps a
 * coupon name at 40 characters, and a name it refuses would fail the whole
 * session.
 */
export function discountLabel(applied: AppliedDiscounts) {
  const parts: string[] = [];
  if (applied.promoCode && applied.promoDiscountCents > 0) parts.push(applied.promoCode);
  if (applied.giftCardCode && applied.giftCardCents > 0) {
    parts.push(`Gift card ${giftCardTail(applied.giftCardCode)}`);
  }
  return (parts.join(' + ') || 'Discount').slice(0, 40);
}

/**
 * What Stripe records about the discount, so a payment can be traced back to
 * the code that made it cheaper from Stripe's own dashboard. Values are strings
 * because Stripe metadata has no other type, and the card is named by its tail
 * for the same reason it is on the receipt.
 */
export function discountMetadata(applied: AppliedDiscounts): Record<string, string> {
  return {
    ...(applied.promoCode && applied.promoDiscountCents > 0
      ? { promoCode: applied.promoCode, promoOffCents: String(applied.promoDiscountCents) }
      : {}),
    ...(applied.giftCardCode && applied.giftCardCents > 0
      ? {
          giftCard: giftCardTail(applied.giftCardCode),
          giftCardOffCents: String(applied.giftCardCents)
        }
      : {})
  };
}

/**
 * Writes one row of a gift card's ledger, reading the card back afterwards so
 * the row records the balance it actually left behind rather than the one the
 * caller expected.
 */
async function recordGiftCardEntry(
  transaction: Prisma.TransactionClient,
  giftCardId: string,
  entry: {
    kind: 'ISSUE' | 'HOLD' | 'RELEASE' | 'REDEEM' | 'REFUND' | 'ADJUST';
    amountCents?: number;
    reservedDeltaCents?: number;
    reference: string;
    orderId?: string | null;
    note?: string | null;
  }
) {
  const card = await transaction.giftCard.findUnique({
    where: { id: giftCardId },
    select: { balanceCents: true, reservedCents: true }
  });
  await transaction.giftCardEntry.create({
    data: {
      giftCardId,
      kind: entry.kind,
      amountCents: entry.amountCents ?? 0,
      reservedDeltaCents: entry.reservedDeltaCents ?? 0,
      balanceAfterCents: card?.balanceCents ?? 0,
      reservedAfterCents: card?.reservedCents ?? 0,
      orderId: entry.orderId ?? null,
      reference: entry.reference,
      note: entry.note ?? null
    }
  });
}

/**
 * Takes a redemption slot on a capped promotion, or answers false if the last
 * one went to somebody else while this basket was being priced.
 *
 * The cap is compared against the literal the row was read with rather than
 * against the column — Prisma cannot compare two columns — which is sound
 * because `maxRedemptions` only ever changes when the owner edits the code, and
 * an edit mid-checkout is the one case where honouring the figure the customer
 * was quoted is the kinder answer anyway.
 */
async function claimPromotionSlot(
  transaction: Prisma.TransactionClient,
  promotion: { id: string; maxRedemptions: number | null }
) {
  const claimed = await transaction.promotion.updateMany({
    where: {
      id: promotion.id,
      active: true,
      ...(promotion.maxRedemptions != null
        ? { redemptionsUsed: { lt: promotion.maxRedemptions } }
        : {})
    },
    data: { redemptionsUsed: { increment: 1 } }
  });
  return claimed.count > 0;
}

async function addToBalance(
  transaction: Prisma.TransactionClient,
  giftCardId: string,
  amountCents: number
) {
  await transaction.giftCard.update({
    where: { id: giftCardId },
    data: { balanceCents: { increment: amountCents } }
  });
  return amountCents;
}

/**
 * Takes up to `amountCents` off a card's spendable balance and answers with
 * what it actually took, which is never more than was there.
 *
 * The same conditional-update shape as every other reduction in this file: the
 * row decides, under its own lock, so a balance cannot be driven negative by a
 * figure that was accurate when it was read and stale by the time it was
 * written.
 */
async function takeFromBalance(
  transaction: Prisma.TransactionClient,
  giftCardId: string,
  amountCents: number
) {
  const wanted = Math.max(0, Math.floor(amountCents));
  if (wanted <= 0) return 0;

  const took = await transaction.giftCard.updateMany({
    where: { id: giftCardId, balanceCents: { gte: wanted } },
    data: { balanceCents: { decrement: wanted } }
  });
  if (took.count > 0) return -wanted;

  const current = await transaction.giftCard.findUnique({
    where: { id: giftCardId },
    select: { balanceCents: true }
  });
  const available = Math.max(0, Math.min(wanted, current?.balanceCents ?? 0));
  if (available <= 0) return 0;

  const partial = await transaction.giftCard.updateMany({
    where: { id: giftCardId, balanceCents: { gte: available } },
    data: { balanceCents: { decrement: available } }
  });
  return partial.count > 0 ? -available : 0;
}

/**
 * Moves money on a card from spendable to held, and answers with how much it
 * actually moved.
 *
 * The retry is not belt and braces: a card is a bearer instrument that two
 * people can be holding at once, so a second checkout opening while the first
 * is unpaid is ordinary, and taking what is genuinely left is a better answer
 * for the customer standing in front of the pay button than refusing the card
 * outright.
 */
async function holdGiftCardAmount(
  transaction: Prisma.TransactionClient,
  giftCardId: string,
  requestedCents: number
) {
  const wanted = Math.max(0, Math.floor(requestedCents));
  if (wanted <= 0) return 0;

  const held = await transaction.giftCard.updateMany({
    where: { id: giftCardId, active: true, balanceCents: { gte: wanted } },
    data: { balanceCents: { decrement: wanted }, reservedCents: { increment: wanted } }
  });
  if (held.count > 0) return wanted;

  const current = await transaction.giftCard.findUnique({
    where: { id: giftCardId },
    select: { balanceCents: true, active: true }
  });
  const available = current?.active ? Math.min(wanted, Math.max(0, current.balanceCents)) : 0;
  if (available <= 0) return 0;

  const partial = await transaction.giftCard.updateMany({
    where: { id: giftCardId, active: true, balanceCents: { gte: available } },
    data: { balanceCents: { decrement: available }, reservedCents: { increment: available } }
  });
  return partial.count > 0 ? available : 0;
}

/**
 * Holds everything a plan asks for against a freshly reserved order, and writes
 * what was actually held onto that order.
 *
 * Runs inside the caller's transaction — the same one that reserved the stock —
 * so an order never exists carrying a discount that was not taken, and never
 * takes one for an order that was rolled back.
 */
export async function claimDiscounts(
  transaction: Prisma.TransactionClient,
  orderId: string,
  plan: DiscountPlan
): Promise<AppliedDiscounts> {
  const applied: AppliedDiscounts = { ...NO_DISCOUNTS };

  if (plan.promotion && (plan.promoDiscountCents > 0 || plan.freeShipping)) {
    if (await claimPromotionSlot(transaction, plan.promotion)) {
      applied.promotionId = plan.promotion.id;
      applied.promoCode = plan.promotion.code;
      applied.promoDiscountCents = plan.promoDiscountCents;
      applied.freeShipping = plan.freeShipping;
    }
  }

  if (plan.giftCard && plan.giftCardCents > 0) {
    /**
     * Exactly what was quoted, even if the promotion above was lost to somebody
     * else a moment ago and this basket now owes more than it did. Spending
     * more of a customer's own gift card than they agreed to, to cover a
     * discount the shop failed to give them, is the wrong way round; the
     * difference is collected as money at Stripe, on a page they see first.
     */
    const held = await holdGiftCardAmount(transaction, plan.giftCard.id, plan.giftCardCents);

    /**
     * What this order will actually owe, worked out from what was held rather
     * than from what was quoted — the card may have had less on it, or the
     * promotion may have gone to somebody else.
     *
     * `quoteDiscounts` already keeps a quote clear of the gap below Stripe's
     * minimum charge, but only for the figures it quoted. A card that could not
     * hold all of what it was asked for moves the remainder off that figure and
     * can land it back in the gap, where Stripe refuses the session outright. So
     * the same floor is held here, against what really happened: the card keeps
     * back whatever it takes to leave an amount Stripe will charge.
     */
    const owed =
      plan.subtotalCents +
      (applied.freeShipping ? 0 : plan.baseShippingCents) -
      applied.promoDiscountCents -
      held;
    const keepBack =
      owed > 0 && owed < STRIPE_MINIMUM_CHARGE_CENTS
        ? Math.min(held, STRIPE_MINIMUM_CHARGE_CENTS - owed)
        : 0;
    if (keepBack > 0) {
      await transaction.giftCard.updateMany({
        where: { id: plan.giftCard.id, reservedCents: { gte: keepBack } },
        data: { balanceCents: { increment: keepBack }, reservedCents: { decrement: keepBack } }
      });
    }

    const netHeld = held - keepBack;
    if (netHeld > 0) {
      applied.giftCardId = plan.giftCard.id;
      applied.giftCardCode = plan.giftCard.code;
      applied.giftCardCents = netHeld;
      await recordGiftCardEntry(transaction, plan.giftCard.id, {
        kind: 'HOLD',
        amountCents: -netHeld,
        reservedDeltaCents: netHeld,
        reference: `hold:${orderId}`,
        orderId
      });
    }
  }

  if (applied.promotionId || applied.giftCardId) {
    await transaction.order.update({
      where: { id: orderId },
      data: {
        promotionId: applied.promotionId,
        promoCode: applied.promoCode,
        promoDiscountCents: applied.promoDiscountCents,
        giftCardId: applied.giftCardId,
        giftCardCode: applied.giftCardCode,
        giftCardCents: applied.giftCardCents
      }
    });
  }

  return applied;
}

/**
 * Gives back a hold that never became a paid order.
 *
 * Claimed through `discountsReleasedAt`, so a webhook that redelivers an
 * expired session — or the sweep and the webhook arriving together — cannot
 * credit the same card twice. An order that has already settled is left alone
 * outright: that money is spent.
 */
export async function releaseOrderDiscounts(
  transaction: Prisma.TransactionClient,
  orderId: string
) {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    select: {
      promotionId: true,
      giftCardId: true,
      giftCardCents: true,
      discountsSettledAt: true,
      discountsReleasedAt: true
    }
  });
  if (!order || order.discountsSettledAt || order.discountsReleasedAt) return false;
  if (!order.promotionId && !order.giftCardId) return false;

  const claimed = await transaction.order.updateMany({
    where: { id: orderId, discountsSettledAt: null, discountsReleasedAt: null },
    data: { discountsReleasedAt: new Date() }
  });
  if (claimed.count === 0) return false;

  if (order.promotionId) {
    await transaction.promotion.updateMany({
      where: { id: order.promotionId, redemptionsUsed: { gt: 0 } },
      data: { redemptionsUsed: { decrement: 1 } }
    });
  }

  if (order.giftCardId && order.giftCardCents > 0) {
    await transaction.giftCard.updateMany({
      where: { id: order.giftCardId, reservedCents: { gte: order.giftCardCents } },
      data: {
        balanceCents: { increment: order.giftCardCents },
        reservedCents: { decrement: order.giftCardCents }
      }
    });
    await recordGiftCardEntry(transaction, order.giftCardId, {
      kind: 'RELEASE',
      amountCents: order.giftCardCents,
      reservedDeltaCents: -order.giftCardCents,
      reference: `release:${orderId}`,
      orderId,
      note: 'Checkout was abandoned or expired.'
    });
  }

  return true;
}

/**
 * Takes the money for good, now that the order is paid.
 *
 * Two paths, because Stripe can deliver `expired` before `completed` for the
 * same session. The ordinary one converts a live hold. The other re-takes money
 * that was already handed back, and cannot always get all of it — the customer
 * may have spent it elsewhere in between — so it reports the shortfall rather
 * than quietly leaving the card richer than the shop's takings.
 */
export async function settleOrderDiscounts(
  transaction: Prisma.TransactionClient,
  orderId: string,
  email?: string | null
): Promise<{ settled: boolean; shortfallCents: number }> {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    select: {
      promotionId: true,
      promoCode: true,
      promoDiscountCents: true,
      giftCardId: true,
      giftCardCents: true,
      discountsSettledAt: true,
      discountsReleasedAt: true
    }
  });
  if (!order || order.discountsSettledAt) return { settled: false, shortfallCents: 0 };
  if (!order.promotionId && !order.giftCardId) return { settled: false, shortfallCents: 0 };

  const claimed = await transaction.order.updateMany({
    where: { id: orderId, discountsSettledAt: null },
    data: { discountsSettledAt: new Date(), discountsReleasedAt: null }
  });
  if (claimed.count === 0) return { settled: false, shortfallCents: 0 };

  const wasReleased = Boolean(order.discountsReleasedAt);

  if (order.promotionId) {
    if (wasReleased) {
      /**
       * The slot was given back when the session looked dead. Take it again
       * without re-checking the cap: the customer has already paid, and a code
       * that has since filled up is the shop's problem to notice, not theirs.
       */
      await transaction.promotion.updateMany({
        where: { id: order.promotionId },
        data: { redemptionsUsed: { increment: 1 } }
      });
    }
    await transaction.promotionRedemption.create({
      data: {
        promotionId: order.promotionId,
        orderId,
        code: order.promoCode || '',
        email: email?.toLowerCase() || null,
        amountCents: order.promoDiscountCents
      }
    });
  }

  let shortfallCents = 0;
  if (order.giftCardId && order.giftCardCents > 0) {
    const amount = order.giftCardCents;
    if (wasReleased) {
      const retaken = await transaction.giftCard.updateMany({
        where: { id: order.giftCardId, balanceCents: { gte: amount } },
        data: { balanceCents: { decrement: amount } }
      });
      if (retaken.count > 0) {
        await recordGiftCardEntry(transaction, order.giftCardId, {
          kind: 'REDEEM',
          amountCents: -amount,
          reference: `redeem:${orderId}`,
          orderId,
          note: 'Settled after the hold had already been released.'
        });
      } else {
        const card = await transaction.giftCard.findUnique({
          where: { id: order.giftCardId },
          select: { balanceCents: true }
        });
        const recovered = Math.max(0, Math.min(amount, card?.balanceCents ?? 0));
        shortfallCents = amount - recovered;
        if (recovered > 0) {
          await transaction.giftCard.updateMany({
            where: { id: order.giftCardId, balanceCents: { gte: recovered } },
            data: { balanceCents: { decrement: recovered } }
          });
        }
        await recordGiftCardEntry(transaction, order.giftCardId, {
          kind: 'REDEEM',
          amountCents: -recovered,
          reference: `redeem:${orderId}`,
          orderId,
          note: `Settled late; ${formatMoney(shortfallCents)} of this order's gift-card payment was no longer on the card.`
        });
      }
    } else {
      await transaction.giftCard.updateMany({
        where: { id: order.giftCardId, reservedCents: { gte: amount } },
        data: { reservedCents: { decrement: amount } }
      });
      await recordGiftCardEntry(transaction, order.giftCardId, {
        kind: 'REDEEM',
        reservedDeltaCents: -amount,
        reference: `redeem:${orderId}`,
        orderId
      });
    }
  }

  return { settled: true, shortfallCents };
}

/**
 * Puts a gift card's share of a refund back on the card.
 *
 * Stripe can only refund what Stripe charged, so the part of an order paid with
 * a card has to come back here or not at all — and it comes back *in
 * proportion*: refund half the cash and half the card returns with it. That is
 * the rule in both directions. It stops a full refund of the small cash
 * remainder on a mostly-card order handing back the whole card, and it fixes
 * the opposite case, where a partial refund used to return nothing of the card
 * at all and the customer simply lost their share.
 *
 * `refundedCents` is the cumulative cash refunded on the charge; leaving it out
 * means the whole order, which is what the dashboard's own refund and cancel
 * mean. Cumulative is also what makes a second refund work: the reference
 * carries the running total, so a redelivered event lands once while a further
 * refund is a new event that credits only the difference.
 */
export async function returnGiftCardForRefund(
  transaction: Prisma.TransactionClient,
  orderId: string,
  { refundedCents, note = 'Order refunded.' }: { refundedCents?: number; note?: string } = {}
) {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    select: {
      giftCardId: true,
      giftCardCents: true,
      totalCents: true,
      discountsSettledAt: true
    }
  });
  if (!order?.giftCardId || order.giftCardCents <= 0 || !order.discountsSettledAt) return 0;

  /**
   * What the card actually gave, read off the ledger rather than off the order.
   *
   * The two differ in one case, and it is the case that matters: an order that
   * settled after its hold had been released takes what it can find, and
   * records a shortfall when the money had been spent elsewhere in between.
   * Crediting the order's nominal figure would put that shortfall *onto* the
   * card — money this order never took, minted by refunding it.
   */
  const redeemed = await transaction.giftCardEntry.findUnique({
    where: { reference: `redeem:${orderId}` },
    select: { amountCents: true, reservedDeltaCents: true }
  });
  const cardTaken = redeemed
    ? Math.max(0, Math.min(order.giftCardCents, -giftCardEntryMovementCents(redeemed)))
    : 0;
  if (cardTaken <= 0) return 0;

  /**
   * A card that covered the whole order leaves no cash to refund and no Stripe
   * charge to refund it from, so the only way back is the dashboard — and that
   * always means the whole thing.
   */
  const cashCharged = Math.max(0, order.totalCents);
  const cashRefunded =
    refundedCents == null ? cashCharged : Math.max(0, Math.min(refundedCents, cashCharged));
  const target =
    cashCharged <= 0 ? cardTaken : Math.round((cardTaken * cashRefunded) / cashCharged);

  const returnedSoFar = await transaction.giftCardEntry.aggregate({
    where: { orderId, kind: 'REFUND' },
    _sum: { amountCents: true }
  });
  const alreadyBack = Math.max(0, returnedSoFar._sum.amountCents || 0);
  const credit = Math.max(0, Math.min(target - alreadyBack, cardTaken - alreadyBack));
  if (credit <= 0) return 0;

  const reference = `refund:${orderId}:${cashRefunded}`;
  const already = await transaction.giftCardEntry.findUnique({
    where: { reference },
    select: { id: true }
  });
  if (already) return 0;

  await transaction.giftCard.update({
    where: { id: order.giftCardId },
    data: { balanceCents: { increment: credit } }
  });
  await recordGiftCardEntry(transaction, order.giftCardId, {
    kind: 'REFUND',
    amountCents: credit,
    reference,
    orderId,
    note:
      credit < cardTaken - alreadyBack
        ? `${note} A part refund, so ${formatMoney(credit)} of the ${formatMoney(cardTaken)} this order took comes back.`
        : note
  });
  return credit;
}

/**
 * How much of an order's gift-card payment has been put back on the card.
 *
 * The dashboard asks before letting a refunded order be moved back to paid: the
 * card is spendable again the moment it is credited, so an order that came back
 * to life without the money coming back with it would let the same balance fund
 * two orders.
 */
export async function orderGiftCardReturnedCents(orderId: string) {
  const returned = await db.giftCardEntry.aggregate({
    where: { orderId, kind: 'REFUND' },
    _sum: { amountCents: true }
  });
  return Math.max(0, returned._sum.amountCents || 0);
}

/**
 * The same return, run on its own rather than inside somebody else's
 * transaction: what the dashboard calls when Tammy refunds or cancels a paid
 * order herself. The unique reference is what keeps this and Stripe's own
 * `charge.refunded` from crediting the card twice between them.
 */
export async function refundOrderGiftCard(orderId: string, note?: string) {
  // No `refundedCents`: the dashboard's refund and cancel mean the whole order.
  return db.$transaction((transaction) => returnGiftCardForRefund(transaction, orderId, { note }));
}

/**
 * Issues gift cards.
 *
 * The codes are minted before the write and inserted in one transaction, so a
 * batch of fifty either exists or does not: half a batch would leave the owner
 * printing cards she cannot tell apart from the ones that failed.
 */
export async function createGiftCards({
  count,
  amountCents,
  recipientName,
  recipientEmail,
  purchaserName,
  purchaserEmail,
  message,
  expiresAt,
  batch,
  note,
  issuedBy
}: {
  count: number;
  amountCents: number;
  recipientName?: string | null;
  recipientEmail?: string | null;
  purchaserName?: string | null;
  purchaserEmail?: string | null;
  message?: string | null;
  expiresAt?: Date | null;
  batch?: string | null;
  note?: string | null;
  issuedBy?: string | null;
}) {
  const codes = generateUniqueCodes(count, () => generateGiftCardCode());

  return db.$transaction(async (transaction) => {
    const created = [];
    for (const code of codes) {
      const card = await transaction.giftCard.create({
        data: {
          code,
          initialCents: amountCents,
          balanceCents: amountCents,
          recipientName: recipientName || null,
          recipientEmail: recipientEmail || null,
          purchaserName: purchaserName || null,
          purchaserEmail: purchaserEmail || null,
          message: message || null,
          expiresAt: expiresAt || null,
          batch: batch || null,
          note: note || null,
          issuedBy: issuedBy || null
        }
      });
      await recordGiftCardEntry(transaction, card.id, {
        kind: 'ISSUE',
        amountCents,
        reference: `issue:${card.id}`,
        note: issuedBy ? `Issued by ${issuedBy}.` : 'Issued from the dashboard.'
      });
      created.push(card);
    }
    return created;
  });
}

/**
 * Adds to or takes off a card's balance by hand — a goodwill top-up, or a
 * correction. Never moves reserved money: a checkout that is holding some is
 * still entitled to it.
 */
export async function adjustGiftCardBalance({
  giftCardId,
  deltaCents,
  note,
  issuedBy
}: {
  giftCardId: string;
  deltaCents: number;
  note?: string | null;
  issuedBy?: string | null;
}) {
  return db.$transaction(async (transaction) => {
    const card = await transaction.giftCard.findUnique({
      where: { id: giftCardId },
      select: { balanceCents: true }
    });
    if (!card) return null;
    if (deltaCents === 0) return { appliedCents: 0 };

    /**
     * Adding is always safe. Taking away is not, and the difference is the same
     * one every balance change here turns on: between reading a figure and
     * writing against it, a checkout can move money out from under the read.
     *
     * So a reduction is a conditional update against the balance itself, and
     * how much it takes is decided by the row rather than by what was read a
     * moment earlier. Incrementing by a figure clamped to a stale balance is
     * how an admin taking $100 off a $100 card, while a checkout holds $80 of
     * it, leaves the card at minus eighty — and spends money that checkout was
     * entitled to keep.
     */
    const applied =
      deltaCents > 0
        ? await addToBalance(transaction, giftCardId, deltaCents)
        : await takeFromBalance(transaction, giftCardId, -deltaCents);
    if (applied === 0) return { appliedCents: 0 };

    await recordGiftCardEntry(transaction, giftCardId, {
      kind: 'ADJUST',
      amountCents: applied,
      reference: `adjust:${crypto.randomUUID()}`,
      note: [note, issuedBy ? `by ${issuedBy}` : null].filter(Boolean).join(' — ') || null
    });
    return { appliedCents: applied };
  });
}

/**
 * Mints promo codes under one set of rules — one code, or fifty for a fair.
 *
 * Codes already in use are skipped rather than failing the run: the owner
 * typing a code she used last spring should be told, not have forty-nine other
 * codes rolled back with it.
 */
export async function createPromotions({
  codes,
  rules,
  batch
}: {
  codes: string[];
  rules: Omit<Prisma.PromotionUncheckedCreateInput, 'code' | 'batch'>;
  batch?: string | null;
}) {
  const wanted = [...new Set(codes.map(normalizePromoCode).filter(Boolean))];
  if (!wanted.length) return { created: [], skipped: [] as string[] };

  const existing = await db.promotion.findMany({
    where: { code: { in: wanted } },
    select: { code: true }
  });
  const taken = new Set(existing.map((row) => row.code));
  const fresh = wanted.filter((code) => !taken.has(code));

  const created = await db.$transaction(
    fresh.map((code) => db.promotion.create({ data: { ...rules, code, batch: batch || null } }))
  );
  return { created, skipped: [...taken] };
}

/** `count` generated codes under `prefix`, none of which is already in use. */
export async function generatePromotionCodes(count: number, prefix: string) {
  const minted = generateUniqueCodes(count, () => generatePromoCode(prefix));
  if (!minted.length) return [];
  const existing = await db.promotion.findMany({
    where: { code: { in: minted } },
    select: { code: true }
  });
  const taken = new Set(existing.map((row) => row.code));
  return minted.filter((code) => !taken.has(code));
}
