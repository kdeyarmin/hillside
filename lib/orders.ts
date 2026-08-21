import { OrderStatus } from '@prisma/client';

/**
 * Orders that are paid for and still owe the customer a parcel.
 *
 * `PARTIALLY_REFUNDED` belongs here, and that is the whole reason this constant
 * exists. Before partial refunds were modelled, any refund at all moved an order
 * to `REFUNDED`, so every shipping query could simply ask for `PAID`. Now a
 * goodwill refund of the shipping charge on an order whose plant has not left the
 * bench leaves it `PARTIALLY_REFUNDED` — still entirely shippable. A query that
 * asks only for `PAID` drops it out of the packing list and the awaiting-shipment
 * count, and nothing anywhere would say it had gone missing.
 *
 * The same status is also used after a partial refund of an already-shipped
 * order, so customers can still see that money came back. Those rows keep
 * `fulfilledAt` set. Anything that answers "what do we still have to send?"
 * must therefore also require `fulfilledAt: null` — status alone is not enough.
 */
export const AWAITING_SHIPMENT_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PARTIALLY_REFUNDED
] as const;

/** Orders whose money counts toward revenue, net of anything refunded. */
export const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
  OrderStatus.PARTIALLY_REFUNDED
] as const;

export function isAwaitingShipment(status: OrderStatus, fulfilledAt: Date | string | null) {
  if (fulfilledAt) return false;
  return (AWAITING_SHIPMENT_STATUSES as readonly OrderStatus[]).includes(status);
}

/**
 * Status to store after a Stripe (or dashboard) refund.
 *
 * Partial refunds always stay `PARTIALLY_REFUNDED` so the customer status page
 * can show that money came back. Unshipped ones remain on the packing list
 * because `isAwaitingShipment` also requires `fulfilledAt` to be empty.
 * Shipped ones keep their ship stamp and stay off that list.
 *
 * A full refund always becomes `REFUNDED`. Whether stock comes back is a
 * separate question (`shouldRestoreInventoryOnRefund`).
 */
export function refundedOrderStatus(args: { fullyRefunded: boolean }): OrderStatus {
  return args.fullyRefunded ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED;
}

/**
 * A full refund of a plant that never left the bench returns it to the shelf.
 * A refund after ship or pickup does not: the piece is gone, and incrementing
 * inventory would list it as sellable again.
 */
export function shouldRestoreInventoryOnRefund(args: {
  fullyRefunded: boolean;
  alreadyFulfilled: boolean;
}) {
  return args.fullyRefunded && !args.alreadyFulfilled;
}

/**
 * `fulfilledAt` is the ship/pickup stamp, not a mirror of the status enum.
 * Refunds must keep it so a later partial refund cannot reopen the packing
 * list. Clearing it is reserved for an explicit un-fulfill back to paid or
 * pending — Tammy putting a mis-clicked "shipped" back on the bench.
 * Cancelling a shipped (or refunded-after-ship) order must keep the stamp so
 * a retry cannot restock a plant that already left.
 */
export function nextFulfilledAt(
  previous: { status: OrderStatus; fulfilledAt: Date | null },
  nextStatus: OrderStatus,
  now = new Date()
): Date | null {
  if (nextStatus === OrderStatus.FULFILLED) return previous.fulfilledAt || now;
  if (
    previous.fulfilledAt &&
    (nextStatus === OrderStatus.PAID || nextStatus === OrderStatus.PENDING)
  ) {
    return null;
  }
  return previous.fulfilledAt;
}
