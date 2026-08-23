import { PrismaClient, ProductRelationKind } from '@prisma/client';
import { ALL_TAGS } from '../lib/product-tags.ts';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../lib/merchandising.ts';

const db = new PrismaClient();

/**
 * Starter merchandising: a couple of sets, the traits the recommendation rules
 * match on, and a few worked examples of "show this beside that".
 *
 * Everything here is seeded **once and never re-applied**, the same discipline
 * `seed-collections.ts` follows. Re-matching on every deploy would undo Tammy's
 * own work: a product she deliberately removed from a set would keep coming
 * back, and a recommendation she deleted would reappear the next time the
 * service restarted.
 *
 * Nothing is invented, either. A set is only created when every product it names
 * already exists, so this can run against a catalog that has been rebuilt from
 * scratch without producing a box the shop cannot pack.
 */

/** Products matched by slug, then by a keyword in the name — in that order. */
type Match = { slug?: string; keyword?: string };

type BundleSeed = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  imageUrl: string;
  badge?: string;
  featured: boolean;
  sortOrder: number;
  /** What the set sells for. Left below the sum of the parts on purpose. */
  priceCents: number;
  items: Array<Match & { quantity?: number; optional?: boolean; note?: string }>;
};

const bundles: BundleSeed[] = [
  {
    slug: 'tea-starter-set',
    title: 'Tea Starter Set',
    tagline: 'A blend, and the one tool that makes brewing it easy.',
    description:
      'Loose-leaf tea is worth the small amount of fuss, and this is the whole of that fuss: a tin of our own blend and a fine-mesh infuser that drops into any mug you already own. It is the set we give to people who say they have never got on with loose leaf.',
    imageUrl: '/images/catalog/apothecary.webp',
    badge: 'Gift ready',
    featured: true,
    sortOrder: 1,
    priceCents: 2400,
    items: [
      { slug: 'hillside-calm-tea', note: 'Our own chamomile and lemon balm blend.' },
      { slug: 'stainless-tea-infuser', note: 'Fine enough for the smallest leaf.' }
    ]
  },
  {
    slug: 'hillside-gift-box',
    title: 'Hillside Gift Box',
    tagline: 'Tea, soap and lotion, boxed and ready to hand over.',
    description:
      'What we put together when somebody wants one thing to give and does not want to choose. A tin of tea, a bar of our garden herb soap and a bottle of the hand lotion — all made or blended here, all packed in one box with a card you can write on.',
    imageUrl: '/images/catalog/apothecary.webp',
    featured: true,
    sortOrder: 2,
    priceCents: 3600,
    items: [
      { slug: 'hillside-calm-tea' },
      { slug: 'garden-herb-soap' },
      { slug: 'botanical-hand-lotion' }
    ]
  },
  {
    slug: 'new-plant-parent-kit',
    title: 'New Plant Parent Kit',
    tagline: 'A plant that forgives beginners, with what it needs to settle in.',
    description:
      'Chosen because it is genuinely hard to kill. The kit goes home with the care guide for it, so the first month is a matter of following something written down rather than guessing.',
    imageUrl: '/images/catalog/live-plant-planters.webp',
    badge: 'Beginner friendly',
    featured: false,
    sortOrder: 3,
    priceCents: 3600,
    items: [
      { slug: 'golden-pothos', note: 'The plant we hand to anyone who has killed a few.' },
      { keyword: 'planter', note: 'Somewhere to put it that is not the nursery pot.' }
    ]
  }
];

/**
 * Traits exist for the recommendation rules, and are a different field from the
 * `tags` a shopper filters the shop by. Seeded only onto products that have no
 * traits at all, so anything Tammy has written herself is never overwritten.
 */
const traitsByKeyword: Array<{ keyword: string; traits: string[] }> = [
  { keyword: 'tea', traits: ['tea'] },
  { keyword: 'infuser', traits: ['infuser', 'teaware'] },
  { keyword: 'soap', traits: ['soap'] },
  { keyword: 'lotion', traits: ['lotion'] },
  { keyword: 'planter', traits: ['planter'] },
  { keyword: 'moss', traits: ['moss', 'terrarium'] }
];

