import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  bundleAvailability,
  bundleContentsLine,
  bundleFulfillment,
  bundleIsBuyable,
  bundleSavingsCents,
  bundleSavingsNote,
  bundleStockLines,
  bundleStockNote,
  bundleValueCents,
  componentNeedsVariant,
  componentUnitsAvailable,
  mergeStockLines
} = await import('../lib/bundles.ts');

const { orderItemStockLines, orderStockLines } = await import('../lib/order-stock.ts');

type ProductOverrides = Partial<{
  id: string;
  slug: string;
  name: string;
  active: boolean;
  priceCents: number;
  inventory: number;
  sizes: unknown;
  ships: boolean;
  pickup: boolean;
}>;

function product(overrides: ProductOverrides = {}) {
  return {
    id: overrides.id ?? 'p-tea',
    slug: overrides.slug ?? 'hillside-calm-tea',
    name: overrides.name ?? 'Hillside Calm Tea',
    active: overrides.active ?? true,
    priceCents: overrides.priceCents ?? 1800,
    inventory: overrides.inventory ?? 10,
    sizes: overrides.sizes,
    ships: overrides.ships ?? true,
    pickup: overrides.pickup ?? true
  };
}

const infuser = product({
  id: 'p-infuser',
  slug: 'stainless-infuser',
  name: 'Stainless infuser',
  priceCents: 1400,
  inventory: 4
});

function bundle(items: Array<Record<string, unknown>>, priceCents = 2800) {
  return {
    slug: 'tea-starter-set',
    title: 'Tea Starter Set',
    priceCents,
    active: true,
    items: items as never
  };
}

describe('bundle availability', () => {
  it('is the fewest sets any required component can supply', () => {
    const set = bundle([
      { quantity: 1, product: product({ inventory: 10 }) },
      { quantity: 1, product: infuser }
    ]);
    assert.equal(bundleAvailability(set).sets, 4);
    assert.equal(bundleIsBuyable(set), true);
  });

  it('divides by how many of a product one set contains', () => {
    // Nine succulents on the bench builds three trios, not nine.
    const trio = bundle([{ quantity: 3, product: product({ inventory: 9 }) }], 3500);
    assert.equal(bundleAvailability(trio).sets, 3);
  });

  it('goes unavailable the moment a required component runs out', () => {
    const set = bundle([
      { quantity: 1, product: product({ inventory: 10 }) },
      { quantity: 1, product: product({ ...infuser, inventory: 0 }) }
    ]);
    const availability = bundleAvailability(set);
    assert.equal(availability.sets, 0);
    assert.equal(availability.blocking.length, 1);
    assert.equal(bundleIsBuyable(set), false);
  });

  it('treats an archived component as gone, not merely as unstocked', () => {
    const set = bundle([{ quantity: 1, product: product({ active: false, inventory: 12 }) }]);
    assert.equal(bundleAvailability(set).sets, 0);
  });

  it('refuses to build a set from a sized product with no variant pinned', () => {
    const line = {
      quantity: 1,
      product: product({ sizes: [{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }] })
    };
    assert.equal(componentNeedsVariant(line as never), true);
    assert.equal(componentUnitsAvailable(line as never), 0);
    assert.equal(bundleAvailability(bundle([line])).sets, 0);
    assert.equal(bundleAvailability(bundle([line])).unpinned.length, 1);
  });

  it('counts against the pinned variant, not the product total', () => {
    const sized = product({
      inventory: 9,
      sizes: [
        { label: '2 oz', inventory: 7 },
        { label: '8 oz', inventory: 2 }
      ]
    });
    assert.equal(
      bundleAvailability(bundle([{ quantity: 1, size: '8 oz', product: sized }])).sets,
      2
    );
    assert.equal(
      bundleAvailability(bundle([{ quantity: 1, size: '2 oz', product: sized }])).sets,
      7
    );
  });

  it('treats a retired variant as nothing on the shelf', () => {
    const sized = product({ inventory: 9, sizes: [{ label: '2 oz', inventory: 9 }] });
    assert.equal(
      bundleAvailability(bundle([{ quantity: 1, size: '4 oz', product: sized }])).sets,
      0
    );
  });

  it('reports zero for a recipe with nothing required in it', () => {
    assert.equal(bundleAvailability(bundle([])).sets, 0);
    assert.equal(
      bundleAvailability(bundle([{ quantity: 1, optional: true, product: infuser }])).sets,
      0
    );
  });

  it('lets an optional extra run out without taking the set off sale', () => {
    const set = bundle([
      { quantity: 1, product: product({ inventory: 5 }) },
      { quantity: 1, optional: true, product: product({ id: 'p-sprig', inventory: 0 }) }
    ]);
    const availability = bundleAvailability(set);
    assert.equal(availability.sets, 5);
    assert.equal(availability.missingOptional.length, 1);
  });
});

