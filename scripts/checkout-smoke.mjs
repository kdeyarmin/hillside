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
const DISPOSABLE = 'yes-this-database-is-disposable';

/**
 * Both halves of "where does this write land" have to be checked, not one.
 *
 * The database this script asserts against and the site whose routes it posts
 * to are configured separately, so a local `DATABASE_URL` proves nothing about
 * where `SMOKE_BASE_URL` sends its writes. Checked apart, a local database and
 * a remote site would pass the guard while every checkout reserved stock on
 * the remote one and every cleanup ran against the local one.
 */
const dbUrl = process.env.DATABASE_URL || '';
const localish = (value) => /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/.test(value);
const acknowledged = process.env.CHECKOUT_SMOKE_ALLOW_REMOTE === DISPOSABLE;
if (!acknowledged) {
  const dbLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl);
  if (!dbLocal || !localish(BASE)) {
    console.error('Refusing to run: this must point at a local database AND a local site.');
    console.error(`  DATABASE_URL   local: ${dbLocal}`);
    console.error(`  SMOKE_BASE_URL local: ${localish(BASE)}  (${BASE})`);
    console.error(`Set CHECKOUT_SMOKE_ALLOW_REMOTE=${DISPOSABLE} to override.`);
    process.exit(2);
  }
}

/**
 * The rollback case works by failing at Stripe on purpose. A live key is
 * refused outright — no test belongs near the shop's real account.
 *
 * This only sees the key in *this* process, though, and the site under test is
 * a server that was started separately: it may hold a perfectly good key
 * whatever is set here. So the guard is a backstop, not the mechanism. What
 * actually keeps the run honest is the rollback case below, which requires
 * proof that a reservation was made and released, and releases the hold
 * through the shop's own cancel route if the checkout unexpectedly succeeds.
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

/** Order ids this run is responsible for, and nothing else. */
const myOrderIds = new Set();

/**
 * Posts a checkout and returns the order it created, if it created one.
 *
 * Which orders belong to this run has to be settled per call rather than by
 * diffing the table at the end: on a shared server an unrelated checkout can
 * land mid-run, and "every row I had not seen before" would sweep somebody
 * else's order — pending or paid — into the cleanup.
 */
async function checkout(body) {
  const before = new Set((await db.order.findMany({ select: { id: true } })).map((o) => o.id));
  const response = await post('/api/checkout', body);
  const created = (await db.order.findMany({ select: { id: true }, orderBy: { createdAt: 'desc' } }))
    .filter((o) => !before.has(o.id));
  created.forEach((o) => myOrderIds.add(o.id));
  return { ...response, orderIds: created.map((o) => o.id) };
}

