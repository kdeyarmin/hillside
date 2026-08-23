/**
 * Drives a real basket through the checkout, against a running site.
 *
 * The money rules live as pure functions in `lib/discounts.ts` and are unit
 * tested there, but what a shopper is actually charged depends on the route
 * around them: whether it re-prices the basket from the shop's own rows, what
 * it does when a code stops working mid-checkout, and — the one that costs a
 * customer real money if it is wrong — whether a checkout that fails on its
 * way to Stripe gives back the gift-card balance and the stock it had already
 * taken.
 *
 * That last case is why this exists. `reserveProductOrder` runs *before* the
 * Stripe call, so anything that throws at Stripe leaves a hold behind unless
 * the route cleans it up. Pointing the site at an unusable Stripe key makes
 * every checkout fail exactly there, which is the cheapest way to prove the
 * rollback actually runs.
 *
 *   DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_not_a_real_key \
 *     node scripts/checkout-smoke.mjs
 *
 * Exits non-zero on the first failed expectation, listing every failure.
 */
import { randomInt } from 'crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

const url = process.env.DATABASE_URL || '';
const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
if (!isLocal && process.env.CHECKOUT_SMOKE_ALLOW_REMOTE !== 'yes-this-database-is-disposable') {
  console.error('Refusing to run: DATABASE_URL is not local.');
  console.error('This script mints codes and reserves stock. Point it at a scratch database,');
  console.error('or set CHECKOUT_SMOKE_ALLOW_REMOTE=yes-this-database-is-disposable.');
  process.exit(2);
}

/**
 * The rollback case works by failing at Stripe on purpose, which means the key
 * this runs against is expected to be unusable. Against a *working* key the
 * checkout would instead succeed — opening a real Stripe session and leaving
 * the stock and the customer's balance genuinely held, which deleting the
 * order afterwards does not release.
 *
 * A live key is refused outright: no test belongs anywhere near the shop's
 * real account. A working test key is not refused here, because it cannot be
 * told apart from an unusable one by looking — instead the rollback case below
 * notices that the checkout succeeded, releases the hold through the shop's
 * own cancel route, and fails rather than pretending it proved anything.
 */
if ((process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')) {
  console.error('Refusing to run: STRIPE_SECRET_KEY is a live key.');
  console.error('This script deliberately fails checkouts. Use a test key, or an unusable one.');
  process.exit(2);
}

const db = new PrismaClient();
const results = [];
const undo = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* some paths answer with no body */ }
  return { status: res.status, json };
};

