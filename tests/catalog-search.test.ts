import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { careSheetSearchFields, productSearchFields } from '../lib/catalog-search.ts';
import { matchesAnySearchFieldFuzzy, rankSearchHits } from '../lib/search.ts';

const pothos = {
  name: 'Golden Pothos',
  botanical: 'Epipremnum aureum',
  shortDescription: 'A trailing plant that copes with a dim hallway.',
  description: 'Long, easy vines for a shelf or a hanging pot.',
  searchTerms: "devil's ivy",
  type: 'PLANT',
  tags: ['pet-safe', 'low-light', 'beginner-friendly', 'trailing'],
  collections: [{ title: 'House Plants', keywords: ['houseplants', 'indoor plants'] }]
};

const soap = {
  name: 'Lavender Soap',
  shortDescription: 'A hand-cut bar.',
  description: 'Cured for six weeks.',
  type: 'SOAP',
  tags: ['handmade', 'giftable']
};

const finds = (product: Parameters<typeof productSearchFields>[0], term: string) => {
  const { primary, secondary } = productSearchFields(product);
  return matchesAnySearchFieldFuzzy([...primary, ...secondary], term);
};

describe('productSearchFields', () => {
  /**
   * Every one of these returned nothing before: the words are attributes, a
   * Latin name, a nickname or a category, and none of them appear in the copy
   * the old query searched.
   */
  it('finds a plant by what it is like to live with', () => {
    assert.equal(finds(pothos, 'pet safe'), true);
    assert.equal(finds(pothos, 'low light'), true);
    assert.equal(finds(pothos, 'beginner plant'), true);
  });

  it('finds a plant by its botanical name and its nickname', () => {
    assert.equal(finds(pothos, 'epipremnum'), true);
    assert.equal(finds(pothos, 'devils ivy'), true);
  });

  it('finds a product through the collection it belongs to', () => {
    assert.equal(finds(pothos, 'houseplants'), true);
  });

  it('does not answer a plant question with a bar of soap', () => {
    assert.equal(finds(soap, 'pet safe'), false);
    assert.equal(finds(soap, 'low light'), false);
    assert.equal(finds(soap, 'handmade'), true);
  });

  it('makes the derived attributes searchable without storing them', () => {
    const { primary, secondary } = productSearchFields(soap, ['best-seller', 'local-pickup']);
    assert.equal(matchesAnySearchFieldFuzzy([...primary, ...secondary], 'best seller'), true);
    assert.equal(matchesAnySearchFieldFuzzy([...primary, ...secondary], 'local pickup'), true);
    // …and it is genuinely derived: without the flag, the same product is not one.
    assert.equal(finds(soap, 'best seller'), false);
  });

  it('ranks the product named for the term above one that merely mentions it', () => {
    const potting = {
      name: 'Potting mix',
      description: 'Blended for pothos and philodendron.',
      type: 'OTHER'
    };
    const ranked = rankSearchHits(
      [potting, pothos],
      (product) => productSearchFields(product),
      'pothos'
    );
    assert.deepEqual(
      ranked.map((product) => product.name),
      ['Golden Pothos', 'Potting mix']
    );
  });
});

describe('careSheetSearchFields', () => {
  const guide = {
    plantName: 'Venus Flytrap',
    botanical: 'Dionaea muscipula',
    category: 'Carnivorous',
    summary: 'Bog plants that want rainwater and full sun.',
    symptoms: 'Traps turning black'
  };

  it('searches the name, the botanical name and the symptom', () => {
    const { primary, secondary } = careSheetSearchFields(guide);
    const fields = [...primary, ...secondary];
    assert.equal(matchesAnySearchFieldFuzzy(fields, 'flytrap'), true);
    assert.equal(matchesAnySearchFieldFuzzy(fields, 'dionaea'), true);
    assert.equal(matchesAnySearchFieldFuzzy(fields, 'carnivorous'), true);
    assert.equal(matchesAnySearchFieldFuzzy(fields, 'black traps'), true);
  });
});
