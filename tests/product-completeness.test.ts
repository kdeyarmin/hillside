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

/**
 * The kind-specific facts live in `specs`, read through the same registry the
 * admin form writes and the product page renders — so a checklist that passes
 * here is a checklist about the fields Tammy actually filled in.
 */
const plant = {
  ...complete,
  type: 'PLANT',
  specs: {
    potSize: '6" nursery pot',
    light: 'Bright indirect',
    water: 'When the top inch is dry',
    petSafety: 'Keep away from cats and dogs'
  }
};

const tea = {
  ...complete,
  type: 'TEA',
  name: 'Garden Mint',
  sku: 'TEA-04',
  specs: {
    netWeight: '2 oz (56 g)',
    ingredients: 'Peppermint, spearmint, lemon balm.',
    steepTime: '4 minutes',
    caffeine: 'Caffeine free'
  }
};

/** The same product with one spec field cleared. */
const without = <T extends { specs: Record<string, string> }>(product: T, ...keys: string[]) => {
  const specs = { ...product.specs };
  for (const key of keys) delete specs[key];
  return { ...product, specs };
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
    const missingLight = productCompleteness(without(plant, 'light'));
    assert.equal(missingLight.score, 92);
    assert.deepEqual(
      missingLight.missing.map((check) => check.key),
      ['light']
    );
  });

  it('treats an unanswered pet-safety question as unanswered', () => {
    // "Keep away from cats and dogs" is an answer as much as "safe around
    // them" is; only a blank counts as unanswered.
    assert.equal(productCompleteness(plant).score, 100);
    assert.equal(productCompleteness(without(plant, 'petSafety')).score, 92);
  });

  it('accepts an empty shelf when the status explains it', () => {
    assert.equal(productCompleteness({ ...plant, inventory: 0 }).score, 92);
    assert.equal(
      productCompleteness({ ...plant, inventory: 0, inventoryStatus: 'MADE_TO_ORDER' }).score,
      100
    );
  });

  it('calls generic category artwork what it is', () => {
    const generic = productCompleteness({
      ...plant,
      imageUrl: '/images/catalog/house-plants.webp'
    });
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
    assert.equal(
      publishBlockReason({ ...without(plant, 'potSize'), sku: null, imageUrl: null }),
      null
    );
  });

  it('refuses a consumable with no contents or ingredients on it', () => {
    assert.equal(publishBlockReason(tea), null);
    assert.match(
      publishBlockReason(without(tea, 'ingredients')) || '',
      /Add the ingredients before listing this for sale/
    );
    assert.match(
      publishBlockReason(without(tea, 'netWeight', 'ingredients')) || '',
      /Add the net weight and ingredients before listing this for sale/
    );
  });

  it('holds soaps and lotions to the same rule', () => {
    assert.ok(publishBlockReason({ ...complete, type: 'SOAP' }));
    assert.ok(publishBlockReason({ ...complete, type: 'LOTION' }));
    assert.equal(publishBlockReason({ ...complete, type: 'TEA_SUPPLY' }), null);
  });
});
