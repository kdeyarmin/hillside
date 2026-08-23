import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPriorityCards,
  EMPTY_PRIORITY_COUNTS,
  priorityTotal,
  prioritySummary
} from '../lib/admin-priorities.ts';

describe('buildPriorityCards', () => {
  it('leaves out everything that is at zero', () => {
    assert.deepEqual(buildPriorityCards(EMPTY_PRIORITY_COUNTS), []);
    assert.deepEqual(buildPriorityCards({}), []);
  });

  it('only reports the jobs that are actually waiting', () => {
    const cards = buildPriorityCards({ newMessages: 2, missingPhotos: 4 });
    assert.deepEqual(
      cards.map((card) => card.key),
      ['newMessages', 'missingPhotos']
    );
  });

  it('puts the customer-facing work first', () => {
    const cards = buildPriorityCards({
      missingPhotos: 9,
      incompleteProducts: 3,
      ordersToFulfil: 1,
      newMessages: 2,
      customPlanterRequests: 1
    });
    assert.deepEqual(
      cards.map((card) => card.key),
      [
        'ordersToFulfil',
        'customPlanterRequests',
        'newMessages',
        'missingPhotos',
        'incompleteProducts'
      ]
    );
    assert.equal(cards[0].tone, 'urgent');
    assert.equal(cards[3].tone, 'calm');
  });

  it('links each card at the list that does the job', () => {
    const cards = buildPriorityCards({ outOfStock: 2, pickupsToPrepare: 1, reviewsToApprove: 1 });
    const href = (key: string) => cards.find((card) => card.key === key)?.href;
    assert.equal(href('outOfStock'), '/admin?section=inventory&stock=out');
    assert.equal(href('pickupsToPrepare'), '/admin?section=orders&orders=pickup');
    assert.equal(href('reviewsToApprove'), '/admin?section=reviews');
  });

  it('says "order" for one and "orders" for more', () => {
    assert.equal(buildPriorityCards({ ordersToFulfil: 1 })[0].unit, 'order');
    assert.equal(buildPriorityCards({ ordersToFulfil: 2 })[0].unit, 'orders');
  });

  it('ignores a negative count as firmly as a zero', () => {
    assert.deepEqual(buildPriorityCards({ newMessages: -3 }), []);
  });
});

describe('priorityTotal and prioritySummary', () => {
  it('adds up the work on the board', () => {
    const cards = buildPriorityCards({ ordersToFulfil: 2, newMessages: 3 });
    assert.equal(priorityTotal(cards), 5);
  });

  it('says so plainly when there is nothing to do', () => {
    assert.equal(prioritySummary([]), 'Nothing is waiting on you. The shop is in good order.');
  });

  it('points at the most urgent thing first', () => {
    const cards = buildPriorityCards({ missingPhotos: 4, ordersToFulfil: 2 });
    assert.equal(prioritySummary(cards), 'Start with 2 orders — orders to pack.');
  });

  it('is gentler when nothing is urgent', () => {
    const cards = buildPriorityCards({ missingPhotos: 4 });
    assert.equal(prioritySummary(cards), '1 thing to pick up when you have a moment.');
  });
});
