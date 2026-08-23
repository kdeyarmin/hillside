import { formatMoney } from './store.ts';

/**
 * Size options for a product that is sold in more than one size — a plant in a
 * 4" or a 6" pot, a lotion in a 2 oz or an 8 oz jar.
 *
 * Sizes live on the product row rather than in their own table because they are
 * one thing the owner edits and saves in one go, and because everything that
 * already asks "is this product sellable" — the gallery, recommendations, the
 * care pages, the low-stock filter — asks `Product.inventory`. Keeping that
 * column as the product's *total* means none of those had to learn about sizes.
 *
 * A stored option carries a price only when it differs from the product's base
 * price. Copying the base price into every option would silently freeze it: the
 * owner would raise the price on the product and the dropdown would go on
 * selling last season's figure.
 *
 * Stock works the same way round. A size carries a count only when the owner
 * counted the sizes separately — four 4" pots on the bench and eleven 6" ones.
 * Leave the counts off and every size draws on the product's one quantity, the
 * way a lotion sold in two jar sizes off one pile does. Once *any* size carries
 * a count the product is tracked per size: a size with no number has none left,
 * and `Product.inventory` is kept equal to the sum, so a product whose sizes are
 * all empty reads as sold out everywhere without a second column to consult.
 */

/**
 * As persisted in `Product.sizes`. `priceCents` absent means "the base price";
 * `inventory` absent means "this product is not counted per size".
 */
export type StoredSize = { label: string; priceCents?: number; inventory?: number };

/**
 * A resolved option, priced and ready to render. `inventory` is null when the
 * sizes share the product's one quantity, and a number when this size has its
 * own count.
 */
export type SizeOption = { label: string; priceCents: number; inventory: number | null };

export const SIZE_LABEL_MAX = 60;
export const SIZE_FIELD_LABEL_MAX = 40;
export const MAX_SIZE_OPTIONS = 12;
export const DEFAULT_SIZE_FIELD_LABEL = 'Size';

/** Same ceiling the price field uses, so a stray keystroke cannot store $1M. */
const MAX_PRICE_CENTS = 10_000_000;

/**
 * A ceiling on a single size's count, for the same reason as the price one: a
 * fat-fingered quantity should not be able to push the product total — the sum
 * of at most `MAX_SIZE_OPTIONS` of these — anywhere near an `Int` column's edge.
 */
export const MAX_SIZE_INVENTORY = 1_000_000;

/**
 * The one spelling of a size label. Anything that stores, compares or keys on a
 * size runs it through here first, so a value that has been round-tripped
 * through localStorage, an emailed cart link or Stripe metadata still lines up
 * with the option it came from.
 */
export function normalizeSizeLabel(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIZE_LABEL_MAX);
}

const cleanLabel = normalizeSizeLabel;

function cleanPriceCents(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(MAX_PRICE_CENTS, Math.round(number));
}

/**
 * `undefined` for anything that is not a count, so "no number here" and "none
 * left" stay different answers — the first means the sizes share the product's
 * pile, the second means this size is sold out.
 */
function cleanSizeInventory(value: unknown) {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(MAX_SIZE_INVENTORY, Math.floor(number));
}

/**
 * Validates whatever is in the JSON column. Accepts bare strings as well as
 * objects so a size list can be hand-written or seeded as `["Small", "Large"]`.
 */
