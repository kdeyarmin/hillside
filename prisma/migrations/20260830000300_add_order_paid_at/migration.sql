-- When Stripe's money actually landed, kept for the life of the order.
--
-- The webhook has to tell a released inventory hold, which may legitimately be
-- completed late, from an admin's cancel of an order that was already paid,
-- which may not. Both land in CANCELLED, and the markers available before this
-- column did not cover every paid order: a session a Stripe-side promotion
-- brought to zero has no payment intent, and discountsSettledAt is written only
-- for an order carrying one of the shop's own codes.
--
-- Existing rows are backfilled from what is already known about them, so orders
-- taken before this column existed are not mistaken for unpaid holds. The
-- webhook keeps reading the older markers as a fallback regardless.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Backfill: anything that reached a paid state, or carries a trace of payment.
UPDATE "Order"
   SET "paidAt" = COALESCE("fulfilledAt", "discountsSettledAt", "updatedAt")
 WHERE "paidAt" IS NULL
   AND ("status" IN ('PAID', 'FULFILLED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        OR "paymentIntentId" IS NOT NULL
        OR "discountsSettledAt" IS NOT NULL
        OR "fulfilledAt" IS NOT NULL);
