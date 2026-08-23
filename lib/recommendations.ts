/**
 * Contextual cross-selling.
 *
 * The rule this file exists to enforce is negative: **never recommend something
 * merely because it shares a broad category**. "Plants" is not a reason to show
 * a monstera under a venus flytrap, and "Botanicals" is not a reason to put a
 * bar of soap beside a bag of sphagnum. A recommendation earns its place by
 * being either a companion to what the shopper is looking at (a tea and the
 * infuser to brew it in) or a requirement of it (a carnivorous plant and the
 * only growing medium that will not kill it).
 *
 * Two sources, in that order:
 *
 * 1. What Tammy configured. She knows the catalog; a row she wrote always wins
 *    and always shows, with her own reason printed under it.
 * 2. Rules over traits. A trait is a merchandising fact about a product —
 *    `carnivorous`, `terrarium`, `planter`, `substrate` — read from the tags she
 *    set, or inferred from the product's own words when she has not tagged it.
 *    `ProductType` is deliberately not a trait source beyond the coarse ones it
 *    genuinely carries: it is the enum that decides shipping and returns.
 *
 * Anything that matches neither is simply not shown. An empty "Complete the
 * setup" is a better answer than a full one that is wrong, because a shopper who
 * is once shown a bar of soap under a fly trap stops reading the section.
 *
 * Kept free of Prisma so `npm test` can cover the matching.
 */

export type RecommendationSectionKey = 'pairs' | 'complete' | 'together' | 'similar';

export const RECOMMENDATION_SECTIONS = [
  {
    key: 'pairs' as const,
    kind: 'PAIRS_WITH' as const,
    title: 'Pairs well with',
    blurb: 'Things we would send home in the same box.'
  },
  {
    key: 'complete' as const,
    kind: 'COMPLETES_SETUP' as const,
    title: 'Complete the setup',
    blurb: 'What this needs to actually work once it is home.'
  },
  {
    key: 'similar' as const,
    kind: 'SIMILAR' as const,
    title: 'You may also like',
    blurb: 'Other pieces in the same spirit.'
  }
];

/** How many owner-configured rows one section may hold. */
export const MAX_RELATIONS_PER_KIND = 8;

/** How many cards a rail shows. Three fits the grid without wrapping oddly. */
export const RECOMMENDATIONS_PER_SECTION = 3;

/**
 * How many separate paid orders have to contain both products before the shop
 * will say they are "frequently bought together".
 *
 * Two, not one. One shared order is a coincidence — every basket makes a pair
 * out of whatever happened to be in it — and a small shop would otherwise fill
 * the section with noise from its first week of trading.
 */
export const MIN_CO_PURCHASES = 2;

/**
 * The merchandising vocabulary. Offered to the owner as the tag list in the
 * editor, so the tags she types line up with what the rules below look for
 * instead of being free text that never matches anything.
 */
export const RECOMMENDATION_TAGS = [
  'tea',
  'teaware',
  'infuser',
  'plant',
  'planter',
  'plant-care',
  'fertilizer',
  'substrate',
  'moss',
  'terrarium',
  'terrarium-container',
  'carnivorous',
  'carnivorous-medium',
  'distilled-water',
  'succulent',
  'air-plant',
  'soap',
  'lotion',
  'gift'
] as const;

export type RecommendableProduct = {
  id: string;
  slug: string;
  name: string;
  type: string;
  /** Owner-written recommendation traits: `carnivorous`, `infuser`, `-terrarium`. */
  traits?: string[] | null;
  /**
   * The shopper-facing filter attributes — `pet-safe`, `low-light`. Read here
   * too, because someone buying one pet-safe plant often wants another, but
   * never written by this module: that vocabulary is closed and
   * `normalizeTags` owns it.
   */
  tags?: string[] | null;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
  careNotes?: string | null;
};

/**
 * Traits inferred from a product's own words, for the catalog Tammy has not
 * tagged yet. Each carries the product types it may apply to, and that guard is
 * doing real work: "grown on in a 6\" pot" appears in half the plant
 * descriptions on the site, and without it every plant would be tagged as a
 * planter and recommended as the thing to pot itself in.
 */
