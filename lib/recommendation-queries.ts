/**
 * Assembling the recommendation rails from the database.
 *
 * The matching itself lives in `lib/recommendations.ts`, which is pure and
 * tested. This file only feeds it: the owner's own rows, a pool of candidates,
 * and what has actually been bought alongside the product.
 */

import { OrderStatus, Prisma, ProductRelationKind } from '@prisma/client';
import { db } from '@/lib/db';
import { withCardFacts, type CardFacts } from '@/lib/product-cards';
import {
  automaticMatches,
  frequentlyBoughtTogether,
  RECOMMENDATIONS_PER_SECTION,
  similarProducts,
  type RecommendableProduct,
  type RecommendationSectionKey
} from '@/lib/recommendations';

/** Orders that count as real purchases when reading co-purchase history. */
const PURCHASED = [
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
  OrderStatus.PARTIALLY_REFUNDED
] as const;

/**
 * How wide the candidate pool goes. Every product in it is scored in memory, so
 * this is the ceiling on the work one product page does — generous for a shop
 * this size, and bounded so it stays that way if the catalog grows.
 */
const CANDIDATE_LIMIT = 200;

/** How many recent orders to read when looking for co-purchases. */
const CO_PURCHASE_ORDER_LIMIT = 400;

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  description: true,
  details: true,
  careNotes: true,
  type: true,
  tags: true,
  traits: true,
  priceCents: true,
  compareAtCents: true,
  inventory: true,
  imageUrl: true,
  badge: true,
  featured: true,
  sortOrder: true,
  ships: true,
  pickup: true,
  sizes: true,
  sizeLabel: true,
  createdAt: true,
  staffPick: true,
  bestSellerMode: true,
  newArrivalMode: true,
  seasonStartsAt: true,
  seasonEndsAt: true,
  collections: { select: { id: true } },
  category: { select: { slug: true, title: true } }
} satisfies Prisma.ProductSelect;

type CandidateRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

/**
 * A row the rules picked, carrying why it was picked. Kept whole rather than
 * narrowed here: the badges are worked out downstream by `withCardFacts`, and
 * narrowing first is what would quietly leave a recommended card unbadged where
 * the same product is badged in the shop grid.
 */
type RecommendationSeed = CandidateRow & { reason: string | null };

type RailSeed = {
  key: RecommendationSectionKey;
  title: string;
  blurb: string;
  products: RecommendationSeed[];
};

export type RecommendationCard = Omit<CandidateRow, 'category' | 'collections'> &
  CardFacts & { reason?: string | null };

export type RecommendationRail = {
  key: RecommendationSectionKey;
  title: string;
  blurb: string;
  products: RecommendationCard[];
};

function toRecommendable(row: CandidateRow): RecommendableProduct & { collectionIds: string[] } {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    tags: row.tags,
    traits: row.traits,
    shortDescription: row.shortDescription,
    description: row.description,
    details: row.details,
    careNotes: row.careNotes,
    collectionIds: row.collections.map((collection) => collection.id)
  };
}

function toCard(row: CandidateRow, reason?: string | null): RecommendationSeed {
  return { ...row, reason: reason || null };
}

/**
 * How many separate paid orders contain both the anchor and each other product.
 *
 * Components count: a plant bought inside the New Plant Parent Kit was bought
 * alongside everything else in that box just as surely as a loose one, and a
 * bundle line carries no `productId` of its own to be found by.
 */
