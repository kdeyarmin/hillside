import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  productCompleteness,
  publishBlockReason,
  publishedIncomplete
} from '../lib/product-completeness.ts';

/** Everything the common checklist wants, so each test can remove one thing. */
const complete = {
  name: 'Monstera Deliciosa',
  description: 'A big-leaved climber that grows into the room.',
  shortDescription: 'Big, glossy, forgiving.',
  sku: 'PL-01',
  priceCents: 4200,
  inventory: 6,
  imageUrl: '/media/monstera.jpg',
  ships: true,
  pickup: true,
  active: true
};

const plant = {
  ...complete,
  type: 'PLANT',
  potSize: '6" nursery pot',
  lightNeeds: 'Bright indirect',
  waterNeeds: 'When the top inch is dry',
  petSafe: false
};

const tea = {
  ...complete,
  type: 'TEA',
  name: 'Garden Mint',
  sku: 'TEA-04',
  netWeight: '2 oz (56 g)',
  ingredients: 'Peppermint, spearmint, lemon balm.',
  brewingInstructions: '1 tsp per cup, 4 minutes.',
  caffeineStatus: 'CAFFEINE_FREE'
};

describe('productCompleteness', () => {
  it('asks a plant for plant things and a tea for tea things', () => {
    const plantKeys = productCompleteness(plant).checks.map((check) => check.key);
    assert.ok(plantKeys.includes('potSize'));
    assert.ok(!plantKeys.includes('brewing'));

    const teaKeys = productCompleteness(tea).checks.map((check) => check.key);
    assert.ok(teaKeys.includes('brewing'));
    assert.ok(!teaKeys.includes('potSize'));
  });

  it('scores what is filled in over what this kind of product needs', () => {
    assert.equal(productCompleteness(plant).score, 100);
    const missingLight = productCompleteness({ ...plant, lightNeeds: null });
    assert.equal(missingLight.score, 92);
    assert.deepEqual(
      missingLight.missing.map((check) => check.key),
      ['light']
    );
  });

  it('treats an unanswered pet-safety question as unanswered', () => {
    // `false` is an answer — "keep it away from the cat" — and must not read as
    // a blank the way a missing string would.
    assert.equal(productCompleteness({ ...plant, petSafe: false }).score, 100);
    assert.equal(productCompleteness({ ...plant, petSafe: null }).score, 92);
  });

  it('accepts an empty shelf when the status explains it', () => {
    assert.equal(productCompleteness({ ...plant, inventory: 0 }).score, 92);
    assert.equal(
      productCompleteness({ ...plant, inventory: 0, inventoryStatus: 'MADE_TO_ORDER' }).score,
      100
    );
  });

  it('calls generic category artwork what it is', () => {
    const generic = productCompleteness({ ...plant, imageUrl: '/images/catalog/house-plants.webp' });
    assert.deepEqual(
      generic.missing.map((check) => check.key),
      ['mainPhoto']
    );
  });
});

describe('publish states', () => {
  it('separates a draft from something merely unpublished', () => {
    assert.equal(productCompleteness(plant).state, 'published');
    assert.equal(productCompleteness({ ...plant, active: false }).state, 'ready');
    assert.equal(productCompleteness({ ...plant, active: false, sku: null }).state, 'draft');
  });

  it('names a live listing that is still missing something', () => {
    assert.equal(publishedIncomplete(productCompleteness(plant)), false);
    assert.equal(publishedIncomplete(productCompleteness({ ...plant, sku: null })), true);
    // Only *required* gaps count; a missing card description is not a problem
    // worth flagging on a product that is selling.
    assert.equal(
      publishedIncomplete(productCompleteness({ ...plant, shortDescription: null })),
      false
    );
  });
});

describe('publishBlockReason', () => {
  it('does not stand in the way of an unfinished plant', () => {
    assert.equal(publishBlockReason({ ...plant, potSize: null, sku: null, imageUrl: null }), null);
  });

  it('refuses a consumable with no contents or ingredients on it', () => {
    assert.equal(publishBlockReason(tea), null);
    assert.match(
      publishBlockReason({ ...tea, ingredients: null }) || '',
      /Add the ingredients before listing this for sale/
    );
    assert.match(
      publishBlockReason({ ...tea, netWeight: null, ingredients: null }) || '',
      /Add the net weight and ingredients before listing this for sale/
    );
  });

  it('holds soaps and lotions to the same rule', () => {
    assert.ok(publishBlockReason({ ...complete, type: 'SOAP' }));
    assert.ok(publishBlockReason({ ...complete, type: 'LOTION' }));
    assert.equal(publishBlockReason({ ...complete, type: 'TEA_SUPPLY' }), null);
  });
});
