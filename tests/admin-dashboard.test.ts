import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminContentPath,
  adminDashboardPath,
  firstSearchParam,
  parseAdminStockFilter,
  productIsLowStock,
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
