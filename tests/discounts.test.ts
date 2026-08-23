import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  eligibleSubtotalCents,
  evaluateGiftCard,
  evaluatePromotion,
  expiryFromDateInput,
  giftCardEntryMovementCents,
  giftCardRefusalMessage,
  promotionDiscountCents,
  promotionRefusalMessage,
  promotionSummary,
  quoteDiscounts,
  STRIPE_MINIMUM_CHARGE_CENTS,
  type GiftCardBalance,
  type PromotionRule
} from '../lib/discounts.ts';
import { CODE_INPUT_MAX, readDiscountCodes } from '../lib/discount-request.ts';

const NOW = new Date('2026-05-01T12:00:00Z');

function promotion(overrides: Partial<PromotionRule> = {}): PromotionRule {
  return {
    id: 'promo1',
    code: 'SPRING20',
    kind: 'PERCENT',
    percentOff: 20,
    amountOffCents: null,
    minSubtotalCents: 0,
    categoryId: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    redemptionsUsed: 0,
    active: true,
    ...overrides
  };
}

function giftCard(overrides: Partial<GiftCardBalance> = {}): GiftCardBalance {
  return {
    code: '0123-4567-89AB-CDEF',
    balanceCents: 5000,
    reservedCents: 0,
    expiresAt: null,
    active: true,
    ...overrides
  };
}

const teas = [{ unitCents: 1200, quantity: 2, categoryId: 'tea' }];
const mixed = [
  { unitCents: 1200, quantity: 2, categoryId: 'tea' },
  { unitCents: 3000, quantity: 1, categoryId: 'plant' }
];

describe('eligibleSubtotalCents', () => {
  it('counts the whole basket when a code is not scoped', () => {
    assert.equal(eligibleSubtotalCents(mixed, null), 5400);
  });

  it('counts only the category a scoped code names', () => {
    assert.equal(eligibleSubtotalCents(mixed, 'tea'), 2400);
    assert.equal(eligibleSubtotalCents(mixed, 'soap'), 0);
  });

  it('ignores a line whose product was never filed under a category', () => {
    assert.equal(eligibleSubtotalCents([{ unitCents: 900, quantity: 1 }], 'tea'), 0);
  });
});

describe('promotionDiscountCents', () => {
  it('takes a percentage of the eligible lines, rounded to the cent', () => {
    assert.equal(promotionDiscountCents(promotion(), mixed), 1080);
    assert.equal(promotionDiscountCents(promotion({ categoryId: 'tea' }), mixed), 480);
  });

  it('rounds a fractional percentage rather than dropping the fraction', () => {
    // 15% of $10.15 is 152.25 cents.
    const lines = [{ unitCents: 1015, quantity: 1, categoryId: 'tea' }];
    assert.equal(promotionDiscountCents(promotion({ percentOff: 15 }), lines), 152);
  });

  it('never takes off more than the basket it applies to', () => {
    const big = promotion({ kind: 'AMOUNT', percentOff: null, amountOffCents: 9000 });
    assert.equal(promotionDiscountCents(big, teas), 2400);
  });

  it('discounts nothing for a free-shipping code — that is not a discount', () => {
    const shipping = promotion({ kind: 'FREE_SHIPPING', percentOff: null });
    assert.equal(promotionDiscountCents(shipping, mixed), 0);
  });
});

