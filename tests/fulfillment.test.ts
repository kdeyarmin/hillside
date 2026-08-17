import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  cartFulfillment,
  fulfillmentBlurb,
  orderStatusHeading,
  readFulfillmentChoice,
  readGiftMessage,
  resolveFulfillment,
  sanitizeGiftMessage,
  shippingMethodLabel,
  GIFT_MESSAGE_MAX
} = await import('../lib/fulfillment.ts');

describe('sanitizeGiftMessage', () => {
  it('trims, drops control characters, and returns null when empty', () => {
    assert.equal(sanitizeGiftMessage('  Happy birthday, Mom.  '), 'Happy birthday, Mom.');
    assert.equal(sanitizeGiftMessage('   \n  '), null);
    assert.equal(sanitizeGiftMessage(12), null);
    assert.equal(sanitizeGiftMessage('line\u0007one'), 'lineone');
  });

  it('keeps newlines and caps the note', () => {
    assert.equal(sanitizeGiftMessage('For Sam.\nLove, Ada'), 'For Sam.\nLove, Ada');
    const long = 'x'.repeat(GIFT_MESSAGE_MAX + 40);
    assert.equal(sanitizeGiftMessage(long)?.length, GIFT_MESSAGE_MAX);
  });
});

describe('readGiftMessage and readFulfillmentChoice', () => {
  it('reads a gift note from the checkout body', () => {
    assert.equal(readGiftMessage({ giftMessage: '  Enjoy.  ' }), 'Enjoy.');
    assert.equal(readGiftMessage({ items: [] }), null);
    assert.equal(readGiftMessage(null), null);
  });

  it('treats anything other than pickup as ship', () => {
    assert.equal(readFulfillmentChoice({ fulfillment: 'pickup' }), 'PICKUP');
    assert.equal(readFulfillmentChoice({ fulfillment: 'PICKUP' }), 'PICKUP');
    assert.equal(readFulfillmentChoice({ fulfillment: 'ship' }), 'SHIP');
    assert.equal(readFulfillmentChoice({ fulfillment: 'bike' }), 'SHIP');
    assert.equal(readFulfillmentChoice(null), 'SHIP');
  });
});

describe('cartFulfillment', () => {
  it('lets a mixed-capable cart ship or pick up', () => {
    const options = cartFulfillment([
      { ships: true, pickup: true },
      { ships: true, pickup: true }
    ]);
    assert.deepEqual(options, {
      canShip: true,
      canPickup: true,
      forced: null,
      conflict: false
    });
  });

  it('forces pickup when any piece cannot ship', () => {
    const options = cartFulfillment([
      { ships: false, pickup: true },
      { ships: true, pickup: true }
    ]);
    assert.equal(options.canShip, false);
    assert.equal(options.canPickup, true);
    assert.equal(options.forced, 'PICKUP');
    assert.equal(options.conflict, false);
  });

  it('flags a cart that cannot be fulfilled one way', () => {
    const options = cartFulfillment([
      { ships: false, pickup: true },
      { ships: true, pickup: false }
    ]);
    assert.equal(options.conflict, true);
    assert.equal(options.canShip, false);
    assert.equal(options.canPickup, false);
  });

  it('treats missing flags as both allowed, so old baskets still work', () => {
    const options = cartFulfillment([{}]);
    assert.equal(options.canShip, true);
    assert.equal(options.canPickup, true);
  });
});

describe('resolveFulfillment', () => {
  it('accepts the customer choice when the cart allows it', () => {
    const options = cartFulfillment([{ ships: true, pickup: true }]);
    assert.deepEqual(resolveFulfillment('PICKUP', options), { ok: true, method: 'PICKUP' });
  });

  it('overrides a ship request when the cart is pickup only', () => {
    const options = cartFulfillment([{ ships: false, pickup: true }]);
    assert.deepEqual(resolveFulfillment('SHIP', options), { ok: true, method: 'PICKUP' });
  });

  it('refuses a conflicting cart instead of guessing', () => {
    const options = cartFulfillment([
      { ships: false, pickup: true },
      { ships: true, pickup: false }
    ]);
    const result = resolveFulfillment('PICKUP', options);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /mixes pieces/);
  });
});

describe('labels', () => {
  it('names the shipping method the customer actually chose', () => {
    assert.equal(shippingMethodLabel('PICKUP', 0), 'Local pickup');
    assert.equal(shippingMethodLabel('SHIP', 0), 'Free standard shipping');
    assert.equal(shippingMethodLabel('SHIP', 895), 'Standard shipping');
  });

  it('describes how a piece gets home without inventing SKUs', () => {
    assert.match(fulfillmentBlurb({ ships: true, pickup: true }), /Local pickup in Ebensburg/);
    assert.match(fulfillmentBlurb({ ships: false, pickup: true }), /Local pickup only/);
    assert.equal(fulfillmentBlurb({ ships: true, pickup: false }), 'Ships to US addresses.');
  });

  it('uses pickup language on the status page', () => {
    assert.equal(
      orderStatusHeading({ status: 'FULFILLED', fulfillmentMethod: 'PICKUP' }),
      'Your order is ready for pickup.'
    );
    assert.equal(
      orderStatusHeading({ status: 'PAID', fulfillmentMethod: 'PICKUP' }),
      'We are preparing your pickup.'
    );
    assert.equal(
      orderStatusHeading({ status: 'FULFILLED', fulfillmentMethod: 'SHIP' }),
      'Your order has shipped.'
    );
  });
});
