-- Rate-limit counters, shared by every instance of the app.
--
-- One row per (limit, caller) window rather than one per request: the counter is
-- bumped by a single conditional upsert, so a limit costs one round trip and the
-- table stays roughly as large as the number of distinct callers inside the
-- longest window. Expired rows are reused in place; the sweep in lib/rate-limit
-- only stops the table growing a permanent entry per caller the shop has seen.

-- CreateTable
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimitCounter_resetAt_idx" ON "RateLimitCounter"("resetAt");