describe('evaluatePromotion', () => {
  const basket = { lines: mixed, subtotalCents: 5400, shippingCents: 895, now: NOW };

  it('accepts a live code and says what it is worth', () => {
    const verdict = evaluatePromotion(promotion(), basket);
    assert.deepEqual(verdict, { ok: true, discountCents: 1080, freeShipping: false });
  });

  it('refuses a code that does not exist, is switched off, or is out of its window', () => {
    assert.deepEqual(evaluatePromotion(null, basket), { ok: false, reason: 'not-found' });
    assert.deepEqual(evaluatePromotion(promotion({ active: false }), basket), {
      ok: false,
      reason: 'inactive'
    });
    assert.deepEqual(
      evaluatePromotion(promotion({ startsAt: new Date('2026-06-01T00:00:00Z') }), basket),
      { ok: false, reason: 'not-started' }
    );
    assert.deepEqual(
      evaluatePromotion(promotion({ endsAt: new Date('2026-04-01T00:00:00Z') }), basket),
      { ok: false, reason: 'expired' }
    );
  });

  it('refuses a code whose redemptions are all spoken for', () => {
    assert.equal(
      evaluatePromotion(promotion({ maxRedemptions: 10, redemptionsUsed: 9 }), basket).ok,
      true
    );
    assert.deepEqual(
      evaluatePromotion(promotion({ maxRedemptions: 10, redemptionsUsed: 10 }), basket),
      {
        ok: false,
        reason: 'used-up'
      }
    );
    /**
     * `redemptionsUsed` counts the holds sitting on open checkouts as well as
     * the settled redemptions, which is the whole point of the column: nine
     * used and a tenth being paid for right now leaves nothing for this basket.
     */
    assert.equal(
      evaluatePromotion(promotion({ maxRedemptions: 1, redemptionsUsed: 1 }), basket).ok,
      false
    );
    // Uncapped codes never run out.
    assert.equal(
      evaluatePromotion(promotion({ maxRedemptions: null, redemptionsUsed: 5000 }), basket).ok,
      true
    );
  });

  it('refuses a basket under the minimum, and accepts one that reaches it exactly', () => {
    const minimum = promotion({ minSubtotalCents: 5400 });
    assert.equal(evaluatePromotion(minimum, basket).ok, true);
    assert.deepEqual(evaluatePromotion(minimum, { ...basket, subtotalCents: 5399 }), {
      ok: false,
      reason: 'minimum'
    });
  });

  it('refuses a scoped code against a basket holding nothing in that category', () => {
    assert.deepEqual(evaluatePromotion(promotion({ categoryId: 'soap' }), basket), {
      ok: false,
      reason: 'not-eligible'
    });
  });

  it('gives free shipping away only where there is shipping to give away', () => {
    const shipping = promotion({ kind: 'FREE_SHIPPING', percentOff: null });
    assert.deepEqual(evaluatePromotion(shipping, basket), {
      ok: true,
      discountCents: 0,
      freeShipping: true
    });
    // A pickup order, or one already over the free-shipping threshold.
    assert.deepEqual(evaluatePromotion(shipping, { ...basket, shippingCents: 0 }), {
      ok: false,
      reason: 'no-shipping'
    });
  });
});

describe('evaluateGiftCard', () => {
  it('spends the balance, not the money an open checkout is holding', () => {
    const held = giftCard({ balanceCents: 1500, reservedCents: 3500 });
    assert.deepEqual(evaluateGiftCard(held, { now: NOW }), { ok: true, spendableCents: 1500 });
  });

  it('refuses a card that is unknown, on hold, expired or empty', () => {
    assert.deepEqual(evaluateGiftCard(null, { now: NOW }), { ok: false, reason: 'not-found' });
    assert.deepEqual(evaluateGiftCard(giftCard({ active: false }), { now: NOW }), {
      ok: false,
      reason: 'inactive'
    });
    assert.deepEqual(
      evaluateGiftCard(giftCard({ expiresAt: new Date('2026-04-30T00:00:00Z') }), { now: NOW }),
      { ok: false, reason: 'expired' }
    );
    assert.deepEqual(evaluateGiftCard(giftCard({ balanceCents: 0 }), { now: NOW }), {
      ok: false,
      reason: 'empty'
    });
  });
});

