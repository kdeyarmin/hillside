/**
 * Bundles — a set sold as one thing, built out of products that are already on
 * the bench.
 *
 * The rule the whole file exists to keep is that a bundle has **no stock of its
 * own**. Everything a shopper is told about availability is derived here from
 * the components, every time it is asked, so there is no second number to keep
 * in step and no way for the shop to advertise a set it cannot build. A
 * component running out takes its bundles off sale by arithmetic rather than by
 * anybody remembering to switch them off.
 *
 * Kept free of Prisma so `npm test` can cover the arithmetic that decides
 * whether a set is sellable.
 */

import { offersPickup, offersShipping } from './fulfillment.ts';
import {
  availableForSize,
  cartLineKey,
  normalizeSizeLabel,
  productSizes,
  sizeChoiceRejected,
  sizedName,
  sizedPriceCents,
  sizesTrackStock
} from './product-sizes.ts';
import { formatMoney } from './store.ts';

/** As many lines as a recipe may hold. A gift box is not a purchase order. */
export const MAX_BUNDLE_ITEMS = 12;
/** How many of one product a single set may contain. */
export const MAX_BUNDLE_ITEM_QUANTITY = 24;

export type BundleComponentProduct = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  priceCents: number;
  inventory: number;
  /** Raw `Product.sizes`. */
  sizes?: unknown;
  sizeLabel?: string | null;
  imageUrl?: string | null;
  type?: string;
  ships?: boolean | null;
  pickup?: boolean | null;
};

export type BundleComponent = {
  id?: string;
  /** How many of this product one set contains. */
  quantity: number;
  /** The variant the set calls for, or null when the product is sold one way. */
  size?: string | null;
  /** A garnish: listed, included when available, never a reason to stop selling. */
  optional?: boolean;
  note?: string | null;
  product: BundleComponentProduct;
};

export type BundleForSale = {
  slug: string;
  title: string;
  priceCents: number;
  active?: boolean;
  items: BundleComponent[];
};

/**
 * How many of this component are on the shelf for the exact variant the recipe
 * calls for.
 *
 * A product sold in sizes with no variant pinned answers zero rather than
 * falling back to its total. That is a recipe the shop cannot fill — nobody has
 * said whether the set contains the 2 oz tin or the 8 oz one — and quietly
 * picking a size for the shopper is how the wrong jar ends up in the box. The
 * bundle editor flags it; here it simply is not sellable.
 *
 * A pinned variant the owner has since retired answers zero for the same reason.
 */
export function componentUnitsAvailable(component: BundleComponent) {
  const { product } = component;
  if (!product.active) return 0;
  const sizes = productSizes(product.sizes, product.priceCents);
  if (sizeChoiceRejected(sizes, component.size)) return 0;
  return availableForSize(sizes, component.size, product.inventory);
}

/** How many complete sets this one component could supply on its own. */
export function componentSetsAvailable(component: BundleComponent) {
  const perSet = Math.max(1, Math.floor(component.quantity || 1));
  return Math.floor(componentUnitsAvailable(component) / perSet);
}

/**
 * Which count a recipe line draws on.
 *
 * Two lines of one product share a shelf whenever its sizes are not counted
 * separately — a gift box holding both the 2 oz and the 8 oz of one lotion is
 * two lines against one pile. Sizes the owner *did* count have their own key,
 * so those two lines are genuinely two shelves. Matches `shelfKey` in
 * `lib/checkout-format.ts`, which meters the same demand at checkout.
 */
export function productShelfKey(
  product: { slug: string; priceCents: number; sizes?: unknown },
  label: string | null | undefined
) {
  const sizes = productSizes(product.sizes, product.priceCents);
  return sizesTrackStock(sizes) ? cartLineKey(product.slug, label) : product.slug;
}

export function componentShelfKey(component: BundleComponent) {
  return productShelfKey(component.product, component.size);
}

/**
 * How many complete sets a group of recipe lines can supply between them.
 *
 * Grouped by shelf before dividing, which is the whole point: checked line by
 * line, a lotion with one jar on the pile answers "one set" to a recipe that
 * needs a 2 oz *and* an 8 oz of it, because each line sees the same single jar.
 * The set needs two, so the reservation then fails and the shopper is bounced
 * with a correction that says the same wrong number again.
 */
