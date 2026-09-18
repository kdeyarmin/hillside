import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bulkOrderPrefill, lineCapNote, lineCeiling, lineScarcityNote } from '../lib/cart-lines.ts';
import { clampQuantity, LINE_QUANTITY_MAX } from '../lib/store.ts';

/**
 * The regression these exist for: the cart let a shopper build a line of 24 and
 * total it at 24, while checkout clamped the same line to 20 and charged for
 * that — no adjustment shown, no message, the order quietly cut back after the
 * customer had authorised payment.
 */
describe('per-order quantity ceiling', () => {
  it('clamps a line to the per-order maximum even when the shelf holds more', () => {
    assert.equal(clampQuantity(24, 50), LINE_QUANTITY_MAX);
    assert.equal(clampQuantity(LINE_QUANTITY_MAX + 1, 999), LINE_QUANTITY_MAX);
  });

  it('still stops at the shelf when the shelf is the smaller of the two', () => {
    assert.equal(clampQuantity(24, 3), 3);
    assert.equal(clampQuantity(5, 3), 3);
  });

  it('keeps the existing floor of one', () => {
    assert.equal(clampQuantity(0, 10), 1);
    assert.equal(clampQuantity(-4, 10), 1);
    // A product with nothing on the bench still reads as one, as it always has:
    // the caller decides whether a sold-out line may be added at all.
    assert.equal(clampQuantity(3, 0), 1);
  });

  it('agrees with what the stepper is allowed to climb to', () => {
    assert.equal(lineCeiling({ inventory: 50 }), LINE_QUANTITY_MAX);
    assert.equal(lineCeiling({ inventory: 3 }), 3);
    assert.equal(lineCeiling({ inventory: 0 }), 1);
  });
});

describe('why the plus button stopped', () => {
  it('names the shelf when the shelf is what ran out', () => {
    assert.equal(lineCapNote({ inventory: 2 }), 'Only 2 available.');
  });

  it('names the per-order limit when the shelf has plenty', () => {
    assert.equal(
      lineCapNote({ inventory: 500 }),
      `${LINE_QUANTITY_MAX} is the most we sell in one order.`
    );
  });

  /**
   * Both constraints bind at exactly the ceiling. The shelf is the more useful
   * thing to say — "only 20 available" is true and actionable, where quoting the
   * policy would imply more could be had by ordering twice.
   */
  it('prefers the shelf when the two coincide', () => {
    assert.equal(
      lineCapNote({ inventory: LINE_QUANTITY_MAX }),
      `Only ${LINE_QUANTITY_MAX} available.`
    );
  });
});

describe('the basket’s own "only N left"', () => {
  it('speaks up only when the shelf is nearly bare', () => {
    assert.equal(lineScarcityNote({ inventory: 2, quantity: 1 }), 'Only 2 left in stock.');
    assert.equal(lineScarcityNote({ inventory: 12, quantity: 1 }), null);
  });

  it('stays quiet once the line already holds everything there is', () => {
    // The cap note beside the plus button says it; saying it twice is nagging.
    assert.equal(lineScarcityNote({ inventory: 2, quantity: 2 }), null);
    assert.equal(lineScarcityNote({ inventory: 0, quantity: 1 }), null);
  });

  it('counts a set in sets', () => {
    assert.equal(lineScarcityNote({ inventory: 1, quantity: 1, kind: 'bundle' }), null);
    assert.equal(
      lineScarcityNote({ inventory: 3, quantity: 1, kind: 'bundle' }),
      'Only 3 sets left to make up.'
    );
  });
});

describe('the bulk-order note a capped line starts', () => {
  it('names the line, and its size when it has one', () => {
    assert.equal(
      bulkOrderPrefill({ name: 'Golden Pothos' }),
      'I would like more Golden Pothos than the shop lets me add to the basket. '
    );
    assert.equal(
      bulkOrderPrefill({ name: 'Golden Pothos', size: '6" pot' }),
      'I would like more Golden Pothos (6" pot) than the shop lets me add to the basket. '
    );
  });
});
