import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_TRAITS, cardTraits } from '../lib/card-traits.ts';
import { PRODUCT_TAGS, normalizeTags } from '../lib/product-tags.ts';

/**
 * The two claims a product card is allowed to make about the product itself.
 * Both were briefly derived from other things — boolean columns, and then the
 * free-text specification fields that replaced them — so the point of these
 * tests is that a claim is now only ever made because Tammy ticked it.
 */
describe('cardTraits', () => {
  it('states the attributes that were ticked, in the order a card prints them', () => {
    assert.deepEqual(
      cardTraits(['beginner-friendly', 'pet-safe'], 'PLANT').map((trait) => trait.label),
      ['Pet safe', 'Beginner friendly']
    );
    assert.deepEqual(
      cardTraits(['pet-safe'], 'PLANT').map((trait) => trait.label),
      ['Pet safe']
    );
  });

  it('claims nothing for a product that was never given the attribute', () => {
    assert.deepEqual(cardTraits([], 'PLANT'), []);
    assert.deepEqual(cardTraits(null, 'PLANT'), []);
    assert.deepEqual(cardTraits(undefined, 'PLANT'), []);
  });

  it('leaves the rest of the vocabulary off the card', () => {
    // Every one of these is a real assignable attribute and a real filter; none
    // of them belongs in the two lines a card has room for.
    assert.deepEqual(cardTraits(['low-light', 'handmade', 'drought-tolerant'], 'PLANT'), []);
  });

  it('drops an attribute that no longer applies to what the product is', () => {
    // Pet safety is a plant question. A listing re-shelved as a soap keeps the
    // stored tag, and must stop advertising it.
    assert.deepEqual(cardTraits(['pet-safe'], 'SOAP'), []);
    assert.deepEqual(
      cardTraits(['pet-safe'], 'PLANT').map((trait) => trait.slug),
      ['pet-safe']
    );
  });

  it('makes no claim a derived tag could smuggle in', () => {
    for (const slug of ['best-seller', 'new', 'in-stock', 'on-sale']) {
      assert.deepEqual(cardTraits([slug], 'PLANT'), []);
    }
  });

  it('is not thrown by the casing or spacing a stored value might carry', () => {
    assert.deepEqual(
      cardTraits(['  Pet-Safe  '], 'PLANT').map((trait) => trait.slug),
      ['pet-safe']
    );
  });
});

/**
 * `lib/card-traits.ts` restates three facts about two attributes so that
 * `ProductCard` — a client component on every page with a grid — does not have
 * to pull the whole vocabulary, synonym lists and all, into the browser. That
 * restatement is only safe while it agrees with the vocabulary it copies from,
 * so this is the thing that fails when somebody reworders a label or widens a
 * tag's product types and does not know a card also prints it.
 */
describe('the card traits agree with the vocabulary they came from', () => {
  for (const trait of CARD_TRAITS) {
    it(`${trait.slug} matches its entry in PRODUCT_TAGS`, () => {
      const canonical = PRODUCT_TAGS.find((tag) => tag.slug === trait.slug);
      assert.ok(canonical, `${trait.slug} is not an assignable attribute any more`);
      assert.equal(trait.label, canonical.label);
      assert.deepEqual([...trait.types], [...(canonical.types || [])]);
    });
  }

  it('claims exactly what the vocabulary would claim for the same tags', () => {
    // The card's own filtering has to reach the same answer `normalizeTags`
    // would, since that is what the shop filters and the admin form agree on.
    const stored = ['pet-safe', 'beginner-friendly', 'low-light', 'handmade'];
    const viaVocabulary = new Set(normalizeTags(stored, 'PLANT'));
    for (const trait of CARD_TRAITS) {
      assert.equal(
        cardTraits(stored, 'PLANT').some((claimed) => claimed.slug === trait.slug),
        viaVocabulary.has(trait.slug),
        `${trait.slug} disagrees with normalizeTags`
      );
    }
  });
});