function setsFromShelves(items: BundleComponent[]) {
  if (!items.length) return Number.POSITIVE_INFINITY;
  const demand = new Map<string, { perSet: number; units: number }>();
  for (const item of items) {
    const key = componentShelfKey(item);
    const perSet = Math.max(1, Math.floor(item.quantity || 1));
    const existing = demand.get(key);
    demand.set(key, {
      perSet: (existing?.perSet ?? 0) + perSet,
      units: existing?.units ?? componentUnitsAvailable(item)
    });
  }
  return [...demand.values()].reduce(
    (fewest, shelf) => Math.min(fewest, Math.floor(shelf.units / shelf.perSet)),
    Number.POSITIVE_INFINITY
  );
}

export function requiredItems(bundle: BundleForSale) {
  return bundle.items.filter((item) => !item.optional);
}

/**
 * The lines that will actually be in the box for this many sets: everything
 * required, plus the extras the shelf can cover.
 *
 * One helper because three separate answers have to agree about it — what comes
 * off the shelf, what the receipt says is inside, and whether the box can ship.
 * When they disagreed, a sold-out pickup-only garnish made a fully shippable set
 * pickup-only, and Stripe's receipt promised an extra that was never packed.
 */
export function includedItems(bundle: BundleForSale, sets = 1) {
  const count = Math.max(1, Math.floor(sets || 1));
  return bundle.items.filter((item) => !item.optional || setsFromShelves([item]) >= count);
}

export function optionalItems(bundle: BundleForSale) {
  return bundle.items.filter((item) => Boolean(item.optional));
}

export type BundleAvailability = {
  /** Complete sets that can be built right now. */
  sets: number;
  /** Required components that cannot supply even one set. */
  blocking: BundleComponent[];
  /** Optional components with nothing on the shelf, so left out of the box. */
  missingOptional: BundleComponent[];
  /** Sized components with no variant pinned — a recipe nobody can fill. */
  unpinned: BundleComponent[];
};

/**
 * What the shop can honestly say about this set.
 *
 * `sets` is the fewest any required component can supply, which is the only
 * figure that is true of the set as a whole. A bundle with no required
 * components at all reports zero: a box of nothing but "while supplies last"
 * extras is a recipe that was never finished, and offering it would sell a
 * promise with nothing behind it.
 */
export function bundleAvailability(bundle: BundleForSale): BundleAvailability {
  const required = requiredItems(bundle);
  const blocking = required.filter((item) => componentSetsAvailable(item) <= 0);
  const missingOptional = optionalItems(bundle).filter((item) => componentSetsAvailable(item) <= 0);
  const unpinned = bundle.items.filter((item) => componentNeedsVariant(item));

  const sets = required.length === 0 ? 0 : setsFromShelves(required);

  return {
    sets: Number.isFinite(sets) ? Math.max(0, sets) : 0,
    blocking,
    missingOptional,
    unpinned
  };
}

/** A sized product on a recipe line that never said which size. */
export function componentNeedsVariant(component: BundleComponent) {
  const sizes = productSizes(component.product.sizes, component.product.priceCents);
  return sizes.length > 0 && !normalizeSizeLabel(component.size);
}

export function bundleIsBuyable(bundle: BundleForSale) {
  return bundle.active !== false && bundleAvailability(bundle).sets > 0;
}

/** What one line of the recipe would cost bought loose, at today's prices. */
export function componentValueCents(component: BundleComponent) {
  const sizes = productSizes(component.product.sizes, component.product.priceCents);
  const unit = sizedPriceCents(sizes, component.size, component.product.priceCents);
  return (unit ?? component.product.priceCents) * Math.max(1, Math.floor(component.quantity || 1));
}

/**
 * What the whole set would cost bought loose — the figure a "you save $12"
 * claim is measured against.
 *
 * Optional extras are left out of it deliberately. They may not be in the box,
 * and a saving quoted against something the customer might not receive is a
 * claim the shop cannot stand behind. Understating the saving is the safe
 * direction to be wrong in.
 */
export function bundleValueCents(bundle: BundleForSale) {
  return requiredItems(bundle).reduce((total, item) => total + componentValueCents(item), 0);
}

export function bundleSavingsCents(bundle: BundleForSale) {
  return Math.max(0, bundleValueCents(bundle) - Math.max(0, bundle.priceCents));
}

