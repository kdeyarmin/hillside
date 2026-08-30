/**
 * The queries behind the merchandising rules: what has actually sold, and what
 * each homepage row should hold.
 *
 * Best sellers are read from paid order lines rather than from a checkbox, which
 * is the point — a badge that says "best seller" should be a fact about the
 * shop, not a thing somebody remembered to tick. `lib/merchandising.ts` holds the
 * thresholds and the overrides; this file only counts.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { Prisma } from '@prisma/client';
import { SALES_STATS_TTL_SECONDS } from './cache';
import { db } from './db';
import { REVENUE_STATUSES } from './orders';
import {
  BEST_SELLER_MIN_UNITS,
  BEST_SELLER_WINDOW_DAYS,
  NEW_ARRIVAL_DAYS,
  RECENT_BEST_SELLER_DAYS,
  isBestSeller,
  isInSeason,
  isNewArrival,
  type BestSellerStat,
  type HomepageSectionKind
} from './merchandising';
import { CATEGORY_GROUPS, discountPercent } from './store';
import { comparableAtCents, productSizes } from './product-sizes';
import { tagsForProduct } from './product-tags';

export type SalesStats = Map<string, BestSellerStat>;

function windowStart(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000);
}

/** One product's sales, as Postgres counts them. Plain JSON so it can be cached. */
type SalesRow = {
  productId: string;
  units: number;
  orders: number;
  lastSoldAt: string | null;
};

/**
 * Units, distinct orders and the last sale per product inside a window.
 *
 * This used to read up to twenty thousand order lines into memory and total them
 * in JavaScript, on essentially every commerce page — the home page ran it twice,
 * because its two best-seller rows ask about different windows. The counting is
 * an aggregate, so Postgres does it, over the `Order(status, createdAt)` index
 * added for exactly this query.
 *
 * The old row ceiling is gone with it. It was a `take` with no `orderBy`, so once
 * the shop passed twenty thousand lines it would have silently totalled an
 * arbitrary subset and reported the result as fact. An aggregate has no such
 * cliff: the count is complete however long the shop trades.
 *
 * Cancelled and fully refunded orders are excluded by `REVENUE_STATUSES`: money
 * that came back is not a sale, and counting it would let a returned order carry
 * a product onto the best-seller shelf.
 *
 * The two halves of the union are the two ways a product leaves the shelf. A
 * set's own line carries no `productId` — it is the set that was bought — so what
 * actually went out is recorded underneath it in `OrderItemComponent`. Counting
 * those is what keeps a tea that sells briskly inside the Tea Starter Set from
 * looking like a tea nobody buys, which is exactly the claim the best-seller
 * badge would then be making about it. `oi."productId" IS NULL` on the second
 * half is what stops an ordinary line being counted twice.
 */
export async function readSalesRows(days: number): Promise<SalesRow[]> {
  const since = windowStart(days);
  const statuses = [...REVENUE_STATUSES];

  /**
   * `::int` on both aggregates is load-bearing: Postgres returns `bigint` for
   * `SUM` and `COUNT`, Prisma maps that to a JavaScript `BigInt`, and `BigInt` is
   * not serializable — it would throw the moment the cache tried to store it.
   */
  return db.$queryRaw<SalesRow[]>`
    WITH sold AS (
      SELECT oi."productId" AS product_id,
             oi."orderId"   AS order_id,
             oi."quantity"  AS quantity,
             o."createdAt"  AS created_at
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
       WHERE o."status"::text = ANY(${statuses}::text[])
         AND o."createdAt" >= ${since}
         AND oi."productId" IS NOT NULL
      UNION ALL
      SELECT oic."productId",
             oi."orderId",
             oic."quantity",
             o."createdAt"
        FROM "OrderItemComponent" oic
        JOIN "OrderItem" oi ON oi."id" = oic."orderItemId"
        JOIN "Order" o ON o."id" = oi."orderId"
       WHERE o."status"::text = ANY(${statuses}::text[])
         AND o."createdAt" >= ${since}
         AND oi."productId" IS NULL
    )
    SELECT product_id                              AS "productId",
           SUM(GREATEST(quantity, 0))::int         AS "units",
           COUNT(DISTINCT order_id)::int           AS "orders",
           MAX(created_at)                         AS "lastSoldAt"
      FROM sold
     GROUP BY product_id
  `;
}

