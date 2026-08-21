import { formatMoney } from './store.ts';

/**
 * Size options for a product that is sold in more than one size — a plant in a
 * 4" or a 6" pot, a lotion in a 2 oz or an 8 oz jar.
 *
 * Sizes are stored on the product row rather than as their own rows because
 * they are a *choice*, not a second inventory: the bench holds one pile of
 * lotion jars, and the shopper is telling us which one to pack. Anything that
 * needs its own stock count, SKU or photograph is a separate product, and the
 * owner already has a form for that.
 *
 * A stored option carries a price only when it differs from the product's base
 * price. Copying the base price into every option would silently freeze it: the
 * owner would raise the price on the product and the dropdown would go on
 * selling last season's figure.
 */

/** As persisted in `Product.sizes`. `priceCents` absent means "the base price". */
export type StoredSize = { label: string; priceCents?: number };

/** A resolved option, priced and ready to render. */
export type SizeOption = { label: string; priceCents: number };

export const SIZE_LABEL_MAX = 60;
export const SIZE_FIELD_LABEL_MAX = 40;
export const MAX_SIZE_OPTIONS = 12;
export const DEFAULT_SIZE_FIELD_LABEL = 'Size';

/** Same ceiling the price field uses, so a stray keystroke cannot store $1M. */
const MAX_PRICE_CENTS = 10_000_000;

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
          ? (entry as { label?: unknown; priceCents?: unknown })
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
    sizes.push(priceCents == null ? { label } : { label, priceCents });
    if (sizes.length >= MAX_SIZE_OPTIONS) break;
  }
  return sizes;
}

export function resolveSizes(stored: StoredSize[], basePriceCents: number): SizeOption[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));
  return stored.map((size) => ({
    label: size.label,
    priceCents: size.priceCents ?? base
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

/**
 * The owner types sizes one per line, `label | price`, with the price left off
 * for anything that costs the same as the product itself. A dollar sign, commas
 * and stray spacing are all tolerated — this is a text box on a phone, not a
 * data-entry form.
 */
export function parseSizeLines(value: string): StoredSize[] {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return readStoredSizes(
    lines.map((line) => {
      // Split on the last separator so a label may contain one.
      const separator = Math.max(line.lastIndexOf('|'), line.lastIndexOf('\t'));
      if (separator < 0) return { label: line };

      const label = line.slice(0, separator);
      const priceText = line
        .slice(separator + 1)
        .replace(/[$,\s]/g, '')
        .trim();
      if (!priceText) return { label };

      const dollars = Number(priceText);
      if (!Number.isFinite(dollars) || dollars < 0) return { label };
      return { label, priceCents: Math.round(dollars * 100) };
    })
  );
}

/**
 * Drops an override that merely repeats the product's own price, so it is stored
 * as "the base price" rather than pinned to today's figure. The admin box shows
 * `4" pot | 18.00` as its example, so an owner following it would otherwise have
 * left that size behind the next time they raised the price.
 */
export function withoutRedundantPrices(sizes: StoredSize[], basePriceCents: number): StoredSize[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));
  return sizes.map(({ label, priceCents }) =>
    priceCents == null || priceCents === base ? { label } : { label, priceCents }
  );
}

/** The inverse, for the admin textarea. */
export function sizeLines(value: unknown) {
  return readStoredSizes(value)
    .map((size) =>
      size.priceCents == null ? size.label : `${size.label} | ${(size.priceCents / 100).toFixed(2)}`
    )
    .join('\n');
}