try {
  /**
   * A failed checkout leaves its order behind on purpose — released, but kept,
   * because the shop's record of an attempt is not something a failure should
   * erase. That is right for the shop and wrong for a test, so the orders this
   * run causes are noted here and removed at the end. Anything that existed
   * before is left alone.
   */
  const preexistingOrders = new Set(
    (await db.order.findMany({ select: { id: true } })).map((o) => o.id)
  );
  undo.push(async () => {
    const mine = (await db.order.findMany({ select: { id: true } }))
      .map((o) => o.id)
      .filter((id) => !preexistingOrders.has(id));
    if (!mine.length) return;
    await db.orderItem.deleteMany({ where: { orderId: { in: mine } } });
    await db.order.deleteMany({ where: { id: { in: mine } } });
  });

  // A product with plenty of stock, priced in whole dollars for legible sums.
  const product = await db.product.findFirst({ where: { active: true, inventory: { gte: 5 } }, orderBy: { priceCents: 'asc' } });
  if (!product) throw new Error('no sellable product to test with');
  const line = (quantity = 1, priceCents = product.priceCents) => ([
    { id: product.slug, kind: 'product', quantity, priceCents }
  ]);
  const unit = product.priceCents;
  console.log(`basket product: ${product.slug} @ ${unit}c, stock ${product.inventory}\n`);

  // ------------------------------------------------------------- fixtures
  const promoCode = 'CHK' + String(Date.now()).slice(-7);
  const promo = await db.promotion.create({
    data: { code: promoCode, kind: 'PERCENT', percentOff: 20, minSubtotalCents: 0, active: true }
  });
  undo.push(() => db.promotion.delete({ where: { id: promo.id } }));

  const bigPromoCode = 'MIN' + String(Date.now()).slice(-7);
  const bigPromo = await db.promotion.create({
    // A minimum far above the basket, so it must be refused for that reason.
    data: { code: bigPromoCode, kind: 'PERCENT', percentOff: 50, minSubtotalCents: 99_999_00, active: true }
  });
  undo.push(() => db.promotion.delete({ where: { id: bigPromo.id } }));

  /**
   * Built to the shop's code format rather than by hand: sixteen characters
   * from the alphabet in `lib/discount-codes.ts`, in groups of four. Anything
   * else is refused at lookup, so a hand-written code would be rejected before
   * the checkout ever reserved anything — and every rollback check below would
   * then pass while proving nothing at all.
   *
   * The alphabet is duplicated rather than imported because that module is
   * TypeScript and this is a plain script; `tests/discount-codes.test.ts`
   * covers the real generator. `randomInt` rather than `Math.random` because a
   * code is a bearer token, and there is no reason for a test to mint a weaker
   * one than the shop does.
   */
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // lib/discount-codes.ts
  const cardCode = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  ).join('-');
  const card = await db.giftCard.create({
    data: { code: cardCode, initialCents: 2500, balanceCents: 2500, active: true }
  });
  undo.push(async () => {
    await db.giftCardEntry.deleteMany({ where: { giftCardId: card.id } });
    await db.giftCard.delete({ where: { id: card.id } });
  });

  // --------------------------------------------------- quoting a promo code
  {
    const { status, json } = await post('/api/discounts', { items: line(2), promoCode });
    const subtotal = unit * 2;
    check('quote: promo accepted', status === 200 && !json?.promotionError, `HTTP ${status} ${json?.promotionError || ''}`);
    check('quote: subtotal read from the shop, not the basket', json?.subtotalCents === subtotal, `${json?.subtotalCents} vs ${subtotal}`);
    check('quote: 20% off is a fifth of the merchandise', json?.promoDiscountCents === Math.round(subtotal * 0.2), `${json?.promoDiscountCents}`);
  }

  // ---------------------------------- the browser's price must not set the charge
  {
    /**
     * A basket claiming a penny a bar is not quietly re-priced and quoted —
     * it is refused, with the real price named, so the cart has to show the
     * customer the corrected figure before anything is charged. That is a
     * stronger guarantee than silently ignoring the browser's number: a
     * shopper never reaches a payment page showing a total they never saw.
     */
    const { status, json } = await post('/api/discounts', { items: line(2, 1), promoCode });
    const adjustment = json?.adjustments?.[0];
    check('quote: a basket claiming 1c is refused, not quoted', status === 409, `HTTP ${status}`);
    check('quote: the refusal names the price as the reason', adjustment?.reason === 'price', `reason=${adjustment?.reason}`);
    check('quote: the refusal carries the shop’s real price', adjustment?.priceCents === unit, `${adjustment?.priceCents} vs ${unit}`);
  }

  // ------------------------------------------------------------- refusals
  {
    const { json } = await post('/api/discounts', { items: line(1), promoCode: bigPromoCode });
    check('quote: a code under its minimum is refused, saying so', /or more/.test(json?.promotionError || ''), `msg=${json?.promotionError}`);
  }
  {
    const { json } = await post('/api/discounts', { items: line(1), promoCode: 'NOPE-NOT-A-CODE' });
    check('quote: an unknown code is refused, saying so', /do not recognise/.test(json?.promotionError || ''), `msg=${json?.promotionError}`);
  }
  {
    const { json } = await post('/api/discounts', { items: line(1), giftCardCode: 'NOPE-NOPE-NOPE-NOPE' });
    check('quote: an unknown card is refused, saying so', /do not recognise/.test(json?.giftCardError || ''), `msg=${json?.giftCardError}`);
  }

  // ------------------------------------- a card spends against what is left
  {
    const { json } = await post('/api/discounts', { items: line(2), promoCode, giftCardCode: cardCode });
    const subtotal = unit * 2;
    const promoOff = Math.round(subtotal * 0.2);
    const due = subtotal - promoOff;
    const expected = Math.min(2500, due);
    check('quote: the promotion comes off before the card is spent', json?.promoDiscountCents === promoOff, `promo=${json?.promoDiscountCents}`);
    check('quote: the card pays no more than what is left owing', json?.giftCardCents <= expected, `card=${json?.giftCardCents} due=${due}`);
    const total = json?.totalCents;
    check('quote: total is never below zero', typeof total === 'number' && total >= 0, `total=${total}`);
  }

  // ------------------------- quoting must not move a penny of the balance
  {
    const after = await db.giftCard.findUnique({ where: { id: card.id } });
    check('quote: asking what a card is worth does not spend it', after.balanceCents === 2500 && after.reservedCents === 0, `balance=${after.balanceCents} reserved=${after.reservedCents}`);
  }

  // --------------------------------------------------- overselling the shelf
  {
    const { status, json } = await post('/api/checkout', { items: line(20), fulfillment: 'SHIP' });
    const oversold = product.inventory < 20;
    if (oversold) {
      check('checkout: asking for more than the shelf holds is corrected, not sold', status === 409 && Array.isArray(json?.adjustments), `HTTP ${status}`);
    } else {
      check('checkout: shelf deep enough that overselling could not be tested', true, `stock=${product.inventory}`);
    }
  }

  // ---------------- the rollback: a checkout that dies at Stripe must give back
  // both the stock it took and the customer's own money.
  {
    const before = await db.product.findUnique({ where: { id: product.id } });
    const cardBefore = await db.giftCard.findUnique({ where: { id: card.id } });

    const { status, json } = await post('/api/checkout', {
      items: line(1), fulfillment: 'SHIP', giftCardCode: cardCode
    });

    if (status < 400) {
      /**
       * The key works, so this checkout really did reserve stock and really
       * did take the balance down. Put it back through the shop's own cancel
       * route — the same one the cart posts to — rather than leaving a hold
       * behind or reaching into the tables to undo it by hand.
       */
      const sessionId = String(json?.url || '').match(/cs_[A-Za-z0-9_]+/)?.[0];
      if (sessionId) await post('/api/checkout/cancel', { sessionId });
      check(
        'checkout: the Stripe key is unusable, as the rollback case requires',
        false,
        sessionId
          ? 'checkout SUCCEEDED against a working key; the hold has been released via /api/checkout/cancel'
          : 'checkout SUCCEEDED and no session id was returned — release the hold by hand'
      );
    } else {
      check('checkout: an unusable Stripe key fails the checkout', true, `HTTP ${status}`);
    }

    // The release is awaited inside the route before it answers, so by the time
    // we have a response the shelf and the card should already be whole.
    const after = await db.product.findUnique({ where: { id: product.id } });
    const cardAfter = await db.giftCard.findUnique({ where: { id: card.id } });

    check('rollback: the stock goes back on the shelf', after.inventory === before.inventory, `${before.inventory} -> ${after.inventory}`);
    check('rollback: the gift card balance is returned', cardAfter.balanceCents === cardBefore.balanceCents, `${cardBefore.balanceCents} -> ${cardAfter.balanceCents}`);
    check('rollback: nothing is left held against the card', cardAfter.reservedCents === 0, `reserved=${cardAfter.reservedCents}`);

    const stranded = await db.order.findMany({
      where: { giftCardId: card.id, status: 'PENDING', discountsReleasedAt: null }
    });
    check('rollback: no pending order left holding the card', stranded.length === 0, `${stranded.length} stranded`);
  }
} finally {
  for (const step of undo.reverse()) {
    await step().catch((error) => console.error('cleanup step failed:', error.message));
  }
  await db.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + '='.repeat(60));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? '  ' + f.detail : '')));
}
process.exit(failed.length ? 1 : 0);
