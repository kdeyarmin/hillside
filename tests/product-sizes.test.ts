import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  availableForSize,
  cartLineKey,
  findSize,
  formatSizePriceRange,
  parseSizeLines,
  productInventoryForSizes,
  productSizes,
  readStoredSizes,
  comparableAtCents,
  normalizeSizeLabel,
  returnStoredSizeStock,
  sizeAvailable,
  sizeChoiceRejected,
  sizedName,
  sizeFieldLabel,
  sizeLines,
  sizePriceRange,
  sizeStockSummary,
  sizedPriceCents,
  sizesArePriced,
  sizesTrackStock,
  storedSizesTrackStock,
  takeStoredSizeStock,
  withoutRedundantPrices
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
        { label: '4" pot', priceCents: 1800, inventory: null },
        { label: '6" pot', priceCents: 2400, inventory: null }
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

describe('sizeChoiceRejected', () => {
  const sizes = productSizes([{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }], 1200);

  it('accepts a size we sell and a product sold one way', () => {
    assert.equal(sizeChoiceRejected(sizes, '8 oz'), false);
    assert.equal(sizeChoiceRejected([], null), false);
    assert.equal(sizeChoiceRejected([], '   '), false);
  });

  it('refuses a missing choice and one we do not sell', () => {
    assert.equal(sizeChoiceRejected(sizes, null), true);
    assert.equal(sizeChoiceRejected(sizes, '4 oz'), true);
  });

  it('still refuses a size the owner has cleared the list of', () => {
    // The basket remembers "8 oz" after every option is deleted. Reading the
    // list length alone let that line through as an ordinary one.
    assert.equal(sizeChoiceRejected([], '8 oz'), true);
  });
});

describe('comparableAtCents', () => {
  it('keeps a sale on a product priced one way', () => {
    assert.equal(comparableAtCents([], 1800, 2400), 2400);
    const flat = productSizes([{ label: 'Small' }, { label: 'Large' }], 1800);
    assert.equal(comparableAtCents(flat, 1800, 2400), 2400);
  });

  it('stands the sale down once the sizes disagree about the price', () => {
    // $18 base against a $24 compare-at once a size costs $32 read as
    // "$18 – $32, was $24, save 25%" — untrue of the $32 size.
    const priced = productSizes([{ label: 'Small' }, { label: 'Large', priceCents: 3200 }], 1800);
    assert.equal(comparableAtCents(priced, 1800, 2400), null);
  });
});

