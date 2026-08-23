import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  averageRating,
  countRatings,
  helpfulLabel,
  offersReviewSorting,
  parseReviewSort,
  ratingDistribution,
  REVIEW_SORT_THRESHOLD,
  sortReviews,
  totalReviews
} from '../lib/review-display.ts';

describe('countRatings', () => {
  it('tallies into the five buckets', () => {
    const counts = countRatings([{ rating: 5 }, { rating: 5 }, { rating: 3 }]);
    assert.deepEqual(counts, { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  it('ignores a rating outside one to five', () => {
    const counts = countRatings([{ rating: 0 }, { rating: 9 }, { rating: 4 }]);
    assert.equal(totalReviews(counts), 1);
  });
});

describe('averageRating', () => {
  it('averages to one decimal', () => {
    assert.equal(averageRating({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 }), 4.3);
    assert.equal(averageRating({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 }), 3);
  });

  it('is zero with nothing to average', () => {
    assert.equal(averageRating({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }), 0);
  });
});

describe('ratingDistribution', () => {
  it('runs five stars down to one and shares out the percentages', () => {
    const bars = ratingDistribution({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });
    assert.deepEqual(
      bars.map((bar) => [bar.stars, bar.count, bar.percent]),
      [
        [5, 2, 50],
        [4, 1, 25],
        [3, 1, 25],
        [2, 0, 0],
        [1, 0, 0]
      ]
    );
  });

  it('keeps every row when there are no reviews at all', () => {
    const bars = ratingDistribution({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    assert.equal(bars.length, 5);
    assert.ok(bars.every((bar) => bar.percent === 0));
  });
});

describe('sortReviews', () => {
  const reviews = [
    { id: 'a', rating: 5, helpfulCount: 1, createdAt: '2026-01-10T00:00:00.000Z' },
    { id: 'b', rating: 4, helpfulCount: 9, createdAt: '2025-06-01T00:00:00.000Z' },
    { id: 'c', rating: 3, helpfulCount: 9, createdAt: '2025-12-01T00:00:00.000Z' }
  ];

  it('puts the newest first by default', () => {
    assert.deepEqual(
      sortReviews(reviews, 'recent').map((review) => review.id),
      ['a', 'c', 'b']
    );
  });

  it('puts the most helpful first, newest breaking the tie', () => {
    assert.deepEqual(
      sortReviews(reviews, 'helpful').map((review) => review.id),
      ['c', 'b', 'a']
    );
  });

  it('leaves the caller’s array alone', () => {
    const order = reviews.map((review) => review.id);
    sortReviews(reviews, 'helpful');
    assert.deepEqual(
      reviews.map((review) => review.id),
      order
    );
  });
});

describe('parseReviewSort and offersReviewSorting', () => {
  it('only knows two orderings', () => {
    assert.equal(parseReviewSort('helpful'), 'helpful');
    assert.equal(parseReviewSort('HELPFUL'), 'helpful');
    assert.equal(parseReviewSort('recent'), 'recent');
    assert.equal(parseReviewSort('rating'), 'recent');
    assert.equal(parseReviewSort(undefined), 'recent');
  });

  it('offers the control only once there is enough to sort', () => {
    assert.equal(offersReviewSorting(REVIEW_SORT_THRESHOLD - 1), false);
    assert.equal(offersReviewSorting(REVIEW_SORT_THRESHOLD), true);
    assert.equal(offersReviewSorting(0), false);
  });
});

describe('helpfulLabel', () => {
  it('says nothing until someone has voted', () => {
    assert.equal(helpfulLabel(0), null);
    assert.equal(helpfulLabel(-2), null);
    assert.equal(helpfulLabel(1), '1 person found this helpful');
    assert.equal(helpfulLabel(4), '4 people found this helpful');
  });
});