/*
 * Every pattern ends `)e?s?\b`, so a trait is found in the plural too. Without
 * it "perfect for terrariums" and "a trio of succulents" — the natural way to
 * write either — inferred nothing at all, and the rules that lean on those
 * traits stayed silent on exactly the products they were written for.
 */
const INFERRED_TRAITS: Array<{ trait: string; pattern: RegExp; types?: string[] }> = [
  { trait: 'tea', pattern: /\b(tea|tisane|herbal blend|loose[- ]leaf)e?s?\b/i, types: ['TEA'] },
  {
    trait: 'infuser',
    pattern: /\b(infuser|strainer|steeper|tea ?ball|teapot|brew basket)e?s?\b/i,
    types: ['TEA_SUPPLY', 'OTHER']
  },
  {
    trait: 'teaware',
    pattern: /\b(mug|cup|teapot|kettle|tin|caddy)e?s?\b/i,
    types: ['TEA_SUPPLY', 'OTHER']
  },
  {
    trait: 'carnivorous',
    pattern:
      /\b(carnivorous|venus ?fly ?trap|flytrap|dionaea|sarracenia|pitcher plant|nepenthes|sundew|drosera|butterwort|pinguicula)e?s?\b/i
  },
  {
    trait: 'carnivorous-medium',
    pattern:
      /\b(carnivorous (mix|soil|medium)|long[- ]fibered sphagnum|sphagnum (and|\+) perlite|bog mix|nutrient[- ]free (mix|soil))e?s?\b/i,
    types: ['OTHER']
  },
  {
    trait: 'distilled-water',
    pattern: /\b(distilled water|rain ?water|reverse osmosis)e?s?\b/i,
    types: ['OTHER']
  },
  { trait: 'terrarium', pattern: /\b(terrarium|vivarium|wardian|closed case)e?s?\b/i },
  {
    trait: 'terrarium-container',
    pattern: /\b(glass (jar|globe|vessel|container|cloche)|cloche|apothecary jar|bell jar)e?s?\b/i,
    types: ['OTHER']
  },
  { trait: 'moss', pattern: /\b(moss|sphagnum|sheet moss|cushion moss)e?s?\b/i, types: ['OTHER'] },
  {
    trait: 'substrate',
    pattern:
      /\b(substrate|potting (mix|soil)|growing medium|soil mix|coco coir|orchid bark|horticultural charcoal|leca|perlite|drainage layer|pea gravel)e?s?\b/i,
    types: ['OTHER']
  },
  {
    trait: 'planter',
    pattern: /\b(planter|cachepot|pot cover|ceramic pot|clay pot|terracotta|vessel|saucer)e?s?\b/i,
    types: ['OTHER']
  },
  {
    trait: 'fertilizer',
    pattern: /\b(fertili[sz]er|plant food|feed|nutrient)e?s?\b/i,
    types: ['OTHER']
  },
  {
    trait: 'plant-care',
    pattern:
      /\b(mister|spray bottle|watering can|pruner|snips|moisture meter|humidity tray|pebble tray)e?s?\b/i,
    types: ['OTHER']
  },
  { trait: 'succulent', pattern: /\b(succulent|echeveria|haworthia|sedum|cact(us|i))e?s?\b/i },
  { trait: 'air-plant', pattern: /\b(air plant|tillandsia)e?s?\b/i },
  { trait: 'soap', pattern: /\b(soap|bar soap|cleansing bar)e?s?\b/i, types: ['SOAP'] },
  { trait: 'lotion', pattern: /\b(lotion|balm|salve|butter|hand cream)e?s?\b/i, types: ['LOTION'] },
  { trait: 'gift', pattern: /\b(gift|gifting|present)e?s?\b/i }
];

/** The coarse traits `ProductType` genuinely carries, and nothing finer. */
const TYPE_TRAITS: Record<string, string[]> = {
  PLANT: ['plant'],
  TEA: ['tea'],
  TEA_SUPPLY: ['teaware'],
  SOAP: ['soap'],
  LOTION: ['lotion']
};

/**
 * One spelling of a tag, so what the owner types matches what the rules look
 * for. `Terrarium Container` and `terrarium container` both become
 * `terrarium-container`.
 *
 * A leading `-` survives, because it means something: see `productTraits`.
 */
