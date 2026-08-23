/**
 * The gift guides, and the rules that decide what is in each one.
 *
 * Kept free of Prisma and Next so `npm test` can cover the matching directly.
 * Every gift page — the hub, the individual guides, the badges on a product —
 * reads this file, so a product can never be advertised in a guide on one page
 * and missing from it on the next.
 *
 * A guide holds a product when the owner tagged it, or when the product matches
 * the guide's own rules on price, type or wording. Tagging only ever adds:
 * Tammy should not have to tag the whole catalog before the gift pages work,
 * and should not lose the automatic placement of a product she tags once.
 */

import { productSizes, sizePriceRange, sizesTrackStock } from './product-sizes.ts';
import { matchesSearchTerm } from './search.ts';

/**
 * The reserved tag that keeps a product out of every guide however well it
 * matches — a bag of potting substrate is a fine product and a poor present.
 */
export const GIFT_EXCLUDE_TAG = 'none';

export type GiftGuideKind = 'price' | 'occasion';

export type GiftGuide = {
  slug: string;
  /** The page heading and the card title. */
  title: string;
  /** The chip and breadcrumb form, which has to stay short. */
  shortTitle: string;
  eyebrow: string;
  /** One line under the heading, and on the hub card. */
  blurb: string;
  /** Search and social description. */
  description: string;
  kind: GiftGuideKind;
  /**
   * The most a gift in this guide may cost. Compared against the cheapest price
   * a shopper can actually pay, so a plant whose 4" pot is $18 belongs under $25
   * even when its 8" pot does not.
   */
  maxPriceCents?: number;
  /** Product types that always belong here. */
  types?: readonly string[];
  /** Words in the name or copy that put a product here. */
  keywords?: readonly string[];
  /**
   * Whether ready-made sets are shown above this guide's products. A set is a
   * `Bundle` — a recipe of real stock with its own availability — so it is
   * rendered as its own shelf rather than mixed into a product grid.
   */
  includeBundles?: boolean;
  /** Whether the owner's featured picks are automatically part of this guide. */
  includeFeatured?: boolean;
};

