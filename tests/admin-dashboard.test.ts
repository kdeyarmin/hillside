import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminContentPath,
  adminDashboardPath,
  firstSearchParam,
  inventoryAttention,
  parseAdminStockFilter,
  productIsLowStock,
  productMatchesAdminFilter,
  productMatchesStockFilter,
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
    assert.equal(productMatchesAdminFilter(monstera, '', 'inactive'), true);
    assert.equal(productMatchesAdminFilter(monstera, '', 'active'), false);
    assert.equal(productMatchesAdminFilter(tea, '', 'active'), true);
    assert.equal(productMatchesAdminFilter(tea, '', 'low'), true);
    assert.equal(productMatchesAdminFilter(tea, '', 'photo'), false);
    assert.equal(productMatchesAdminFilter(monstera, '', 'photo'), false);
  });

  it('finds a product by its supplier and their item number', () => {
    const sourced = { ...tea, supplier: 'Ebensburg Growers', supplierItemNumber: 'EG-9912' };
    assert.equal(productMatchesAdminFilter(sourced, 'ebensburg', 'all'), true);
    assert.equal(productMatchesAdminFilter(sourced, 'EG-9912', 'all'), true);
    assert.equal(productMatchesAdminFilter(tea, 'ebensburg', 'all'), false);
  });

  it('counts the jobs that actually need doing', () => {
    const restocked = new Date('2026-08-20T09:00:00Z');
    const now = new Date('2026-08-22T09:00:00Z');
    const catalog = [
      { ...monstera, active: true, inventory: 0, sku: null },
      { ...tea, reorderPoint: 4, lastRestockedAt: restocked }
    ];

    assert.equal(productMatchesStockFilter(catalog[0], 'out', now), true);
    assert.equal(productMatchesStockFilter(catalog[1], 'out', now), false);
    // Two on the bench against a reorder point of four.
    assert.equal(productMatchesStockFilter(catalog[1], 'reorder', now), true);
    assert.equal(productMatchesStockFilter(catalog[0], 'no-reorder', now), true);
    assert.equal(productMatchesStockFilter(catalog[0], 'sku', now), true);
    assert.equal(productMatchesStockFilter(catalog[1], 'sku', now), false);
    assert.equal(productMatchesStockFilter(catalog[0], 'supplier', now), true);
    assert.equal(productMatchesStockFilter(catalog[1], 'restocked', now), true);
    assert.equal(productMatchesStockFilter(catalog[0], 'restocked', now), false);
  });
});

describe('inventoryAttention', () => {
  const now = new Date('2026-08-22T09:00:00Z');
  const base = {
    name: 'Monstera',
    slug: 'monstera',
    sku: 'PL-01',
    supplier: 'Ebensburg Growers',
    active: true,
    inventory: 6,
    reorderPoint: 2,
    imageUrl: '/media/monstera.jpg',
    description: 'A big green thing.',
    shortDescription: 'Big and green.',
    priceCents: 4200,
    type: 'OTHER',
    details: 'Grown here.',
    ships: true,
    pickup: true
  };

  it('says nothing at all when nothing needs doing', () => {
    assert.deepEqual(inventoryAttention([base], now), []);
  });

  it('reads as a sentence, and links to the chip that shows those products', () => {
    const items = inventoryAttention(
      [
        { ...base, inventory: 0 },
        { ...base, inventory: 0 }
      ],
      now
    );
    const outOfStock = items.find((item) => item.key === 'out');
    assert.equal(outOfStock?.message, '2 products are out of stock');
    assert.equal(outOfStock?.detail, 'products are out of stock');
    assert.equal(outOfStock?.href, '/admin?stock=out&section=inventory');
  });

  it('keeps the singular singular', () => {
    const items = inventoryAttention([{ ...base, inventory: 0 }], now);
    assert.equal(items.find((item) => item.key === 'out')?.message, '1 product is out of stock');
    assert.equal(
      items.find((item) => item.key === 'reorder')?.message,
      '1 product has reached its reorder point'
    );
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
    assert.equal(parseAdminStockFilter('reorder'), 'reorder');
    assert.equal(parseAdminStockFilter('nope'), 'all');
    assert.equal(parseAdminStockFilter(undefined), 'all');
  });

  it('still understands the old archived links the dashboard has issued', () => {
    assert.equal(parseAdminStockFilter('archived'), 'inactive');
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
