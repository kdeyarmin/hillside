import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  freeShippingCopy,
  freeShippingProgress,
  freeShippingSentence,
  unlocksFreeShipping,
  unlocksFreeShippingFor
} from '../lib/free-shipping.ts';
import { productSizes } from '../lib/product-sizes.ts';

const shop = { thresholdCents: 7500, flatCents: 895 };

describe('freeShippingProgress', () => {
  it('steps aside entirely when the shop has no threshold', () => {
    assert.equal(
      freeShippingProgress({ subtotalCents: 4000, thresholdCents: 0, flatCents: 895 }),
      null
    );
    assert.equal(
      freeShippingProgress({ subtotalCents: 4000, thresholdCents: -1, flatCents: 895 }),
      null
    );
  });

  it('measures what is still missing and how far along the meter is', () => {
    const progress = freeShippingProgress({ subtotalCents: 4500, ...shop });
    assert.deepEqual(progress, {
      remainingCents: 3000,
      percent: 60,
      unlocked: false,
      savesCents: 895,
      cheaperThanShipping: false
    });
  });

  it('unlocks at the threshold exactly, and never reports more than 100%', () => {
    assert.equal(freeShippingProgress({ subtotalCents: 7500, ...shop })?.unlocked, true);
    const over = freeShippingProgress({ subtotalCents: 12000, ...shop });
    assert.equal(over?.remainingCents, 0);
    assert.equal(over?.percent, 100);
    assert.equal(over?.cheaperThanShipping, false);
  });

  it('notices when the missing amount is smaller than the postage it waives', () => {
    assert.equal(freeShippingProgress({ subtotalCents: 6900, ...shop })?.cheaperThanShipping, true);
    // Equal is not cheaper.
    assert.equal(
      freeShippingProgress({ subtotalCents: 7500 - 895, ...shop })?.cheaperThanShipping,
      false
    );
    // And with no postage to waive there is nothing to be cheaper than.
    assert.equal(
      freeShippingProgress({ subtotalCents: 6900, thresholdCents: 7500, flatCents: 0 })
        ?.cheaperThanShipping,
      false
    );
  });

  it('treats a negative subtotal as an empty basket', () => {
    const progress = freeShippingProgress({ subtotalCents: -5, ...shop });
    assert.equal(progress?.remainingCents, 7500);
    assert.equal(progress?.percent, 0);
  });
});

describe('unlocksFreeShipping', () => {
  it('is true only for something that carries the basket over the line', () => {
    const progress = freeShippingProgress({ subtotalCents: 6000, ...shop });
    assert.equal(unlocksFreeShipping(progress, 1500), true);
    assert.equal(unlocksFreeShipping(progress, 1499), false);
  });

  it('is never true once shipping is already free, or with no threshold', () => {
    assert.equal(
      unlocksFreeShipping(freeShippingProgress({ subtotalCents: 9000, ...shop }), 1),
      false
    );
    assert.equal(unlocksFreeShipping(null, 100000), false);
  });
});

describe('the meter’s sentence', () => {
  it('says what adding more is worth', () => {
    const progress = freeShippingProgress({ subtotalCents: 4500, ...shop })!;
    assert.equal(
      freeShippingSentence(progress),
      'Add $30.00 more for free standard shipping and save the $8.95 postage.'
    );
    assert.equal(freeShippingCopy(progress).emphasis, '$30.00');
  });

  it('points out when the last few dollars cost less than the postage', () => {
    const progress = freeShippingProgress({ subtotalCents: 6900, ...shop })!;
    assert.equal(
      freeShippingSentence(progress),
      'Add $6.00 more for free standard shipping — less than the $8.95 it would cost to post.'
    );
  });

  it('celebrates the unlock with the figure saved', () => {
    const progress = freeShippingProgress({ subtotalCents: 8000, ...shop })!;
    assert.equal(
      freeShippingSentence(progress),
      'Free standard shipping unlocked — you’re saving $8.95 on this order.'
    );
    assert.equal(freeShippingCopy(progress).emphasis, 'Free standard shipping unlocked');
  });

  it('does not promise a saving the shop does not charge for', () => {
    const short = freeShippingProgress({
      subtotalCents: 4500,
      thresholdCents: 7500,
      flatCents: 0
    })!;
    assert.equal(freeShippingSentence(short), 'Add $30.00 more for free standard shipping.');
    const unlocked = freeShippingProgress({
      subtotalCents: 9000,
      thresholdCents: 7500,
      flatCents: 0
    })!;
    assert.equal(freeShippingSentence(unlocked), 'Free standard shipping unlocked on this order.');
  });
});

/**
 * The tag on a suggestion is a promise that adding this one thing makes the
 * order ship free. Price alone does not make that true: a pickup-only plant
 * clears any threshold and still cannot be posted, and putting it in a shipped
 * basket leaves a cart checkout refuses to sell.
 */
describe('unlocksFreeShippingFor', () => {
  const progress = freeShippingProgress({ subtotalCents: 6000, ...shop });

  it('tags a shippable product priced over the gap', () => {
    assert.equal(unlocksFreeShippingFor(progress, [], { priceCents: 1500 }), true);
    assert.equal(unlocksFreeShippingFor(progress, [], { priceCents: 1499 }), false);
  });

  it('never tags a product that does not ship, whatever it costs', () => {
    assert.equal(unlocksFreeShippingFor(progress, [], { priceCents: 9900, ships: false }), false);
  });

  it('measures a sized product by its cheapest shippable size', () => {
    const mixed = productSizes(
      [
        { label: '4" pot', priceCents: 1000, ships: false, pickup: true },
        { label: '8" specimen', priceCents: 1500, ships: true, pickup: true }
      ],
      1000
    );
    // The $10 pickup-only pot does not qualify and must not disqualify the
    // $15 one that does.
    assert.equal(unlocksFreeShippingFor(progress, mixed, { priceCents: 1000 }), true);

    const pickupOnly = productSizes(
      [{ label: '10" specimen', priceCents: 9500, ships: false, pickup: true }],
      9500
    );
    assert.equal(unlocksFreeShippingFor(progress, pickupOnly, { priceCents: 9500 }), false);
  });

  it('is false once shipping is already free, and with no threshold', () => {
    const unlocked = freeShippingProgress({ subtotalCents: 9000, ...shop });
    assert.equal(unlocksFreeShippingFor(unlocked, [], { priceCents: 5000 }), false);
    assert.equal(unlocksFreeShippingFor(null, [], { priceCents: 100000 }), false);
  });
});
