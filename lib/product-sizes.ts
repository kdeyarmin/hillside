import { formatMoney } from './store.ts';

/**
 * The variants a product is sold in — a plant in a 4" nursery pot or a 6"
 * decorative planter, a lotion in a 2 oz or an 8 oz jar.
 *
 * Variants live on the product row rather than in their own table because they
 * are one thing the owner edits and saves in one go, and because everything
 * that already asks "is this product sellable" — the gallery, recommendations,
 * the care pages, the low-stock filter — asks `Product.inventory`. Keeping that
 * column as the product's *total* means none of those had to learn about them.
 *
 * Every field but the label is optional, and absent always means *the same as
 * the product*. That is what lets a variant follow its product: a stored
 * variant carries a price only when it differs from the product's, so raising
 * the product's price still moves every variant with it, and it carries a
 * photograph, a SKU, a weight or a shipping flag only where it genuinely
 * differs from the one on the product.
 *
 * Stock works the same way round. A variant carries a count only when the owner
 * counted the variants separately — four 4" pots on the bench and eleven 6"
 * ones. Leave the counts off and every variant draws on the product's one
 * quantity, the way a lotion sold in two jar sizes off one pile does. Once
 * *any* variant carries a count the product is tracked per variant: a variant
 * with no number has none left, and `Product.inventory` is kept equal to the
 * sum, so a product whose variants are all empty reads as sold out everywhere
 * without a second column to consult.
 *
 * The type is still called a size in places, and the column is still
 * `Product.sizes`, because live rows, saved carts and in-flight Stripe sessions
 * are stored under those names. Only the shape has grown, and it grew in a way
 * every older row already validates against.
 */

/**
 * As persisted in `Product.sizes`. Anything absent means "whatever the product
 * says": `priceCents` absent is the base price, `inventory` absent means this
 * product is not counted per variant, `ships`/`pickup` absent are the product's
 * own flags.
 */
export type StoredSize = {
  label: string;
  priceCents?: number;
  inventory?: number;
  sku?: string;
  imageUrl?: string;
  weightOunces?: number;
  dimensions?: string;
  ships?: boolean;
  pickup?: boolean;
};

/**
 * A resolved variant, priced and ready to render. `inventory` is null when the
 * variants share the product's one quantity, and a number when this one has its
 * own count. The rest resolve against the product wherever the variant is
 * silent, so a caller never has to remember which fallback applies.
 */
export type SizeOption = {
  label: string;
  priceCents: number;
  inventory: number | null;
  sku: string | null;
  imageUrl: string | null;
  weightOunces: number | null;
  dimensions: string | null;
  ships: boolean;
  pickup: boolean;
};

/** What a variant falls back to: the product's own price, photo, SKU and flags. */
export type VariantDefaults = {
  sku?: string | null;
  imageUrl?: string | null;
  weightOunces?: number | null;
  dimensions?: string | null;
  ships?: boolean | null;
  pickup?: boolean | null;
};

export const SIZE_LABEL_MAX = 60;
export const SIZE_FIELD_LABEL_MAX = 40;
export const MAX_SIZE_OPTIONS = 12;
export const DEFAULT_SIZE_FIELD_LABEL = 'Size';
export const VARIANT_SKU_MAX = 60;
export const VARIANT_DIMENSIONS_MAX = 80;
export const VARIANT_IMAGE_URL_MAX = 500;

/** Same ceiling the price field uses, so a stray keystroke cannot store $1M. */
const MAX_PRICE_CENTS = 10_000_000;

/**
 * A ceiling on a single variant's count, for the same reason as the price one: a
 * fat-fingered quantity should not be able to push the product total — the sum
 * of at most `MAX_SIZE_OPTIONS` of these — anywhere near an `Int` column's edge.
 */
export const MAX_SIZE_INVENTORY = 1_000_000;

/** 6,250 lb. A shipping weight, not a pallet: anything above this is a typo. */
export const MAX_VARIANT_WEIGHT_OUNCES = 100_000;

/**
 * The one spelling of a variant label. Anything that stores, compares or keys on
 * a variant runs it through here first, so a value that has been round-tripped
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

/** A short single-line field — a SKU, a dimensions note — or undefined. */
function cleanShortText(value: unknown, max: number) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return text || undefined;
}

function cleanPriceCents(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(MAX_PRICE_CENTS, Math.round(number));
}

/**
 * `undefined` for anything that is not a count, so "no number here" and "none
 * left" stay different answers — the first means the variants share the
 * product's pile, the second means this variant is sold out.
 */
function cleanSizeInventory(value: unknown) {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(MAX_SIZE_INVENTORY, Math.floor(number));
}

