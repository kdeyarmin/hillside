/**
 * Loading bundles from the database with everything the availability maths in
 * `lib/bundles.ts` needs.
 *
 * Whether a set is sellable cannot be asked in SQL — it is the minimum over its
 * components of "how many sets could this one supply", and per-size counts live
 * in a JSON column — so every query here loads the recipe with its products and
 * then filters in memory. The recipes are short and there are only ever a
 * handful of sets, so the cost is a rounding error against being unable to
 * advertise a set the shop cannot build.
 */

import { cache } from 'react';
import { Prisma } from '@prisma/client';
import {
  bundleAvailability,
  bundleContentsLine,
  bundleFulfillment,
  bundleIsBuyable,
  bundleSavingsCents,
  bundleSavingsNote,
  bundleValueCents,
  type BundleForSale
} from '@/lib/bundles';
import { db } from '@/lib/db';

/** Everything the storefront needs to price, picture and cost out a set. */
export const bundleSaleInclude = {
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          active: true,
          type: true,
          priceCents: true,
          inventory: true,
          sizes: true,
          sizeLabel: true,
          imageUrl: true,
          shortDescription: true,
          ships: true,
          pickup: true
        }
      }
    }
  }
} satisfies Prisma.BundleInclude;

/**
 * A loaded bundle. It satisfies `BundleForSale`, which is what lets the pure
 * availability helpers work directly on a Prisma row.
 */
export type BundleWithItems = Prisma.BundleGetPayload<{ include: typeof bundleSaleInclude }> &
  BundleForSale;

const publicOrder = [
  { sortOrder: 'asc' },
  { title: 'asc' }
] satisfies Prisma.BundleOrderByWithRelationInput[];

/**
 * Active bundles the shop can actually build right now, most prominent first.
 * A set whose component ran out simply is not in the list — which is the whole
 * point of deriving availability rather than storing it.
 */
export async function sellableBundles(options: { featured?: boolean; take?: number } = {}) {
  const bundles = await db.bundle.findMany({
    where: { active: true, ...(options.featured ? { featured: true } : {}) },
    orderBy: [{ featured: 'desc' }, ...publicOrder],
    include: bundleSaleInclude
  });
  const buyable = bundles.filter((bundle) => bundleIsBuyable(bundle));
  return options.take ? buyable.slice(0, options.take) : buyable;
}

/**
 * Whether the header should carry a Sets link at all. Deliberately asks the same
 * "can we actually build it" question the page does, so the navigation can never
 * point at an empty shelf — and fails closed, because advertising sets the shop
 * cannot supply is worse than not advertising them.
 *
 * `cache()` dedupes it within a request the way `catalogHasActiveProducts` does,
 * so the layout, the page and the footer share one read.
 */
export const hasSellableBundles = cache(async () => {
  try {
    return (await sellableBundles({ take: 1 })).length > 0;
  } catch {
    return false;
  }
});

/** Sellable sets that contain a given product — the "buy it as a set" nudge. */
export async function sellableBundlesContaining(productId: string, take = 3) {
  const bundles = await db.bundle.findMany({
    where: { active: true, items: { some: { productId } } },
    orderBy: [{ featured: 'desc' }, ...publicOrder],
    include: bundleSaleInclude
  });
  return bundles.filter((bundle) => bundleIsBuyable(bundle)).slice(0, take);
}

/** Sellable sets built around any of these products — for a care guide's CTA. */
export async function sellableBundlesWithAnyProduct(productIds: string[], take = 2) {
  if (!productIds.length) return [];
  const bundles = await db.bundle.findMany({
    where: { active: true, items: { some: { productId: { in: productIds } } } },
    orderBy: [{ featured: 'desc' }, ...publicOrder],
    include: bundleSaleInclude
  });
  return bundles.filter((bundle) => bundleIsBuyable(bundle)).slice(0, take);
}

/**
 * Every bundle whose slug is in the basket, **including archived ones**, and
 * whether or not it can currently be built.
 *
 * Deliberately unfiltered: the caller restoring a saved cart has to tell "this
 * set is archived" apart from "this slug was never a set", and a query that
 * filtered on `active` would hand it the same empty answer for both.
 */
export async function bundlesBySlug(slugs: string[]) {
  if (!slugs.length) return [];
  return db.bundle.findMany({
    where: { slug: { in: slugs } },
    include: bundleSaleInclude
  });
}

export async function bundlesById(ids: string[]) {
  if (!ids.length) return [];
  return db.bundle.findMany({ where: { id: { in: ids } }, include: bundleSaleInclude });
}

/** How many sets of each of these bundles can be built, keyed by bundle id. */
export function availabilityById(bundles: BundleWithItems[]) {
  return new Map(bundles.map((bundle) => [bundle.id, bundleAvailability(bundle)]));
}

/**
 * A set flattened into something a client component can hold: the derived
 * figures already worked out, so nothing on the browser side has to know how
 * availability is calculated — or be able to get it wrong.
 */
export type BundleCardData = {
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  imageUrl: string | null;
  badge: string | null;
  priceCents: number;
  valueCents: number;
  savingsCents: number;
  savingsNote: string | null;
  /** Complete sets on the bench right now. Never stored, always derived. */
  sets: number;
  contents: string;
  ships: boolean;
  pickup: boolean;
  items: Array<{
    slug: string;
    name: string;
    size: string | null;
    quantity: number;
    optional: boolean;
    note: string | null;
    imageUrl: string | null;
    type: string;
    /** Whether this line is what is currently holding the set back. */
    short: boolean;
  }>;
};

export function bundleCardData(bundle: BundleWithItems): BundleCardData {
  const availability = bundleAvailability(bundle);
  const short = new Set(
    [...availability.blocking, ...availability.missingOptional, ...availability.unpinned].map(
      (item) => item.product.id
    )
  );
  const fulfillment = bundleFulfillment(bundle);
  return {
    slug: bundle.slug,
    title: bundle.title,
    tagline: bundle.tagline,
    description: bundle.description,
    imageUrl: bundle.imageUrl,
    badge: bundle.badge,
    priceCents: bundle.priceCents,
    valueCents: bundleValueCents(bundle),
    savingsCents: bundleSavingsCents(bundle),
    savingsNote: bundleSavingsNote(bundle),
    sets: availability.sets,
    contents: bundleContentsLine(bundle),
    ships: fulfillment.ships,
    pickup: fulfillment.pickup,
    items: bundle.items.map((item) => ({
      slug: item.product.slug,
      name: item.product.name,
      size: item.size,
      quantity: item.quantity,
      optional: item.optional,
      note: item.note,
      imageUrl: item.product.imageUrl,
      type: item.product.type,
      short: short.has(item.product.id)
    }))
  };
}
