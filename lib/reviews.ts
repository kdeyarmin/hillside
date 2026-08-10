import { db } from '@/lib/db';

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
