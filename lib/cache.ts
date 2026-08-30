/**
 * How long the shop is allowed to be wrong about something, per kind of answer.
 *
 * Every page here renders dynamically and always will: the build runs before
 * `prisma migrate deploy` on Railway, so there is no database to prerender
 * against, and `force-dynamic` in the root layout is what stops the build asking
 * for one (see "Why the database-backed pages are `force-dynamic`" in the
 * README). What that decision does *not* require is that every render redo every
 * query — a shopper opening three product pages was paying for the same
 * best-seller scan three times.
 *
 * `unstable_cache` is the missing half: rendering stays dynamic, while the reads
 * underneath it are shared across requests for a stated number of seconds. The
 * numbers below are chosen per answer, from how wrong it can afford to be:
 *
 * - **Stock and prices are never cached.** A shopper must see the shelf as it
 *   is, and checkout re-resolves both from the database at the moment of sale.
 * - The figures here are *merchandising* — which things are selling, whether the
 *   catalog has anything in it at all, what the sitemap lists. Being a few
 *   minutes stale costs nothing a customer can see.
 *
 * `unstable_cache` serializes what it stores, so a cached function must return
 * plain JSON: no `Map`, no `Set`, and a `Date` comes back as a string. Build the
 * richer shape outside the cache, from the plain rows inside it.
 */

/**
 * Best-seller counts. A badge appearing a quarter of an hour after the order
 * that earned it is not a defect; re-counting the order history on every product
 * page view is.
 */
export const SALES_STATS_TTL_SECONDS = 15 * 60;

/**
 * "Does the shop have anything to sell?" — three booleans the root layout asks
 * on every single page load to decide whether to render the shop links at all.
 * Kept short because the answer flipping is what an owner sees right after
 * publishing her first product.
 */
export const CATALOG_SHAPE_TTL_SECONDS = 60;

/** The sitemap. Crawlers refetch it often and nothing in it is time-critical. */
export const SITEMAP_TTL_SECONDS = 60 * 60;