/**
 * Shared across requests for `SALES_STATS_TTL_SECONDS`. Deliberately *not*
 * wrapped in a try/catch: a throw is not cached, so a database blip costs one
 * request rather than fifteen minutes of a shop that thinks it has sold nothing.
 */
const cachedSalesRows = unstable_cache(readSalesRows, ['merchandising', 'sales-stats'], {
  revalidate: SALES_STATS_TTL_SECONDS
});

/**
 * `cache()` still wraps the cross-request cache: it dedupes within one request,
 * so a page rendering a best-seller row, best-seller badges on the cards and a
 * best-selling category heading does not go three times even to the cache.
 */
export const salesStats = cache(async (days = BEST_SELLER_WINDOW_DAYS): Promise<SalesStats> => {
  let rows: SalesRow[];
  try {
    rows = await cachedSalesRows(days);
  } catch (error) {
    // A shop that cannot read its order history should merchandise as if nothing
    // has sold rather than fail the page a shopper asked for.
    console.error('Best-seller counts could not be read; merchandising without them', error);
    return new Map();
  }

  return new Map(
    rows.map((row) => [
      row.productId,
      { units: row.units, orders: row.orders, lastSoldAt: row.lastSoldAt }
    ])
  );
});

export type MerchandisingFlags = {
  isNew: boolean;
  isBestSeller: boolean;
  isInSeason: boolean;
  isOnSale: boolean;
  /** Units sold in the window, for sorting a best-seller row. */
  unitsSold: number;
};

type FlaggableProduct = {
  id: string;
  createdAt: Date;
  newArrivalMode: string;
  bestSellerMode: string;
  seasonStartsAt: Date | null;
  seasonEndsAt: Date | null;
  priceCents: number;
  compareAtCents: number | null;
  sizes?: unknown;
};

/**
 * Every automatic label for a set of products, worked out once. Pages hand the
 * result to cards and to structured data so a product cannot be badged "Best
 * seller" in the grid and left unmentioned in the markup a crawler reads.
 */
export async function merchandisingFlagsFor<T extends FlaggableProduct>(
  products: T[],
  now = new Date()
): Promise<Map<string, MerchandisingFlags>> {
  const flags = new Map<string, MerchandisingFlags>();
  if (!products.length) return flags;

  const stats = await salesStats();
  for (const product of products) {
    const stat = stats.get(product.id) || null;
    const sizes = productSizes(product.sizes, product.priceCents);
    const compareAt = comparableAtCents(sizes, product.priceCents, product.compareAtCents);
    flags.set(product.id, {
      isNew: isNewArrival(
        { createdAt: product.createdAt, newArrivalMode: product.newArrivalMode as never },
        now
      ),
      isBestSeller: isBestSeller({ bestSellerMode: product.bestSellerMode as never }, stat),
      isInSeason: isInSeason(
        { seasonStartsAt: product.seasonStartsAt, seasonEndsAt: product.seasonEndsAt },
        now
      ),
      isOnSale: discountPercent(product.priceCents, compareAt) > 0,
      unitsSold: stat?.units || 0
    });
  }
  return flags;
}

/** Everything a shop card needs to be filtered and badged. */
export function tagsWithFlags(
  product: Parameters<typeof tagsForProduct>[0],
  flags: MerchandisingFlags | undefined
) {
  return tagsForProduct(product, {
    isNew: flags?.isNew,
    isBestSeller: flags?.isBestSeller,
    isOnSale: flags?.isOnSale,
    isInSeason: flags?.isInSeason
  });
}

