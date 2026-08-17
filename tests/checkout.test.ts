import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  checkoutAdjustments,
  encodeCheckoutItems,
  parseCheckoutItems,
  readCheckoutItems,
  stripeProductDescription,
  stripeProductImages
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
});

describe('checkoutAdjustments', () => {
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

  it('returns an empty list for garbage', () => {
    assert.deepEqual(parseCheckoutItems('not-json'), []);
    assert.deepEqual(parseCheckoutItems('{}'), []);
  });
});
