-- Let the rate limits slide instead of resetting at a boundary.
--
-- A fixed window forgets its whole count the moment it rolls, which lets twice
-- the limit through either side of that instant. Measured on the admin login
-- before this change: eight attempts at the end of one window and eight more at
-- the start of the next — sixteen password guesses inside a span shorter than
-- the fifteen minutes that were meant to allow eight.
--
-- Holding the previous window's count lets the limiter weight it by how much of
-- that window is still in view, which also makes the checkout-hold limit track
-- reservations that are genuinely still open rather than forgetting the ones
-- made just before the boundary.
--
-- Existing rows default to 0, which reads as "the window before this one was
-- empty" — the correct starting assumption, and it simply makes the first
-- window after deploy behave as the old fixed one did.

-- AlterTable
ALTER TABLE "RateLimitCounter" ADD COLUMN IF NOT EXISTS "prevCount" INTEGER NOT NULL DEFAULT 0;
