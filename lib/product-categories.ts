/**
 * The shop's merchandising taxonomy.
 *
 * `ProductType` was six broad values — PLANT, TEA, TEA_SUPPLY, LOTION, SOAP,
 * OTHER — which is not a catalog a shopper can navigate: flytraps, air plants,
 * live arrangements and cushion moss all arrived as "Plant", and driftwood,
 * terrarium gravel and a stoneware planter all arrived as "Botanical good".
 * Categories are real rows Tammy edits instead, so the taxonomy can grow with
 * the bench rather than with a deploy.
 *
 * A category and a collection answer different questions and are deliberately
 * kept apart:
 *
 * - a **category** says what a thing *is*. Exactly one per product, it decides
 *   which structured detail fields the product is asked for, and it is what the
 *   shop filters and the header navigate by;
 * - a **collection** says why you might *want* it — "Beginner Friendly", "Low
 *   Light", "Gifts Under $30". A product joins as many as apply.
 *
 * The seeds below are the starting taxonomy, not a fixed list: they are created
 * once, on the first deploy that has this table, and never rewritten, so a
 * category Tammy renames stays renamed and one she adds stays added.
 */

import type { ProductSpecKind, ProductType } from '@prisma/client';

export type CategorySeed = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  specKind: ProductSpecKind;
  /** The `ProductType` products here are recorded as, for legacy readers. */
  legacyType: ProductType;
  imageUrl?: string;
  sortOrder: number;
  /**
   * Keywords that claim an existing, uncategorised product for this category
   * during the one-off backfill. Order matters: the first category whose
   * keywords match wins, which is why "Carnivorous Plants" is listed before
   * "Houseplants" and the plain type fallback runs last.
   */
  keywords?: string[];
};