export function bundleSavingsPercent(bundle: BundleForSale) {
  const value = bundleValueCents(bundle);
  if (value <= 0) return 0;
  return Math.round((bundleSavingsCents(bundle) / value) * 100);
}

/**
 * Whether a set can ship or be picked up: only if every single thing in the box
 * can. One pickup-only planter makes the whole set pickup-only, which is the
 * truth about a box that contains it.
 *
 * An extra the shelf cannot cover is not in the box, so it does not get a vote —
 * a sold-out pickup-only garnish used to make an otherwise shippable set
 * pickup-only, and refuse shipping at checkout for a box it was never in.
 */
export function bundleFulfillment(bundle: BundleForSale, sets = 1) {
  const included = includedItems(bundle, sets);
  return {
    ships: included.every((item) => offersShipping(item.product)),
    pickup: included.every((item) => offersPickup(item.product))
  };
}

/**
 * "Hillside Calm Tea × 1 · Stainless infuser × 1" — for a card or a receipt.
 *
 * Lists what will be in the box, not what the recipe hopes for. Stripe puts this
 * straight into the line item's "Includes …" description, so an extra that was
 * never reserved must not appear in it: a receipt is a promise.
 */
export function bundleContentsLine(bundle: BundleForSale, sets = 1) {
  return includedItems(bundle, sets)
    .map(
      (item) =>
        `${sizedName(item.product.name, item.size)} × ${Math.max(1, Math.floor(item.quantity || 1))}`
    )
    .join(' · ');
}

export type BundleStockLine = {
  productId: string;
  name: string;
  size: string | null;
  /** The total for the order line: per-set quantity × sets bought. */
  quantity: number;
  /**
   * Carried through so the reservation knows which lines it may go without.
   * A required line that comes up short rolls the whole checkout back; an extra
   * that does is simply left out of the box.
   */
  optional?: boolean;
};

/**
 * What buying `sets` of this bundle takes off the shelf.
 *
 * Optional extras are included only when the shelf can cover every set being
 * bought. Half of a two-set order is not an outcome the packing slip can
 * describe, and it is the extras' whole nature that leaving one out is allowed.
 */
export function bundleStockLines(
  bundle: BundleForSale,
  sets: number
): { lines: BundleStockLine[]; skipped: BundleComponent[] } {
  const count = Math.max(1, Math.floor(sets || 1));
  const lines: BundleStockLine[] = [];
  const skipped: BundleComponent[] = [];

  const included = new Set(includedItems(bundle, count));
  for (const item of bundle.items) {
    const perSet = Math.max(1, Math.floor(item.quantity || 1));
    if (!included.has(item)) {
      skipped.push(item);
      continue;
    }
    lines.push({
      productId: item.product.id,
      name: item.product.name,
      size: normalizeSizeLabel(item.size) || null,
      quantity: perSet * count,
      ...(item.optional ? { optional: true } : {})
    });
  }

  return { lines, skipped };
}

/**
 * The stock lines a *basket* of bundles adds up to, folded per product and
 * variant.
 *
 * Two sets that both contain the same 4" pot draw on one shelf, so they have to
 * be metered as one line — checked separately, each would pass against a shelf
 * holding enough for only one of them.
 */
export function mergeStockLines(lines: BundleStockLine[]): BundleStockLine[] {
  const merged = new Map<string, BundleStockLine>();
  for (const line of lines) {
    const key = cartLineKey(line.productId, line.size);
    const existing = merged.get(key);
    merged.set(
      key,
      existing ? { ...existing, quantity: existing.quantity + line.quantity } : { ...line }
    );
  }
  return [...merged.values()];
}

/** "3 sets ready" / "Last set" / "Sold out" for a card or a detail page. */
export function bundleStockNote(sets: number) {
  if (sets <= 0) return 'Sold out';
  if (sets === 1) return 'Last set ready';
  if (sets <= 3) return `Only ${sets} sets left`;
  return `${sets} sets ready`;
}

/** "Save $12.00 (24%)", or null when the set is not priced below its parts. */
export function bundleSavingsNote(bundle: BundleForSale) {
  const saving = bundleSavingsCents(bundle);
  if (saving <= 0) return null;
  const percent = bundleSavingsPercent(bundle);
  return percent > 0 ? `Save ${formatMoney(saving)} (${percent}%)` : `Save ${formatMoney(saving)}`;
}