describe('bundle pricing', () => {
  it('measures the saving against what the parts cost loose', () => {
    const set = bundle([
      { quantity: 1, product: product({ priceCents: 1800 }) },
      { quantity: 1, product: infuser }
    ]);
    assert.equal(bundleValueCents(set), 3200);
    assert.equal(bundleSavingsCents(set), 400);
    assert.match(bundleSavingsNote(set) || '', /Save \$4\.00 \(13%\)/);
  });

  it('prices a pinned variant at that variant’s price', () => {
    const sized = product({
      priceCents: 1200,
      sizes: [{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }]
    });
    assert.equal(bundleValueCents(bundle([{ quantity: 2, size: '8 oz', product: sized }])), 5200);
  });

  it('leaves optional extras out of the saving it advertises', () => {
    // The extra may not be in the box, so it cannot inflate the claim.
    const set = bundle([
      { quantity: 1, product: product({ priceCents: 1800 }) },
      { quantity: 1, optional: true, product: infuser }
    ]);
    assert.equal(bundleValueCents(set), 1800);
  });

  it('says nothing about a saving when the set is not cheaper', () => {
    assert.equal(bundleSavingsNote(bundle([{ quantity: 1, product: infuser }], 9900)), null);
  });
});

describe('bundle fulfilment and copy', () => {
  it('is pickup-only as soon as one thing in the box is', () => {
    const set = bundle([
      { quantity: 1, product: product({ inventory: 5 }) },
      { quantity: 1, product: product({ id: 'p-pot', ships: false }) }
    ]);
    assert.deepEqual(bundleFulfillment(set), { ships: false, pickup: true });
  });

  it('lists what is in the box', () => {
    assert.equal(
      bundleContentsLine(
        bundle([
          { quantity: 1, size: '2 oz', product: product({ name: 'Hillside Calm Tea' }) },
          { quantity: 2, product: infuser }
        ])
      ),
      'Hillside Calm Tea — 2 oz × 1 · Stainless infuser × 2'
    );
  });

  it('counts sets rather than pieces in its stock note', () => {
    assert.equal(bundleStockNote(0), 'Sold out');
    assert.equal(bundleStockNote(1), 'Last set ready');
    assert.equal(bundleStockNote(3), 'Only 3 sets left');
    assert.equal(bundleStockNote(9), '9 sets ready');
  });
});

describe('what a sold set takes off the shelf', () => {
  it('multiplies the recipe by the number of sets', () => {
    const { lines } = bundleStockLines(
      bundle([
        { quantity: 3, product: product({ id: 'p-succulent', inventory: 12 }) },
        { quantity: 1, size: '2 oz', product: product({ id: 'p-tea', inventory: 8 }) }
      ]),
      2
    );
    assert.deepEqual(lines, [
      { productId: 'p-succulent', name: 'Hillside Calm Tea', size: null, quantity: 6 },
      { productId: 'p-tea', name: 'Hillside Calm Tea', size: '2 oz', quantity: 2 }
    ]);
  });

  it('leaves out an optional extra the shelf cannot cover for every set', () => {
    const set = bundle([
      { quantity: 1, product: product({ inventory: 5 }) },
      { quantity: 1, optional: true, product: product({ id: 'p-sprig', inventory: 1 }) }
    ]);
    const one = bundleStockLines(set, 1);
    assert.equal(one.lines.length, 2);
    assert.equal(one.skipped.length, 0);

    const two = bundleStockLines(set, 2);
    assert.equal(two.lines.length, 1);
    assert.equal(two.skipped.length, 1);
  });

  it('folds two sets drawing on one shelf into a single line', () => {
    assert.deepEqual(
      mergeStockLines([
        { productId: 'p-tea', name: 'Tea', size: '2 oz', quantity: 1 },
        { productId: 'p-tea', name: 'Tea', size: '2 oz', quantity: 3 },
        { productId: 'p-tea', name: 'Tea', size: '8 oz', quantity: 1 }
      ]),
      [
        { productId: 'p-tea', name: 'Tea', size: '2 oz', quantity: 4 },
        { productId: 'p-tea', name: 'Tea', size: '8 oz', quantity: 1 }
      ]
    );
  });
});

describe('order stock lines', () => {
  it('reads a plain product line straight off the item', () => {
    assert.deepEqual(
      orderItemStockLines({
        productId: 'p-tea',
        name: 'Hillside Calm Tea',
        size: '2 oz',
        quantity: 2,
        components: []
      }),
      [{ productId: 'p-tea', name: 'Hillside Calm Tea', size: '2 oz', quantity: 2 }]
    );
  });

  it('reads a bundle line from its components, not from the set', () => {
    assert.deepEqual(
      orderStockLines({
        items: [
          {
            productId: null,
            name: 'Tea Starter Set',
            size: null,
            quantity: 2,
            components: [
              { productId: 'p-tea', name: 'Tea', size: '2 oz', quantity: 2 },
              { productId: 'p-infuser', name: 'Infuser', size: null, quantity: 2 }
            ]
          }
        ]
      }),
      [
        { productId: 'p-tea', name: 'Tea', size: '2 oz', quantity: 2 },
        { productId: 'p-infuser', name: 'Infuser', size: null, quantity: 2 }
      ]
    );
  });

  it('yields nothing for a line with neither a product nor components', () => {
    assert.deepEqual(
      orderItemStockLines({ productId: null, name: 'Gone', size: null, quantity: 1 }),
      []
    );
  });
});
