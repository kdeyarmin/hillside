import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  freeShippingCopy,
  freeShippingProgress,
  freeShippingSentence,
  unlocksFreeShipping
} from '../lib/free-shipping.ts';

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