/** The fields every merchandising query needs to badge and filter a card. */
export const PRODUCT_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  description: true,
  type: true,
  priceCents: true,
  compareAtCents: true,
  inventory: true,
  imageUrl: true,
  badge: true,
  sizes: true,
  sizeLabel: true,
  featured: true,
  staffPick: true,
  sortOrder: true,
  createdAt: true,
  ships: true,
  pickup: true,
  tags: true,
  botanical: true,
  searchTerms: true,
  newArrivalMode: true,
  bestSellerMode: true,
  seasonStartsAt: true,
  seasonEndsAt: true,
  // Two strings, not the joined row: a card renders one pill from it and the
  // whole catalog is serialized into the browser twice over.
  category: { select: { slug: true, title: true } }
} satisfies Prisma.ProductSelect;

export type MerchandisedProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_CARD_SELECT }>;

/**
 * Active products that have earned the best-seller label, most sold first.
 *
 * Pinned products (`bestSellerMode: ALWAYS`) come after the ones that earned it,
 * because a row headed "what is selling" should lead with what is actually
 * selling; suppressed ones never appear at all.
 */
export async function bestSellingProducts(limit = 4): Promise<MerchandisedProduct[]> {
  const stats = await salesStats();
  const products = await db.product.findMany({
    where: {
      active: true,
      OR: [{ id: { in: [...stats.keys()] } }, { bestSellerMode: 'ALWAYS' }]
    },
    select: PRODUCT_CARD_SELECT,
    take: 200
  });

  return products
    .filter((product) =>
      isBestSeller({ bestSellerMode: product.bestSellerMode }, stats.get(product.id))
    )
    .map((product) => ({ product, units: stats.get(product.id)?.units || 0 }))
    .sort((a, b) => b.units - a.units || a.product.name.localeCompare(b.product.name))
    .slice(0, limit)
    .map((entry) => entry.product);
}

/**
 * Best sellers measured over the last month rather than the season, most sold
 * first.
 *
 * The same decision as `bestSellingProducts`, only against a shorter window —
 * not "anything that sold at all recently". Admitting a single unit would have
 * put a one-off purchase under a heading that reads as a recommendation, shown
 * a product Tammy had set to `NEVER`, and hidden one she had pinned to
 * `ALWAYS`. A row about what is selling has to obey the same rules as the badge
 * that says so.
 */
export async function recentBestSellers(limit = 4): Promise<MerchandisedProduct[]> {
  const stats = await salesStats(RECENT_BEST_SELLER_DAYS);
  const ids = [...stats.entries()]
    .filter(([, stat]) => stat.units > 0)
    .sort((a, b) => b[1].units - a[1].units)
    .map(([id]) => id);

  const products = await db.product.findMany({
    where: {
      active: true,
      OR: [{ id: { in: ids.slice(0, 40) } }, { bestSellerMode: 'ALWAYS' }]
    },
    select: PRODUCT_CARD_SELECT,
    take: 200
  });

  const order = new Map(ids.map((id, index) => [id, index]));
  return products
    .filter((product) =>
      isBestSeller({ bestSellerMode: product.bestSellerMode }, stats.get(product.id))
    )
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .slice(0, limit);
}

/**
 * The category people are buying most, as a merchandising group rather than a
 * raw product type — "Botanicals" is what a shopper reads, not "SOAP".
 * Returns null until at least one group clears the best-seller unit floor, so
 * the homepage cannot announce a best-selling category off a single sale.
 */