export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    slug: 'houseplants',
    title: 'Houseplants',
    tagline: 'Living beauty for every room',
    description: 'Foliage plants chosen to thrive in ordinary rooms with ordinary light.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/house-plants.webp',
    sortOrder: 10,
    keywords: ['pothos', 'philodendron', 'monstera', 'fern', 'ivy', 'palm', 'ficus', 'houseplant']
  },
  {
    slug: 'carnivorous-plants',
    title: 'Carnivorous Plants',
    tagline: 'Wild, unusual and wonderful',
    description: 'Flytraps, pitcher plants and sundews, with the care they genuinely need.',
    specKind: 'CARNIVOROUS_PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/carnivorous-plants.webp',
    sortOrder: 20,
    keywords: [
      'carnivor',
      'flytrap',
      'fly trap',
      'venus',
      'dionaea',
      'pitcher',
      'sarracenia',
      'nepenthes',
      'sundew',
      'drosera',
      'butterwort',
      'pinguicula'
    ]
  },
  {
    slug: 'succulents',
    title: 'Succulents',
    tagline: 'Sculptural greens in forgiving forms',
    description: 'Low-water plants with strong shapes for bright windowsills.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/succulents.webp',
    sortOrder: 30,
    keywords: ['succulent', 'echeveria', 'sedum', 'jade', 'aloe', 'cactus', 'cacti', 'haworthia']
  },
  {
    slug: 'air-plants',
    title: 'Air Plants',
    tagline: 'Small plants with big personality',
    description: 'Tillandsia that need no soil at all — just light, air and a weekly soak.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/air-plants.webp',
    sortOrder: 40,
    keywords: ['air plant', 'airplant', 'tillandsia']
  },
  {
    slug: 'live-plant-arrangements',
    title: 'Live Plant Arrangements',
    tagline: 'Arrangements made to take home',
    description: 'Finished arrangements, potted and balanced, ready to set down and enjoy.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/live-plant-planters.webp',
    sortOrder: 50,
    keywords: ['arrangement', 'planter garden', 'centerpiece', 'dish garden', 'kokedama']
  },
  {
    slug: 'terrariums',
    title: 'Terrariums',
    tagline: 'A tiny living world under glass',
    description: 'Planted, closed and open terrariums built to keep themselves going.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/terrarium-supplies.webp',
    sortOrder: 60,
    keywords: ['terrarium garden', 'planted terrarium', 'closed terrarium', 'glass garden']
  },
  {
    slug: 'terrarium-supplies',
    title: 'Terrarium Supplies',
    tagline: 'Everything for building one yourself',
    description: 'Substrate, charcoal, gravel and glass for a terrarium that lasts.',
    specKind: 'HARD_GOOD',
    legacyType: 'OTHER',
    imageUrl: '/images/catalog/terrarium-supplies.webp',
    sortOrder: 70,
    keywords: ['terrarium', 'substrate', 'gravel', 'charcoal', 'potting mix', 'sphagnum', 'perlite']
  },
  {
    slug: 'moss',
    title: 'Moss',
    tagline: 'Natural texture for creative projects',
    description: 'Cushions and sheets of moss for terrariums, planters and table settings.',
    specKind: 'PLANT',
    legacyType: 'PLANT',
    imageUrl: '/images/catalog/moss.webp',
    sortOrder: 80,
    keywords: ['moss']
  },
  {
    slug: 'driftwood-natural-materials',
    title: 'Driftwood & Natural Materials',
    tagline: 'One-of-a-kind natural forms',
    description: 'Weathered wood, bark and stone for mounting plants and building landscapes.',
    specKind: 'HARD_GOOD',
    legacyType: 'OTHER',
    imageUrl: '/images/catalog/driftwood.webp',
    sortOrder: 90,
    keywords: ['driftwood', 'cork bark', 'grapewood', 'river stone', 'lava rock']
  },
  {
    slug: 'planters-pots',
    title: 'Planters & Pots',
    tagline: 'Somewhere for it all to live',
    description: 'Decorative planters, nursery pots, saucers and the pieces that finish a plant.',
    specKind: 'HARD_GOOD',
    legacyType: 'OTHER',
    imageUrl: '/images/catalog/live-plant-planters.webp',
    sortOrder: 100,
    keywords: ['planter', 'pot ', 'saucer', 'cachepot', 'vessel']
  },
  {
    slug: 'tea',
    title: 'Tea',
    tagline: 'Thoughtful botanical blends',
    description: 'Loose-leaf blends and herbal infusions, packed in small batches.',
    specKind: 'TEA',
    legacyType: 'TEA',
    imageUrl: '/images/catalog/apothecary.webp',
    sortOrder: 110,
    keywords: ['tea', 'tisane', 'infusion', 'chai']
  },
  {
    slug: 'tea-accessories',
    title: 'Tea Accessories',
    tagline: 'The simple tools that make brewing a pleasure',
    description: 'Infusers, strainers, tins and the small things a good cup asks for.',
    specKind: 'HARD_GOOD',
    legacyType: 'TEA_SUPPLY',
    imageUrl: '/images/catalog/apothecary.webp',
    sortOrder: 120,
    keywords: ['infuser', 'strainer', 'teapot', 'tea tin', 'steeper', 'kettle']
  },
  {
    slug: 'handmade-soap',
    title: 'Handmade Soap',
    tagline: 'Small-batch botanical bars',
    description: 'Hand-cut soaps made in small batches with botanical scents.',
    specKind: 'SOAP',
    legacyType: 'SOAP',
    imageUrl: '/images/catalog/homemade-soaps.webp',
    sortOrder: 130,
    keywords: ['soap', 'bar soap', 'shampoo bar']
  },
  {
    slug: 'botanical-lotion',
    title: 'Botanical Lotion',
    tagline: 'Everyday care, made by hand',
    description: 'Lotions and creams blended in small batches for dry hands and dry weather.',
    specKind: 'LOTION',
    legacyType: 'LOTION',
    imageUrl: '/images/catalog/apothecary.webp',
    sortOrder: 140,
    keywords: ['lotion', 'cream', 'body butter']
  },
  {
    slug: 'apothecary',
    title: 'Apothecary',
    tagline: 'Botanical goods and slow rituals',
    description: 'Salves, balms, oils and botanical blends for slow, ordinary evenings.',
    specKind: 'LOTION',
    legacyType: 'LOTION',
    imageUrl: '/images/catalog/apothecary.webp',
    sortOrder: 150,
    keywords: ['salve', 'balm', 'tincture', 'essential oil', 'apothecary', 'bath soak']
  },
  {
    slug: 'gifts',
    title: 'Gifts',
    tagline: 'Ready to give as they are',
    description: 'Sets and single pieces chosen because they need no explaining.',
    specKind: 'GENERAL',
    legacyType: 'OTHER',
    imageUrl: '/images/catalog/homemade-soaps.webp',
    sortOrder: 160,
    keywords: ['gift set', 'gift box', 'bundle']
  },
  {
    slug: 'seasonal',
    title: 'Seasonal',
    tagline: 'Here while the season is',
    description: 'Wreaths, holiday planters and whatever the bench is making this month.',
    specKind: 'GENERAL',
    legacyType: 'OTHER',
    imageUrl: '/images/scenes/potting-bench.webp',
    sortOrder: 170,
    keywords: ['wreath', 'holiday', 'christmas', 'seasonal', 'pumpkin']
  },
  {
    slug: 'other',
    title: 'Other',
    tagline: 'Everything else on the bench',
    description: 'Pieces that do not belong anywhere else yet.',
    specKind: 'GENERAL',
    legacyType: 'OTHER',
    sortOrder: 900
  }
];

