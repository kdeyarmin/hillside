import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus } from '@prisma/client';
import {
  nextFulfilledAt,
  refundedOrderStatus,
  shouldRestoreInventoryOnRefund
} from '../lib/orders.ts';

describe('refundedOrderStatus', () => {
  it('keeps an unshipped partial refund on the packing list', () => {
    assert.equal(
      refundedOrderStatus({ fullyRefunded: false, alreadyFulfilled: false }),
      OrderStatus.PARTIALLY_REFUNDED
    );
  });

  it('does not reopen a shipped order as awaiting shipment', () => {
    assert.equal(
      refundedOrderStatus({ fullyRefunded: false, alreadyFulfilled: true }),
      OrderStatus.FULFILLED
    );
  });

  it('marks a full refund as refunded either way', () => {
    assert.equal(
      refundedOrderStatus({ fullyRefunded: true, alreadyFulfilled: false }),
      OrderStatus.REFUNDED
    );
    assert.equal(
      refundedOrderStatus({ fullyRefunded: true, alreadyFulfilled: true }),
      OrderStatus.REFUNDED
    );
  });
});

describe('shouldRestoreInventoryOnRefund', () => {
  it('restocks only a full refund that never left the bench', () => {
    assert.equal(
      shouldRestoreInventoryOnRefund({ fullyRefunded: true, alreadyFulfilled: false }),
      true
    );
    assert.equal(
      shouldRestoreInventoryOnRefund({ fullyRefunded: true, alreadyFulfilled: true }),
      false
    );
    assert.equal(
      shouldRestoreInventoryOnRefund({ fullyRefunded: false, alreadyFulfilled: false }),
      false
    );
  });
});

describe('nextFulfilledAt', () => {
  const shipped = new Date('2026-04-01T12:00:00Z');

  it('stamps fulfillment the first time an order is marked shipped', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.PAID, fulfilledAt: null },
        OrderStatus.FULFILLED,
        now
      )?.toISOString(),
      now.toISOString()
    );
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.FULFILLED, fulfilledAt: shipped },
        OrderStatus.FULFILLED,
        now
      )?.toISOString(),
      shipped.toISOString()
    );
  });

  it('keeps the ship stamp through a refund', () => {
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.FULFILLED, fulfilledAt: shipped },
        OrderStatus.REFUNDED
      )?.toISOString(),
      shipped.toISOString()
    );
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.FULFILLED, fulfilledAt: shipped },
        OrderStatus.PARTIALLY_REFUNDED
      )?.toISOString(),
      shipped.toISOString()
    );
  });

  it('clears the stamp only when Tammy reopens a fulfilled order', () => {
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.FULFILLED, fulfilledAt: shipped }, OrderStatus.PAID),
      null
    );
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.PAID, fulfilledAt: null }, OrderStatus.CANCELLED),
      null
    );
  });
});