export function normalizeTag(value: unknown) {
  const raw = String(value ?? '').trim();
  const negated = raw.startsWith('-');
  const body = (negated ? raw.slice(1) : raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  if (!body) return '';
  return negated ? `-${body}` : body;
}

/**
 * Everything the rules know about one product, from two written vocabularies
 * and the product's own words.
 *
 * The written ones are `traits` — the open words Tammy sets for
 * recommendations — and `tags`, the closed list shoppers filter the shop by.
 * Both are read, because `pet-safe` is worth matching on as much as
 * `carnivorous` is; only `traits` is ever written back, since the product form
 * rewrites `tags` from its own fixed list.
 *
 * Both **add to** inference rather than replacing it, which is the behaviour
 * the admin copy promises ("the words the automatic suggestions match on") and
 * the one that does not punish an owner for writing a single word: marking a
 * plant `gift` should not cost it `plant` and `carnivorous`.
 *
 * That leaves the owner needing a way to take a trait *off*, because inference
 * reads the product's own words and those words are not always about the
 * product — a moss whose description says it is "not intended for terrariums"
 * would otherwise acquire `terrarium` and pick up recommendations she cannot
 * remove. A trait written `-terrarium` suppresses exactly that, and beats every
 * other source — inference, a filter tag, or an identical positive trait — so a
 * contradiction resolves the predictable way.
 */
export function productTraits(product: RecommendableProduct): Set<string> {
  const traits = new Set<string>();
  const suppressed = new Set<string>();

  for (const word of [...(product.traits || []), ...(product.tags || [])]) {
    const clean = normalizeTag(word);
    if (!clean) continue;
    if (clean.startsWith('-')) suppressed.add(clean.slice(1));
    else traits.add(clean);
  }
  for (const trait of TYPE_TRAITS[product.type] || []) traits.add(trait);

  const words = [
    product.name,
    product.shortDescription,
    product.description,
    product.details,
    product.careNotes
  ]
    .filter(Boolean)
    .join('\n');

  for (const rule of INFERRED_TRAITS) {
    if (rule.types && !rule.types.includes(product.type)) continue;
    if (suppressed.has(rule.trait)) continue;
    if (rule.pattern.test(words)) traits.add(rule.trait);
  }

  for (const trait of suppressed) traits.delete(trait);
  return traits;
}

/**
 * One reason a product belongs beside another. `from` and `to` are traits, not
 * categories, and every rule is one-way: a planter completes a plant, but a
 * plant does not complete a planter.
 */
type MatchRule = {
  section: 'pairs' | 'complete';
  from: string;
  to: string[];
  /** Shown under the card when the owner has not written her own reason. */
  reason: string;
  /** Higher wins when a candidate matches several rules. */
  weight: number;
};

const MATCH_RULES: MatchRule[] = [
  {
    section: 'pairs',
    from: 'tea',
    to: ['infuser', 'teaware'],
    reason: 'Loose leaf needs something to steep in.',
    weight: 10
  },
  {
    section: 'pairs',
    from: 'infuser',
    to: ['tea'],
    reason: 'The blend we brew in ours.',
    weight: 10
  },
  {
    section: 'pairs',
    from: 'teaware',
    to: ['tea'],
    reason: 'A blend to fill it with.',
    weight: 8
  },
  {
    section: 'complete',
    from: 'carnivorous',
    to: ['carnivorous-medium'],
    reason: 'Ordinary potting soil will kill this plant. This is what it wants instead.',
    weight: 14
  },
  {
    section: 'complete',
    from: 'carnivorous',
    to: ['distilled-water'],
    reason: 'Tap water builds up minerals a carnivorous plant cannot cope with.',
    weight: 12
  },
  {
    section: 'complete',
    from: 'terrarium',
    to: ['moss', 'substrate', 'terrarium-container'],
    reason: 'Part of building the terrarium up from the bottom.',
    weight: 12
  },
  {
    section: 'complete',
    from: 'terrarium-container',
    to: ['moss', 'substrate'],
    reason: 'What goes in it before the plants do.',
    weight: 10
  },
  {
    section: 'complete',
    from: 'succulent',
    to: ['substrate', 'planter'],
    reason: 'Succulents rot in a pot that holds water — sharp drainage matters.',
    weight: 11
  },
  {
    section: 'complete',
    from: 'air-plant',
    to: ['terrarium-container', 'plant-care'],
    reason: 'Somewhere to sit, and the misting that keeps it alive.',
    weight: 10
  },
  {
    section: 'complete',
    from: 'plant',
    to: ['planter'],
    reason: 'The pot it will live in.',
    weight: 8
  },
  {
    section: 'complete',
    from: 'plant',
    to: ['fertilizer', 'plant-care'],
    reason: 'What keeps it going after the first month.',
    weight: 6
  },
  {
    section: 'complete',
    from: 'planter',
    to: ['substrate'],
    reason: 'Something to fill it with.',
    weight: 8
  },
  {
    section: 'pairs',
    from: 'soap',
    to: ['lotion'],
    reason: 'The pair we set out together.',
    weight: 10
  },
  {
    section: 'pairs',
    from: 'lotion',
    to: ['soap'],
    reason: 'The pair we set out together.',
    weight: 10
  }
];

export type AutomaticMatch = {
  product: RecommendableProduct;
  section: 'pairs' | 'complete';
  reason: string;
  score: number;
};

/**
 * The rule-driven recommendations for one product.
 *
 * A candidate that matches no rule is not returned at all — there is no
 * "otherwise show something from the same category" branch here on purpose,
 * because that branch is the behaviour this replaces.
 */
export function automaticMatches(
  anchor: RecommendableProduct,
  candidates: RecommendableProduct[]
): AutomaticMatch[] {
  const anchorTraits = productTraits(anchor);
  const matches: AutomaticMatch[] = [];

  for (const candidate of candidates) {
    if (candidate.id === anchor.id) continue;
    const candidateTraits = productTraits(candidate);

    let best: MatchRule | null = null;
    for (const rule of MATCH_RULES) {
      if (!anchorTraits.has(rule.from)) continue;
      if (!rule.to.some((trait) => candidateTraits.has(trait))) continue;
      if (!best || rule.weight > best.weight) best = rule;
    }
    if (!best) continue;

    /**
     * A shared trait beyond the one the rule matched on is a small tiebreak —
     * the terrarium-tagged moss goes above the general-purpose moss — but it can
     * never promote a candidate that matched no rule, because it is only ever
     * added to a score that already cleared one.
     */
    const shared = [...candidateTraits].filter(
      (trait) => anchorTraits.has(trait) && trait !== best.from
    ).length;

    matches.push({
      product: candidate,
      section: best.section,
      reason: best.reason,
      score: best.weight + Math.min(3, shared)
    });
  }

  return matches.sort(
    (left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name)
  );
}

/**
 * The fallback for "You may also like" — an *alternative* to what the shopper is
 * looking at, which is the one section where same-category really is the point.
 *
 * Even here it is not "anything of this type": a shared trait or collection
 * ranks first, so a fly trap leads with other carnivorous plants rather than
 * with a pothos, and anything already recommended above is excluded so the three
 * rails do not repeat each other.
 */
export function similarProducts(
  anchor: RecommendableProduct & { collectionIds?: string[] },
  candidates: Array<RecommendableProduct & { collectionIds?: string[]; featured?: boolean }>,
  exclude: Set<string> = new Set()
) {
  const anchorTraits = productTraits(anchor);
  const anchorCollections = new Set(anchor.collectionIds || []);

  return candidates
    .filter((candidate) => candidate.id !== anchor.id && !exclude.has(candidate.id))
    .map((candidate) => {
      const traits = productTraits(candidate);
      const sharedTraits = [...traits].filter((trait) => anchorTraits.has(trait)).length;
      const sharedCollections = (candidate.collectionIds || []).filter((id) =>
        anchorCollections.has(id)
      ).length;
      return {
        product: candidate,
        score:
          sharedTraits * 3 +
          sharedCollections * 2 +
          (candidate.type === anchor.type ? 2 : 0) +
          (candidate.featured ? 1 : 0)
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.product.name.localeCompare(right.product.name)
    );
}

/**
 * Ranks co-purchase pairs into a "Frequently bought together" list.
 *
 * The counts are of *orders*, not of units: someone who bought six of one thing
 * in one order has told us nothing about what goes with it.
 */
export function frequentlyBoughtTogether(counts: Map<string, number>, minimum = MIN_CO_PURCHASES) {
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([productId, count]) => ({ productId, count }));
}