export const GIFT_GUIDES: readonly GiftGuide[] = [
  {
    slug: 'under-25',
    title: 'Gifts under $25',
    shortTitle: 'Under $25',
    eyebrow: 'Small and thoughtful',
    blurb: 'Something real for a teacher, a neighbour or a stocking, without overthinking it.',
    description: 'Plant, tea and botanical gifts under $25 from The Hillside Gardens.',
    kind: 'price',
    maxPriceCents: 2500
  },
  {
    slug: 'under-50',
    title: 'Gifts under $50',
    shortTitle: 'Under $50',
    eyebrow: 'The easy answer',
    blurb: 'The range most gifts land in — a good plant, a set of botanicals, a proper tea ritual.',
    description: 'Plant, tea and botanical gifts under $50 from The Hillside Gardens.',
    kind: 'price',
    maxPriceCents: 5000
  },
  {
    slug: 'under-100',
    title: 'Gifts under $100',
    shortTitle: 'Under $100',
    eyebrow: 'For someone special',
    blurb: 'Statement plants and larger sets, for the gift that is meant to be remembered.',
    description:
      'Statement plants, arrangements and gift sets under $100 from The Hillside Gardens.',
    kind: 'price',
    maxPriceCents: 10000
  },
  {
    slug: 'plant-lover',
    title: 'Gifts for plant lovers',
    shortTitle: 'Plant lover',
    eyebrow: 'For the one with no windowsill left',
    blurb: 'Plants, planters and the small supplies that make keeping them a pleasure.',
    description:
      'Gifts for plant lovers — houseplants, planters, terrarium supplies and propagation kit from The Hillside Gardens.',
    kind: 'occasion',
    types: ['PLANT'],
    keywords: [
      'plant',
      'planter',
      'terrarium',
      'moss',
      'driftwood',
      'succulent',
      'air plant',
      'propagat',
      'watering',
      'potting',
      'cutting'
    ]
  },
  {
    slug: 'tea-lover',
    title: 'Gifts for tea lovers',
    shortTitle: 'Tea lover',
    eyebrow: 'For the slow evening',
    blurb: 'Loose-leaf blends and the simple tools that make brewing them worth doing properly.',
    description:
      'Gifts for tea drinkers — loose-leaf botanical blends, infusers and brewing supplies from The Hillside Gardens.',
    kind: 'occasion',
    types: ['TEA', 'TEA_SUPPLY'],
    keywords: ['tea', 'infuser', 'steep', 'kettle', 'mug', 'honey', 'tisane', 'herbal']
  },
  {
    slug: 'housewarming',
    title: 'Housewarming gifts',
    shortTitle: 'Housewarming',
    eyebrow: 'For a new front door',
    blurb: 'Finished arrangements and handmade goods that look like you meant it.',
    description:
      'Housewarming gifts from The Hillside Gardens — potted arrangements, handmade soap and botanical goods for a new home.',
    kind: 'occasion',
    types: ['SOAP', 'LOTION', 'OTHER'],
    keywords: [
      'planter',
      'arrangement',
      'centerpiece',
      'centrepiece',
      'dish garden',
      'terrarium',
      'candle',
      'housewarming',
      'home'
    ],
    includeBundles: true
  },
  {
    slug: 'teacher',
    title: 'Teacher gifts',
    shortTitle: 'Teacher',
    eyebrow: 'For the end of term',
    blurb: 'Modest, useful and easy to carry home — nothing that needs a green thumb.',
    description:
      'Teacher gifts under $30 from The Hillside Gardens: small plants, handmade soap and loose-leaf tea.',
    kind: 'occasion',
    /* A ceiling, because a teacher gift that costs $80 is a different gesture. */
    maxPriceCents: 3000,
    types: ['SOAP', 'TEA', 'TEA_SUPPLY', 'LOTION'],
    keywords: ['succulent', 'air plant', 'pothos', 'soap', 'lotion', 'tea', 'desk', 'thank']
  },
  {
    slug: 'holiday',
    title: 'Holiday gifts',
    shortTitle: 'Holiday',
    eyebrow: 'Off the bench, into a box',
    blurb: 'What we would give this season: our bundles, our favourites and the seasonal pieces.',
    description:
      'Holiday gifts from The Hillside Gardens — gift bundles, seasonal plants and small-batch botanicals.',
    kind: 'occasion',
    keywords: [
      'holiday',
      'christmas',
      'winter',
      'evergreen',
      'poinsettia',
      'amaryllis',
      'cranberry',
      'spice',
      'peppermint',
      'gift'
    ],
    includeBundles: true,
    /* Featured is the owner's own "this is what we are proud of right now",
       which is exactly the shelf a holiday guide should be built from. */
    includeFeatured: true
  }
];

export type GiftMatchable = {
  name: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
  type: string;
  priceCents: number;
  /** Raw `Product.sizes`; only the cheapest price is read from it. */
  sizes?: unknown;
  /** The product total, needed to tell a sold-out size from a sellable one. */
  inventory?: number | null;
  featured?: boolean | null;
  giftTags?: readonly string[] | null;
};

export function findGiftGuide(slug: string | null | undefined) {
  const wanted = (slug || '').trim().toLowerCase();
  return GIFT_GUIDES.find((guide) => guide.slug === wanted) || null;
}

export function giftGuidePath(slug: string) {
  return `/gifts/${slug}`;
}

/** The occasion guides Tammy can tick on the product form. */
export const GIFT_TAG_CHOICES = GIFT_GUIDES.filter((guide) => guide.kind === 'occasion');

/**
 * Cleans a posted list of gift tags down to the occasion guides this build
 * knows, plus the reserved exclusion. Anything else is dropped rather than
 * stored, so a renamed guide cannot leave orphaned values behind in the column.
 *
 * Price bands and the bundle shelf are deliberately not taggable: what a
 * product costs and whether it is a set are facts about the product, and a tag
 * that contradicted either would put a $60 plant under "Gifts under $25".
 */
