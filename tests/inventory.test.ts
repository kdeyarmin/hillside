import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  needsReorder,
  needsRestocking,
  nextRestockedAt,
  missingReorderPoint,
  recentlyRestocked,
  reorderSuggestion,
  restockDateValue,
  restockedLabel
} from '../lib/inventory.ts';

const stocked = { active: true, inventory: 6, reorderPoint: 4 };

describe('needsRestocking', () => {
  it('is about what is actually for sale and actually empty', () => {
    assert.equal(needsRestocking({ active: true, inventory: 0 }), true);
    assert.equal(needsRestocking({ active: true, inventory: 1 }), false);
    // Archived products are not a job — they are already off the shop.
    assert.equal(needsRestocking({ active: false, inventory: 0 }), false);
  });

  it('leaves a made-to-order product alone', () => {
    // Nothing on the shelf is the design, not a problem to be chased.
    assert.equal(
      needsRestocking({ active: true, inventory: 0, inventoryStatus: 'MADE_TO_ORDER' }),
      false
    );
    // Discontinued still shows: selling out is when it wants archiving.
    assert.equal(
      needsRestocking({ active: true, inventory: 0, inventoryStatus: 'DISCONTINUED' }),
      true
    );
  });
});

describe('needsReorder', () => {
  it('fires at the reorder point, not below it', () => {
    assert.equal(needsReorder(stocked), false);
    assert.equal(needsReorder({ ...stocked, inventory: 4 }), true);
    assert.equal(needsReorder({ ...stocked, inventory: 0 }), true);
  });

  it('says nothing without a reorder point', () => {
    assert.equal(needsReorder({ active: true, inventory: 0 }), false);
    // Zero is a real answer — reorder when the last one goes.
    assert.equal(needsReorder({ active: true, inventory: 0, reorderPoint: 0 }), true);
  });

  it('drops off the list once the order has been placed', () => {
    assert.equal(needsReorder({ ...stocked, inventory: 2, inventoryStatus: 'ON_ORDER' }), false);
    assert.equal(needsReorder({ ...stocked, inventory: 2, inventoryStatus: 'SEASONAL' }), false);
    assert.equal(needsReorder({ ...stocked, inventory: 2, inventoryStatus: 'STOCKED' }), true);
  });
});

describe('missingReorderPoint', () => {
  it('only counts products somebody would actually reorder', () => {
    assert.equal(missingReorderPoint({ active: true, inventory: 3 }), true);
    assert.equal(missingReorderPoint(stocked), false);
    assert.equal(missingReorderPoint({ active: false, inventory: 3 }), false);
    assert.equal(
      missingReorderPoint({ active: true, inventory: 3, inventoryStatus: 'DISCONTINUED' }),
      false
    );
  });
});

describe('reorderSuggestion', () => {
  it('prefers the stated quantity', () => {
    assert.equal(reorderSuggestion({ ...stocked, reorderQuantity: 24 }), 24);
  });

  it('otherwise orders enough to clear the reorder point', () => {
    assert.equal(reorderSuggestion({ active: true, inventory: 1, reorderPoint: 4 }), 4);
    // Never "order none": a suggestion of zero is not a suggestion.
    assert.equal(reorderSuggestion({ active: true, inventory: 9, reorderPoint: 4 }), 1);
    assert.equal(reorderSuggestion({ active: true, inventory: 2 }), null);
  });
});

describe('recentlyRestocked', () => {
  const now = new Date('2026-08-22T12:00:00Z');

  it('covers the last fortnight', () => {
    assert.equal(recentlyRestocked({ active: true, inventory: 4 }, now), false);
    assert.equal(
      recentlyRestocked({ active: true, inventory: 4, lastRestockedAt: '2026-08-20' }, now),
      true
    );
    assert.equal(
      recentlyRestocked({ active: true, inventory: 4, lastRestockedAt: '2026-07-01' }, now),
      false
    );
  });

  it('reads as something a person would say', () => {
    const at = (date: string) => ({ active: true, inventory: 4, lastRestockedAt: date });
    assert.equal(restockedLabel(at('2026-08-22'), now), 'Restocked today');
    assert.equal(restockedLabel(at('2026-08-21'), now), 'Restocked yesterday');
    assert.equal(restockedLabel(at('2026-08-19'), now), 'Restocked 3 days ago');
    assert.equal(restockedLabel(at('2026-06-22'), now), 'Restocked 2 months ago');
    assert.equal(restockedLabel({ active: true, inventory: 4 }, now), null);
  });
});

describe('nextRestockedAt', () => {
  const now = new Date('2026-08-22T12:00:00Z');
  const stored = new Date('2026-08-01T14:33:00Z');

  it('stamps itself when the quantity goes up', () => {
    assert.equal(
      nextRestockedAt({ typed: null, stored: null, previousInventory: 0, nextInventory: 6, now }),
      now
    );
  });

  it('leaves the date alone when stock only goes down', () => {
    // A sale or a correction is not a restock. The form posts the date it was
    // rendered with, which is what "untouched" looks like here.
    const asPosted = new Date(restockDateValue(stored));
    assert.equal(
      nextRestockedAt({ typed: asPosted, stored, previousInventory: 6, nextInventory: 5, now }),
      stored
    );
  });

  it('clears the date when the owner empties the field', () => {
    assert.equal(
      nextRestockedAt({ typed: null, stored, previousInventory: 6, nextInventory: 6, now }),
      null
    );
  });

  it('lets the owner say when the box really arrived', () => {
    const typed = new Date('2026-08-18T00:00:00Z');
    assert.equal(
      nextRestockedAt({ typed, stored, previousInventory: 0, nextInventory: 9, now }),
      typed
    );
  });

  it('does not treat an untouched date field as an edit', () => {
    // The form posts a date; the column holds a timestamp. Compared by the
    // millisecond, re-saving an unchanged form would truncate the stored time
    // and look like the owner had retyped it.
    const asPosted = new Date(restockDateValue(stored));
    assert.equal(
      nextRestockedAt({
        typed: asPosted,
        stored,
        previousInventory: 6,
        nextInventory: 6,
        now
      }),
      stored
    );
  });
});