function cleanWeightOunces(value: unknown) {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.min(MAX_VARIANT_WEIGHT_OUNCES, Math.round(number));
}

/** Only a real boolean counts as an override; anything else means "follow the product". */
function cleanFlag(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Validates whatever is in the JSON column. Accepts bare strings as well as
 * objects so a variant list can be hand-written or seeded as `["Small", "Large"]`,
 * and ignores keys it does not know, so a row written by an older or a newer
 * release still reads.
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
          ? (entry as Record<string, unknown>)
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
    const sku = cleanShortText(raw.sku, VARIANT_SKU_MAX);
    const imageUrl = cleanShortText(raw.imageUrl, VARIANT_IMAGE_URL_MAX);
    const weightOunces = cleanWeightOunces(raw.weightOunces);
    const dimensions = cleanShortText(raw.dimensions, VARIANT_DIMENSIONS_MAX);
    const ships = cleanFlag(raw.ships);
    const pickup = cleanFlag(raw.pickup);
    sizes.push({
      label,
      ...(priceCents == null ? {} : { priceCents }),
      ...(inventory == null ? {} : { inventory }),
      ...(sku == null ? {} : { sku }),
      ...(imageUrl == null ? {} : { imageUrl }),
      ...(weightOunces == null ? {} : { weightOunces }),
      ...(dimensions == null ? {} : { dimensions }),
      ...(ships == null ? {} : { ships }),
      ...(pickup == null ? {} : { pickup })
    });
    if (sizes.length >= MAX_SIZE_OPTIONS) break;
  }
  return sizes;
}

/**
 * Whether the owner counted these variants separately. One number anywhere in
 * the list is enough: a product is either counted per variant or not at all,
 * because a half-counted list has no honest answer for the ones left blank.
 */
export function storedSizesTrackStock(stored: StoredSize[]) {
  return stored.some((size) => size.inventory != null);
}

export function resolveSizes(
  stored: StoredSize[],
  basePriceCents: number,
  defaults: VariantDefaults = {}
): SizeOption[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));
  // A variant left blank in a counted list has none on the bench, not "as many
  // as the product has" — that second reading would sell a variant the owner
  // never counted out of another variant's pile.
  const counted = storedSizesTrackStock(stored);
  return stored.map((size) => ({
    label: size.label,
    priceCents: size.priceCents ?? base,
    inventory: counted ? (size.inventory ?? 0) : null,
    sku: size.sku ?? defaults.sku ?? null,
    imageUrl: size.imageUrl ?? defaults.imageUrl ?? null,
    weightOunces: size.weightOunces ?? defaults.weightOunces ?? null,
    dimensions: size.dimensions ?? defaults.dimensions ?? null,
    // `!== false` rather than `?? true`, so a product that does not ship is not
    // quietly made shippable by a variant that says nothing about it.
    ships: size.ships ?? defaults.ships !== false,
    pickup: size.pickup ?? defaults.pickup !== false
  }));
}

