'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  ownerReply: string | null;
  createdAt: string;
};

function StarRow({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <span className="rating-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          size={size}
          key={step}
          className={step <= Math.round(rating) ? 'star on' : 'star'}
        />
      ))}
    </span>
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
      <fieldset className="rating-picker">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            key={value}
            className={value <= rating ? 'on' : ''}
            aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
            aria-pressed={value === rating}
            onClick={() => setRating(value)}
          >
            <Star size={22} />
          </button>
        ))}
      </fieldset>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="review-name">Your name</label>
          <input className="form-input" id="review-name" name="authorName" required maxLength={80} />
        </div>
        <div className="form-group">
          <label htmlFor="review-email">Email (not published)</label>
          <input className="form-input" id="review-email" name="email" type="email" required />
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
      {status.message && (
        <p className={`form-status ${status.type === 'ok' ? 'success' : 'error'}`} role="status">
          {status.message}
        </p>
      )}
    </form>
  );
}

export default function ProductReviews({
  productSlug,
  productName,
  reviews,
  average,
  count
}: {
  productSlug: string;
  productName: string;
  reviews: PublicReview[];
  average: number;
  count: number;
}) {
  return (
    <section className="product-details-section reviews-section" id="reviews">
      <div className="reviews-head">
        <div>
          <div className="eyebrow">Customer reviews</div>
          <h2>What people say about {productName}.</h2>
          {count > 0 ? (
            <p className="reviews-summary">
              <StarRow rating={average} size={18} />
              <b>{average.toFixed(1)}</b> out of 5 · {count} {count === 1 ? 'review' : 'reviews'}
            </p>
          ) : (
            <p className="muted">No reviews yet — be the first to share how it settled in.</p>
          )}
        </div>
        <ReviewForm productSlug={productSlug} />
      </div>

      {reviews.length > 0 && (
        <ol className="review-list">
          {reviews.map((review) => (
            <li className="review" key={review.id}>
              <div className="review-head">
                <StarRow rating={review.rating} />
                <b>{review.authorName}</b>
                {review.verifiedPurchase && <span className="pill">Verified purchase</span>}
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
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
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
