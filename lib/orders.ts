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
 * Use this for anything that answers "what do we still have to send?", so the two
 * states cannot drift apart again.
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

export function isAwaitingShipment(status: OrderStatus) {
  return (AWAITING_SHIPMENT_STATUSES as readonly OrderStatus[]).includes(status);
}

/**
 * Status to store after a Stripe (or dashboard) refund.
 *
 * A partial refund of an unshipped order must stay `PARTIALLY_REFUNDED` so it
 * remains on the packing list — that is why `AWAITING_SHIPMENT_STATUSES`
 * exists. The same partial refund on an already-shipped order must *not* move
 * it there: Tammy would see a fulfilled plant as "needs shipping" again, and
 * the customer status page would claim we were still preparing it.
 *
 * A full refund always becomes `REFUNDED`. Whether stock comes back is a
 * separate question (`shouldRestoreInventoryOnRefund`).
 */
export function refundedOrderStatus(args: {
  fullyRefunded: boolean;
  alreadyFulfilled: boolean;
}): OrderStatus {
  if (args.fullyRefunded) return OrderStatus.REFUNDED;
  if (args.alreadyFulfilled) return OrderStatus.FULFILLED;
  return OrderStatus.PARTIALLY_REFUNDED;
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
 * list. Clearing it is reserved for an explicit un-fulfill (back to paid,
 * pending, or cancelled) — Tammy putting a mis-clicked "shipped" back on
 * the bench.
 */
export function nextFulfilledAt(
  previous: { status: OrderStatus; fulfilledAt: Date | null },
  nextStatus: OrderStatus,
  now = new Date()
): Date | null {
  if (nextStatus === OrderStatus.FULFILLED) return previous.fulfilledAt || now;
  if (
    previous.status === OrderStatus.FULFILLED &&
    (nextStatus === OrderStatus.PAID ||
      nextStatus === OrderStatus.PENDING ||
      nextStatus === OrderStatus.CANCELLED)
  ) {
    return null;
  }
  return previous.fulfilledAt;
}
