import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bundleContents,
  bundlesFirst,
  excludedFromGifts,
  findGiftGuide,
  giftGuidePath,
  giftGuidesForProduct,
  giftPriceCents,
  GIFT_EXCLUDE_TAG,
  GIFT_GUIDES,
  GIFT_TAG_CHOICES,
  matchesGiftGuide,
  parseBundleItems,
  productsForGiftGuide,
  readGiftTags,
  type GiftMatchable
} from '../lib/gifts.ts';

const guide = (slug: string) => {
  const found = findGiftGuide(slug);
  assert.ok(found, `expected a guide called ${slug}`);
  return found;
};

const product = (overrides: Partial<GiftMatchable> = {}): GiftMatchable => ({
  name: 'Golden Pothos',
  slug: 'golden-pothos',
  shortDescription: 'A forgiving trailing plant.',
  description: 'Dependable, easygoing foliage.',
  type: 'PLANT',
  priceCents: 2400,
  ...overrides
});

describe('findGiftGuide', () => {
  it('resolves a guide by slug, case and whitespace insensitively', () => {
    assert.equal(findGiftGuide('under-25')?.title, 'Gifts under $25');
    assert.equal(findGiftGuide('  UNDER-25 ')?.slug, 'under-25');
    assert.equal(findGiftGuide('nonsense'), null);
    assert.equal(findGiftGuide(undefined), null);
  });

  it('gives every guide a unique slug and a path under /gifts', () => {
    const slugs = GIFT_GUIDES.map((entry) => entry.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(giftGuidePath('tea-lover'), '/gifts/tea-lover');
  });

  it('offers only occasion guides as owner tags', () => {
    assert.ok(GIFT_TAG_CHOICES.length > 0);
    assert.ok(GIFT_TAG_CHOICES.every((entry) => entry.kind === 'occasion'));
  });
});

describe('giftPriceCents', () => {
  it('uses the cheapest size a shopper can actually buy', () => {
    assert.equal(giftPriceCents(product({ priceCents: 3800 })), 3800);
    assert.equal(
      giftPriceCents(
        product({
          priceCents: 3800,
          sizes: [{ label: '4" pot', priceCents: 1800 }, { label: '8" pot' }]
        })
      ),
      1800
    );
  });
});

describe('giftPriceCents and sold-out sizes', () => {
  it('quotes only a size a shopper can actually buy', () => {
    /* $18 4" pots have run out; $40 8" pots have not. The product total stays
       positive because the 8" pots hold it up, so nothing else catches this. */
    const partlySoldOut = product({
      priceCents: 4000,
      inventory: 3,
      sizes: [
        { label: '4" pot', priceCents: 1800, inventory: 0 },
        { label: '8" pot', priceCents: 4000, inventory: 3 }
      ]
    });
    assert.equal(giftPriceCents(partlySoldOut), 4000);
    assert.equal(matchesGiftGuide(partlySoldOut, guide('under-25')), false);
    assert.equal(matchesGiftGuide(partlySoldOut, guide('under-50')), true);
  });

  it('still quotes the cheapest size while it is on the bench', () => {
    const stocked = product({
      priceCents: 4000,
      inventory: 5,
      sizes: [
        { label: '4" pot', priceCents: 1800, inventory: 2 },
        { label: '8" pot', priceCents: 4000, inventory: 3 }
      ]
    });
    assert.equal(giftPriceCents(stocked), 1800);
    assert.equal(matchesGiftGuide(stocked, guide('under-25')), true);
  });

  it('leaves a shared-pile size list alone', () => {
    // No per-size counts: the product's own quantity governs every size.
    const shared = product({
      priceCents: 4000,
      inventory: 0,
      sizes: [{ label: '4" pot', priceCents: 1800 }, { label: '8" pot' }]
    });
    assert.equal(giftPriceCents(shared), 1800);
  });
});

describe('price bands', () => {
  it('includes a product whose smallest size clears the ceiling', () => {
    const sized = product({
      priceCents: 3800,
      sizes: [
        { label: '4" pot', priceCents: 1800 },
        { label: '8" pot', priceCents: 3800 }
      ]
    });
    assert.equal(matchesGiftGuide(sized, guide('under-25')), true);
    assert.equal(matchesGiftGuide(product({ priceCents: 3800 }), guide('under-25')), false);
    assert.equal(matchesGiftGuide(product({ priceCents: 3800 }), guide('under-50')), true);
  });

  it('holds the ceiling even against an owner tag', () => {
    const expensive = product({ priceCents: 9000, giftTags: ['under-25'] });
    assert.equal(matchesGiftGuide(expensive, guide('under-25')), false);
  });

  it('treats a price exactly on the ceiling as inside it', () => {
    assert.equal(matchesGiftGuide(product({ priceCents: 2500 }), guide('under-25')), true);
    assert.equal(matchesGiftGuide(product({ priceCents: 2501 }), guide('under-25')), false);
  });
});

describe('occasion guides', () => {
  it('matches on product type', () => {
    assert.equal(matchesGiftGuide(product(), guide('plant-lover')), true);
    assert.equal(
      matchesGiftGuide(product({ type: 'TEA', name: 'Hillside Calm' }), guide('tea-lover')),
      true
    );
    assert.equal(matchesGiftGuide(product(), guide('tea-lover')), false);
  });

  it('matches a keyword at the start of a word, not anywhere inside one', () => {
    /* The exact false positive `lib/search.ts` exists to stop: "tea" sitting
       inside "steady" used to put a houseplant in the tea-lover guide. */
    const steady = product({
      name: 'Cast Iron Plant',
      slug: 'cast-iron-plant',
      shortDescription: 'Wants steady watering and little else.',
      description: 'A steadfast, instead-of-fussing houseplant.',
      type: 'PLANT'
    });
    assert.equal(matchesGiftGuide(steady, guide('tea-lover')), false);

    const realTea = product({
      name: 'Teapot and infuser set',
      slug: 'teapot-and-infuser-set',
      shortDescription: 'For loose leaf.',
      description: 'A teapot.',
      type: 'OTHER'
    });
    assert.equal(matchesGiftGuide(realTea, guide('tea-lover')), true);
  });

  it('keeps a stem keyword working as a prefix', () => {
    const cuttings = product({
      name: 'Propagation station',
      slug: 'propagation-station',
      shortDescription: 'Glass vials for rooting cuttings.',
      description: 'Rooting vials.',
      type: 'OTHER'
    });
    assert.equal(matchesGiftGuide(cuttings, guide('plant-lover')), true);
  });

  it('matches on wording when the type does not say enough', () => {
    const driftwood = product({
      name: 'Driftwood mount',
      slug: 'driftwood-mount',
      shortDescription: 'For mounting air plants.',
      description: 'Weathered wood.',
      type: 'OTHER'
    });
    assert.equal(matchesGiftGuide(driftwood, guide('plant-lover')), true);
  });

  it('respects an occasion ceiling', () => {
    const bigSoap = product({ name: 'Soap crate', type: 'SOAP', priceCents: 8000 });
    assert.equal(matchesGiftGuide(bigSoap, guide('teacher')), false);
    assert.equal(
      matchesGiftGuide(
        product({ name: 'Herb soap', type: 'SOAP', priceCents: 900 }),
        guide('teacher')
      ),
      true
    );
  });

  it('lets an owner tag add a guide the rules would have missed', () => {
    const tagged = product({ giftTags: ['teacher'] });
    assert.equal(matchesGiftGuide(tagged, guide('teacher')), true);
    // And the derived placement it already had is kept.
    assert.equal(matchesGiftGuide(tagged, guide('plant-lover')), true);
  });

  it('puts bundles and featured picks in the holiday guide', () => {
    const set = product({ name: 'Evening set', type: 'OTHER', bundle: true, priceCents: 6500 });
    assert.equal(matchesGiftGuide(set, guide('holiday')), true);
    assert.equal(matchesGiftGuide(product({ featured: true }), guide('holiday')), true);
    assert.equal(matchesGiftGuide(product(), guide('holiday')), false);
  });
});

describe('the bundles guide', () => {
  it('holds bundles and nothing else', () => {
    assert.equal(matchesGiftGuide(product({ bundle: true }), guide('bundles')), true);
    assert.equal(matchesGiftGuide(product(), guide('bundles')), false);
  });

  it('is not opened up by a tag', () => {
    assert.equal(matchesGiftGuide(product({ giftTags: ['bundles'] }), guide('bundles')), false);
  });
});

describe('the exclusion tag', () => {
  const substrate = product({
    name: 'Terrarium substrate',
    slug: 'terrarium-substrate',
    type: 'OTHER',
    priceCents: 900,
    giftTags: [GIFT_EXCLUDE_TAG]
  });

  it('keeps a product out of every guide', () => {
    assert.equal(excludedFromGifts(substrate), true);
    assert.deepEqual(giftGuidesForProduct(substrate), []);
  });

  it('wins over any guide tag saved alongside it', () => {
    assert.deepEqual(readGiftTags(['teacher', GIFT_EXCLUDE_TAG]), [GIFT_EXCLUDE_TAG]);
  });
});

describe('readGiftTags', () => {
  it('keeps known guide slugs, drops the rest, and deduplicates', () => {
    assert.deepEqual(readGiftTags([' Teacher ', 'teacher', 'holiday', 'made-up']), [
      'teacher',
      'holiday'
    ]);
    assert.deepEqual(readGiftTags([]), []);
  });
});

describe('giftGuidesForProduct and productsForGiftGuide', () => {
  it('lists every guide a product belongs to', () => {
    const tea = product({
      name: 'Hillside Calm Tea',
      slug: 'hillside-calm-tea',
      shortDescription: 'A soothing loose-leaf blend.',
      description: 'Small batch.',
      type: 'TEA',
      priceCents: 1600
    });
    const slugs = giftGuidesForProduct(tea).map((entry) => entry.slug);
    assert.deepEqual(slugs, ['under-25', 'under-50', 'under-100', 'tea-lover', 'teacher']);
  });

  it('filters a catalog down to one guide', () => {
    const catalog = [product(), product({ name: 'Calm tea', type: 'TEA', priceCents: 1600 })];
    assert.deepEqual(
      productsForGiftGuide(catalog, guide('tea-lover')).map((entry) => entry.name),
      ['Calm tea']
    );
  });
});

describe('bundlesFirst', () => {
  it('lifts bundles to the front and leaves the rest in order', () => {
    const rows = [
      { slug: 'a', bundle: false },
      { slug: 'b', bundle: true },
      { slug: 'c' },
      { slug: 'd', bundle: true }
    ];
    assert.deepEqual(
      bundlesFirst(rows).map((row) => row.slug),
      ['b', 'd', 'a', 'c']
    );
  });
});

describe('bundle contents', () => {
  it('parses the owner form one item per line, trimmed and capped', () => {
    assert.deepEqual(parseBundleItems('  One tin of tea \n\n Infuser  \n'), [
      'One tin of tea',
      'Infuser'
    ]);
    assert.equal(parseBundleItems(Array.from({ length: 30 }, () => 'item').join('\n')).length, 12);
  });

  it('cleans stored contents for display', () => {
    assert.deepEqual(bundleContents([' Tea ', '', null as unknown as string]), ['Tea']);
    assert.deepEqual(bundleContents(undefined), []);
  });
});
