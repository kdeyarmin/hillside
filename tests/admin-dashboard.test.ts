import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminContentPath,
  adminDashboardPath,
  firstSearchParam,
  incompleteProductFields,
  isCustomPlanterRequest,
  orderMatchesAdminFilter,
  parseAdminOrderFilter,
  parseAdminStockFilter,
  productHasIncompleteInfo,
  productIsLowStock,
  productIsOutOfStock,
  productMatchesAdminFilter,
  productNeedsPhoto,
  uniqueConstraintField
} from '../lib/admin-dashboard.ts';

describe('productNeedsPhoto', () => {
  it('flags a missing or shared catalog photo', () => {
    assert.equal(productNeedsPhoto(null), true);
    assert.equal(productNeedsPhoto(''), true);
    assert.equal(productNeedsPhoto('/images/catalog/house-plants.webp'), true);
    assert.equal(productNeedsPhoto('/images/scenes/hillside-hero.webp'), true);
    assert.equal(productNeedsPhoto('/media/monstera.jpg'), false);
  });
});

describe('productMatchesAdminFilter', () => {
  const monstera = {
    name: 'Monstera Deliciosa',
    slug: 'monstera-deliciosa',
    sku: 'PL-01',
    active: false,
    inventory: 0,
    imageUrl: '/images/catalog/house-plants.webp'
  };
  const tea = {
    name: 'Garden Mint Tea',
    slug: 'garden-mint-tea',
    sku: 'TEA-04',
    active: true,
    inventory: 2,
    imageUrl: '/media/mint.jpg'
  };

  it('finds a product by name, slug or SKU', () => {
    assert.equal(productMatchesAdminFilter(monstera, 'monstera', 'all'), true);
    assert.equal(productMatchesAdminFilter(monstera, 'PL-01', 'all'), true);
    assert.equal(productMatchesAdminFilter(monstera, 'tea', 'all'), false);
  });

  it('separates archived stock from what the shop is actually selling', () => {
    assert.equal(productMatchesAdminFilter(monstera, '', 'archived'), true);
    assert.equal(productMatchesAdminFilter(monstera, '', 'active'), false);
    assert.equal(productMatchesAdminFilter(tea, '', 'active'), true);
    assert.equal(productMatchesAdminFilter(tea, '', 'low'), true);
    assert.equal(productMatchesAdminFilter(tea, '', 'photo'), false);
    assert.equal(productMatchesAdminFilter(monstera, '', 'photo'), false);
  });
});

describe('productIsLowStock', () => {
  const base = { active: true, inventory: 9 };

  it('reads the product total when the sizes are not counted', () => {
    assert.equal(productIsLowStock(base), false);
    assert.equal(productIsLowStock({ ...base, inventory: 3 }), true);
    assert.equal(productIsLowStock({ ...base, inventory: 3, active: false }), false);
    // Sizes sharing one shelf still answer with that shelf.
    assert.equal(productIsLowStock({ ...base, sizes: [{ label: '4\" pot' }] }), false);
  });

  it('flags a counted size running down even when the product is full', () => {
    // Nine on the bench and none of them in 6" pots: a size to pot up.
    assert.equal(
      productIsLowStock({
        ...base,
        sizes: [
          { label: '4\" pot', inventory: 9 },
          { label: '6\" pot', inventory: 0 }
        ]
      }),
      true
    );
    assert.equal(
      productIsLowStock({
        ...base,
        sizes: [
          { label: '4\" pot', inventory: 5 },
          { label: '6\" pot', inventory: 4 }
        ]
      }),
      false
    );
  });
});

describe('parseAdminStockFilter', () => {
  it('falls back to all for an unknown chip', () => {
    assert.equal(parseAdminStockFilter('archived'), 'archived');
    assert.equal(parseAdminStockFilter('nope'), 'all');
    assert.equal(parseAdminStockFilter(undefined), 'all');
  });
});

describe('uniqueConstraintField', () => {
  it('tells a SKU collision from a slug collision', () => {
    assert.equal(uniqueConstraintField(['sku']), 'sku');
    assert.equal(uniqueConstraintField(['slug']), 'slug');
    assert.equal(uniqueConstraintField('Product_sku_key'), 'sku');
    assert.equal(uniqueConstraintField('Product_slug_key'), 'slug');
    assert.equal(uniqueConstraintField(undefined), 'unknown');
  });
});

describe('adminDashboardPath', () => {
  it('drops empty values so a save does not carry stale filters', () => {
    assert.equal(adminDashboardPath({}), '/admin');
    assert.equal(
      adminDashboardPath({
        notice: 'product-live',
        product: 'monstera',
        section: 'inventory',
        q: ''
      }),
      '/admin?notice=product-live&product=monstera&section=inventory'
    );
  });
});

describe('firstSearchParam', () => {
  it('takes the first string when Next repeats a query key', () => {
    assert.equal(firstSearchParam('monstera'), 'monstera');
    assert.equal(firstSearchParam(['one', 'two']), 'one');
    assert.equal(firstSearchParam([]), '');
    assert.equal(firstSearchParam(undefined), '');
    assert.equal(firstSearchParam(null), '');
  });
});

describe('adminContentPath', () => {
  it('stays on the content manager and keeps the focused row', () => {
    assert.equal(adminContentPath({}), '/admin/content');
    assert.equal(
      adminContentPath({
        notice: 'collection-saved',
        section: 'collections',
        item: 'col_1'
      }),
      '/admin/content?notice=collection-saved&section=collections&item=col_1'
    );
  });
});