/** Worked examples, so the sections on a product page are not empty on day one. */
const relations: Array<{ from: Match; to: Match; kind: ProductRelationKind; note: string }> = [
  {
    from: { slug: 'hillside-calm-tea' },
    to: { slug: 'stainless-tea-infuser' },
    kind: ProductRelationKind.PAIRS_WITH,
    note: 'What we brew ours in. It drops into any mug and rinses clean.'
  },
  {
    from: { slug: 'stainless-tea-infuser' },
    to: { slug: 'hillside-calm-tea' },
    kind: ProductRelationKind.PAIRS_WITH,
    note: 'The blend it was bought for, more often than not.'
  },
  {
    from: { slug: 'garden-herb-soap' },
    to: { slug: 'botanical-hand-lotion' },
    kind: ProductRelationKind.PAIRS_WITH,
    note: 'The pair we set out by the kitchen sink.'
  },
  {
    from: { slug: 'botanical-hand-lotion' },
    to: { slug: 'garden-herb-soap' },
    kind: ProductRelationKind.PAIRS_WITH,
    note: 'Same botanicals, same batch.'
  }
];

type ProductRow = { id: string; name: string; slug: string };

function find(products: ProductRow[], match: Match) {
  if (match.slug) {
    const bySlug = products.find((product) => product.slug === match.slug);
    if (bySlug) return bySlug;
    if (!match.keyword) return null;
  }
  const keyword = (match.keyword || '').toLowerCase();
  if (!keyword) return null;
  return (
    products.find((product) => `${product.name} ${product.slug}`.toLowerCase().includes(keyword)) ||
    null
  );
}

/** Whether a one-time migration has already had its turn. */
async function alreadyRun(key: string) {
  return Boolean(await db.seedMarker.findUnique({ where: { key }, select: { key: true } }));
}

async function markRun(key: string) {
  await db.seedMarker.upsert({ where: { key }, create: { key }, update: {} });
}

/**
 * Rescue recommendation words that were written into `tags` before `traits`
 * existed.
 *
 * They were readable but not safe there: the product form rewrites `tags`
 * through `normalizeTags`, which keeps only its own fixed vocabulary, so the
 * next time Tammy saved any of these products the words went. Anything in
 * `tags` that the filter vocabulary does not recognise is therefore hers, and
 * moves to `traits` — including suppressions like `-terrarium`, which
 * `normalizeTags` would also have dropped.
 *
 * Runs once. Products that already have traits are left alone, and recognised
 * filter slugs stay exactly where they are.
 */
async function migrateTagsToTraits() {
  if (await alreadyRun('traits-from-tags')) return 0;

  const known = new Set(ALL_TAGS.map((tag) => tag.slug));
  const products = await db.product.findMany({ select: { id: true, tags: true, traits: true } });

  let moved = 0;
  for (const product of products) {
    if (product.traits.length) continue;
    const rescued = product.tags.filter((tag) => !known.has(tag.replace(/^-/, '')));
    if (!rescued.length) continue;
    await db.product.update({
      where: { id: product.id },
      data: {
        traits: rescued,
        tags: product.tags.filter((tag) => known.has(tag.replace(/^-/, '')))
      }
    });
    moved += 1;
  }

  await markRun('traits-from-tags');
  return moved;
}

/**
 * Give an already-arranged homepage its sets row.
 *
 * `seedHomepageSections` stops at its marker, by design — it must never
 * re-create rows Tammy has deleted. But that means a shop seeded before the
 * BUNDLES row existed would simply never get one, and since the hard-coded
 * featured-sets strip is gone with it, its featured sets would drop off the
 * homepage on this deploy with nothing to put them back.
 *
 * Added once, at the end of whatever arrangement is already there, and only
 * when the shop has no BUNDLES row of its own.
 */
