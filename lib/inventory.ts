/**
 * The stock questions the owner dashboard asks, kept free of Prisma and Next so
 * `npm test` can cover them.
 *
 * There is deliberately no money in this file. Reorder points, suppliers and
 * restock dates are what Tammy needs at the potting bench; unit cost, margin and
 * inventory valuation are bookkeeping, and putting them in the same form would
 * turn a two-minute restock into an accounting exercise.
 *
 * Everything here reads `Product.inventory` as the product's total, which is the
 * one thing the size list is kept in step with (see lib/product-sizes.ts). Only
 * the low-stock question looks *inside* the sizes, because that is the only one
 * whose answer differs per size: a reorder is placed for the product.
 */

import { readStoredSizes, storedSizesTrackStock } from './product-sizes.ts';

/** Mirrors the `InventoryStatus` enum without importing the generated client. */
export type InventoryStatusValue =
  'STOCKED' | 'ON_ORDER' | 'MADE_TO_ORDER' | 'SEASONAL' | 'DISCONTINUED';

export type InventoryProduct = {
  active: boolean;
  inventory: number;
  /** Raw `Product.sizes`; only the per-size counts are read from it. */
  sizes?: unknown;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  inventoryStatus?: InventoryStatusValue | null;
  lastRestockedAt?: Date | string | null;
  supplier?: string | null;
  sku?: string | null;
};

/** Where "Only 3 left" starts, on the shop card and on the dashboard chip. */
export const LOW_STOCK_AT = 3;

/** How recent "recently restocked" is. Two weeks of the owner's own history. */
export const RECENTLY_RESTOCKED_DAYS = 14;

export const INVENTORY_STATUS_LABELS: Record<InventoryStatusValue, string> = {
  STOCKED: 'Stocked',
  ON_ORDER: 'On order',
  MADE_TO_ORDER: 'Made to order',
  SEASONAL: 'Seasonal',
  DISCONTINUED: 'Discontinued'
};

export const INVENTORY_STATUS_HINTS: Record<InventoryStatusValue, string> = {
  STOCKED: 'Counted on the bench and reordered when it runs down.',
  ON_ORDER: 'Already reordered — it stays off the reorder list until it lands.',
  MADE_TO_ORDER:
    'Made after someone orders it, so it is never chased for a restock. The shop still sells from the quantity on hand — keep one there for anything you are ready to make.',
  SEASONAL: 'Comes back in its season rather than being reordered now.',
  DISCONTINUED: 'Not coming back. Sell through what is left, then archive it.'
};

export function inventoryStatusValue(value: unknown): InventoryStatusValue {
  const key = String(value ?? '').toUpperCase();
  return key in INVENTORY_STATUS_LABELS ? (key as InventoryStatusValue) : 'STOCKED';
}

export function inventoryStatusLabel(value: unknown) {
  return INVENTORY_STATUS_LABELS[inventoryStatusValue(value)];
}

/** The product total, floored at zero — the number every count question uses. */
export function onHand(product: Pick<InventoryProduct, 'inventory'>) {
  return Math.max(0, Math.floor(product.inventory || 0));
}

/**
 * Statuses that describe a product nobody is going to reorder. A made-to-order
 * lotion has nothing on the shelf by design, a discontinued one is being sold
 * through, and a seasonal one comes back when its season does — none of the
 * three belongs on a list of things to buy this week.
 */
const NOT_REORDERED: InventoryStatusValue[] = ['MADE_TO_ORDER', 'SEASONAL', 'DISCONTINUED'];

function reordered(product: InventoryProduct) {
  return !NOT_REORDERED.includes(inventoryStatusValue(product.inventoryStatus));
}

/** The plain fact, whatever the status says about it. */
export function isOutOfStock(product: Pick<InventoryProduct, 'inventory'>) {
  return onHand(product) <= 0;
}

/**
 * Out of stock *and* worth Tammy's attention: listed in the shop, and not a
 * product that is made when someone orders it, which never has a count to run
 * down. A discontinued product that has sold out is still on this list — it is
 * how she remembers to archive it.
 */
export function needsRestocking(product: InventoryProduct) {
  if (!product.active) return false;
  if (inventoryStatusValue(product.inventoryStatus) === 'MADE_TO_ORDER') return false;
  return isOutOfStock(product);
}

/**
 * What the Low stock chip counts. On a product counted per size that is any one
 * size running down, not the total: a plant with nine on the bench and none of
 * them in 6" pots has a size to pot up, and the total alone would keep it off
 * the list Tammy works from until the 4" ones ran out too.
 *
 * A product that is *entirely* sold out is not "running low" — it has run out,
 * which is a different chip, a different card on the Today board and a different
 * job. Counting it as both put one listing on the dashboard twice and inflated
 * the day's work.
 */
export function productIsLowStock(product: InventoryProduct) {
  if (!product.active) return false;
  if (onHand(product) <= 0) return false;
  const stored = readStoredSizes(product.sizes);
  if (storedSizesTrackStock(stored)) {
    return stored.some((size) => (size.inventory ?? 0) <= LOW_STOCK_AT);
  }
  return onHand(product) <= LOW_STOCK_AT;
}

export function hasReorderPoint(product: InventoryProduct) {
  return typeof product.reorderPoint === 'number' && product.reorderPoint >= 0;
}

/**
 * Down to the level the owner said to reorder at.
 *
 * Marking something ON_ORDER takes it off this list, which is the point: the
 * reorder has been placed, and a count that keeps insisting otherwise is a count
 * she learns to ignore.
 */