describe('productIsOutOfStock', () => {
  it('separates a listing with nothing to sell from one running low', () => {
    assert.equal(productIsOutOfStock({ active: true, inventory: 0 }), true);
    assert.equal(productIsOutOfStock({ active: true, inventory: 1 }), false);
    // An archived product is not on the shop, so it is not a problem.
    assert.equal(productIsOutOfStock({ active: false, inventory: 0 }), false);
  });

  it('never counts one listing as both sold out and running low', () => {
    const soldOut = { active: true, inventory: 0 };
    assert.equal(productIsOutOfStock(soldOut), true);
    assert.equal(productIsLowStock(soldOut), false);
    assert.equal(productMatchesAdminFilter({ ...base, inventory: 0 }, '', 'out'), true);
    assert.equal(productMatchesAdminFilter({ ...base, inventory: 0 }, '', 'low'), false);
  });

  it('still calls a counted size running down low, while the product has stock', () => {
    assert.equal(
      productIsLowStock({
        active: true,
        inventory: 9,
        sizes: [
          { label: '4\" pot', inventory: 9 },
          { label: '6\" pot', inventory: 0 }
        ]
      }),
      true
    );
  });
});

const base = {
  name: 'Monstera',
  slug: 'monstera',
  sku: 'PL-01',
  active: true,
  inventory: 4,
  imageUrl: '/media/monstera.jpg',
  shortDescription: 'A bold tropical.',
  description: 'A bold, easygoing tropical with iconic split leaves and a lot of presence.',
  details: 'Nursery grown, potted here.'
};

describe('incompleteProductFields', () => {
  const complete = {
    name: 'Monstera',
    slug: 'monstera',
    sku: 'PL-01',
    active: true,
    inventory: 4,
    imageUrl: '/media/monstera.jpg',
    shortDescription: 'A bold tropical.',
    description: 'A bold, easygoing tropical with iconic split leaves and a lot of presence.',
    details: 'Nursery grown, potted here.'
  };

  it('says nothing about a finished listing', () => {
    assert.deepEqual(incompleteProductFields(complete), []);
    assert.equal(productHasIncompleteInfo(complete), false);
  });

  it('names each gap rather than counting them', () => {
    assert.deepEqual(incompleteProductFields({ ...complete, shortDescription: '  ' }), [
      'card blurb'
    ]);
    assert.deepEqual(incompleteProductFields({ ...complete, sku: null, details: null }), [
      'details',
      'SKU'
    ]);
    assert.deepEqual(incompleteProductFields({ ...complete, description: 'Short.' }), [
      'description'
    ]);
  });

  it('leaves an archived product alone', () => {
    assert.equal(productHasIncompleteInfo({ ...complete, sku: null, active: false }), false);
  });

  it('is a filter of its own on the inventory list', () => {
    const thin = { ...complete, details: null };
    assert.equal(productMatchesAdminFilter(thin, '', 'incomplete'), true);
    assert.equal(productMatchesAdminFilter(complete, '', 'incomplete'), false);
    assert.equal(productMatchesAdminFilter({ ...complete, inventory: 0 }, '', 'out'), true);
  });
});

describe('parseAdminStockFilter', () => {
  it('accepts the filters the dashboard links at and nothing else', () => {
    for (const value of ['active', 'archived', 'photo', 'low', 'out', 'incomplete']) {
      assert.equal(parseAdminStockFilter(value), value);
    }
    assert.equal(parseAdminStockFilter('everything'), 'all');
    assert.equal(parseAdminStockFilter(null), 'all');
  });
});

describe('order filters', () => {
  it('reads only the two narrowed views', () => {
    assert.equal(parseAdminOrderFilter('awaiting'), 'awaiting');
    assert.equal(parseAdminOrderFilter('pickup'), 'pickup');
    assert.equal(parseAdminOrderFilter('paid'), 'all');
    assert.equal(parseAdminOrderFilter(undefined), 'all');
  });

  it('shows only pickups that still owe the customer something', () => {
    const collected = { awaiting: false, pickup: true };
    const waiting = { awaiting: true, pickup: true };
    const shipping = { awaiting: true, pickup: false };
    assert.equal(orderMatchesAdminFilter(collected, 'pickup'), false);
    assert.equal(orderMatchesAdminFilter(waiting, 'pickup'), true);
    assert.equal(orderMatchesAdminFilter(shipping, 'pickup'), false);
    assert.equal(orderMatchesAdminFilter(shipping, 'awaiting'), true);
    assert.equal(orderMatchesAdminFilter(collected, 'all'), true);
  });

  it('partitions the outstanding work so one order is never two jobs', () => {
    const waitingPickup = { awaiting: true, pickup: true };
    // Packing a parcel and preparing a pickup are different jobs, and the
    // Today board counts them as one each — never the same order as both.
    assert.equal(orderMatchesAdminFilter(waitingPickup, 'awaiting'), false);
    assert.equal(orderMatchesAdminFilter(waitingPickup, 'pickup'), true);
  });
});

describe('isCustomPlanterRequest', () => {
  it('recognises the contact form’s own subject', () => {
    assert.equal(
      isCustomPlanterRequest({ subject: 'Custom planter arrangement', message: '' }),
      true
    );
  });

  it('recognises someone asking in their own words', () => {
    assert.equal(
      isCustomPlanterRequest({
        subject: 'Question',
        message: 'Could you make a dish garden for my mother?'
      }),
      true
    );
    assert.equal(
      isCustomPlanterRequest({ subject: 'Hello', message: 'Do you ship to Ohio?' }),
      false
    );
  });

  it('copes with a message that has no body', () => {
    assert.equal(isCustomPlanterRequest({ subject: 'centerpiece for a wedding' }), true);
    assert.equal(isCustomPlanterRequest({ subject: 'Hello' }), false);
  });
});
