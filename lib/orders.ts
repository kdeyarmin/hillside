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