describe('withoutRedundantPrices', () => {
  it('drops a price that only repeats the product price', () => {
    // Otherwise the size stays pinned at $18 the next time the base price moves.
    assert.deepEqual(withoutRedundantPrices([{ label: '4" pot', priceCents: 1800 }], 1800), [
      { label: '4" pot' }
    ]);
  });

  it('keeps one that genuinely differs, in both directions', () => {
    assert.deepEqual(
      withoutRedundantPrices(
        [
          { label: 'Small', priceCents: 1400 },
          { label: 'Large', priceCents: 3200 },
          { label: 'Medium' }
        ],
        1800
      ),
      [
        { label: 'Small', priceCents: 1400 },
        { label: 'Large', priceCents: 3200 },
        { label: 'Medium' }
      ]
    );
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

describe('counting stock by size', () => {
  const counted = [
    { label: '4" pot', inventory: 6 },
    { label: '6" pot', priceCents: 2400, inventory: 2 },
    { label: '8" pot', priceCents: 3200, inventory: 0 }
  ];
  const shared = [{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }];

  it('treats a list with any count on it as counted throughout', () => {
    assert.equal(storedSizesTrackStock(counted), true);
    assert.equal(storedSizesTrackStock(shared), false);
    // One number anywhere makes the whole list counted, and the sizes left
    // blank read as none left rather than as the product's whole shelf.
    assert.deepEqual(productSizes([{ label: '4" pot', inventory: 5 }, { label: '6" pot' }], 1800), [
      { label: '4" pot', priceCents: 1800, inventory: 5 },
      { label: '6" pot', priceCents: 1800, inventory: 0 }
    ]);
  });

  it('answers availability from the size, and from the product when uncounted', () => {
    const sizes = productSizes(counted, 1800);
    assert.equal(sizesTrackStock(sizes), true);
    assert.equal(availableForSize(sizes, '6" POT', 8), 2);
    assert.equal(availableForSize(sizes, '8" pot', 8), 0);
    // A size that is no longer offered has none, whatever the product holds.
    assert.equal(availableForSize(sizes, '10" pot', 8), 0);

    const pooled = productSizes(shared, 1200);
    assert.equal(sizesTrackStock(pooled), false);
    assert.equal(availableForSize(pooled, '8 oz', 3), 3);
    // A product sold one way still answers with its own count.
    assert.equal(availableForSize([], null, 4), 4);
    assert.equal(sizeAvailable(null, 4), 4);
  });

  it('keeps the product total equal to what the sizes add up to', () => {
    assert.equal(productInventoryForSizes(counted, 99), 8);
    // Uncounted sizes leave the quantity the owner typed alone.
    assert.equal(productInventoryForSizes(shared, 7), 7);
    assert.equal(productInventoryForSizes([], 7), 7);
  });

  it('spends a size, and zeroes only that size when it comes up short', () => {
    const taken = takeStoredSizeStock(counted, '6" pot', 2);
    assert.equal(taken.took, true);
    assert.equal(productInventoryForSizes(taken.sizes, 0), 6);
    assert.deepEqual(taken.sizes[1], { label: '6" pot', priceCents: 2400, inventory: 0 });

    const short = takeStoredSizeStock(counted, '4" pot', 9);
    assert.equal(short.took, false);
    // The oversold size is emptied; the others stay sellable.
    assert.equal(short.sizes[0].inventory, 0);
    assert.equal(short.sizes[1].inventory, 2);

    // A size we no longer sell cannot be spent at all.
    assert.equal(takeStoredSizeStock(counted, '10" pot', 1).took, false);
    // An uncounted list has nothing of its own to spend: the product row did it.
    assert.deepEqual(takeStoredSizeStock(shared, '8 oz', 3), { sizes: shared, took: true });
  });

  it('returns stock to the size it came off, and drops it when that size is gone', () => {
    const returned = returnStoredSizeStock(counted, '8" POT', 3);
    assert.equal(returned[2].inventory, 3);
    assert.equal(productInventoryForSizes(returned, 0), 11);

    // Retired between the sale and the refund: there is no shelf to put it on,
    // and a total larger than the sizes would advertise stock nothing can sell.
    assert.deepEqual(returnStoredSizeStock(counted, '10" pot', 3), counted);
    assert.deepEqual(returnStoredSizeStock(shared, '8 oz', 3), shared);
  });

  it('reads the counts the owner typed and writes them back unchanged', () => {
    const typed = '4" pot | | 6\n6" pot | 24.00 | 2\n8" pot | 32.00 | 0';
    const parsed = withoutRedundantPrices(parseSizeLines(typed), 1800);
    assert.deepEqual(parsed, counted);
    assert.equal(sizeLines(parsed), typed);
    assert.equal(sizeStockSummary(parsed), '4" pot 6 · 6" pot 2 · 8" pot 0');
  });

  it('leaves the older two-field lines uncounted', () => {
    const typed = '2 oz\n8 oz | 26.00';
    const parsed = withoutRedundantPrices(parseSizeLines(typed), 1200);
    assert.deepEqual(parsed, shared);
    assert.equal(sizeLines(parsed), typed);
    assert.equal(sizeStockSummary(parsed), null);
  });

  it('only reads a third field as a count when both trailing fields are numbers', () => {
    // `Small | free` kept its label before counts existed and still does.
    assert.deepEqual(parseSizeLines('Small | free | 3'), [
      { label: 'Small | free', priceCents: 300 }
    ]);
    assert.deepEqual(parseSizeLines('4" pot | $18.00 | 6'), [
      { label: '4" pot', priceCents: 1800, inventory: 6 }
    ]);
    // A trailing bar with nothing after it is not a count of nothing.
    assert.deepEqual(parseSizeLines('4" pot | 18.00 |'), [{ label: '4" pot', priceCents: 1800 }]);
    // Fractions and negatives are not quantities on a bench.
    assert.deepEqual(parseSizeLines('4" pot | | 2.7'), [{ label: '4" pot', inventory: 2 }]);
    assert.deepEqual(parseSizeLines('4" pot | | -3'), [{ label: '4" pot' }]);
  });
});
