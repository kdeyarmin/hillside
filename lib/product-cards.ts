import { Prisma } from '@prisma/client';
import { cache } from 'react';
import { db } from '@/lib/db';
import { REVENUE_STATUSES } from '@/lib/orders';
import { withCategory } from '@/lib/product-categories';
import { ratingsByProduct } from '@/lib/reviews';

/**
 * The columns a product card actually renders.
 *
 * Two pages hand the whole catalog to a client component, so every column they
 * select is serialized twice per request — once into the HTML and once into the
 * RSC payload. They had drifted into two hand-maintained lists that already
 * disagreed; a card that grew a pet-safe badge would have shown it on the shop
 * and not in a collection.
 */
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
  ships: true,
  pickup: true,
  createdAt: true,
  // Two strings, not the joined row: a card renders one pill from it and the
  // whole catalog is serialized into the browser twice over.
  category: { select: { slug: true, title: true } }
} satisfies Prisma.ProductSelect;

/** How long a product wears the "New" badge. */
export const NEW_FOR_DAYS = 30;

/** How far back best sellers are counted. A season, not all time. */
export const BEST_SELLER_WINDOW_DAYS = 90;

/**
 * How many of a thing must have sold before it is called a best seller. Without
 * a floor, the first order a new shop takes crowns whatever was in it — which is
 * exactly the kind of claim a small shop cannot afford to make loosely.
 */
export const BEST_SELLER_MIN_UNITS = 3;

/** How many products may wear the badge at once. */
export const BEST_SELLER_LIMIT = 4;

/**
 * The products that have genuinely been selling, by units shipped and paid for.
 *
 * `cache()` because several sections of one page ask, and fail-closed because a
 * badge is decoration: if the rollup cannot be read, nothing wears it rather
 * than the page failing over an ornament.
 */
export const bestSellerProductIds = cache(async () => {
  const since = new Date(Date.now() - BEST_SELLER_WINDOW_DAYS * 86_400_000);
  try {
    const rows = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: since } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: BEST_SELLER_LIMIT
    });
    return new Set(
      rows
        .filter((row) => (row._sum.quantity || 0) >= BEST_SELLER_MIN_UNITS)
        .map((row) => row.productId)
    );
  } catch {
    return new Set<string>();
  }
});

export type CardFacts = {
  averageRating: number | null;
  reviewCount: number;
  bestSeller: boolean;
  isNew: boolean;
  categorySlug: string | null;
  categoryTitle: string | null;
};

/**
 * Decided here rather than in the card, which is a client component: comparing
 * `createdAt` to `Date.now()` during render would be answered once on the server
 * and again in the browser, and a product that crossed the thirty-day line
 * between the two would hydrate into a mismatch.
 */
function isNewProduct(createdAt: Date | string | null | undefined, now: number) {
  if (!createdAt) return false;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return now - created.getTime() <= NEW_FOR_DAYS * 86_400_000;
}

/**
 * Adds the things a card knows that its own row does not: how it has been
 * reviewed, whether it is one of the shop's best sellers, and its category
 * flattened to the two strings the pill renders.
 *
 * Every page that renders a grid was repeating the ratings half of this inline,
 * four lines at a time, which is why the badge could not simply be added to the
 * card component and be done with. The category flattening joined it here for
 * the same reason: it was the same block, copied to the same eight callers.
 */
export async function withCardFacts<
  T extends {
    id: string;
    createdAt?: Date | string | null;
    category?: { slug: string; title: string } | null;
  }
>(products: T[]): Promise<Array<Omit<T, 'category'> & CardFacts>> {
  if (!products.length) return [];
  const [ratings, bestSellers] = await Promise.all([
    ratingsByProduct(products.map((product) => product.id)),
    bestSellerProductIds()
  ]);
  const now = Date.now();

  return products.map((product) => ({
    ...withCategory(product),
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0,
    bestSeller: bestSellers.has(product.id),
    isNew: isNewProduct(product.createdAt, now)
  }));
}
