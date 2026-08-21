import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  checkoutAdjustmentNotice,
  checkoutAdjustments,
  encodeCheckoutItems,
  parseCheckoutItems,
  readCheckoutItems,
  stripeProductDescription,
  stripeProductImages,
  STRIPE_METADATA_VALUE_MAX
} = await import('../lib/checkout-format.ts');

describe('readCheckoutItems', () => {
  it('merges duplicate slugs and caps quantity at 20', () => {
    const items = readCheckoutItems({
      items: [
        { id: 'monstera', quantity: 12 },
        { id: 'monstera', quantity: 15 },
        { id: 'tea', quantity: 2, priceCents: 1200 }
      ]
    });
    assert.deepEqual(items, [
      { id: 'monstera', quantity: 20 },
      { id: 'tea', quantity: 2, priceCents: 1200 }
    ]);
  });

  it('ignores empty and non-object payloads', () => {
    assert.deepEqual(readCheckoutItems(null), []);
    assert.deepEqual(readCheckoutItems({ items: 'nope' }), []);
    assert.deepEqual(readCheckoutItems({ items: [{ quantity: 2 }] }), []);
  });

  it('keeps two sizes of one product apart, and merges each with itself', () => {
    const items = readCheckoutItems({
      items: [
        { id: 'monstera', size: '4" pot', quantity: 1 },
        { id: 'monstera', size: '6" pot', quantity: 2 },
        { id: 'monstera', size: '4" pot', quantity: 3 }
      ]
    });
    assert.deepEqual(items, [
      { id: 'monstera', size: '4" pot', quantity: 4 },
      { id: 'monstera', size: '6" pot', quantity: 2 }
    ]);
  });
});

describe('checkoutAdjustments', () => {
  const sized = [
    {
      slug: 'lotion',
      name: 'Hillside lotion',
      inventory: 3,
      priceCents: 1200,
      sizes: [{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }]
    }
  ];

  const catalog = [
    { slug: 'monstera', name: 'Monstera', inventory: 2, priceCents: 4500 },
    { slug: 'tea', name: 'Hillside tea', inventory: 10, priceCents: 1800 }
  ];

  it('reports stock, price and unavailable separately', () => {
    const changes = checkoutAdjustments(
      [
        { id: 'monstera', quantity: 4 },
        { id: 'tea', quantity: 1, priceCents: 1200 },
        { id: 'gone', quantity: 1 }
      ],
      catalog
    );
    assert.equal(changes.length, 3);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 2);
    assert.equal(changes[1].reason, 'price');
    assert.equal(changes[1].priceCents, 1800);
    assert.equal(changes[2].reason, 'unavailable');
  });

  it('is quiet when the basket already matches the shelf', () => {
    assert.deepEqual(
      checkoutAdjustments([{ id: 'tea', quantity: 2, priceCents: 1800 }], catalog),
      []
    );
  });

  it('charges the chosen size, and reports a basket holding a stale one', () => {
    assert.deepEqual(
      checkoutAdjustments([{ id: 'lotion', size: '8 oz', quantity: 1, priceCents: 2600 }], sized),
      []
    );

    const changes = checkoutAdjustments(
      [{ id: 'lotion', size: '8 oz', quantity: 1, priceCents: 1200 }],
      sized
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'price');
    assert.equal(changes[0].priceCents, 2600);
    assert.equal(changes[0].size, '8 oz');
    assert.equal(changes[0].name, 'Hillside lotion — 8 oz');
  });

  it('sends back a size we no longer sell rather than picking one', () => {
    for (const requested of [
      { id: 'lotion', size: '4 oz', quantity: 1 },
      { id: 'lotion', quantity: 1 }
    ]) {
      const changes = checkoutAdjustments([requested], sized);
      assert.equal(changes.length, 1);
      assert.equal(changes[0].reason, 'size');
      assert.equal(changes[0].available, 0);
      assert.match(checkoutAdjustmentNotice(changes[0]), /no longer sold in that size/);
    }
  });

  it('spends one stock count across every size of a product', () => {
    // Three jars on the bench, four asked for across two sizes.
    const changes = checkoutAdjustments(
      [
        { id: 'lotion', size: '2 oz', quantity: 2 },
        { id: 'lotion', size: '8 oz', quantity: 2 }
      ],
      sized
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].size, '8 oz');
    assert.equal(changes[0].available, 1);
    assert.match(checkoutAdjustmentNotice(changes[0]), /Only 1 of Hillside lotion — 8 oz left/);
  });

  it('names an archived product instead of calling it sold out', () => {
    const changes = checkoutAdjustments(
      [{ id: 'monstera', quantity: 1 }],
      [
        {
          slug: 'monstera',
          name: 'Monstera Deliciosa',
          inventory: 4,
          priceCents: 4500,
          active: false
        }
      ]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'unavailable');
    assert.equal(changes[0].name, 'Monstera Deliciosa');
    assert.match(checkoutAdjustmentNotice(changes[0]), /Monstera Deliciosa is no longer available/);
    assert.doesNotMatch(checkoutAdjustmentNotice(changes[0]), /sold out/);
  });
});