async function addBundlesHomepageRow() {
  if (await alreadyRun('homepage-bundles-row')) return false;

  const arranged = await db.homepageSection.count();
  // A shop with no rows at all has not been seeded yet; the default
  // arrangement already contains this row, so there is nothing to back-fill.
  if (arranged === 0) return false;

  if (await db.homepageSection.findFirst({ where: { kind: 'BUNDLES' } })) {
    await markRun('homepage-bundles-row');
    return false;
  }

  const seed = DEFAULT_HOMEPAGE_SECTIONS.find((section) => section.kind === 'BUNDLES');
  if (!seed) return false;

  const last = await db.homepageSection.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true }
  });
  await db.homepageSection.create({
    data: {
      kind: seed.kind,
      eyebrow: seed.eyebrow,
      title: seed.title,
      subtitle: seed.subtitle,
      maxItems: seed.maxItems,
      sortOrder: (last?.sortOrder ?? 0) + 10
    }
  });
  await markRun('homepage-bundles-row');
  return true;
}

async function main() {
  const rescued = await migrateTagsToTraits();
  const addedBundlesRow = await addBundlesHomepageRow();

  const products = await db.product.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true, traits: true }
  });

  let tagged = 0;
  for (const product of products) {
    if (product.traits.length) continue;
    const haystack = `${product.name} ${product.slug}`.toLowerCase();
    const traits = [
      ...new Set(
        traitsByKeyword
          .filter((entry) => haystack.includes(entry.keyword))
          .flatMap((entry) => entry.traits)
      )
    ];
    if (!traits.length) continue;
    await db.product.update({ where: { id: product.id }, data: { traits } });
    tagged += 1;
  }

  let createdBundles = 0;
  let skippedBundles = 0;
  for (const seed of bundles) {
    const existing = await db.bundle.findUnique({ where: { slug: seed.slug } });
    if (existing) continue;

    const resolved = seed.items.map((item) => ({ item, product: find(products, item) }));
    // A set is only worth creating when the whole recipe resolves. Half a
    // Hillside Gift Box is not a smaller gift box; it is a wrong one.
    if (resolved.some((entry) => !entry.product)) {
      skippedBundles += 1;
      continue;
    }

    await db.bundle.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        tagline: seed.tagline,
        description: seed.description,
        imageUrl: seed.imageUrl,
        badge: seed.badge ?? null,
        featured: seed.featured,
        sortOrder: seed.sortOrder,
        priceCents: seed.priceCents,
        items: {
          create: resolved.map((entry, index) => ({
            productId: entry.product!.id,
            quantity: entry.item.quantity ?? 1,
            optional: entry.item.optional ?? false,
            note: entry.item.note ?? null,
            sortOrder: index
          }))
        }
      }
    });
    createdBundles += 1;
  }

  let createdRelations = 0;
  for (const seed of relations) {
    const from = find(products, seed.from);
    const to = find(products, seed.to);
    if (!from || !to || from.id === to.id) continue;

    const existing = await db.productRelation.findFirst({
      where: { productId: from.id, kind: seed.kind }
    });
    // Seeded per product and section, not per row: once Tammy has chosen
    // anything for "Pairs well with" on a product, this leaves it alone.
    if (existing) continue;

    await db.productRelation.create({
      data: {
        productId: from.id,
        relatedProductId: to.id,
        kind: seed.kind,
        note: seed.note,
        sortOrder: 0
      }
    });
    createdRelations += 1;
  }

  console.log(
    `Merchandising ready: ${createdBundles} sets created` +
      `${skippedBundles ? ` (${skippedBundles} skipped — their products are not in the catalog)` : ''}` +
      `, ${tagged} products tagged, ${createdRelations} recommendations added.`
  );
  if (rescued) {
    console.log(`Recommendation words moved from tags to traits on ${rescued} products.`);
  }
  if (addedBundlesRow) {
    console.log('Sets row added to the existing homepage arrangement.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