describe('quoteDiscounts', () => {
  const basket = { lines: mixed, subtotalCents: 5400, shippingCents: 895, now: NOW };

  it('leaves a basket with no codes exactly as it found it, and says nothing', () => {
    const quote = quoteDiscounts(basket);
    assert.equal(quote.discountCents, 0);
    assert.equal(quote.totalCents, 6295);
    assert.equal(quote.promotionRefused, undefined);
    assert.equal(quote.giftCardRefused, undefined);
  });

  it('reports a code that matched nothing, rather than quietly ignoring it', () => {
    // `null` is a code the customer typed that no row matched — almost always a
    // typo, and the one refusal they most need to be told about.
    const quote = quoteDiscounts({ ...basket, promotion: null, giftCard: null });
    assert.equal(quote.promotionRefused, 'not-found');
    assert.equal(quote.giftCardRefused, 'not-found');
    assert.equal(quote.totalCents, 6295);
  });

  it('takes the promotion off first and the card off what is left', () => {
    const quote = quoteDiscounts({
      ...basket,
      promotion: promotion(),
      giftCard: giftCard({ balanceCents: 2000 })
    });
    assert.equal(quote.promoDiscountCents, 1080);
    assert.equal(quote.giftCardCents, 2000);
    assert.equal(quote.discountCents, 3080);
    // Shipping is still charged: the discount comes off the merchandise.
    assert.equal(quote.totalCents, 5400 - 3080 + 895);
  });

  it('never lets a card pay for more merchandise than the basket holds', () => {
    const quote = quoteDiscounts({
      ...basket,
      promotion: promotion(),
      giftCard: giftCard({ balanceCents: 100_000 })
    });
    assert.equal(quote.giftCardCents, 5400 - 1080);
    assert.equal(quote.discountCents, 5400);
    // What is left is the postage, which a gift card does not cover.
    assert.equal(quote.totalCents, 895);
  });

  it('zeroes the shipping for a free-shipping code and discounts nothing', () => {
    const quote = quoteDiscounts({
      ...basket,
      promotion: promotion({ kind: 'FREE_SHIPPING', percentOff: null })
    });
    assert.equal(quote.freeShipping, true);
    assert.equal(quote.shippingCents, 0);
    assert.equal(quote.promoDiscountCents, 0);
    assert.equal(quote.totalCents, 5400);
  });

  it('reports a refused code and goes on pricing the rest of the basket', () => {
    const quote = quoteDiscounts({
      ...basket,
      promotion: promotion({ active: false }),
      giftCard: giftCard({ balanceCents: 1000 })
    });
    assert.equal(quote.promotionRefused, 'inactive');
    assert.equal(quote.promoDiscountCents, 0);
    assert.equal(quote.giftCardCents, 1000);
    assert.equal(quote.totalCents, 5400 - 1000 + 895);
  });

  it('refuses a card that has nothing left to pay for rather than applying it at zero', () => {
    const quote = quoteDiscounts({
      lines: teas,
      subtotalCents: 2400,
      shippingCents: 0,
      // A code that covers the whole basket leaves the card nothing to do.
      promotion: promotion({ kind: 'PERCENT', percentOff: 100 }),
      giftCard: giftCard(),
      now: NOW
    });
    assert.equal(quote.promoDiscountCents, 2400);
    assert.equal(quote.giftCardCents, 0);
    assert.equal(quote.giftCardRefused, 'nothing-due');
    assert.equal(quote.totalCents, 0);
  });

  it('never leaves a total Stripe would refuse to charge', () => {
    // A $25 card against a $25.20 pickup order: twenty cents due is below
    // Stripe's floor, so the card holds back enough to leave a payable order.
    const quote = quoteDiscounts({
      lines: [{ unitCents: 2520, quantity: 1, categoryId: 'plant' }],
      subtotalCents: 2520,
      shippingCents: 0,
      giftCard: giftCard({ balanceCents: 2500 }),
      now: NOW
    });
    assert.equal(quote.giftCardCents, 2470);
    assert.equal(quote.totalCents, STRIPE_MINIMUM_CHARGE_CENTS);
  });

  it('lets a card that covers the whole basket cover it, down to zero', () => {
    const quote = quoteDiscounts({
      lines: [{ unitCents: 2520, quantity: 1, categoryId: 'plant' }],
      subtotalCents: 2520,
      shippingCents: 0,
      giftCard: giftCard({ balanceCents: 9000 }),
      now: NOW
    });
    assert.equal(quote.giftCardCents, 2520);
    assert.equal(quote.totalCents, 0);
  });

  it('gives away the last few cents rather than lose the order to a promotion', () => {
    // $19.70 off a $20.00 basket would leave thirty cents, which Stripe refuses.
    const quote = quoteDiscounts({
      lines: [{ unitCents: 2000, quantity: 1, categoryId: 'plant' }],
      subtotalCents: 2000,
      shippingCents: 0,
      promotion: promotion({ kind: 'AMOUNT', percentOff: null, amountOffCents: 1970 }),
      now: NOW
    });
    assert.equal(quote.promoDiscountCents, 2000);
    assert.equal(quote.totalCents, 0);
  });

  it('does not round a basket that is under the floor on its own', () => {
    // Nothing to round off here — no code was used. Quoting this at zero would
    // tell the customer an unsellable basket was free.
    const quote = quoteDiscounts({
      lines: [{ unitCents: 30, quantity: 1, categoryId: 'plant' }],
      subtotalCents: 30,
      shippingCents: 0,
      now: NOW
    });
    assert.equal(quote.promoDiscountCents, 0);
    assert.equal(quote.totalCents, 30);
  });

  it('leaves shipping alone: a postage charge is well over the floor', () => {
    const quote = quoteDiscounts({
      lines: [{ unitCents: 2520, quantity: 1, categoryId: 'plant' }],
      subtotalCents: 2520,
      shippingCents: 895,
      giftCard: giftCard({ balanceCents: 2500 }),
      now: NOW
    });
    assert.equal(quote.giftCardCents, 2500);
    assert.equal(quote.totalCents, 20 + 895);
  });

  it('holds the floor whatever the basket and the card are worth', () => {
    for (let subtotal = 100; subtotal <= 4000; subtotal += 7) {
      for (let balance = 0; balance <= 4000; balance += 13) {
        const quote = quoteDiscounts({
          lines: [{ unitCents: subtotal, quantity: 1, categoryId: 'plant' }],
          subtotalCents: subtotal,
          shippingCents: 0,
          promotion: promotion({ percentOff: 15 }),
          giftCard: giftCard({ balanceCents: balance }),
          now: NOW
        });
        assert.equal(
          quote.totalCents === 0 || quote.totalCents >= STRIPE_MINIMUM_CHARGE_CENTS,
          true,
          `subtotal ${subtotal} with ${balance} on the card left ${quote.totalCents} due`
        );
      }
    }
  });

  it('rounds nothing into existence: the parts always add up to the total', () => {
    const quote = quoteDiscounts({
      ...basket,
      promotion: promotion({ percentOff: 33 }),
      giftCard: giftCard({ balanceCents: 700 })
    });
    assert.equal(
      quote.totalCents,
      quote.subtotalCents + quote.shippingCents - quote.promoDiscountCents - quote.giftCardCents
    );
    assert.equal(quote.discountCents, quote.promoDiscountCents + quote.giftCardCents);
  });
});