export function readStoredSizes(value: unknown): StoredSize[] {
  if (typeof value === 'string') {
    // Older rows, or a hand-edited column, may hold the JSON as text.
    try {
      return readStoredSizes(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const sizes: StoredSize[] = [];
  for (const entry of value) {
    const raw =
      typeof entry === 'string'
        ? { label: entry }
        : entry && typeof entry === 'object'
          ? (entry as { label?: unknown; priceCents?: unknown; inventory?: unknown })
          : null;
    if (!raw) continue;

    const label = cleanLabel(raw.label);
    if (!label) continue;
    // Two options reading the same to a shopper cannot be told apart in an
    // order, so the first one wins rather than both being offered.
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const priceCents = cleanPriceCents(raw.priceCents);
    const inventory = cleanSizeInventory(raw.inventory);
    sizes.push({
      label,
      ...(priceCents == null ? {} : { priceCents }),
      ...(inventory == null ? {} : { inventory })
    });
    if (sizes.length >= MAX_SIZE_OPTIONS) break;
  }
  return sizes;
}

/**
 * Whether the owner counted these sizes separately. One number anywhere in the
 * list is enough: a product is either counted per size or not at all, because a
 * half-counted list has no honest answer for the sizes left blank.
 */
export function storedSizesTrackStock(stored: StoredSize[]) {
  return stored.some((size) => size.inventory != null);
}

export function resolveSizes(stored: StoredSize[], basePriceCents: number): SizeOption[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));
  // A size left blank in a counted list has none on the bench, not "as many as
  // the product has" — that second reading would sell a size the owner never
  // counted out of another size's pile.
  const counted = storedSizesTrackStock(stored);
  return stored.map((size) => ({
    label: size.label,
    priceCents: size.priceCents ?? base,
    inventory: counted ? (size.inventory ?? 0) : null
  }));
}

/** The options to offer for a product, or `[]` when it is sold one way only. */
export function productSizes(value: unknown, basePriceCents: number): SizeOption[] {
  return resolveSizes(readStoredSizes(value), basePriceCents);
}

export function hasSizeChoice(value: unknown) {
  return readStoredSizes(value).length > 0;
}

/** What the dropdown is called. Owners can say "Pot size" or "Jar size". */
export function sizeFieldLabel(value: string | null | undefined) {
  const trimmed = (value || '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, SIZE_FIELD_LABEL_MAX) : DEFAULT_SIZE_FIELD_LABEL;
}

/**
 * The option a shopper actually picked, or null when the choice is not one we
 * sell. Matching is forgiving about case and spacing — the value survives a
 * round trip through localStorage, an emailed cart link and Stripe metadata —
 * but never invents an option, so a size the owner retired cannot be ordered.
 */
export function findSize(sizes: SizeOption[], label: string | null | undefined): SizeOption | null {
  const wanted = cleanLabel(label);
  if (!wanted) return null;
  return (
    sizes.find((size) => size.label === wanted) ||
    sizes.find((size) => size.label.toLowerCase() === wanted.toLowerCase()) ||
    null
  );
}

/**
 * What a line costs. A product with no sizes charges its base price; a product
 * with sizes charges the chosen option and nothing else — an unrecognised size
 * returns null so the caller can refuse the line rather than guess a price.
 */
export function sizedPriceCents(
  sizes: SizeOption[],
  label: string | null | undefined,
  basePriceCents: number
): number | null {
  if (!sizes.length) return basePriceCents;
  return findSize(sizes, label)?.priceCents ?? null;
}

/**
 * Whether a basket line's size choice cannot be honoured — because a size is due
 * and none was chosen, or because the one chosen is not offered any more. The
 * second case includes a product whose size list has since been cleared
 * altogether, which is why this asks about the *choice* rather than about the
 * length of the list. Checkout, the checkout session and a restored saved cart
 * all have to agree on it, so they ask here.
 */
export function sizeChoiceRejected(sizes: SizeOption[], size: string | null | undefined) {
  if (findSize(sizes, size)) return false;
  return sizes.length > 0 || Boolean(normalizeSizeLabel(size));
}

/** Whether these options carry their own counts rather than sharing one pile. */
export function sizesTrackStock(sizes: SizeOption[]) {
  return sizes.some((size) => size.inventory != null);
}

/**
 * How many of one option are on the bench. A product sold one way has whatever
 * the product has; a shared-pile size has the same; a counted size has its own
 * number. A size that is not offered has none — that is the retired-size case,
 * and answering with the product's total there would sell it anyway.
 */
export function sizeAvailable(size: SizeOption | null, productInventory: number) {
  const stock = Math.max(0, Math.floor(productInventory || 0));
  if (!size) return stock;
  return size.inventory == null ? stock : Math.max(0, size.inventory);
}

/** The same question asked with a label, the way a basket line asks it. */
export function availableForSize(
  sizes: SizeOption[],
  label: string | null | undefined,
  productInventory: number
) {
  if (!sizes.length) return Math.max(0, Math.floor(productInventory || 0));
  const chosen = findSize(sizes, label);
  return chosen ? sizeAvailable(chosen, productInventory) : 0;
}

/**
 * What `Product.inventory` should read for this size list — the sum of the
 * counted sizes, or the figure the owner typed in the quantity box when the
 * sizes are not counted separately. Every save and every stock movement runs
 * the total back through here, so the column and the size list cannot drift
 * apart and start disagreeing about whether the product is sold out.
 */
export function productInventoryForSizes(stored: StoredSize[], fallbackInventory: number) {
  if (!storedSizesTrackStock(stored)) return Math.max(0, Math.floor(fallbackInventory || 0));
  return stored.reduce((total, size) => total + Math.max(0, Math.floor(size.inventory ?? 0)), 0);
}

/**
 * Spends a size's own count, mirroring what the product row does: take the full
 * quantity when it is there, and otherwise zero whatever is left so the
 * leftover one or two cannot be sold again on top of an oversell. `took` says
 * which happened; a caller that must not oversell throws on `false` and lets
 * the transaction roll the write back.
 *
 * A list that is not counted per size has nothing to spend, and says so with
 * `took: true`: the product row already holds that stock and has already been
 * decremented by the caller.
 */
export function takeStoredSizeStock(
  stored: StoredSize[],
  label: string | null | undefined,
  quantity: number
): { sizes: StoredSize[]; took: boolean } {
  if (!storedSizesTrackStock(stored)) return { sizes: stored, took: true };
  const wanted = Math.max(0, Math.floor(quantity || 0));
  const target = matchStoredLabel(stored, label);
  if (!target) return { sizes: stored, took: false };

  const onHand = Math.max(0, Math.floor(target.inventory ?? 0));
  const took = onHand >= wanted;
  return {
    sizes: stored.map((size) =>
      size === target ? { ...size, inventory: took ? onHand - wanted : 0 } : size
    ),
    took
  };
}

/**
 * Puts stock back on a released hold, a cancelled order or a refund. A size the
 * owner has retired in the meantime has nowhere to go back to, and the units are
 * dropped rather than added to the product total: a total larger than the sizes
 * add up to would advertise stock that no option on the page can sell.
 */
export function returnStoredSizeStock(
  stored: StoredSize[],
  label: string | null | undefined,
  quantity: number
): StoredSize[] {
  if (!storedSizesTrackStock(stored)) return stored;
  const wanted = Math.max(0, Math.floor(quantity || 0));
  const target = matchStoredLabel(stored, label);
  if (!target) return stored;

  return stored.map((size) =>
    size === target
      ? {
          ...size,
          inventory: Math.min(
            MAX_SIZE_INVENTORY,
            Math.max(0, Math.floor(size.inventory ?? 0)) + wanted
          )
        }
      : size
  );
}

/**
 * How many of one size are on the shelf, or null when this product is not
 * counted per size.
 *
 * A read, unlike `takeStoredSizeStock` — which rewrites the product's total from
 * the size list whether or not it succeeds, and so cannot be used to *ask*
 * whether a size can cover a quantity without also committing to the answer.
 *
 * A label matching nothing has none: that is the retired-size case, where
 * answering with the product's total would sell a size nobody stocks.
 */
export function storedSizeOnHand(stored: StoredSize[], label: string | null | undefined) {
  if (!storedSizesTrackStock(stored)) return null;
  const target = matchStoredLabel(stored, label);
  return Math.max(0, Math.floor(target?.inventory ?? 0));
}

/** `findSize` for stored rows, so stock moves match the same way prices do. */
function matchStoredLabel(stored: StoredSize[], label: string | null | undefined) {
  const wanted = cleanLabel(label);
  if (!wanted) return null;
  return (
    stored.find((size) => size.label === wanted) ||
    stored.find((size) => size.label.toLowerCase() === wanted.toLowerCase()) ||
    null
  );
}

/**
 * `4" pot 6 · 6" pot 4` for the owner's dashboard, or null when the sizes are
 * not counted separately and the product's one quantity already says it all.
 */
export function sizeStockSummary(value: unknown) {
  const stored = readStoredSizes(value);
  if (!storedSizesTrackStock(stored)) return null;
  return stored.map((size) => `${size.label} ${Math.max(0, size.inventory ?? 0)}`).join(' · ');
}

export function sizePriceRange(sizes: SizeOption[], basePriceCents: number) {
  const prices = sizes.length ? sizes.map((size) => size.priceCents) : [basePriceCents];
  return { minCents: Math.min(...prices), maxCents: Math.max(...prices) };
}

/** "$18.00" when every size costs the same, "$18.00 – $24.00" when they differ. */
export function formatSizePriceRange(sizes: SizeOption[], basePriceCents: number) {
  const { minCents, maxCents } = sizePriceRange(sizes, basePriceCents);
  return minCents === maxCents
    ? formatMoney(minCents)
    : `${formatMoney(minCents)} – ${formatMoney(maxCents)}`;
}

/** True when the dropdown has to show a price against each option. */
export function sizesArePriced(sizes: SizeOption[], basePriceCents: number) {
  const { minCents, maxCents } = sizePriceRange(sizes, basePriceCents);
  return minCents !== maxCents;
}

/**
 * The compare-at price a sized product may advertise.
 *
 * A "was $24, save 25%" is a claim about *the* price, and a product whose sizes
 * are priced differently does not have one. Left alone, a base of $18 against a
 * $24 compare-at rendered "$18 – $32", a struck-through $24 and "Save 25%" —
 * presenting the $32 size as part of a discount it is not in. So the sale
 * treatment stands down as soon as the sizes disagree about the price; the
 * range says what each size costs instead.
 */
export function comparableAtCents(
  sizes: SizeOption[],
  basePriceCents: number,
  compareAtCents: number | null | undefined
) {
  return sizesArePriced(sizes, basePriceCents) ? null : (compareAtCents ?? null);
}

/** The product name as it should read on an order, a packing slip or in Stripe. */
export function sizedName(name: string, size: string | null | undefined) {
  const label = cleanLabel(size);
  return label ? `${name} — ${label}` : name;
}

/**
 * Identifies a basket line. Two sizes of one product are two lines, so a cart
 * keyed on the slug alone would let a 6" pot overwrite the 4" one already in
 * the basket.
 */
export function cartLineKey(slug: string, size?: string | null) {
  const label = cleanLabel(size);
  return label ? `${slug}::${label}` : slug;
}

/** A field that reads as a number, or as nothing at all. `$18.00`, `1,200`, ``. */
function numberField(part: string | undefined) {
  const text = String(part ?? '').replace(/[$,\s]/g, '');
  if (!text) return { present: true, value: null as number | null };
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return { present: false, value: null };
  return { present: true, value: number };
}

/**
 * The owner types sizes one per line, `label | price | quantity`. The price is
 * left off for anything that costs the same as the product itself, and the
 * quantity is left off when the sizes are not counted separately, so all three
 * of these are lines she may type:
 *
 * ```
 * 4" pot | 18.00 | 6     a size with its own price and its own six on the bench
 * 6" pot | | 4           the product's price, four on the bench
 * 8" pot | 32.00         the older two-field line: a price, and no separate count
 * ```
 *
 * The price is what decides a line has three fields, and a blank price field
 * still counts as one — that is what `6" pot | | 4` leans on. A price that reads
 * as neither blank nor a number means the bars belong to the label instead, and
 * the line falls back to the two-field rule that was here before: label, then a
 * price after the last bar. So `Small | free` still stores the label it always
 * did rather than acquiring the word "free".
 *
 * A dollar sign, commas and stray spacing are all tolerated: this is a text box
 * on a phone, not a data-entry form.
 */
export function parseSizeLines(value: string): StoredSize[] {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return readStoredSizes(
    lines.map((line) => {
      const parts = line.split(/[|\t]/);

      if (parts.length >= 3) {
        const price = numberField(parts.at(-2));
        const quantity = numberField(parts.at(-1));
        /**
         * `Small | free | 3` reads as the old two-field line it has always been,
         * because `free` is not a price. Once the price field does read, though,
         * a quantity that does not — `4" pot | | -3` — is simply dropped rather
         * than dragging the line back to that rule, the same way an unreadable
         * price is dropped from a two-field line.
         */
        if (price.present) {
          return {
            label: parts.slice(0, -2).join('|').trim(),
            ...(price.value == null ? {} : { priceCents: Math.round(price.value * 100) }),
            ...(quantity.value == null ? {} : { inventory: Math.floor(quantity.value) })
          };
        }
      }

      // Split on the last separator so a label may contain one.
      const separator = Math.max(line.lastIndexOf('|'), line.lastIndexOf('\t'));
      if (separator < 0) return { label: line };

      const label = line.slice(0, separator);
      const price = numberField(line.slice(separator + 1));
      if (price.value == null) return { label };
      return { label, priceCents: Math.round(price.value * 100) };
    })
  );
}

/**
 * Drops an override that merely repeats the product's own price, so it is stored
 * as "the base price" rather than pinned to today's figure. The admin box shows
 * `4" pot | 18.00 | 6` as its example, so an owner following it would otherwise
 * have left that size behind the next time they raised the price. The count is
 * kept exactly as typed: unlike a price, it never follows the product's.
 */
export function withoutRedundantPrices(sizes: StoredSize[], basePriceCents: number): StoredSize[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));
  return sizes.map(({ label, priceCents, inventory }) => ({
    label,
    ...(priceCents == null || priceCents === base ? {} : { priceCents }),
    ...(inventory == null ? {} : { inventory })
  }));
}

/**
 * The inverse, for the admin textarea. A counted list writes all three fields on
 * every line — including the empty price of a size that costs what the product
 * costs — so the columns line up and re-saving the box unchanged stores exactly
 * what was there.
 */
export function sizeLines(value: unknown) {
  const stored = readStoredSizes(value);
  const counted = storedSizesTrackStock(stored);
  return stored
    .map((size) => {
      const price = size.priceCents == null ? '' : (size.priceCents / 100).toFixed(2);
      // `4" pot | | 6` rather than a double space where the price is blank.
      if (counted) return `${size.label} |${price ? ` ${price} ` : ' '}| ${size.inventory ?? 0}`;
      return price ? `${size.label} | ${price}` : size.label;
    })
    .join('\n');
}