export function readGiftTags(values: readonly string[]): string[] {
  const allowed = new Set<string>([
    GIFT_EXCLUDE_TAG,
    ...GIFT_TAG_CHOICES.map((guide) => guide.slug)
  ]);
  const clean: string[] = [];
  for (const value of values) {
    const tag = String(value || '')
      .trim()
      .toLowerCase();
    if (!allowed.has(tag) || clean.includes(tag)) continue;
    clean.push(tag);
  }
  // "Not a gift" is a whole answer on its own; keeping guide tags beside it
  // would leave the product's own record contradicting itself.
  return clean.includes(GIFT_EXCLUDE_TAG) ? [GIFT_EXCLUDE_TAG] : clean;
}

/** True when the owner has said this product is not to be offered as a gift. */
export function excludedFromGifts(product: GiftMatchable) {
  return (product.giftTags || []).includes(GIFT_EXCLUDE_TAG);
}

/**
 * The lowest price a shopper can actually pay for this product.
 *
 * A price band is a promise about what the guide costs to buy from, so it is
 * measured against the cheapest size rather than the product's headline
 * figure — and, where the owner counts the sizes separately, against the
 * cheapest size that is still *on the bench*. A plant whose $18 4" pots have
 * run out and whose $40 8" pots have not is a $40 plant this week, and
 * quoting the $18 would put it in "Gifts under $25" for a shopper who cannot
 * buy it for that. The product's own total stays positive in that case,
 * because the other size is holding it up, so nothing else catches it.
 *
 * If every counted size is empty the whole list is used again rather than
 * nothing: such a product is sold out and is not in a guide at all, and a
 * price of "the base" beats a price of "undefined".
 */
export function giftPriceCents(product: GiftMatchable) {
  const sizes = productSizes(product.sizes, product.priceCents);
  const inStock = sizesTrackStock(sizes)
    ? sizes.filter((size) => (size.inventory ?? 0) > 0)
    : sizes;
  return sizePriceRange(inStock.length ? inStock : sizes, product.priceCents).minCents;
}

function searchableText(product: GiftMatchable) {
  return [
    product.name,
    product.slug,
    product.shortDescription,
    product.description,
    product.details
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesGuideRules(product: GiftMatchable, guide: GiftGuide) {
  if (guide.maxPriceCents !== undefined && giftPriceCents(product) > guide.maxPriceCents) {
    return false;
  }
  // A price band asks one question and has now asked it.
  if (guide.kind === 'price') return true;

  if (guide.includeFeatured && product.featured) return true;
  if (guide.types?.includes(product.type)) return true;

  /**
   * Start-of-word, not substring — the same rule, and the same helper, that
   * site search uses. Plain `includes` put anything whose copy said "steady"
   * into the tea-lover guide, which is the exact false positive `lib/search.ts`
   * was written to stop. Stems still work the way they read: "propagat"
   * matches "propagation", and "tea" matches "teas" and "teapot" but not
   * "instead".
   */
  const haystack = searchableText(product);
  return Boolean(guide.keywords?.some((keyword) => matchesSearchTerm(haystack, keyword)));
}

export function matchesGiftGuide(product: GiftMatchable, guide: GiftGuide) {
  if (excludedFromGifts(product)) return false;
  /**
   * Tags speak for occasions only. A price band is a statement about the price
   * and the bundle shelf a statement about the product, so a tag pointing at
   * either would be a claim the next page contradicts.
   */
  if (guide.kind === 'occasion' && (product.giftTags || []).includes(guide.slug)) return true;
  return matchesGuideRules(product, guide);
}

export function giftGuidesForProduct(product: GiftMatchable) {
  return GIFT_GUIDES.filter((guide) => matchesGiftGuide(product, guide));
}

export function productsForGiftGuide<T extends GiftMatchable>(
  products: readonly T[],
  guide: GiftGuide
) {
  return products.filter((product) => matchesGiftGuide(product, guide));
}