describe('the words a refusal is explained in', () => {
  it('says what a customer can act on, and names the minimum where there is one', () => {
    assert.match(
      promotionRefusalMessage('minimum', { minSubtotalCents: 5000 }),
      /\$50\.00 or more/
    );
    assert.match(promotionRefusalMessage('expired'), /expired/);
    assert.match(promotionRefusalMessage('used-up'), /fully redeemed/);
    assert.match(promotionRefusalMessage('not-found'), /do not recognise/);
    assert.match(giftCardRefusalMessage('empty'), /no balance/);
    assert.match(giftCardRefusalMessage('nothing-due'), /already covered/);
  });

  it('falls back to a general refusal when no minimum is known', () => {
    assert.match(promotionRefusalMessage('minimum', null), /does not meet the conditions/);
  });
});

describe('promotionSummary', () => {
  it('reads as one line, with the category where the code is scoped to one', () => {
    assert.equal(promotionSummary(promotion()), '20% off');
    assert.equal(promotionSummary(promotion(), { categoryTitle: 'Teas' }), '20% off Teas');
    assert.equal(
      promotionSummary({ kind: 'AMOUNT', percentOff: null, amountOffCents: 500 }),
      '$5.00 off'
    );
    assert.equal(
      promotionSummary({ kind: 'FREE_SHIPPING', percentOff: null, amountOffCents: null }),
      'Free shipping'
    );
  });
});

