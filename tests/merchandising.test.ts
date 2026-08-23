import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BEST_SELLER_MIN_ORDERS,
  BEST_SELLER_MIN_UNITS,
  NEW_ARRIVAL_DAYS,
  hasSeason,
  isBestSeller,
  isInSeason,
  isNewArrival,
  merchandisingBadges,
  qualifiesAsBestSeller,
  soldRecently
} from '../lib/merchandising.ts';

const NOW = new Date('2026-06-15T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe('isNewArrival', () => {
  it('counts a product listed inside the window', () => {
    assert.equal(isNewArrival({ createdAt: daysAgo(3) }, NOW), true);
    assert.equal(isNewArrival({ createdAt: daysAgo(NEW_ARRIVAL_DAYS - 1) }, NOW), true);
  });

  it('stops counting one listed before it', () => {
    assert.equal(isNewArrival({ createdAt: daysAgo(NEW_ARRIVAL_DAYS + 1) }, NOW), false);
  });

  it('honours the owner over the date, both ways', () => {
    const old = { createdAt: daysAgo(400) };
    const fresh = { createdAt: daysAgo(1) };
    assert.equal(isNewArrival({ ...old, newArrivalMode: 'ALWAYS' }, NOW), true);
    assert.equal(isNewArrival({ ...fresh, newArrivalMode: 'NEVER' }, NOW), false);
  });

  it('is not new when there is no listing date at all', () => {
    assert.equal(isNewArrival({ createdAt: null }, NOW), false);
  });
});

describe('qualifiesAsBestSeller', () => {
  /**
   * The live worry: "do not permanently label an item a best seller after one
   * isolated sale". Six units in one order is one customer, not a best seller.
   */
  it('rejects one order however many units it carried', () => {
    assert.equal(qualifiesAsBestSeller({ units: 12, orders: 1 }), false);
  });

  it('rejects enough orders with too few units', () => {
    assert.equal(
      qualifiesAsBestSeller({ units: BEST_SELLER_MIN_UNITS - 1, orders: BEST_SELLER_MIN_ORDERS }),
      false
    );
  });

  it('accepts once both floors are cleared', () => {
    assert.equal(
      qualifiesAsBestSeller({ units: BEST_SELLER_MIN_UNITS, orders: BEST_SELLER_MIN_ORDERS }),
      true
    );
  });

  it('treats no sales as no', () => {
    assert.equal(qualifiesAsBestSeller(null), false);
    assert.equal(qualifiesAsBestSeller({ units: 0, orders: 0 }), false);
  });
});

describe('isBestSeller', () => {
  const earned = { units: 20, orders: 9 };

  it('follows the sales when left automatic', () => {
    assert.equal(isBestSeller({}, earned), true);
    assert.equal(isBestSeller({}, { units: 1, orders: 1 }), false);
  });

  it('lets the owner pin one with no sales and suppress one with plenty', () => {
    assert.equal(isBestSeller({ bestSellerMode: 'ALWAYS' }, null), true);
    assert.equal(isBestSeller({ bestSellerMode: 'NEVER' }, earned), false);
  });
});

describe('soldRecently', () => {
  it('is about the last sale, not the total', () => {
    assert.equal(soldRecently({ units: 99, orders: 20, lastSoldAt: daysAgo(90) }, NOW), false);
    assert.equal(soldRecently({ units: 1, orders: 1, lastSoldAt: daysAgo(2) }, NOW), true);
    assert.equal(soldRecently({ units: 5, orders: 5 }, NOW), false);
  });
});

describe('isInSeason', () => {
  const winter = {
    seasonStartsAt: new Date('2024-11-15T00:00:00Z'),
    seasonEndsAt: new Date('2024-12-31T00:00:00Z')
  };

  it('reads only the month and day, so a season set once repeats', () => {
    // Dates stored in 2024; the question is being asked in 2026 and later.
    assert.equal(isInSeason(winter, new Date('2026-12-01T00:00:00Z')), true);
    assert.equal(isInSeason(winter, new Date('2030-11-20T00:00:00Z')), true);
    assert.equal(isInSeason(winter, NOW), false);
  });

  it('handles a season that runs past New Year', () => {
    const wrapped = {
      seasonStartsAt: new Date('2024-11-15T00:00:00Z'),
      seasonEndsAt: new Date('2025-02-10T00:00:00Z')
    };
    assert.equal(isInSeason(wrapped, new Date('2026-12-20T00:00:00Z')), true);
    assert.equal(isInSeason(wrapped, new Date('2026-01-30T00:00:00Z')), true);
    assert.equal(isInSeason(wrapped, new Date('2026-03-01T00:00:00Z')), false);
  });

  it('treats one end on its own as open in the other direction', () => {
    assert.equal(isInSeason({ seasonStartsAt: new Date('2024-06-01T00:00:00Z') }, NOW), true);
    assert.equal(isInSeason({ seasonEndsAt: new Date('2024-06-01T00:00:00Z') }, NOW), false);
    assert.equal(isInSeason({ seasonEndsAt: new Date('2024-07-01T00:00:00Z') }, NOW), true);
  });

  it('is never in season without dates, and says so separately', () => {
    assert.equal(isInSeason({}, NOW), false);
    assert.equal(hasSeason({}), false);
    assert.equal(hasSeason({ seasonEndsAt: new Date('2024-07-01T00:00:00Z') }), true);
  });
});

describe('merchandisingBadges', () => {
  it('leads with the saving and keeps the owner’s own wording over the automatic labels', () => {
    const badges = merchandisingBadges(
      { badge: 'Last one', staffPick: true },
      { savingPercent: 20, isBestSeller: true, isNew: true }
    );
    assert.deepEqual(
      badges.map((badge) => badge.label),
      ['Save 20%', 'Last one']
    );
  });

  /**
   * The dashboard promises her badge shows "instead of Best seller". Appending
   * both broke that, and made it impossible to replace an earned label with
   * better copy — the only reason to type a badge at all.
   */
  it('replaces the automatic labels rather than sitting beside them', () => {
    const badges = merchandisingBadges(
      { badge: 'Last one', staffPick: true },
      { isBestSeller: true, isNew: true, isInSeason: true },
      3
    );
    assert.deepEqual(
      badges.map((badge) => badge.label),
      ['Last one']
    );
  });

  it('still shows the saving alongside her badge, because that is about the price', () => {
    const badges = merchandisingBadges({ badge: 'Last one' }, { savingPercent: 15 });
    assert.deepEqual(
      badges.map((badge) => badge.tone),
      ['sale', 'custom']
    );
  });

  it('falls through to the automatic labels when there is no badge text', () => {
    const badges = merchandisingBadges({}, { isBestSeller: true, isNew: true });
    assert.deepEqual(
      badges.map((badge) => badge.tone),
      ['best-seller', 'new']
    );
  });

  it('caps the chips so a product cannot become a wall of pills', () => {
    const badges = merchandisingBadges(
      { staffPick: true },
      { savingPercent: 10, isBestSeller: true, isNew: true, isInSeason: true },
      3
    );
    assert.equal(badges.length, 3);
  });

  it('says nothing about a plain product', () => {
    assert.deepEqual(merchandisingBadges({}, {}), []);
  });
});
