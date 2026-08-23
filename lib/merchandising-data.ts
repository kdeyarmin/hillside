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
import { Prisma } from '@prisma/client';
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

/**
 * A ceiling on how many order lines are read to work out best sellers. The shop
 * sells a few hundred items a season, so this is a runaway guard rather than a
 * page size — but it is here because the alternative is a query whose cost grows
 * forever while the answer it produces stops changing.
 */
const ORDER_LINE_LIMIT = 20_000;

export type SalesStats = Map<string, BestSellerStat>;

function windowStart(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Units and distinct orders per product inside the best-seller window.
 *
 * Cancelled and fully refunded orders are excluded by `REVENUE_STATUSES`: money
 * that came back is not a sale, and counting it would let a returned order carry
 * a product onto the best-seller shelf.
 *
 * `cache()` dedupes this within one request, so a page rendering a best-seller
 * row, best-seller badges on the cards and a best-selling category heading pays
 * for it once.
 */
export const salesStats = cache(async (days = BEST_SELLER_WINDOW_DAYS): Promise<SalesStats> => {
  const stats: SalesStats = new Map();
  let lines: Array<{
    productId: string;
    orderId: string;
    quantity: number;
    order: { createdAt: Date };
  }>;

  try {
    lines = await db.orderItem.findMany({
      where: {
        order: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: windowStart(days) } }
      },
      select: {
        productId: true,
        orderId: true,
        quantity: true,
        order: { select: { createdAt: true } }
      },
      take: ORDER_LINE_LIMIT
    });
  } catch {
    // A shop that cannot read its order history should merchandise as if nothing
    // has sold rather than fail the page a shopper asked for.
    return stats;
  }

  const ordersSeen = new Map<string, Set<string>>();
  for (const line of lines) {
    const existing = stats.get(line.productId) || { units: 0, orders: 0, lastSoldAt: null };
    existing.units += Math.max(0, line.quantity);
    const seen = ordersSeen.get(line.productId) || new Set<string>();
    seen.add(line.orderId);
    ordersSeen.set(line.productId, seen);
    existing.orders = seen.size;
    const last = existing.lastSoldAt ? new Date(existing.lastSoldAt) : null;
    if (!last || line.order.createdAt > last) existing.lastSoldAt = line.order.createdAt;
    stats.set(line.productId, existing);
  }

  return stats;
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
  seasonEndsAt: true
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

/** Best sellers that have sold in the last month, newest sale first. */
export async function recentBestSellers(limit = 4): Promise<MerchandisedProduct[]> {
  const stats = await salesStats(RECENT_BEST_SELLER_DAYS);
  const ids = [...stats.entries()]
    .filter(([, stat]) => stat.units > 0)
    .sort((a, b) => b[1].units - a[1].units)
    .map(([id]) => id);
  if (!ids.length) return [];

  const products = await db.product.findMany({
    where: { active: true, id: { in: ids.slice(0, 40) } },
    select: PRODUCT_CARD_SELECT
  });
  const order = new Map(ids.map((id, index) => [id, index]));
  return products
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

  const products = await db.product.findMany({
    where: { id: { in: [...stats.keys()] } },
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
