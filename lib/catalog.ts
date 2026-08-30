import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { CATALOG_SHAPE_TTL_SECONDS } from './cache.ts';
import { db } from './db.ts';

/**
 * Both counts below are asked by the **root layout**, on every page the site
 * serves, to decide whether the header and footer should carry shop links at
 * all. That made them the two most-run queries in the application: a shopper
 * reading three care guides paid for six of them.
 *
 * So each is shared across requests for `CATALOG_SHAPE_TTL_SECONDS`. The
 * counting happens inside the cache and the failure handling outside it, which
 * is the important half of the arrangement: a thrown error is not stored, so a
 * momentary database blip costs one request rather than a full minute of a shop
 * that claims to have nothing for sale.
 */
const countsActiveProducts = unstable_cache(
  async () => (await db.product.count({ where: { active: true } })) > 0,
  ['catalog', 'has-active-products'],
  { revalidate: CATALOG_SHAPE_TTL_SECONDS }
);

const countsSellableProducts = unstable_cache(
  async () => (await db.product.count({ where: { active: true, inventory: { gt: 0 } } })) > 0,
  ['catalog', 'has-sellable-products'],
  { revalidate: CATALOG_SHAPE_TTL_SECONDS }
);

/**
 * The live shop currently has a catalog of archived rows and zero active
 * products. Several customer surfaces still talk as if something is for sale.
 * One count is enough to switch that copy.
 *
 * Fail closed: if the database cannot be read, do not advertise a shop.
 * `cache()` dedupes the count within a single request so layout + page + 404
 * do not each hit the database for the same answer.
 */
export const catalogHasActiveProducts = cache(async () => {
  try {
    return await countsActiveProducts();
  } catch {
    return false;
  }
});

/**
 * Whether anything is actually buyable today — active *and* on the bench.
 *
 * `catalogHasActiveProducts` answers a different question: whether the shop has
 * a catalog at all. The gift pages are built from in-stock rows only, so a shop
 * whose every listing has sold out has an empty gift guide while still having a
 * catalog. Advertising "Gifts" in the header to a page that then says nothing
 * is available is the one thing that condition exists to prevent.
 */
export const catalogHasSellableProducts = cache(async () => {
  try {
    return await countsSellableProducts();
  } catch {
    return false;
  }
});
