import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const { parseBundleInput, parseBundleItems, slugifyBundle } = await import('../lib/bundle-form.ts');

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const base = {
  title: 'Tea Starter Set',
  description: 'A blend and the infuser to brew it in.',
  price: '28.00',
  active: 'on'
};

const oneItem = {
  'itemProductId-0': 'p-tea',
  'itemQuantity-0': '1'
};

describe('parseBundleItems', () => {
  it('ignores the blank rows the form always offers', () => {
    const items = parseBundleItems(
      form({ ...oneItem, 'itemProductId-2': '', 'itemQuantity-2': '3' })
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, 'p-tea');
  });

  it('keeps the required variant, normalized the way a basket line is', () => {
    const items = parseBundleItems(
      form({ 'itemProductId-0': 'p-tea', 'itemSize-0': '  2   oz ', 'itemQuantity-0': '1' })
    );
    assert.equal(items[0].size, '2 oz');
  });

  it('folds a product listed twice in the same variant into one line', () => {
    // Two rows against one shelf are indistinguishable once the set is packed,
    // and would otherwise be checked and decremented as if they were separate.
    const items = parseBundleItems(
      form({
        'itemProductId-0': 'p-tea',
        'itemSize-0': '2 oz',
        'itemQuantity-0': '2',
        'itemProductId-1': 'p-tea',
        'itemSize-1': '2 oz',
        'itemQuantity-1': '3'
      })
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 5);
  });

  it('keeps two variants of one product apart', () => {
    const items = parseBundleItems(
      form({
        'itemProductId-0': 'p-tea',
        'itemSize-0': '2 oz',
        'itemQuantity-0': '1',
        'itemProductId-1': 'p-tea',
        'itemSize-1': '8 oz',
        'itemQuantity-1': '1'
      })
    );
    assert.equal(items.length, 2);
  });

  it('takes the stricter reading when duplicate rows disagree about "extra"', () => {
    const items = parseBundleItems(
      form({
        'itemProductId-0': 'p-sprig',
        'itemQuantity-0': '1',
        'itemOptional-0': 'on',
        'itemProductId-1': 'p-sprig',
        'itemQuantity-1': '1'
      })
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].optional, false);
  });

  it('clamps a quantity to something a box could hold', () => {
    const items = parseBundleItems(form({ 'itemProductId-0': 'p-tea', 'itemQuantity-0': '9999' }));
    assert.equal(items[0].quantity, 24);
    assert.equal(
      parseBundleItems(form({ 'itemProductId-0': 'p-tea', 'itemQuantity-0': '0' }))[0].quantity,
      1
    );
  });
});

describe('parseBundleInput', () => {
  it('accepts a complete set', () => {
    const parsed = parseBundleInput(form({ ...base, ...oneItem }));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.slug, 'tea-starter-set');
    assert.equal(parsed.data.priceCents, 2800);
    assert.equal(parsed.data.active, true);
    assert.equal(parsed.data.featured, false);
    assert.equal(parsed.items.length, 1);
  });

  it('refuses a set with nothing required in it', () => {
    // A box of nothing but "while supplies last" extras is a recipe that was
    // never finished, and it would be permanently unavailable with no visible
    // reason why.
    const parsed = parseBundleInput(
      form({ ...base, 'itemProductId-0': 'p-sprig', 'itemOptional-0': 'on' })
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, 'no-items');
  });

  it('refuses a set with no name, price or description', () => {
    for (const missing of ['title', 'description']) {
      const fields: Record<string, string> = { ...base, ...oneItem };
      delete fields[missing];
      const parsed = parseBundleInput(form(fields));
      assert.equal(parsed.ok, false);
    }
  });

  it('takes the slug from the title when none is typed', () => {
    assert.equal(slugifyBundle('  Hillside Gift Box! '), 'hillside-gift-box');
    const parsed = parseBundleInput(form({ ...base, ...oneItem, slug: '///' }));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.slug, 'tea-starter-set');
  });

  it('reads a price of zero rather than refusing it', () => {
    // A giveaway set is a legitimate thing to publish; a negative one is not.
    const free = parseBundleInput(form({ ...base, ...oneItem, price: '0' }));
    assert.equal(free.ok, true);
    if (free.ok) assert.equal(free.data.priceCents, 0);

    const negative = parseBundleInput(form({ ...base, ...oneItem, price: '-10' }));
    assert.equal(negative.ok, true);
    if (negative.ok) assert.equal(negative.data.priceCents, 0);
  });
});
