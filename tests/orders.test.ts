import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus } from '@prisma/client';
import {
  isAwaitingShipment,
  nextFulfilledAt,
  refundedOrderStatus,
  shouldRestoreInventoryOnRefund
} from '../lib/orders.ts';

describe('refundedOrderStatus', () => {
  it('records every partial refund as partially refunded', () => {
    assert.equal(refundedOrderStatus({ fullyRefunded: false }), OrderStatus.PARTIALLY_REFUNDED);
  });

  it('marks a full refund as refunded', () => {
    assert.equal(refundedOrderStatus({ fullyRefunded: true }), OrderStatus.REFUNDED);
  });
});

describe('isAwaitingShipment', () => {
  it('treats an unshipped partial refund as still to send', () => {
    assert.equal(isAwaitingShipment(OrderStatus.PARTIALLY_REFUNDED, null), true);
    assert.equal(isAwaitingShipment(OrderStatus.PAID, null), true);
  });

  it('keeps a shipped partial refund off the packing list', () => {
    assert.equal(isAwaitingShipment(OrderStatus.PARTIALLY_REFUNDED, new Date()), false);
    assert.equal(isAwaitingShipment(OrderStatus.PAID, new Date()), false);
    assert.equal(isAwaitingShipment(OrderStatus.FULFILLED, new Date()), false);
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

  it('clears the stamp when Tammy reopens a shipped or refunded-after-ship order', () => {
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.FULFILLED, fulfilledAt: shipped }, OrderStatus.PAID),
      null
    );
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.REFUNDED, fulfilledAt: shipped }, OrderStatus.PAID),
      null
    );
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.REFUNDED, fulfilledAt: shipped }, OrderStatus.PENDING),
      null
    );
    assert.equal(
      nextFulfilledAt({ status: OrderStatus.PAID, fulfilledAt: null }, OrderStatus.CANCELLED),
      null
    );
  });

  it('keeps the stamp when cancelling a shipped or refunded-after-ship order', () => {
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.FULFILLED, fulfilledAt: shipped },
        OrderStatus.CANCELLED
      )?.toISOString(),
      shipped.toISOString()
    );
    assert.equal(
      nextFulfilledAt(
        { status: OrderStatus.REFUNDED, fulfilledAt: shipped },
        OrderStatus.CANCELLED
      )?.toISOString(),
      shipped.toISOString()
    );
  });
});
