'use client';

import { useEffect, useMemo, useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import FormStatus from '@/components/FormStatus';
import {
  averageRating,
  helpfulLabel,
  offersReviewSorting,
  ratingDistribution,
  REVIEW_VISIBLE_STEP,
  sortReviews,
  totalReviews,
  type RatingCounts,
  type ReviewSort
} from '@/lib/review-display';

export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  ownerReply: string | null;
  helpfulCount: number;
  createdAt: string;
};

const HELPFUL_STORAGE_KEY = 'hillside-helpful-reviews-v1';

/** Which reviews this browser has already marked helpful. */
function readVoted(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HELPFUL_STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function StarRow({ rating, size = 15, label }: { rating: number; size?: number; label?: string }) {
  return (
    <span className="rating-stars">
      {/* Without this each individual review's score was unannounced: the icons
          are decorative and the row had no text alternative. */}
      {label !== undefined && <span className="sr-only">{label}</span>}
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          size={size}
          key={step}
          aria-hidden="true"
          className={step <= Math.round(rating) ? 'star on' : 'star'}
        />
      ))}
    </span>
  );
}

/**
 * The five-bar breakdown. It answers the question an average alone cannot —
 * whether 4.2 means "everyone liked it" or "most loved it and two people had a
 * plant arrive badly" — and the counts are read from every approved review, not
 * from the page of them rendered below.
 */
function RatingBreakdown({ counts }: { counts: RatingCounts }) {
  const bars = ratingDistribution(counts);
  const total = totalReviews(counts);
  if (!total) return null;

  return (
    <ul className="rating-breakdown">
      {bars.map((bar) => (
        <li key={bar.stars}>
          <span className="rating-breakdown-label">
            {bar.stars} <span aria-hidden="true">★</span>
            <span className="sr-only">{bar.stars === 1 ? 'star' : 'stars'}</span>
          </span>
          {/* Presentational: the row's numbers are already in the text either
              side of it, so a second announcement would only repeat them. */}
          <span className="rating-breakdown-track" role="presentation">
            <span style={{ width: `${bar.percent}%` }} />
          </span>
          <span className="rating-breakdown-count">
            {bar.count}
            <span className="sr-only">
              {' '}
              {bar.count === 1 ? 'review' : 'reviews'} ({bar.percent}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function HelpfulButton({ review }: { review: PublicReview }) {
  const [count, setCount] = useState(review.helpfulCount);
  const [marked, setMarked] = useState(false);
  const [pending, setPending] = useState(false);

  /**
   * Read after mount, never during render. The server has no localStorage, so
   * a render that consulted it would send "Helpful" and hydrate to "Marked
   * helpful" — a mismatch React resolves by throwing the client tree away.
   */
  useEffect(() => {
    if (readVoted().includes(review.id)) setMarked(true);
  }, [review.id]);

  async function vote() {
    if (marked || pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/reviews/helpful', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id })
      });
      const result = (await response.json()) as { helpfulCount?: number };
      if (!response.ok) throw new Error('vote failed');
      setCount(result.helpfulCount ?? count + 1);
      setMarked(true);
      try {
        const saved = new Set(readVoted());
        saved.add(review.id);
        localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify([...saved].slice(-200)));
      } catch {
        /* A browser that refuses storage still gets its vote counted. */
      }
    } catch {
      /* Nothing to report: a helpfulness vote is not worth an error message. */
    } finally {
      setPending(false);
    }
  }

  const label = helpfulLabel(count);

  return (
    <div className="review-helpful">
      <button
        className="text-button"
        type="button"
        onClick={vote}
        disabled={marked || pending}
        aria-label={marked ? 'You marked this review helpful' : 'Mark this review helpful'}
      >
        <ThumbsUp size={14} aria-hidden="true" /> {marked ? 'Marked helpful' : 'Helpful'}
      </button>
      {label && <span className="muted">{label}</span>}
    </div>
  );
}

function ReviewForm({ productSlug }: { productSlug: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'error'; message?: string }>({
    type: 'idle'
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setStatus({ type: 'idle' });
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: productSlug,
          rating,
          authorName: data.get('authorName'),
          email: data.get('email'),
          title: data.get('title'),
          body: data.get('body'),
          website: data.get('website')
        })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'We could not save that review.');
      setStatus({ type: 'ok', message: result.message || 'Thank you — your review is awaiting approval.' });
      form.reset();
      setRating(5);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'We could not save that review.'
      });
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button className="btn outline" type="button" onClick={() => setOpen(true)}>
        Write a review
      </button>
    );
  }

  return (
    <form className="review-form form-card" onSubmit={submit}>
      <h3>Write a review</h3>
      {/*
        Radios, not toggle buttons. As `aria-pressed` buttons only the exact value
        reported pressed while every star up to it rendered filled, so what a
        screen reader announced contradicted what the page showed. Choosing one of
        five mutually exclusive values is what a radio group is, and it brings
        arrow-key selection with it.
      */}
      <fieldset className="rating-picker">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className={value <= rating ? 'on' : ''}>
            <input
              className="sr-only"
              type="radio"
              name="rating"
              value={value}
              checked={value === rating}
              onChange={() => setRating(value)}
            />
            <span className="sr-only">{`${value} ${value === 1 ? 'star' : 'stars'}`}</span>
            <Star size={22} aria-hidden="true" />
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="review-name">Your name</label>
          <input
            className="form-input"
            id="review-name"
            name="authorName"
            autoComplete="name"
            required
            maxLength={80}
          />
        </div>
        <div className="form-group">
          <label htmlFor="review-email">Email (not published)</label>
          <input
            className="form-input"
            id="review-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="form-group full">
          <label htmlFor="review-title">Headline</label>
          <input className="form-input" id="review-title" name="title" maxLength={120} />
        </div>
        <div className="form-group full">
          <label htmlFor="review-body">Your review</label>
          <textarea className="form-input" id="review-body" name="body" rows={4} required minLength={15} />
        </div>
      </div>
      <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="admin-actions">
        <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Sending…' : 'Submit review'}
        </button>
        <button className="text-button" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <FormStatus message={status.message} tone={status.type === 'ok' ? 'success' : 'error'} />
    </form>
  );
}