export async function bestSellingCategory(): Promise<{
  key: string;
  label: string;
  units: number;
} | null> {
  const stats = await salesStats();
  if (!stats.size) return null;

  /**
   * Active products only. A category ranked on archived stock can be announced
   * as "most shopped right now" and link to a shop filter with nothing in it —
   * the discontinued plants that earned the ranking are exactly the ones a
   * shopper cannot buy.
   */
  const products = await db.product.findMany({
    where: { active: true, id: { in: [...stats.keys()] } },
    select: { id: true, type: true }
  });

  const byGroup = new Map<string, number>();
  for (const product of products) {
    const entry = Object.entries(CATEGORY_GROUPS).find(([, group]) =>
      group.types.includes(product.type)
    );
    const key = entry?.[0] || product.type;
    byGroup.set(key, (byGroup.get(key) || 0) + (stats.get(product.id)?.units || 0));
  }

  const ranked = [...byGroup.entries()].sort((a, b) => b[1] - a[1]);
  const [key, units] = ranked[0] || [];
  /**
   * Only the unit floor applies to a group. The distinct-order floor exists so
   * one bulk purchase cannot make a single product a best seller; a whole
   * category leading the shop off one order is not a failure mode worth a second
   * threshold, and applying it would silently blank the heading on a shop whose
   * customers each buy one thing.
   */
  if (!key || (units || 0) < BEST_SELLER_MIN_UNITS) return null;
  return { key, label: CATEGORY_GROUPS[key]?.label || key, units: units || 0 };
}

/**
 * The products one homepage row should show.
 *
 * A row that comes back empty is not an error and not a placeholder — the
 * homepage drops it. That is what lets Tammy leave a "Best sellers" row arranged
 * through a quiet winter without the front page announcing an empty shelf.
 */
export async function productsForSection(section: {
  kind: HomepageSectionKind | string;
  maxItems: number;
  collectionId: string | null;
}): Promise<MerchandisedProduct[]> {
  const take = Math.max(1, Math.min(12, section.maxItems || 4));
  const active = { active: true } as const;

  switch (section.kind) {
    case 'FEATURED':
      return db.product.findMany({
        where: { ...active, featured: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
        take
      });
    case 'STAFF_PICKS':
      return db.product.findMany({
        where: { ...active, staffPick: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
        take
      });
    case 'NEW_ARRIVALS': {
      /**
       * Recently listed, plus anything pinned as new, minus anything Tammy said
       * is not. The date filter cannot express the overrides on its own, so the
       * candidates are widened and `isNewArrival` decides.
       */
      const since = windowStart(NEW_ARRIVAL_DAYS);
      const candidates = await db.product.findMany({
        where: {
          ...active,
          OR: [{ createdAt: { gte: since } }, { newArrivalMode: 'ALWAYS' }]
        },
        orderBy: { createdAt: 'desc' },
        select: PRODUCT_CARD_SELECT,
        take: take * 4
      });
      return candidates
        .filter((product) =>
          isNewArrival({ createdAt: product.createdAt, newArrivalMode: product.newArrivalMode })
        )
        .slice(0, take);
    }
    case 'BEST_SELLERS':
      return bestSellingProducts(take);
    case 'RECENT_BEST_SELLERS':
      return recentBestSellers(take);
    case 'SEASONAL': {
      const candidates = await db.product.findMany({
        where: {
          ...active,
          OR: [{ seasonStartsAt: { not: null } }, { seasonEndsAt: { not: null } }]
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
        take: 100
      });
      return candidates.filter((product) => isInSeason(product)).slice(0, take);
    }
    case 'ON_SALE': {
      /**
       * `compareAtCents > priceCents` is not expressible as a Prisma filter
       * against another column, and a size can carry its own price — so the
       * candidates are the rows that have a compare-at price at all, and
       * `discountPercent` settles which of them are genuinely reduced.
       */
      const candidates = await db.product.findMany({
        where: { ...active, compareAtCents: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
        take: 100
      });
      return candidates
        .filter((product) => {
          const sizes = productSizes(product.sizes, product.priceCents);
          const compareAt = comparableAtCents(sizes, product.priceCents, product.compareAtCents);
          return discountPercent(product.priceCents, compareAt) > 0;
        })
        .slice(0, take);
    }
    case 'COLLECTION':
      if (!section.collectionId) return [];
      return db.product.findMany({
        where: { ...active, collections: { some: { id: section.collectionId } } },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
        take
      });
    default:
      return [];
  }
}