async function coPurchaseCounts(productId: string) {
  const orders = await db.order.findMany({
    where: {
      status: { in: [...PURCHASED] },
      OR: [
        { items: { some: { productId } } },
        { items: { some: { components: { some: { productId } } } } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: CO_PURCHASE_ORDER_LIMIT,
    select: {
      items: {
        select: { productId: true, components: { select: { productId: true } } }
      }
    }
  });

  const counts = new Map<string, number>();
  for (const order of orders) {
    // Distinct per order: two sizes of one lotion in one basket is one order
    // that contained it, not two votes for it.
    const inThisOrder = new Set<string>();
    for (const item of order.items) {
      if (item.productId) inThisOrder.add(item.productId);
      for (const component of item.components) inThisOrder.add(component.productId);
    }
    inThisOrder.delete(productId);
    for (const otherId of inThisOrder) {
      counts.set(otherId, (counts.get(otherId) || 0) + 1);
    }
  }
  return counts;
}

/**
 * The rails for one product page, in the order they are shown.
 *
 * Each section is filled from the owner's own rows first, then from the rules,
 * and a product already used in an earlier rail is never repeated in a later one
 * — three rails showing the same infuser would read as one padded rail.
 */
export async function recommendationsForProduct(anchor: {
  id: string;
  slug: string;
  name: string;
  type: string;
  tags?: string[] | null;
  traits?: string[] | null;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
  careNotes?: string | null;
  collections?: Array<{ id: string }>;
}): Promise<RecommendationRail[]> {
  const [relations, candidates, counts] = await Promise.all([
    db.productRelation.findMany({
      where: { productId: anchor.id, related: { active: true, inventory: { gt: 0 } } },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      include: { related: { select: cardSelect } }
    }),
    db.product.findMany({
      where: { active: true, inventory: { gt: 0 }, id: { not: anchor.id } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: CANDIDATE_LIMIT,
      select: cardSelect
    }),
    coPurchaseCounts(anchor.id)
  ]);

  const byId = new Map(candidates.map((row) => [row.id, row]));
  const anchorProduct: RecommendableProduct & { collectionIds: string[] } = {
    id: anchor.id,
    slug: anchor.slug,
    name: anchor.name,
    type: anchor.type,
    tags: anchor.tags,
    traits: anchor.traits,
    shortDescription: anchor.shortDescription,
    description: anchor.description,
    details: anchor.details,
    careNotes: anchor.careNotes,
    collectionIds: (anchor.collections || []).map((collection) => collection.id)
  };

  const matches = automaticMatches(anchorProduct, candidates.map(toRecommendable));
  const used = new Set<string>();

  /**
   * Every section's owner-configured rows are placed before any section is
   * filled automatically.
   *
   * Interleaved — owner then automatic, section by section — an automatic match
   * in "Pairs well with" would claim a product the owner had explicitly put
   * under "You may also like", and the later section would silently skip it as
   * already used. Configured merchandising is promised to always win; filling it
   * first is what makes that true rather than true-most-of-the-time.
   */
  const configured = (kind: ProductRelationKind) => {
    const cards: RecommendationSeed[] = [];
    for (const relation of relations) {
      if (relation.kind !== kind) continue;
      if (used.has(relation.relatedProductId)) continue;
      used.add(relation.relatedProductId);
      cards.push(toCard(relation.related, relation.note));
      if (cards.length >= RECOMMENDATIONS_PER_SECTION) break;
    }
    return cards;
  };

  const pairs = configured(ProductRelationKind.PAIRS_WITH);
  const complete = configured(ProductRelationKind.COMPLETES_SETUP);
  const similar = configured(ProductRelationKind.SIMILAR);

  /** Rule matches, filling whatever the owner left room for. */
  const topUp = (cards: RecommendationSeed[], section: 'pairs' | 'complete') => {
    for (const match of matches) {
      if (cards.length >= RECOMMENDATIONS_PER_SECTION) break;
      if (match.section !== section) continue;
      const row = byId.get(match.product.id);
      if (!row || used.has(row.id)) continue;
      used.add(row.id);
      cards.push(toCard(row, match.reason));
    }
  };

  topUp(pairs, 'pairs');
  topUp(complete, 'complete');

  const together: RecommendationSeed[] = [];
  for (const { productId, count } of frequentlyBoughtTogether(counts)) {
    const row = byId.get(productId);
    if (!row || used.has(row.id)) continue;
    used.add(row.id);
    together.push(toCard(row, `Bought with ${anchor.name} in ${count} other orders.`));
    if (together.length >= RECOMMENDATIONS_PER_SECTION) break;
  }

  if (similar.length < RECOMMENDATIONS_PER_SECTION) {
    for (const entry of similarProducts(
      anchorProduct,
      candidates.map((row) => ({ ...toRecommendable(row), featured: row.featured })),
      used
    )) {
      const row = byId.get(entry.product.id);
      if (!row || used.has(row.id)) continue;
      used.add(row.id);
      similar.push(toCard(row));
      if (similar.length >= RECOMMENDATIONS_PER_SECTION) break;
    }
  }

  const rails: RailSeed[] = (
    [
      {
        key: 'pairs',
        title: 'Pairs well with',
        blurb: 'Things we would send home in the same box.',
        products: pairs
      },
      {
        key: 'complete',
        title: 'Complete the setup',
        blurb: 'What this needs to actually work once it is home.',
        products: complete
      },
      {
        key: 'together',
        title: 'Frequently bought together',
        blurb: 'What other customers added alongside it.',
        products: together
      },
      {
        key: 'similar',
        title: 'You may also like',
        blurb: 'Other pieces in the same spirit.',
        products: similar
      }
    ] satisfies RailSeed[]
  ).filter((rail) => rail.products.length > 0);

  const decorated = new Map(
    (await withCardFacts(rails.flatMap((rail) => rail.products))).map((product) => [
      product.id,
      product
    ])
  );
  return rails.map((rail) => ({
    ...rail,
    products: rail.products.map((product) => ({
      ...decorated.get(product.id)!,
      reason: product.reason
    }))
  }));
}

/**
 * The cart drawer's strip. Same rules, anchored on everything already in the
 * basket rather than on one product, so a basket holding a tea is offered the
 * infuser and not a second tea.
 *
 * A set in the basket is anchored on the things inside it — a Terrarium Starter
 * Kit should suggest what goes with a terrarium — and those things are excluded
 * from the suggestions, because the shopper already has them in the box.
 */
export async function recommendationsForBasket(
  slugs: string[],
  bundleSlugs: string[] = [],
  limit = 2
) {
  const [looseInBasket, bundlesInBasket] = await Promise.all([
    slugs.length ? db.product.findMany({ where: { slug: { in: slugs } }, select: cardSelect }) : [],
    bundleSlugs.length
      ? db.bundle.findMany({
          where: { slug: { in: bundleSlugs } },
          select: { items: { select: { productId: true } } }
        })
      : []
  ]);

  const componentIds = bundlesInBasket.flatMap((bundle) =>
    bundle.items.map((item) => item.productId)
  );
  const inBundles = componentIds.length
    ? await db.product.findMany({ where: { id: { in: componentIds } }, select: cardSelect })
    : [];
  const inBasket = [...looseInBasket, ...inBundles];

  const candidates = await db.product.findMany({
    where: {
      active: true,
      inventory: { gt: 0 },
      slug: { notIn: slugs },
      id: { notIn: componentIds }
    },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    take: CANDIDATE_LIMIT,
    select: cardSelect
  });
  const byId = new Map(candidates.map((row) => [row.id, row]));

  /**
   * What Tammy configured for anything in the basket, which the drawer used to
   * ignore entirely — so a product whose only recommendation was hers appeared
   * on its own page and nowhere else, despite this strip being described as
   * running the same rules.
   *
   * Scored above every rule match rather than merged into them: a configured row
   * is a decision, and the drawer should not be the one place it loses to a
   * guess.
   */
  const configured = inBasket.length
    ? await db.productRelation.findMany({
        where: {
          productId: { in: inBasket.map((row) => row.id) },
          relatedProductId: { notIn: componentIds },
          related: { active: true, inventory: { gt: 0 }, slug: { notIn: slugs } }
        },
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        include: { related: { select: cardSelect } }
      })
    : [];

  const CONFIGURED_SCORE = 1000;
  const best = new Map<string, { row: CandidateRow; reason: string; score: number }>();

  for (const [index, relation] of configured.entries()) {
    best.set(relation.relatedProductId, {
      row: relation.related,
      reason: relation.note || 'Tammy pairs these.',
      // Ranked among themselves by the order she put them in.
      score: CONFIGURED_SCORE - index
    });
  }

  for (const basketRow of inBasket) {
    for (const match of automaticMatches(
      toRecommendable(basketRow),
      candidates.map(toRecommendable)
    )) {
      const row = byId.get(match.product.id);
      if (!row) continue;
      const existing = best.get(row.id);
      if (!existing || match.score > existing.score) {
        best.set(row.id, { row, reason: match.reason, score: match.score });
      }
    }
  }

  /**
   * Nothing is returned when nothing matches. The drawer used to fall back to
   * "whatever is featured", which is the untargeted suggestion this feature
   * exists to stop making.
   */
  return [...best.values()]
    .sort((left, right) => right.score - left.score || left.row.name.localeCompare(right.row.name))
    .slice(0, limit)
    .map(({ row, reason }) => ({ ...toCard(row, reason) }));
}