/**
 * The category an uncategorised legacy row falls back to, by its `ProductType`.
 * Every product ends up somewhere: this is what the backfill uses once no
 * keyword has claimed a row, and what the shop uses to label a product whose
 * category was deleted out from under it.
 */
export const CATEGORY_SLUG_BY_TYPE: Record<ProductType, string> = {
  PLANT: 'houseplants',
  TEA: 'tea',
  TEA_SUPPLY: 'tea-accessories',
  SOAP: 'handmade-soap',
  LOTION: 'botanical-lotion',
  OTHER: 'other'
};

/**
 * The detail fields a product is asked for when it has no category at all —
 * during the moment between a deploy and its seed, or after a category was
 * deleted. Derived from the same broad type the shop has always had.
 */
export const SPEC_KIND_BY_TYPE: Record<ProductType, ProductSpecKind> = {
  PLANT: 'PLANT',
  TEA: 'TEA',
  TEA_SUPPLY: 'HARD_GOOD',
  SOAP: 'SOAP',
  LOTION: 'LOTION',
  OTHER: 'GENERAL'
};

export const SPEC_KIND_LABELS: Record<ProductSpecKind, string> = {
  PLANT: 'Plant',
  CARNIVOROUS_PLANT: 'Carnivorous plant',
  TEA: 'Tea',
  SOAP: 'Soap',
  LOTION: 'Lotion & apothecary',
  HARD_GOOD: 'Supplies & hard goods',
  GENERAL: 'General'
};

/**
 * What the product asks for and what the public page shows, for a product row
 * as read from the database. A category always wins; the legacy type answers
 * for the rows that have not been given one.
 */
export function specKindFor(product: {
  type: ProductType | string;
  category?: { specKind: ProductSpecKind } | null;
}): ProductSpecKind {
  if (product.category?.specKind) return product.category.specKind;
  return SPEC_KIND_BY_TYPE[product.type as ProductType] ?? 'GENERAL';
}

/**
 * A category picked for a product by name, for the one-off backfill. Keywords
 * are checked in seed order so the specific categories claim a row before the
 * broad ones — a "Venus flytrap in a 4\" pot" is a carnivorous plant, not a
 * houseplant that happens to be potted.
 */
export function backfillCategorySlug(product: { name: string; slug: string; type: ProductType }) {
  const haystack = `${product.name} ${product.slug}`.toLowerCase();
  const matched = CATEGORY_SEEDS.find(
    (seed) =>
      seed.legacyType === product.type &&
      seed.keywords?.some((keyword) => haystack.includes(keyword))
  );
  return matched?.slug || CATEGORY_SLUG_BY_TYPE[product.type] || 'other';
}

/**
 * Flattens a joined category onto a product row for the card components.
 *
 * Cards are client components, so what they are handed crosses into the browser
 * bundle twice over — once in the HTML, once in the RSC payload. Two strings is
 * all they need of a category, and shipping the whole joined row (its
 * description, its cover photo, its timestamps) to render one pill would be
 * paid for on every card on the page.
 */
export function withCategory<T extends { category?: { slug: string; title: string } | null }>(
  product: T
): Omit<T, 'category'> & { categorySlug: string | null; categoryTitle: string | null } {
  const { category, ...rest } = product;
  return {
    ...rest,
    categorySlug: category?.slug ?? null,
    categoryTitle: category?.title ?? null
  };
}
