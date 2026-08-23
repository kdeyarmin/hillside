import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  backfillCategorySlug,
  CATEGORY_SEEDS,
  CATEGORY_SLUG_BY_TYPE,
  SPEC_KIND_BY_TYPE,
  SPEC_KIND_LABELS,
  specKindFor,
  withCategory
} = await import('../lib/product-categories.ts');

describe('the seeded taxonomy', () => {
  it('names every category once', () => {
    const slugs = CATEGORY_SEEDS.map((seed) => seed.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('gives every fallback slug a category to fall back to', () => {
    for (const slug of Object.values(CATEGORY_SLUG_BY_TYPE)) {
      assert.ok(
        CATEGORY_SEEDS.some((seed) => seed.slug === slug),
        `no seeded category for ${slug}`
      );
    }
  });

  it('labels every kind of detail a category can ask for', () => {
    for (const seed of CATEGORY_SEEDS) {
      assert.ok(SPEC_KIND_LABELS[seed.specKind], `no label for ${seed.specKind}`);
    }
  });
});

describe('backfillCategorySlug', () => {
  it('claims a flytrap for carnivorous plants before houseplants can have it', () => {
    assert.equal(
      backfillCategorySlug({ name: 'Venus Flytrap', slug: 'venus-flytrap', type: 'PLANT' }),
      'carnivorous-plants'
    );
  });

  it('reads the name and the slug together', () => {
    assert.equal(
      backfillCategorySlug({
        name: 'Tillandsia ionantha',
        slug: 'air-plant-ionantha',
        type: 'PLANT'
      }),
      'air-plants'
    );
  });

  it('falls back to the type when no keyword matches', () => {
    assert.equal(
      backfillCategorySlug({ name: 'Something new', slug: 'something-new', type: 'PLANT' }),
      'houseplants'
    );
    assert.equal(
      backfillCategorySlug({ name: 'Mystery item', slug: 'mystery', type: 'OTHER' }),
      'other'
    );
  });

  it('never lets a keyword pull a product across its own type', () => {
    // "Tea infuser" is a tea supply, and the Tea category's keywords must not
    // claim it away from Tea Accessories.
    assert.equal(
      backfillCategorySlug({ name: 'Tea infuser', slug: 'tea-infuser', type: 'TEA_SUPPLY' }),
      'tea-accessories'
    );
    // And "Golden Pothos in a 6" pot" is a plant, not a planter.
    assert.equal(
      backfillCategorySlug({ name: 'Golden Pothos, 6" pot', slug: 'golden-pothos', type: 'PLANT' }),
      'houseplants'
    );
  });
});

describe('specKindFor', () => {
  it('asks the category first', () => {
    assert.equal(
      specKindFor({ type: 'PLANT', category: { specKind: 'CARNIVOROUS_PLANT' } }),
      'CARNIVOROUS_PLANT'
    );
  });

  it('falls back to the broad type for a product with no category', () => {
    assert.equal(specKindFor({ type: 'TEA', category: null }), SPEC_KIND_BY_TYPE.TEA);
    assert.equal(specKindFor({ type: 'OTHER' }), 'GENERAL');
    // A type from outside the enum — a hand-edited row — still gets a form.
    assert.equal(specKindFor({ type: 'NONSENSE' }), 'GENERAL');
  });
});

describe('withCategory', () => {
  it('flattens the joined row to the two strings a card renders', () => {
    assert.deepEqual(withCategory({ id: '1', category: { slug: 'moss', title: 'Moss' } }), {
      id: '1',
      categorySlug: 'moss',
      categoryTitle: 'Moss'
    });
  });

  it('answers with nulls for a product that has no category', () => {
    assert.deepEqual(withCategory({ id: '1', category: null }), {
      id: '1',
      categorySlug: null,
      categoryTitle: null
    });
  });
});
