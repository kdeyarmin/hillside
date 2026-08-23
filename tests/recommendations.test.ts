import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  automaticMatches,
  frequentlyBoughtTogether,
  MIN_CO_PURCHASES,
  normalizeTag,
  productTraits,
  similarProducts
} = await import('../lib/recommendations.ts');

type ProductInput = {
  id: string;
  slug?: string;
  name: string;
  type: string;
  tags?: string[];
  shortDescription?: string;
  description?: string;
  careNotes?: string;
};

function product(input: ProductInput) {
  return {
    slug: input.slug ?? input.id,
    description: '',
    ...input
  };
}

const tea = product({
  id: 'tea',
  name: 'Hillside Calm Tea',
  type: 'TEA',
  description: 'A loose-leaf chamomile and lemon balm blend.'
});
const infuser = product({
  id: 'infuser',
  name: 'Stainless infuser',
  type: 'TEA_SUPPLY',
  description: 'A fine-mesh infuser that drops into any mug.'
});
const soap = product({ id: 'soap', name: 'Lavender soap', type: 'SOAP', description: 'A bar.' });
const lotion = product({
  id: 'lotion',
  name: 'Calendula lotion',
  type: 'LOTION',
  description: 'A light lotion.'
});
const flytrap = product({
  id: 'flytrap',
  name: 'Venus Flytrap',
  type: 'PLANT',
  description: 'A carnivorous plant grown on in a 3" pot.'
});
const carnivorousMix = product({
  id: 'bog-mix',
  name: 'Carnivorous plant mix',
  type: 'OTHER',
  description: 'A nutrient-free mix of long-fibered sphagnum and perlite.'
});
const potting = product({
  id: 'potting',
  name: 'Houseplant potting mix',
  type: 'OTHER',
  description: 'A general potting soil for tropical houseplants.'
});
const planter = product({
  id: 'planter',
  name: 'Stoneware planter',
  type: 'OTHER',
  description: 'A glazed ceramic pot with a matching saucer.'
});
const monstera = product({
  id: 'monstera',
  name: 'Monstera Deliciosa',
  type: 'PLANT',
  description: 'Grown on here in a 6" pot until the leaves fenestrate.'
});
const moss = product({
  id: 'moss',
  name: 'Sheet moss',
  type: 'OTHER',
  tags: ['terrarium'],
  description: 'Live sheet moss, sold by the handful.'
});
const terrariumPlant = product({
  id: 'fittonia',
  name: 'Fittonia',
  type: 'PLANT',
  tags: ['terrarium'],
  description: 'A humidity-lover that thrives in a closed terrarium.'
});

const catalog = [
  tea,
  infuser,
  soap,
  lotion,
  flytrap,
  carnivorousMix,
  potting,
  planter,
  monstera,
  moss,
  terrariumPlant
];

const idsFor = (anchor: ProductInput, section: 'pairs' | 'complete') =>
  automaticMatches(product(anchor), catalog)
    .filter((match) => match.section === section)
    .map((match) => match.product.id);

describe('productTraits', () => {
  it('reads the owner’s tags first', () => {
    assert.equal(
      productTraits(product({ ...moss, tags: ['moss', 'terrarium'] })).has('moss'),
      true
    );
  });

  it('infers from the product’s own words when nothing is tagged', () => {
    const traits = productTraits(flytrap);
    assert.equal(traits.has('carnivorous'), true);
    assert.equal(traits.has('plant'), true);
  });

  it('does not read a plant’s pot size as a planter', () => {
    // "Grown on here in a 6\" pot" appears in half the plant descriptions on the
    // site, and a plant recommended as the thing to pot itself in is nonsense.
    assert.equal(productTraits(monstera).has('planter'), false);
    assert.equal(productTraits(planter).has('planter'), true);
  });

  it('normalizes a tag to what the rules match on', () => {
    assert.equal(normalizeTag('  Terrarium Container '), 'terrarium-container');
  });

  it('finds a trait written in the plural', () => {
    /**
     * "A trio of succulents", "perfect for terrariums", "air plants need no
     * soil" — the natural way to write any of these is plural, and a rule that
     * only matched the singular stayed silent on exactly the products it was
     * written for.
     */
    const cases: Array<[string, string, string]> = [
      ['PLANT', 'A trio of succulents in 2 inch pots.', 'succulent'],
      ['PLANT', 'Air plants need no soil at all.', 'air-plant'],
      ['OTHER', 'Glazed ceramic planters with saucers.', 'planter'],
      ['OTHER', 'Fine-mesh tea infusers.', 'infuser'],
      ['OTHER', 'Sheet moss, good in terrariums.', 'terrarium']
    ];
    for (const [type, description, trait] of cases) {
      const traits = productTraits(product({ id: 'x', name: 'x', type, description }));
      assert.equal(traits.has(trait), true, `expected "${description}" to infer ${trait}`);
    }
  });

  it('adds tags to inference rather than replacing it', () => {
    // Tagging one thing must not cost a product everything else it is.
    const traits = productTraits(product({ ...flytrap, tags: ['gift'] }));
    assert.equal(traits.has('gift'), true);
    assert.equal(traits.has('carnivorous'), true);
    assert.equal(traits.has('plant'), true);
  });

  it('lets a minus tag switch off something the description implied', () => {
    /**
     * Inference reads the product's own words, and those words are not always
     * about the product: "not intended for terrariums" would otherwise tag this
     * moss `terrarium` and give it recommendations the owner cannot remove.
     */
    const moss = product({
      id: 'moss-only',
      name: 'Sheet moss',
      type: 'OTHER',
      description: 'Live sheet moss. Not intended for terrariums.'
    });
    assert.equal(productTraits(moss).has('terrarium'), true);
    assert.equal(
      productTraits(product({ ...moss, tags: ['moss', '-terrarium'] })).has('terrarium'),
      false
    );
    assert.equal(normalizeTag('-Terrarium'), '-terrarium');
  });

  it('resolves a contradiction the predictable way — suppression wins', () => {
    const traits = productTraits(product({ ...flytrap, tags: ['carnivorous', '-carnivorous'] }));
    assert.equal(traits.has('carnivorous'), false);
  });
});