/** The options to offer for a product, or `[]` when it is sold one way only. */
export function productSizes(
  value: unknown,
  basePriceCents: number,
  defaults: VariantDefaults = {}
): SizeOption[] {
  return resolveSizes(readStoredSizes(value), basePriceCents, defaults);
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
 * but never invents an option, so a variant the owner retired cannot be ordered.
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
 * What a line costs. A product with no variants charges its base price; a
 * product with variants charges the chosen one and nothing else — an
 * unrecognised label returns null so the caller can refuse the line rather than
 * guess a price.
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
 * Whether a basket line's variant choice cannot be honoured — because a choice
 * is due and none was made, or because the one chosen is not offered any more.
 * The second case includes a product whose variant list has since been cleared
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
 * the product has; a shared-pile variant has the same; a counted variant has its
 * own number. A variant that is not offered has none — that is the retired-
 * variant case, and answering with the product's total there would sell it
 * anyway.
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
 * What `Product.inventory` should read for this variant list — the sum of the
 * counted variants, or the figure the owner typed in the quantity box when the
 * variants are not counted separately. Every save and every stock movement runs
 * the total back through here, so the column and the variant list cannot drift
 * apart and start disagreeing about whether the product is sold out.
 */
export function productInventoryForSizes(stored: StoredSize[], fallbackInventory: number) {
  if (!storedSizesTrackStock(stored)) return Math.max(0, Math.floor(fallbackInventory || 0));
  return stored.reduce((total, size) => total + Math.max(0, Math.floor(size.inventory ?? 0)), 0);
}

/**
 * Spends a variant's own count, mirroring what the product row does: take the
 * full quantity when it is there, and otherwise zero whatever is left so the
 * leftover one or two cannot be sold again on top of an oversell. `took` says
 * which happened; a caller that must not oversell throws on `false` and lets
 * the transaction roll the write back.
 *
 * A list that is not counted per variant has nothing to spend, and says so with
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
 * Puts stock back on a released hold, a cancelled order or a refund. A variant
 * the owner has retired in the meantime has nowhere to go back to, and the units
 * are dropped rather than added to the product total: a total larger than the
 * variants add up to would advertise stock that no option on the page can sell.
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
 * `4" pot 6 · 6" pot 4` for the owner's dashboard, or null when the variants are
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

/** "$18.00" when every variant costs the same, "$18.00 – $24.00" when they differ. */
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
 * The compare-at price a product with variants may advertise.
 *
 * A "was $24, save 25%" is a claim about *the* price, and a product whose
 * variants are priced differently does not have one. Left alone, a base of $18
 * against a $24 compare-at rendered "$18 – $32", a struck-through $24 and "Save
 * 25%" — presenting the $32 variant as part of a discount it is not in. So the
 * sale treatment stands down as soon as the variants disagree about the price;
 * the range says what each one costs instead.
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
 * Identifies a basket line. Two variants of one product are two lines, so a cart
 * keyed on the slug alone would let a 6" pot overwrite the 4" one already in
 * the basket.
 */
export function cartLineKey(slug: string, size?: string | null) {
  const label = cleanLabel(size);
  return label ? `${slug}::${label}` : slug;
}

/**
 * Whether a product's variants disagree about how they get home. A plant sold
 * both as a 4" pot that posts safely and a 30" specimen that cannot be shipped
 * is one product with two answers, and the page has to say so per variant
 * rather than print one blurb that is wrong for half the dropdown.
 */
export function variantsDifferOnFulfillment(sizes: SizeOption[]) {
  if (sizes.length < 2) return false;
  return new Set(sizes.map((size) => `${size.ships ? 'S' : ''}${size.pickup ? 'P' : ''}`)).size > 1;
}

/**
 * One variant as the admin form posts it. Every field is a string because that
 * is what a form gives us; `readVariantRows` is what turns a row into a stored
 * variant, and drops the rows that are still blank.
 */
export type VariantFormRow = {
  label: string;
  price: string;
  inventory: string;
  sku: string;
  imageUrl: string;
  weightOunces: string;
  dimensions: string;
  /** `''` follows the product; otherwise `both`, `ship` or `pickup`. */
  fulfillment: string;
};

export const VARIANT_FIELD_NAMES = {
  label: 'variantLabel',
  price: 'variantPrice',
  inventory: 'variantInventory',
  sku: 'variantSku',
  imageUrl: 'variantImageUrl',
  weightOunces: 'variantWeight',
  dimensions: 'variantDimensions',
  fulfillment: 'variantFulfillment'
} as const;

/** The four answers the per-variant fulfillment dropdown offers. */
export const VARIANT_FULFILLMENT_CHOICES: Array<[value: string, label: string]> = [
  ['', 'Same as the product'],
  ['both', 'Ships and local pickup'],
  ['ship', 'Ships only'],
  ['pickup', 'Local pickup only']
];

function fulfillmentFlags(choice: string) {
  if (choice === 'both') return { ships: true, pickup: true };
  if (choice === 'ship') return { ships: true, pickup: false };
  if (choice === 'pickup') return { ships: false, pickup: true };
  // Anything else — including the empty default — leaves both absent, which is
  // what makes the variant follow the product's own two checkboxes.
  return {};
}

/** The dropdown value that reproduces a stored variant's flags. */
export function variantFulfillmentChoice(size: Pick<StoredSize, 'ships' | 'pickup'>) {
  if (size.ships == null && size.pickup == null) return '';
  if (size.ships !== false && size.pickup !== false) return 'both';
  if (size.ships !== false) return 'ship';
  if (size.pickup !== false) return 'pickup';
  // Neither: a variant that can neither ship nor be collected cannot be bought,
  // so it is stored as following the product rather than as unsellable.
  return '';
}

/**
 * A price or a quantity as typed. A dollar sign, commas and stray spacing are
 * all tolerated: this is a form on a phone, not a data-entry terminal.
 */
function typedNumber(value: string) {
  const text = value.replace(/[$,\s]/g, '');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * Turns the admin form's variant rows into stored variants.
 *
 * Rows arrive as parallel lists — one `variantLabel` per row, one
 * `variantPrice` per row, and so on — because a form posts repeated fields in
 * document order, so the rows can be zipped back together by index. Every
 * control is a text input or a `<select>` for exactly that reason: a checkbox
 * posts nothing at all when it is unticked, which would slide every row below
 * it up by one and quietly move one variant's shipping answer onto another's.
 *
 * A row with no label is an untouched blank at the bottom of the form and is
 * dropped, so "add a variant" is just typing in the next empty row.
 */
export function readVariantRows(form: {
  getAll(name: string): Array<FormDataEntryValue | string>;
}): StoredSize[] {
  const column = (name: string) => form.getAll(name).map((entry) => String(entry ?? ''));
  const labels = column(VARIANT_FIELD_NAMES.label);
  const prices = column(VARIANT_FIELD_NAMES.price);
  const inventories = column(VARIANT_FIELD_NAMES.inventory);
  const skus = column(VARIANT_FIELD_NAMES.sku);
  const images = column(VARIANT_FIELD_NAMES.imageUrl);
  const weights = column(VARIANT_FIELD_NAMES.weightOunces);
  const dimensions = column(VARIANT_FIELD_NAMES.dimensions);
  const fulfillments = column(VARIANT_FIELD_NAMES.fulfillment);

  return readStoredSizes(
    labels.map((label, index) => {
      const price = typedNumber(prices[index] ?? '');
      const inventory = typedNumber(inventories[index] ?? '');
      const weight = typedNumber(weights[index] ?? '');
      return {
        label,
        ...(price == null ? {} : { priceCents: Math.round(price * 100) }),
        ...(inventory == null ? {} : { inventory: Math.floor(inventory) }),
        ...(weight == null ? {} : { weightOunces: Math.round(weight) }),
        sku: skus[index] ?? '',
        imageUrl: images[index] ?? '',
        dimensions: dimensions[index] ?? '',
        ...fulfillmentFlags((fulfillments[index] ?? '').trim())
      };
    })
  );
}

/**
 * The rows to render in the admin editor: the variants the product has, plus a
 * few empty ones to type the next into. Without scripting those blanks are the
 * whole "add a variant" mechanism, which is why there is always more than one.
 */
export function variantEditorRows(value: unknown, blanks = 2): StoredSize[] {
  const stored = readStoredSizes(value);
  const room = Math.max(0, MAX_SIZE_OPTIONS - stored.length);
  return [...stored, ...Array.from({ length: Math.min(blanks, room) }, () => ({ label: '' }))];
}

/**
 * Drops anything a variant merely repeats from its product, so it is stored as
 * "the same as the product" rather than pinned to today's answer. An owner who
 * copies the product's price into every variant would otherwise have left them
 * all behind the next time she raised it, and a variant carrying a duplicate of
 * the product photograph would keep showing the old one after she replaced it.
 *
 * The count is kept exactly as typed: unlike a price, it never follows the
 * product's.
 */
export function withoutRedundantPrices(
  sizes: StoredSize[],
  basePriceCents: number,
  defaults: VariantDefaults = {}
): StoredSize[] {
  const base = Math.max(0, Math.round(basePriceCents || 0));

  /** Keeps a value only where it says something the product does not. */
  const own = <T>(value: T | undefined, productValue: T | null | undefined) =>
    value == null || value === productValue ? undefined : value;

  /**
   * The flags compare against the product's *effective* answer rather than the
   * raw one, because absent means yes on both sides: a variant that says it
   * ships, on a product that says nothing, is agreeing rather than overriding.
   */
  const ownFlag = (value: boolean | undefined, productValue: boolean | null | undefined) =>
    value == null || value === (productValue !== false) ? undefined : value;

  return sizes.map((size) => {
    const priceCents =
      size.priceCents == null || size.priceCents === base ? undefined : size.priceCents;
    const sku = own(size.sku, defaults.sku);
    const imageUrl = own(size.imageUrl, defaults.imageUrl);
    const weightOunces = own(size.weightOunces, defaults.weightOunces);
    const dimensions = own(size.dimensions, defaults.dimensions);
    const ships = ownFlag(size.ships, defaults.ships);
    const pickup = ownFlag(size.pickup, defaults.pickup);

    return {
      label: size.label,
      ...(priceCents == null ? {} : { priceCents }),
      ...(size.inventory == null ? {} : { inventory: size.inventory }),
      ...(sku == null ? {} : { sku }),
      ...(imageUrl == null ? {} : { imageUrl }),
      ...(weightOunces == null ? {} : { weightOunces }),
      ...(dimensions == null ? {} : { dimensions }),
      ...(ships == null ? {} : { ships }),
      ...(pickup == null ? {} : { pickup })
    };
  });
}
