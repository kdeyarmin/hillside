import { db } from '@/lib/db';
import type { RatingCounts } from '@/lib/review-display';

export type RatingSummary = { average: number; count: number };

/** Approved-review rollups, keyed by product id. */
export async function ratingsByProduct(productIds: string[]) {
  const summary = new Map<string, RatingSummary>();
  if (!productIds.length) return summary;

  const grouped = await db.review.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true }
  });

  for (const row of grouped) {
    summary.set(row.productId, {
      average: Number((row._avg.rating || 0).toFixed(2)),
      count: row._count._all
    });
  }
  return summary;
}

export async function ratingForProduct(productId: string): Promise<RatingSummary> {
  return (await ratingsByProduct([productId])).get(productId) || { average: 0, count: 0 };
}

/**
 * How many approved reviews sit at each star.
 *
 * Counted in SQL over every approved review rather than over the page of them
 * the product page renders: the distribution is a claim about the whole
 * picture, and one derived from the most recent fifty would quietly disagree
 * with the review count printed beside it.
 */
export async function ratingCountsForProduct(productId: string): Promise<RatingCounts> {
  const counts: RatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const grouped = await db.review.groupBy({
    by: ['rating'],
    where: { productId, status: 'APPROVED' },
    _count: { _all: true }
  });
  for (const row of grouped) {
    const star = Math.round(row.rating);
    if (star >= 1 && star <= 5) counts[star] = row._count._all;
  }
  return counts;
}