export function needsReorder(product: InventoryProduct) {
  if (!product.active || !hasReorderPoint(product)) return false;
  if (!reordered(product)) return false;
  if (inventoryStatusValue(product.inventoryStatus) === 'ON_ORDER') return false;
  return onHand(product) <= (product.reorderPoint as number);
}

/**
 * A product that could have a reorder point and does not. Restricted to what is
 * actually in the shop and actually reordered, so the chip counts work to do
 * rather than a permanent backlog of things that will never have one.
 */
export function missingReorderPoint(product: InventoryProduct) {
  if (!product.active || !reordered(product)) return false;
  return !hasReorderPoint(product);
}

/**
 * How many to put on the order. The stated reorder quantity when there is one,
 * otherwise enough to get back above the reorder point — never zero, because a
 * suggestion of "order none" is not a suggestion.
 */
export function reorderSuggestion(product: InventoryProduct) {
  if (typeof product.reorderQuantity === 'number' && product.reorderQuantity > 0) {
    return Math.floor(product.reorderQuantity);
  }
  if (!hasReorderPoint(product)) return null;
  return Math.max(1, Math.floor((product.reorderPoint as number) + 1 - onHand(product)));
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The shop's calendar day for an instant, as `YYYY-MM-DD`.
 *
 * Built from the *local* date parts, not `toISOString()`. `instrumentation.ts`
 * pins `TZ` to America/New_York, so local is the shop's own clock — and UTC is
 * not: a delivery counted in at nine on a summer evening is already tomorrow in
 * UTC, so the date box would show Tammy a restock dated the day after the box
 * arrived, and "Restocked today" would read "yesterday" all evening.
 */
function shopDay(value: Date | null) {
  if (!value) return null;
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Midnight on the shop's clock, for counting whole days between two dates. */
function shopMidnight(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * Whole calendar days, not 24-hour blocks. A box counted in yesterday evening
 * and looked at this morning is "yesterday", which is what a person means;
 * dividing the elapsed milliseconds would call it "today" until the same hour
 * came round again.
 */
export function daysSinceRestock(product: InventoryProduct, now = new Date()) {
  const restocked = asDate(product.lastRestockedAt);
  if (!restocked) return null;
  return Math.round((shopMidnight(now) - shopMidnight(restocked)) / 86_400_000);
}

/**
 * A date typed into a `type="date"` box, read on the shop's clock.
 *
 * `new Date('2026-08-22')` is UTC midnight — which in Eastern time is the
 * evening of the 21st, so a date the owner typed would compare and store as the
 * day before. Appending a time makes it local midnight, the day she meant.
 */
export function parseRestockDate(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function recentlyRestocked(
  product: InventoryProduct,
  now = new Date(),
  withinDays = RECENTLY_RESTOCKED_DAYS
) {
  const days = daysSinceRestock(product, now);
  // A date in the future is a typo, not a restock that has not happened yet, so
  // it counts as recent rather than dropping off the list entirely.
  return days !== null && days <= withinDays;
}

/** "Restocked today", "Restocked 3 days ago", or null when there is no record. */
export function restockedLabel(product: InventoryProduct, now = new Date()) {
  const days = daysSinceRestock(product, now);
  if (days === null) return null;
  if (days <= 0) return 'Restocked today';
  if (days === 1) return 'Restocked yesterday';
  if (days < 30) return `Restocked ${days} days ago`;
  const months = Math.round(days / 30);
  return `Restocked ${months} ${months === 1 ? 'month' : 'months'} ago`;
}

/**
 * What `lastRestockedAt` should read after a save.
 *
 * The owner's own date always wins — she is the one who knows a box arrived on
 * Friday and was counted on Monday. Otherwise a quantity that went *up* is a
 * restock and stamps itself, which is the whole reason this is not simply a
 * field she has to remember to fill in. A quantity that went down is a sale or a
 * correction and leaves the date alone.
 */
export function nextRestockedAt({
  typed,
  stored,
  previousInventory,
  nextInventory,
  now = new Date()
}: {
  typed: Date | null;
  stored: Date | null;
  previousInventory: number;
  nextInventory: number;
  now?: Date;
}) {
  // Compared by calendar day, because the form field is a date and the column is
  // a timestamp. By the millisecond, re-saving an untouched form would always
  // look like an edit and would quietly truncate the stored time to midnight.
  if (shopDay(typed) !== shopDay(stored)) return typed;
  if (nextInventory > previousInventory) return now;
  return stored;
}

/** `YYYY-MM-DD` for a date input, or '' when there is nothing recorded. */
export function restockDateValue(value: Date | string | null | undefined) {
  return shopDay(asDate(value)) || '';
}

/**
 * Every stock flag for one product, answered once. The dashboard row, the filter
 * chips and the Needs attention panel all want the same set, and asking each
 * question separately at three call sites is how the row ends up disagreeing
 * with the chip that put it there.
 */
export function inventorySignals(product: InventoryProduct, now = new Date()) {
  return {
    outOfStock: needsRestocking(product),
    lowStock: productIsLowStock(product),
    needsReorder: needsReorder(product),
    missingReorderPoint: missingReorderPoint(product),
    missingSku: product.active && !product.sku?.trim(),
    missingSupplier: product.active && !product.supplier?.trim(),
    recentlyRestocked: recentlyRestocked(product, now)
  };
}
