-- Indexes for the queries that run on every checkout, every Stripe webhook and
-- every commerce page render. Postgres does not index a foreign key for you, so
-- each of these was a sequential scan that grew with the order history.
--
-- CONCURRENTLY is deliberately not used: Prisma wraps a migration in a
-- transaction, which CREATE INDEX CONCURRENTLY may not run inside. These tables
-- are small enough at this shop's volume that the brief lock is not worth
-- splitting the migration up to avoid.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClassRegistration_classEventId_idx" ON "ClassRegistration"("classEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GiftCardEntry_orderId_idx" ON "GiftCardEntry"("orderId");
