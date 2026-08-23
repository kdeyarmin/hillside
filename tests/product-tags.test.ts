import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARD_TRAIT_TAGS,
  PRODUCT_TAGS,
  cardTraitTags,
  groupTags,
  normalizeTags,
  tagLabel,
  tagSearchText,
  tagsForProduct,
  tagsForTypes
} from '../lib/product-tags.ts';

describe('normalizeTags', () => {
  it('keeps only tags the catalog knows, deduplicated and in catalog order', () => {
    assert.deepEqual(normalizeTags(['handmade', 'pet-safe', 'handmade']), ['pet-safe', 'handmade']);
  });

  it('drops anything invented, including derived tags nothing should store', () => {
    // `best-seller` is worked out from orders. Storing it would let a stale
    // checkbox claim a sales record the shop can disprove.
    assert.deepEqual(normalizeTags(['best-seller', 'in-stock', 'made-up']), []);
  });

  it('is case and whitespace forgiving about what was posted', () => {
    assert.deepEqual(normalizeTags([' Pet-Safe ', 'LOW-LIGHT']), ['pet-safe', 'low-light']);
  });

  it('treats nothing at all as nothing', () => {
    assert.deepEqual(normalizeTags(null), []);
    assert.deepEqual(normalizeTags(undefined), []);
  });

  /**
   * The product form shows every attribute group whatever is being edited, so
   * a soap saved as "low light" would answer a light filter and a plant search
   * for the rest of its life.
   */
  it('drops an attribute that cannot apply to the product being saved', () => {
    assert.deepEqual(normalizeTags(['low-light', 'handmade'], 'SOAP'), ['handmade']);
    assert.deepEqual(normalizeTags(['low-light', 'handmade'], 'PLANT'), ['low-light', 'handmade']);
  });

  it('keeps every known attribute when no type narrows it', () => {
    assert.deepEqual(normalizeTags(['low-light', 'handmade']), ['low-light', 'handmade']);
  });
});

describe('tagsForTypes', () => {
  /**
   * The live requirement: a soap customer does not need a light-requirement
   * filter.
   */
  it('offers no light or growth-habit attributes for soap alone', () => {
    const slugs = tagsForTypes(['SOAP']).map((tag) => tag.slug);
    assert.equal(slugs.includes('low-light'), false);
    assert.equal(slugs.includes('trailing'), false);
    assert.equal(slugs.includes('handmade'), true);
    assert.equal(slugs.includes('giftable'), true);
  });

  it('keeps the plant attributes as soon as one plant is on screen', () => {
    const slugs = tagsForTypes(['SOAP', 'PLANT']).map((tag) => tag.slug);
    assert.equal(slugs.includes('low-light'), true);
    assert.equal(slugs.includes('handmade'), true);
  });

  it('offers everything when nothing narrows it', () => {
    assert.equal(tagsForTypes([]).length, PRODUCT_TAGS.length);
  });
});

describe('groupTags', () => {
  it('drops groups with nothing in them', () => {
    const groups = groupTags(tagsForTypes(['SOAP']));
    assert.equal(
      groups.some((group) => group.key === 'light'),
      false
    );
    assert.equal(
      groups.some((group) => group.key === 'making'),
      true
    );
  });
});

describe('tagsForProduct', () => {
  it('adds what the shop knows to what the owner ticked', () => {
    const tags = tagsForProduct(
      { inventory: 3, ships: true, pickup: true, staffPick: true, tags: ['pet-safe'] },
      { isNew: true, isBestSeller: true, isOnSale: true }
    );
    assert.deepEqual(tags.sort(), [
      'best-seller',
      'in-stock',
      'local-pickup',
      'new',
      'on-sale',
      'pet-safe',
      'ships',
      'staff-pick'
    ]);
  });

  it('does not claim in stock, pickup or shipping when they are not true', () => {
    const tags = tagsForProduct({ inventory: 0, ships: false, pickup: false, tags: [] });
    assert.deepEqual(tags, []);
  });

  it('lets a season be either ticked or earned from the dates', () => {
    assert.equal(tagsForProduct({ inventory: 0, tags: ['seasonal'] }).includes('seasonal'), true);
    assert.equal(
      tagsForProduct({ inventory: 0, tags: [] }, { isInSeason: true }).includes('seasonal'),
      true
    );
  });
});

describe('tagSearchText', () => {
  it('includes the words a shopper would type rather than the stored slug', () => {
    const text = tagSearchText(['pet-safe']).toLowerCase();
    assert.equal(text.includes('pet safe'), true);
    assert.equal(text.includes('cat safe'), true);
    assert.equal(text.includes('non toxic'), true);
  });

  it('falls back to a readable form for anything unknown', () => {
    assert.equal(tagSearchText(['made-up-thing']), 'made up thing');
    assert.equal(tagLabel('made-up-thing'), 'made up thing');
  });
});

/**
 * The two claims a product card is allowed to make about the product itself.
 * Both were briefly derived from other things — boolean columns, and then the
 * free-text specification fields that replaced them — so the point of these
 * tests is that a claim is now only ever made because Tammy ticked it.
 */
describe('cardTraitTags', () => {
  it('states the attributes that were ticked, in catalog order', () => {
    assert.deepEqual(cardTraitTags(['beginner-friendly', 'pet-safe'], 'PLANT'), [
      'pet-safe',
      'beginner-friendly'
    ]);
    assert.deepEqual(cardTraitTags(['pet-safe'], 'PLANT'), ['pet-safe']);
  });

  it('claims nothing for a product that was never given the attribute', () => {
    assert.deepEqual(cardTraitTags([], 'PLANT'), []);
    assert.deepEqual(cardTraitTags(null, 'PLANT'), []);
    assert.deepEqual(cardTraitTags(undefined, 'PLANT'), []);
  });

  it('leaves the rest of the vocabulary off the card', () => {
    // Every one of these is a real assignable attribute and a real filter; none
    // of them belongs in the two lines a card has room for.
    assert.deepEqual(cardTraitTags(['low-light', 'handmade', 'drought-tolerant'], 'PLANT'), []);
  });

  it('drops an attribute that no longer applies to what the product is', () => {
    // Pet safety is a plant question. A listing re-shelved as a soap keeps the
    // stored tag, and must stop advertising it.
    assert.deepEqual(cardTraitTags(['pet-safe'], 'SOAP'), []);
    assert.deepEqual(cardTraitTags(['pet-safe'], 'PLANT'), ['pet-safe']);
  });

  it('makes no claim a derived tag could smuggle in', () => {
    for (const slug of ['best-seller', 'new', 'in-stock', 'on-sale']) {
      assert.deepEqual(cardTraitTags([slug], 'PLANT'), []);
    }
  });

  it('reads on the card as the words the shop filters by', () => {
    assert.deepEqual(
      CARD_TRAIT_TAGS.map((slug) => tagLabel(slug)),
      ['Pet safe', 'Beginner friendly']
    );
  });
});