export default function ProductReviews({
  productSlug,
  productName,
  reviews,
  counts
}: {
  productSlug: string;
  productName: string;
  reviews: PublicReview[];
  /** Every approved review at each star, counted in SQL. */
  counts: RatingCounts;
}) {
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [visible, setVisible] = useState(REVIEW_VISIBLE_STEP);

  const count = totalReviews(counts);
  const average = averageRating(counts);
  const ordered = useMemo(() => sortReviews(reviews, sort), [reviews, sort]);
  const shown = ordered.slice(0, visible);
  const canSort = offersReviewSorting(reviews.length);

  return (
    <section className="product-details-section reviews-section" id="reviews">
      <div className="reviews-head">
        <div>
          <div className="eyebrow">Customer reviews</div>
          <h2>What people say about {productName}.</h2>
          {count > 0 ? (
            <p className="reviews-summary">
              <StarRow rating={average} size={18} label={`Average rating ${average.toFixed(1)} out of 5`} />
              <b>{average.toFixed(1)}</b> out of 5 · {count} {count === 1 ? 'review' : 'reviews'}
            </p>
          ) : (
            <p className="muted">No reviews yet — be the first to share how it settled in.</p>
          )}
        </div>
        <ReviewForm productSlug={productSlug} />
      </div>

      {count > 0 && (
        <div className="reviews-overview">
          <RatingBreakdown counts={counts} />
          {canSort && (
            <div className="reviews-sort">
              <label htmlFor="review-sort">Sort reviews</label>
              <select
                className="sort-select"
                id="review-sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value === 'helpful' ? 'helpful' : 'recent');
                  setVisible(REVIEW_VISIBLE_STEP);
                }}
              >
                <option value="recent">Most recent</option>
                <option value="helpful">Most helpful</option>
              </select>
            </div>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <ol className="review-list">
          {shown.map((review) => (
            <li className="review" key={review.id}>
              <div className="review-head">
                <StarRow rating={review.rating} label={`Rated ${review.rating} out of 5`} />
                <b>{review.authorName}</b>
                {review.verifiedPurchase && <span className="pill verified">Verified purchase</span>}
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC'
                  })}
                </time>
              </div>
              {review.title && <h3>{review.title}</h3>}
              <p>{review.body}</p>
              {review.ownerReply && (
                <div className="review-reply">
                  <b>The Hillside Gardens replied</b>
                  <p>{review.ownerReply}</p>
                </div>
              )}
              <HelpfulButton review={review} />
            </li>
          ))}
        </ol>
      )}

      {ordered.length > shown.length && (
        <div className="reviews-more">
          <button
            className="btn outline"
            type="button"
            onClick={() => setVisible((current) => current + REVIEW_VISIBLE_STEP)}
          >
            Show more reviews ({ordered.length - shown.length} left)
          </button>
        </div>
      )}
    </section>
  );
}