describe('giftCardEntryMovementCents', () => {
  it('reads the balance column, except on a redemption that only clears a hold', () => {
    assert.equal(giftCardEntryMovementCents({ amountCents: 5000, reservedDeltaCents: 0 }), 5000);
    // A hold: money leaves the spendable balance for the reserved one.
    assert.equal(
      giftCardEntryMovementCents({ amountCents: -2000, reservedDeltaCents: 2000 }),
      -2000
    );
    // A redemption: the balance already moved, so the figure is the hold cleared.
    assert.equal(giftCardEntryMovementCents({ amountCents: 0, reservedDeltaCents: -2000 }), -2000);
  });
});

describe('readDiscountCodes', () => {
  it('reads both codes out of a checkout body', () => {
    assert.deepEqual(readDiscountCodes({ promoCode: ' spring20 ', giftCardCode: 'ABCD-EFGH' }), {
      promoCode: 'spring20',
      giftCardCode: 'ABCD-EFGH'
    });
  });

  it('answers with empty strings rather than throwing on anything else', () => {
    assert.deepEqual(readDiscountCodes(null), { promoCode: '', giftCardCode: '' });
    assert.deepEqual(readDiscountCodes('nope'), { promoCode: '', giftCardCode: '' });
    assert.deepEqual(readDiscountCodes({ promoCode: 12345 }), { promoCode: '', giftCardCode: '' });
  });

  it('caps the length, so the box cannot be used to post a payload', () => {
    const long = readDiscountCodes({ promoCode: 'A'.repeat(500) });
    assert.equal(long.promoCode.length, CODE_INPUT_MAX);
  });
});

describe('expiryFromDateInput', () => {
  it('covers the whole of the day that was picked, on the shop clock', () => {
    const expiry = expiryFromDateInput('2026-08-23');
    assert.ok(expiry);
    assert.equal(expiry.getFullYear(), 2026);
    // Local parts, not UTC: `new Date('2026-08-23')` is the evening of the 22nd
    // in the shop's timezone, which would show and expire a day early.
    assert.equal(expiry.getMonth(), 7);
    assert.equal(expiry.getDate(), 23);
    assert.equal(expiry.getHours(), 23);
  });

  it('leaves a card spendable all through its last day', () => {
    const card = {
      code: '0123-4567-89AB-CDEF',
      balanceCents: 2500,
      reservedCents: 0,
      active: true,
      expiresAt: expiryFromDateInput('2026-08-23')
    };
    const lastMorning = new Date(2026, 7, 23, 9, 0, 0);
    const lastEvening = new Date(2026, 7, 23, 22, 30, 0);
    const nextMorning = new Date(2026, 7, 24, 9, 0, 0);
    assert.equal(evaluateGiftCard(card, { now: lastMorning }).ok, true);
    assert.equal(evaluateGiftCard(card, { now: lastEvening }).ok, true);
    assert.deepEqual(evaluateGiftCard(card, { now: nextMorning }), {
      ok: false,
      reason: 'expired'
    });
  });

  it('answers with nothing for an empty or unparseable box', () => {
    assert.equal(expiryFromDateInput(''), null);
    assert.equal(expiryFromDateInput('   '), null);
    assert.equal(expiryFromDateInput('not a date'), null);
    assert.equal(expiryFromDateInput(null), null);
  });
});
