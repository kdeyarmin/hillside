import { cache } from 'react';
import { db } from './db.ts';

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
    const count = await db.product.count({ where: { active: true } });
    return count > 0;
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
    const count = await db.product.count({ where: { active: true, inventory: { gt: 0 } } });
    return count > 0;
  } catch {
    return false;
  }
});
