import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  cartLineKey,
  findSize,
  formatSizePriceRange,
  parseSizeLines,
  productSizes,
  readStoredSizes,
  normalizeSizeLabel,
  sizedName,
  sizeFieldLabel,
  sizeLines,
  sizePriceRange,
  sizedPriceCents,
  sizesArePriced
} = await import('../lib/product-sizes.ts');

describe('readStoredSizes', () => {
  it('keeps labels and only the prices that were set', () => {
    assert.deepEqual(
      readStoredSizes([{ label: '4" pot' }, { label: '6" pot', priceCents: 2400 }]),
      [{ label: '4" pot' }, { label: '6" pot', priceCents: 2400 }]
    );
  });

  it('accepts bare strings and JSON held as text', () => {
    assert.deepEqual(readStoredSizes(['Small', 'Large']), [{ label: 'Small' }, { label: 'Large' }]);
    assert.deepEqual(readStoredSizes('[{"label":"2 oz"}]'), [{ label: '2 oz' }]);
  });

  it('drops empties, duplicates and nonsense', () => {
    assert.deepEqual(readStoredSizes(null), []);
    assert.deepEqual(readStoredSizes('not json'), []);
    assert.deepEqual(readStoredSizes({ label: 'Small' }), []);
    assert.deepEqual(
      readStoredSizes([{ label: '  ' }, { label: 'Small' }, { label: 'SMALL' }, 42]),
      [{ label: 'Small' }]
    );
  });

  it('refuses a negative price rather than storing it', () => {
    assert.deepEqual(readStoredSizes([{ label: 'Small', priceCents: -500 }]), [{ label: 'Small' }]);
  });

  it('caps the list so one paste cannot fill a dropdown', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ label: `Size ${index}` }));
    assert.equal(readStoredSizes(many).length, 12);
  });
});

describe('productSizes', () => {
  it('falls back to the product price for options that set none', () => {
    assert.deepEqual(
      productSizes([{ label: '4" pot' }, { label: '6" pot', priceCents: 2400 }], 1800),
      [
        { label: '4" pot', priceCents: 1800 },
        { label: '6" pot', priceCents: 2400 }
      ]
    );
  });

  it('is empty for a product sold one way', () => {
    assert.deepEqual(productSizes(null, 1800), []);
  });
});

describe('findSize and sizedPriceCents', () => {
  const sizes = productSizes([{ label: '4" pot' }, { label: '6" pot', priceCents: 2400 }], 1800);

  it('forgives case and spacing but never invents an option', () => {
    assert.equal(findSize(sizes, '6" POT')?.priceCents, 2400);
    assert.equal(findSize(sizes, '  4"  pot ')?.label, '4" pot');
    assert.equal(findSize(sizes, '8" pot'), null);
    assert.equal(findSize(sizes, ''), null);
  });

  it('prices a sized line only from an option we sell', () => {
    assert.equal(sizedPriceCents(sizes, '6" pot', 1800), 2400);
    assert.equal(sizedPriceCents(sizes, '8" pot', 1800), null);
    assert.equal(sizedPriceCents(sizes, null, 1800), null);
    // No size list at all: the product's own price stands.
    assert.equal(sizedPriceCents([], null, 1800), 1800);
  });
});

describe('price display', () => {
  it('shows one figure when every size costs the same', () => {
    const sizes = productSizes([{ label: 'Small' }, { label: 'Large' }], 1800);
    assert.equal(formatSizePriceRange(sizes, 1800), '$18.00');
    assert.equal(sizesArePriced(sizes, 1800), false);
  });

  it('shows the span when they differ', () => {
    const sizes = productSizes([{ label: 'Small' }, { label: 'Large', priceCents: 3200 }], 1800);
    assert.deepEqual(sizePriceRange(sizes, 1800), { minCents: 1800, maxCents: 3200 });
    assert.equal(formatSizePriceRange(sizes, 1800), '$18.00 – $32.00');
    assert.equal(sizesArePriced(sizes, 1800), true);
  });

  it('falls back to the product price with no sizes', () => {
    assert.equal(formatSizePriceRange([], 1800), '$18.00');
  });
});

describe('sizeFieldLabel', () => {
  it('defaults to Size and honours what the owner typed', () => {
    assert.equal(sizeFieldLabel(null), 'Size');
    assert.equal(sizeFieldLabel('   '), 'Size');
    assert.equal(sizeFieldLabel(' Pot  size '), 'Pot size');
  });
});

describe('sizedName and cartLineKey', () => {
  it('names a sized line so an order can be packed from it', () => {
    assert.equal(sizedName('Monstera', '6" pot'), 'Monstera — 6" pot');
    assert.equal(sizedName('Monstera', null), 'Monstera');
  });

  it('gives each size of a product its own basket line', () => {
    assert.notEqual(cartLineKey('monstera', '4" pot'), cartLineKey('monstera', '6" pot'));
    assert.equal(cartLineKey('monstera', null), 'monstera');
    assert.equal(cartLineKey('monstera', ' 6"  pot '), cartLineKey('monstera', '6" pot'));
  });
});

describe('normalizeSizeLabel', () => {
  it('is the spelling every stored size has to match', () => {
    assert.equal(normalizeSizeLabel(' 6"  pot '), '6" pot');
    assert.equal(normalizeSizeLabel('6"\npot'), '6" pot');
    assert.equal(normalizeSizeLabel(null), '');
    assert.equal(normalizeSizeLabel('   '), '');
  });

  it('agrees with the key a basket line is addressed by', () => {
    // A stored size that normalizes differently from its key is how one line
    // ends up answering to another line's Remove button.
    for (const messy of [' 6"  pot ', '6" pot', '6"\tpot']) {
      assert.equal(cartLineKey('monstera', messy), `monstera::${normalizeSizeLabel(messy)}`);
    }
  });
});

describe('parseSizeLines', () => {
  it('reads one size per line, with an optional price', () => {
    assert.deepEqual(parseSizeLines('4" pot\n6" pot | 24.00\n\n8" pot | $32'), [
      { label: '4" pot' },
      { label: '6" pot', priceCents: 2400 },
      { label: '8" pot', priceCents: 3200 }
    ]);
  });

  it('keeps the label when the price is unreadable', () => {
    assert.deepEqual(parseSizeLines('Small | free\nLarge | '), [
      { label: 'Small' },
      { label: 'Large' }
    ]);
  });

  it('round-trips through the owner textarea', () => {
    const typed = '4" pot\n6" pot | 24.00';
    assert.equal(sizeLines(parseSizeLines(typed)), typed);
  });
});
