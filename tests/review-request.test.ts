import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isReviewRequestDue,
  REVIEW_REQUEST_DELAY_DAYS,
  REVIEW_REQUEST_MAX_AGE_DAYS,
  reviewRequestDueBefore,
  reviewRequestHtml,
  reviewRequestProducts,
  reviewRequestSubject,
  reviewRequestTooOldBefore
} from '../lib/review-request.ts';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const order = (overrides: Record<string, unknown> = {}) => ({
  status: 'FULFILLED',
  email: 'sam@example.com',
  fulfilledAt: daysAgo(REVIEW_REQUEST_DELAY_DAYS + 1),
  reviewRequestSentAt: null,
  items: [{ productId: 'p1' }],
  ...overrides
});

describe('the review-request window', () => {
  it('waits the delay before asking', () => {
    assert.equal(isReviewRequestDue(order(), NOW), true);
    assert.equal(
      isReviewRequestDue(order({ fulfilledAt: daysAgo(REVIEW_REQUEST_DELAY_DAYS - 1) }), NOW),
      false
    );
  });

  it('stops asking about old orders', () => {
    assert.equal(
      isReviewRequestDue(order({ fulfilledAt: daysAgo(REVIEW_REQUEST_MAX_AGE_DAYS + 1) }), NOW),
      false
    );
    assert.equal(
      isReviewRequestDue(order({ fulfilledAt: daysAgo(REVIEW_REQUEST_MAX_AGE_DAYS - 1) }), NOW),
      true
    );
  });

  it('puts the two boundaries the right way round', () => {
    assert.ok(reviewRequestTooOldBefore(NOW) < reviewRequestDueBefore(NOW));
    assert.ok(reviewRequestDueBefore(NOW) < NOW);
  });
});

describe('isReviewRequestDue', () => {
  it('never asks the same order twice', () => {
    assert.equal(isReviewRequestDue(order({ reviewRequestSentAt: daysAgo(1) }), NOW), false);
  });

  it('only asks about an order that was actually fulfilled', () => {
    assert.equal(isReviewRequestDue(order({ status: 'PAID' }), NOW), false);
    assert.equal(isReviewRequestDue(order({ status: 'REFUNDED' }), NOW), false);
    assert.equal(isReviewRequestDue(order({ status: 'CANCELLED' }), NOW), false);
    assert.equal(isReviewRequestDue(order({ fulfilledAt: null }), NOW), false);
  });

  it('needs somewhere to write to and something to review', () => {
    assert.equal(isReviewRequestDue(order({ email: '' }), NOW), false);
    assert.equal(isReviewRequestDue(order({ email: null }), NOW), false);
    assert.equal(isReviewRequestDue(order({ items: [] }), NOW), false);
  });
});

describe('the letter', () => {
  const withItems = {
    invoiceNumber: 'HG-ABC123',
    customerName: 'Sam Rivera',
    items: [
      {
        name: 'Monstera Deliciosa',
        size: '6" pot',
        product: { slug: 'monstera', name: 'Monstera Deliciosa' }
      },
      {
        name: 'Monstera Deliciosa',
        size: '4" pot',
        product: { slug: 'monstera', name: 'Monstera Deliciosa' }
      },
      {
        name: 'Hillside Calm Tea',
        size: null,
        product: { slug: 'calm-tea', name: 'Hillside Calm Tea' }
      }
    ]
  };

  it('asks about each product once, however many lines it bought', () => {
    assert.deepEqual(
      reviewRequestProducts(withItems).map((product) => product.slug),
      ['monstera', 'calm-tea']
    );
  });

  it('names the product in the subject when there is only one', () => {
    const single = { ...withItems, items: [withItems.items[2]] };
    assert.equal(reviewRequestSubject(single), 'How is your Hillside Calm Tea settling in?');
    assert.equal(reviewRequestSubject(withItems), 'How is your Hillside order settling in?');
  });

  it('links every product it bought and says it will not write again', () => {
    const html = reviewRequestHtml(withItems);
    assert.match(html, /\/shop\/monstera#reviews/);
    assert.match(html, /\/shop\/calm-tea#reviews/);
    assert.match(html, /HG-ABC123/);
    assert.match(html, /only note we will send about this order/);
    // No newsletter unsubscribe: this is not newsletter mail.
    assert.doesNotMatch(html, /Unsubscribe from The Hillside Notes/);
  });

  it('escapes what the customer typed', () => {
    const nasty = {
      invoiceNumber: 'HG-1',
      customerName: '<script>alert(1)</script>',
      items: [{ name: 'Plant & Pot', size: null, product: { slug: 'p', name: 'Plant & Pot' } }]
    };
    const html = reviewRequestHtml(nasty);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /Plant &amp; Pot/);
  });
});