describe('Stripe product fields', () => {
  it('truncates descriptions to Stripe’s 500-character cap', () => {
    const long = 'Care note. '.repeat(80);
    const trimmed = stripeProductDescription(long);
    assert.ok(trimmed);
    assert.ok(trimmed.length <= 500);
    assert.match(trimmed, /\.\.\.$/);
  });

  it('omits empty descriptions rather than sending a blank string', () => {
    assert.equal(stripeProductDescription('   '), undefined);
    assert.equal(stripeProductDescription(null), undefined);
  });

  it('only advertises HTTPS images', () => {
    assert.deepEqual(stripeProductImages('https://cdn.example.com/plant.webp'), [
      'https://cdn.example.com/plant.webp'
    ]);
    assert.deepEqual(stripeProductImages('http://example.com/plant.webp'), []);
    assert.deepEqual(stripeProductImages('http://127.0.0.1/plant.webp'), []);
  });
});

describe('encode/parse checkout items', () => {
  it('round-trips and merges duplicate ids', () => {
    const encoded = encodeCheckoutItems([
      { product: { id: 'a' }, quantity: 2 },
      { product: { id: 'a' }, quantity: 3 },
      { product: { id: 'b' }, quantity: 1 }
    ]);
    assert.deepEqual(parseCheckoutItems(encoded), [
      { id: 'a', q: 5 },
      { id: 'b', q: 1 }
    ]);
  });

  it('carries the size, and merges only lines that share one', () => {
    const encoded = encodeCheckoutItems([
      { product: { id: 'a' }, quantity: 1, size: '2 oz' },
      { product: { id: 'a' }, quantity: 2, size: '8 oz' },
      { product: { id: 'a' }, quantity: 1, size: '2 oz' }
    ]);
    assert.deepEqual(parseCheckoutItems(encoded), [
      { id: 'a', s: '2 oz', q: 2 },
      { id: 'a', s: '8 oz', q: 2 }
    ]);
  });

  it('drops the snapshot whole rather than handing Stripe an over-long value', () => {
    // Stripe refuses a metadata value past its cap, and refusing it fails the
    // whole session — a full basket the customer cannot pay for. The reserved
    // order row carries fulfillment; this snapshot is only the backup.
    const many = Array.from({ length: 20 }, (_, index) => ({
      product: { id: `cmf3k2j9x0000abcd1234ef${String(index).padStart(2, '0')}` },
      quantity: 1,
      size: '6" pot'
    }));
    const encoded = encodeCheckoutItems(many);
    assert.ok(encoded.length <= STRIPE_METADATA_VALUE_MAX);
    // Not a short list, which the legacy path would mistake for a complete one.
    assert.equal(encoded, '[]');

    const few = many.slice(0, 3);
    assert.equal(parseCheckoutItems(encodeCheckoutItems(few)).length, 3);
  });

  it('returns an empty list for garbage', () => {
    assert.deepEqual(parseCheckoutItems('not-json'), []);
    assert.deepEqual(parseCheckoutItems('{}'), []);
  });
});