describe('automaticMatches', () => {
  it('sends a tea to the thing you steep it in', () => {
    assert.deepEqual(idsFor(tea, 'pairs'), ['infuser']);
  });

  it('sends a carnivorous plant to the medium that will not kill it', () => {
    const complete = idsFor(flytrap, 'complete');
    assert.equal(complete[0], 'bog-mix');
    // The general houseplant soil must not be top of the list for a fly trap.
    assert.notEqual(complete[0], 'potting');
  });

  it('sends a terrarium plant to moss and substrate', () => {
    assert.ok(idsFor(terrariumPlant, 'complete').includes('moss'));
  });

  it('pairs soap with lotion, both ways round', () => {
    assert.deepEqual(idsFor(soap, 'pairs'), ['lotion']);
    assert.deepEqual(idsFor(lotion, 'pairs'), ['soap']);
  });

  it('never returns a candidate merely for sharing a broad category', () => {
    // A monstera and a fly trap are both PLANT, and neither completes or pairs
    // with the other. Nothing at all is the right answer.
    const matched = automaticMatches(monstera, [flytrap, terrariumPlant, tea, soap]);
    assert.deepEqual(matched, []);
  });

  it('is one-way: a planter does not recommend a plant', () => {
    assert.equal(idsFor(planter, 'complete').includes('monstera'), false);
    assert.ok(idsFor(monstera, 'complete').includes('planter'));
  });

  it('never recommends the product itself', () => {
    assert.equal(
      automaticMatches(tea, catalog).some((match) => match.product.id === tea.id),
      false
    );
  });

  it('carries a reason with every match', () => {
    for (const match of automaticMatches(flytrap, catalog)) {
      assert.ok(match.reason.length > 0);
    }
  });
});

describe('similarProducts', () => {
  const pitcher = product({
    id: 'sarracenia',
    name: 'Sarracenia',
    type: 'PLANT',
    description: 'A hardy pitcher plant for a sunny bog.'
  });

  it('ranks a shared trait above merely sharing a type', () => {
    const ranked = similarProducts(flytrap, [monstera, terrariumPlant, pitcher]);
    // Another carnivorous plant is a real alternative to a fly trap; a monstera
    // is only "also a plant", which is the reasoning this section replaces.
    assert.equal(ranked[0].product.id, 'sarracenia');
  });

  it('skips anything already used in an earlier rail', () => {
    const ranked = similarProducts(flytrap, [monstera, pitcher], new Set(['sarracenia']));
    assert.equal(
      ranked.some((entry) => entry.product.id === 'sarracenia'),
      false
    );
  });

  it('returns nothing when a candidate has no connection at all', () => {
    assert.deepEqual(similarProducts(tea, [soap]), []);
  });
});

describe('frequentlyBoughtTogether', () => {
  it('needs more than one shared order before it will claim a pattern', () => {
    const counts = new Map([
      ['a', 1],
      ['b', MIN_CO_PURCHASES],
      ['c', 9]
    ]);
    assert.deepEqual(frequentlyBoughtTogether(counts), [
      { productId: 'c', count: 9 },
      { productId: 'b', count: MIN_CO_PURCHASES }
    ]);
  });

  it('is empty when the shop has no history yet', () => {
    assert.deepEqual(frequentlyBoughtTogether(new Map()), []);
  });
});
