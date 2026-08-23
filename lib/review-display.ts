/**
 * How the review block on a product page presents what it has: the star
 * breakdown, the ordering, and when an ordering control is worth showing at all.
 *
 * Pure — no Prisma, no React — so the arithmetic behind "82% five star" is
 * covered by `npm test` rather than by looking at a page and believing it.
 */

export type ReviewSort = 'recent' | 'helpful';

/**
 * How many approved reviews a product needs before the sort control appears.
 * Below this the list is short enough to read whole, and a "sort by" on three
 * reviews is furniture that makes a young shop look emptier than it is.
 */
export const REVIEW_SORT_THRESHOLD = 5;

/** How many reviews are shown before "show more". */
export const REVIEW_VISIBLE_STEP = 5;

/** The most reviews a product page loads. Well past what this shop will hold. */
export const REVIEW_PAGE_SIZE = 50;

export type RatingCounts = Record<number, number>;

export function parseReviewSort(value: unknown): ReviewSort {
  return String(value ?? '').toLowerCase() === 'helpful' ? 'helpful' : 'recent';
}

/** Tallies a list of ratings into the 1–5 buckets, ignoring anything outside. */
export function countRatings(reviews: ReadonlyArray<{ rating: number }>): RatingCounts {
  const counts: RatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    const star = Math.round(review.rating);
    if (star >= 1 && star <= 5) counts[star] += 1;
  }
  return counts;
}

export function totalReviews(counts: RatingCounts) {
  return [1, 2, 3, 4, 5].reduce((total, star) => total + (counts[star] || 0), 0);
}

/** The average to one decimal, or 0 when nobody has reviewed it. */
export function averageRating(counts: RatingCounts) {
  const total = totalReviews(counts);
  if (!total) return 0;
  const sum = [1, 2, 3, 4, 5].reduce((running, star) => running + star * (counts[star] || 0), 0);
  return Math.round((sum / total) * 10) / 10;
}

export type RatingBar = { stars: number; count: number; percent: number };

/**
 * Five rows, five stars down to one, each with the share of reviews at that
 * rating. Rows with no reviews are kept: the shape of a distribution is the
 * point, and a missing "1 star" row would read as a hidden one.
 */
export function ratingDistribution(counts: RatingCounts): RatingBar[] {
  const total = totalReviews(counts);
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = counts[stars] || 0;
    return {
      stars,
      count,
      percent: total ? Math.round((count / total) * 100) : 0
    };
  });
}

export type SortableReview = {
  id: string;
  rating: number;
  helpfulCount: number;
  /** ISO 8601, as it arrives from the server component. */
  createdAt: string;
};

/**
 * Newest first, or most helpful first with the newest breaking ties.
 *
 * Non-mutating: the caller's array is the render order of the page it came
 * from, and sorting it in place would reorder the list under React.
 */
export function sortReviews<T extends SortableReview>(reviews: readonly T[], sort: ReviewSort) {
  const byNewest = (left: T, right: T) =>
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (sort === 'recent') return [...reviews].sort(byNewest);
  return [...reviews].sort(
    (left, right) => right.helpfulCount - left.helpfulCount || byNewest(left, right)
  );
}

/** Whether the sort control has earned its place on this product. */
export function offersReviewSorting(count: number) {
  return count >= REVIEW_SORT_THRESHOLD;
}

/** "4 people found this helpful", or nothing at all at zero. */
export function helpfulLabel(count: number) {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'person' : 'people'} found this helpful`;
}