try {
  undo.push(async () => {
    const ids = [...myOrderIds];
    if (!ids.length) return;
    await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
  });

  /**
   * Two things the basket product has to be, both of which used to be true by
   * luck of which product happened to be cheapest.
   *
   * It must be sold one way. Every line built below carries no size, and the
   * checkout refuses a sized product addressed without one — correctly, but it
   * refuses at validation, so every check after it measures the refusal rather
   * than the thing it was written for.
   *
   * And it should hold fewer than 20, because a line's quantity is capped at 20
   * on the way in: a deeper shelf cannot be oversold through one line, and the
   * oversell check below can only report itself skipped. That one is a
   * preference rather than a requirement — a catalog with nothing shallow still
   * runs everything else.
   */
  const candidates = await db.product.findMany({
    where: { active: true, inventory: { gte: 5 } },
    orderBy: { priceCents: 'asc' }
  });
  const oneSize = candidates.filter(
    (row) => !Array.isArray(row.sizes) || row.sizes.length === 0
  );
  const product = oneSize.find((row) => row.inventory < 20) || oneSize[0];
  if (!product) {
    throw new Error('no sellable one-size product to test with');
  }
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
     * customer the corrected figure before anything is charged.
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
    check('quote: the card was accepted', !json?.giftCardError, `err=${json?.giftCardError}`);
    /**
     * Equality, not "no more than". A card that stopped applying altogether
     * would report zero, and zero is always within the bound — so the loose
     * check would pass while gift cards silently did nothing.
     */
    check('quote: the card pays exactly what is left owing', json?.giftCardCents === expected, `card=${json?.giftCardCents} expected=${expected}`);
    /**
     * Shipping is deliberately in the total and deliberately not in what
     * either code can pay against: both come off the merchandise, because a
     * Stripe coupon can only come off the line items. So a card that covers
     * the goods outright still leaves the postage to pay.
     */
    const shipping = json?.shippingCents ?? 0;
    check('quote: what is left to pay is the merchandise plus postage, less both codes',
      json?.totalCents === subtotal + shipping - promoOff - expected,
      `total=${json?.totalCents} (subtotal ${subtotal} + shipping ${shipping} - promo ${promoOff} - card ${expected})`);
  }

  // ------------------------- quoting must not move a penny of the balance
  {
    const after = await db.giftCard.findUnique({ where: { id: card.id } });
    check('quote: asking what a card is worth does not spend it', after.balanceCents === 2500 && after.reservedCents === 0, `balance=${after.balanceCents} reserved=${after.reservedCents}`);
  }

  // --------------------------------------------------- overselling the shelf
  {
    /**
     * A line's quantity is capped at 20 on the way in, so a shelf holding 20
     * or more cannot be oversold through one line at all. Saying that is the
     * honest answer; recording a pass for a case that was never exercised
     * would advertise coverage this does not have.
     */
    const wanted = product.inventory + 1;
    if (wanted > 20) {
      check('checkout: overselling is corrected, not sold', false,
        `not exercised — ${product.slug} holds ${product.inventory} and a line is capped at 20`);
    } else {
      const { status, json } = await checkout({ items: line(wanted), fulfillment: 'SHIP' });
      check('checkout: overselling is corrected, not sold',
        status === 409 && Array.isArray(json?.adjustments), `asked ${wanted} of ${product.inventory}, HTTP ${status}`);
    }
  }

  // ---------------- the rollback: a checkout that dies at Stripe must give back
  // both the stock it took and the customer's own money.
  {
    const before = await db.product.findUnique({ where: { id: product.id } });
    const cardBefore = await db.giftCard.findUnique({ where: { id: card.id } });

    const { status, json, orderIds } = await checkout({
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
      check('rollback: the checkout failed at Stripe, as this case requires', false,
        sessionId
          ? 'checkout SUCCEEDED against a working key; hold released via /api/checkout/cancel'
          : 'checkout SUCCEEDED and returned no session id — release the hold by hand');
    } else if (!orderIds.length) {
      /**
       * The single most important assertion here, and the easiest to lose.
       *
       * Any 4xx or 5xx used to satisfy this case — but a 429 from the hold
       * limiter, a 503 from a site with no Stripe key, or a fulfillment
       * refusal all fail *before* anything is reserved. Nothing is held, so
       * every "it was given back" check below passes without the rollback
       * having run at all. An order row is the proof that a reservation was
       * actually made; without one there is nothing to have rolled back.
       */
      check('rollback: the checkout got far enough to reserve anything', false,
        `HTTP ${status} — failed before reserving, so the rollback path was never entered: ${JSON.stringify(json).slice(0, 120)}`);
    } else {
      check('rollback: the checkout reserved, then failed at Stripe', true, `HTTP ${status}, order created`);

      /**
       * `releaseProductHold` cancels the order and stamps `inventoryRestoredAt`,
       * so both together are the record that the release actually ran — rather
       * than the stock merely happening to look right.
       */
      const order = await db.order.findUnique({ where: { id: orderIds[0] } });
      check('rollback: the order was cancelled and its stock stamped as restored',
        order?.status === 'CANCELLED' && Boolean(order?.inventoryRestoredAt),
        `status=${order?.status} inventoryRestoredAt=${order?.inventoryRestoredAt ? 'set' : 'null'}`);

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
  }
} finally {
  /**
   * Cleanup failures are failures. A run that leaves a promotion, a card or a
   * reservation behind has not done what this script promises, and reporting
   * success because the functional checks passed would be the one lie that
   * matters most here.
   */
  for (const step of undo.reverse()) {
    try {
      await step();
    } catch (error) {
      check('cleanup: everything this run created was removed', false, error.message);
    }
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
