import {
  bundleContentsLine,
  bundleFulfillment,
  bundleStockLines,
  componentSetsAvailable,
  requiredItems,
  type BundleComponent,
  type BundleForSale,
  type BundleStockLine
} from './bundles.ts';
import { basketLineKey, readLineKind, type LineKind } from './cart-lines.ts';
import {
  cartLineKey,
  findSize,
  productSizes,
  sizeAvailable,
  sizeChoiceRejected,
  sizedName,
  sizesTrackStock,
  SIZE_LABEL_MAX
} from './product-sizes.ts';
import { absoluteUrl, formatMoney, resolveImageUrl } from './store.ts';

/**
 * How long a Stripe Checkout Session may hold stock. Matches the class-seat
 * hold, and stays at or above Stripe's 30-minute minimum for `expires_at`.
 */
export const CHECKOUT_HOLD_MINUTES = 35;

export class InsufficientStockError extends Error {
  /** The basket line that could not be filled — a product's slug or a set's. */
  slug: string;
  size: string | null;
  /**
   * What to call the thing that ran out, when the slug alone will not name it.
   * A set's line fails on one of its components, and telling the customer that
   * "tea-starter-set was claimed" leaves out the part they can act on.
   */
  label: string | null;
  constructor(slug: string, size: string | null = null, label: string | null = null) {
    super(`Insufficient stock for ${slug}`);
    this.name = 'InsufficientStockError';
    this.slug = slug;
    this.size = size;
    this.label = label;
  }
}

export type CheckoutRequestedItem = {
  id: string;
  /** Omitted for an ordinary product, so a pre-bundles basket reads unchanged. */
  kind?: LineKind;
  quantity: number;
  priceCents?: number;
  /** The chosen size, for products sold in more than one. */
  size?: string;
};

export type CheckoutAdjustment = {
  slug: string;
  kind?: LineKind;
  name: string;
  requested: number;
  available: number;
  reason: 'stock' | 'price' | 'unavailable' | 'size';
  priceCents?: number;
  size?: string;
};

export type CheckoutProductLine = {
  kind: 'product';
  product: {
    id: string;
    slug: string;
    name: string;
    shortDescription: string | null;
    description: string;
    priceCents: number;
    inventory: number;
    imageUrl: string | null;
    ships?: boolean | null;
    pickup?: boolean | null;
  };
  quantity: number;
  size?: string | null;
  /** What this line is charged, which for a sized line is the size's price. */
  unitCents: number;
};

/**
 * A set on its way to Stripe. It charges the bundle's own price and it carries
 * `components` — the products and variants it will take off the shelf — because
 * that, not the bundle, is where the stock lives.
 */
export type CheckoutBundleLine = {
  kind: 'bundle';
  bundle: {
    id: string;
    slug: string;
    title: string;
    tagline: string | null;
    description: string;
    imageUrl: string | null;
    priceCents: number;
  };
  quantity: number;
  unitCents: number;
  /** Totals for the whole line: per-set quantity × sets bought. */
  components: BundleStockLine[];
  /** Optional extras the shelf could not cover, so left out of the box. */
  skipped: BundleComponent[];
  contents: string;
  ships: boolean;
  pickup: boolean;
};

export type CheckoutLine = CheckoutProductLine | CheckoutBundleLine;

/** What a line is called on a receipt, an oversell notice or a packing slip. */
export function checkoutLineName(line: CheckoutLine) {
  return line.kind === 'bundle' ? line.bundle.title : sizedName(line.product.name, line.size);
}

/** Whether a line may ship or be picked up, whichever kind of line it is. */
export function checkoutLineFulfillment(line: CheckoutLine) {
  return line.kind === 'bundle'
    ? { ships: line.ships, pickup: line.pickup }
    : { ships: line.product.ships, pickup: line.product.pickup };
}

export function holdExpiry(now = new Date()) {
  return new Date(now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000);
}

export function holdExpiryUnix(expiresAt: Date) {
  return Math.floor(expiresAt.getTime() / 1000);
}

/**
 * Stripe `product_data.description` is capped at 500 characters. A long care
 * note used to make `checkout.sessions.create` throw, and the customer saw a
 * generic 500 with a full basket they could not pay for.
 */
export function stripeProductDescription(value: string | null | undefined) {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= 500) return cleaned;
  return `${cleaned.slice(0, 497).trimEnd()}...`;
}

/**
 * Stripe live mode rejects non-HTTPS images. A loopback or relative URL would
 * fail session creation the same way an overlong description used to.
 */
export function stripeProductImages(imageUrl: string | null | undefined) {
  const resolved = absoluteUrl(resolveImageUrl(imageUrl));
  return resolved.startsWith('https://') ? [resolved] : [];
}

export function readCheckoutItems(body: unknown): CheckoutRequestedItem[] {
  if (!body || typeof body !== 'object' || !('items' in body)) return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  /**
   * Keyed by kind, product *and* size: a basket holding a 4" and a 6" pot of the
   * same plant is two lines, and merging them on the slug alone would have
   * charged for two of whichever size happened to arrive first. The kind is in
   * the key because a bundle may share a slug with a product.
   */
  const merged = new Map<string, CheckoutRequestedItem>();
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as {
      id?: unknown;
      kind?: unknown;
      quantity?: unknown;
      priceCents?: unknown;
      size?: unknown;
    };
    const id = String(raw.id || '').trim();
    if (!id) continue;
    const kind = readLineKind(raw.kind);
    // A set has no size of its own: its recipe already pinned every variant.
    const size =
      kind === 'bundle'
        ? ''
        : String(raw.size ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, SIZE_LABEL_MAX);
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
    const priceCents = Number(raw.priceCents);
    const key = basketLineKey(kind, id, size);
    const current = merged.get(key);
    merged.set(key, {
      id,
      ...(kind === 'bundle' ? { kind } : {}),
      ...(size ? { size } : {}),
      quantity: Math.min(20, (current?.quantity || 0) + quantity),
      ...(Number.isFinite(priceCents) && priceCents >= 0
        ? { priceCents: Math.round(priceCents) }
        : current?.priceCents != null
          ? { priceCents: current.priceCents }
          : {})
    });
  }
  return [...merged.values()];
}

/**
 * Which count a line draws on. Sizes the owner did not count separately share
 * the product's one number, so every line of that product meters against the
 * same key; sizes she did count have their own, so a basket holding the last 4"
 * pot and the last 6" pot is two lines against two shelves and both are
 * honoured.
 *
 * Bundles meter here too, through the same keys — the components are the stock,
 * so a set and a loose jar of the same lotion are two lines against one shelf.
 */
function shelfKey(
  product: { slug: string; priceCents: number; sizes?: unknown },
  label: string | null | undefined
) {
  const sizes = productSizes(product.sizes, product.priceCents);
  return sizesTrackStock(sizes) ? cartLineKey(product.slug, label) : product.slug;
}

export function checkoutAdjustments(
  requested: CheckoutRequestedItem[],
  products: Array<{
    slug: string;
    name: string;
    inventory: number;
    priceCents: number;
    active?: boolean;
    sizes?: unknown;
  }>,
  bundles: BundleForSale[] = []
): CheckoutAdjustment[] {
  const adjustments: CheckoutAdjustment[] = [];
  /**
   * Stock is spent line by line rather than each line being checked against the
   * shelf independently, because two lines drawing on the same shelf would
   * otherwise each pass on the last three jars.
   */
  const remaining = new Map<string, number>();

  for (const requestedItem of requested) {
    if (requestedItem.kind === 'bundle') {
      const change = bundleAdjustment(requestedItem, bundles, remaining);
      if (change) adjustments.push(change);
      continue;
    }

    const product = products.find((candidate) => candidate.slug === requestedItem.id);
    if (!product || product.active === false) {
      adjustments.push({
        slug: requestedItem.id,
        name: product?.name || 'That item',
        requested: requestedItem.quantity,
        available: 0,
        reason: 'unavailable',
        ...(requestedItem.size ? { size: requestedItem.size } : {})
      });
      continue;
    }

    const sizes = productSizes(product.sizes, product.priceCents);
    const chosen = findSize(sizes, requestedItem.size);
    /**
     * A line is refused when a size is due and none was chosen, and equally when
     * a size was chosen that the shop no longer offers — including the case
     * where the owner has since cleared the size list altogether. Keying that
     * second test off `sizes.length` alone let a basket holding "6\" pot" pass
     * as a plain line once the last option was deleted: the shopper was charged
     * the base price for an order recorded with no size on it, and if that size
     * had cost the same as the base, nothing anywhere said so.
     */
    if (sizeChoiceRejected(sizes, requestedItem.size)) {
      adjustments.push({
        slug: requestedItem.id,
        name: product.name,
        requested: requestedItem.quantity,
        available: 0,
        reason: 'size',
        ...(requestedItem.size ? { size: requestedItem.size } : {})
      });
      continue;
    }

    const unitCents = chosen?.priceCents ?? product.priceCents;
    const sizeFields = requestedItem.size ? { size: requestedItem.size } : {};
    const shelf = shelfKey(product, chosen?.label);
    const available = remaining.get(shelf) ?? sizeAvailable(chosen, product.inventory);

    if (available < requestedItem.quantity) {
      remaining.set(shelf, 0);
      adjustments.push({
        slug: requestedItem.id,
        name: sizedName(product.name, requestedItem.size),
        requested: requestedItem.quantity,
        available,
        reason: 'stock',
        ...sizeFields
      });
      continue;
    }

    remaining.set(shelf, available - requestedItem.quantity);

    if (requestedItem.priceCents != null && requestedItem.priceCents !== unitCents) {
      adjustments.push({
        slug: requestedItem.id,
        name: sizedName(product.name, requestedItem.size),
        requested: requestedItem.quantity,
        available,
        reason: 'price',
        priceCents: unitCents,
        ...sizeFields
      });
    }
  }
  return adjustments;
}

/**
 * A set's line, checked against the components it is built from and metered on
 * the same shelves the loose products use.
 *
 * How many sets a basket may take is the fewest any required component can
 * still supply *after everything ahead of it in the basket has been spent* —
 * which is why this reads and writes the shared `remaining` map rather than
 * asking `bundleAvailability` for a fresh answer. A basket holding the last
 * loose infuser and a set that needs one is a basket the shop cannot fill, and
 * checking the set on its own would have said it could.
 */
function bundleAdjustment(
  requestedItem: CheckoutRequestedItem,
  bundles: BundleForSale[],
  remaining: Map<string, number>
): CheckoutAdjustment | null {
  const bundle = bundles.find((candidate) => candidate.slug === requestedItem.id);
  if (!bundle || bundle.active === false || !requiredItems(bundle).length) {
    return {
      slug: requestedItem.id,
      kind: 'bundle',
      name: bundle?.title || 'That set',
      requested: requestedItem.quantity,
      available: 0,
      reason: 'unavailable'
    };
  }

  const onShelf = (item: BundleComponent) => {
    const key = shelfKey(item.product, item.size);
    const units =
      remaining.get(key) ??
      // The recipe's own view of the shelf, which is zero for a variant that
      // has been retired or was never pinned.
      componentSetsAvailable({ ...item, quantity: 1 });
    return { key, units };
  };

  const perSet = (item: BundleComponent) => Math.max(1, Math.floor(item.quantity || 1));
  const sets = requiredItems(bundle).reduce(
    (fewest, item) => Math.min(fewest, Math.floor(onShelf(item).units / perSet(item))),
    Number.POSITIVE_INFINITY
  );
  const available = Math.max(0, Number.isFinite(sets) ? sets : 0);
  const taking = Math.min(requestedItem.quantity, available);

  // Spend what this line will actually take, so the next line sees the shelf as
  // it will be. A line short of stock takes everything its binding component
  // had, which is exactly `available` sets' worth.
  for (const item of bundle.items) {
    const { key, units } = onShelf(item);
    const wanted = perSet(item) * taking;
    // An extra the shelf cannot cover for every set is left out of the box
    // rather than shrinking the order, so it spends nothing.
    if (item.optional && units < wanted) {
      remaining.set(key, units);
      continue;
    }
    remaining.set(key, Math.max(0, units - wanted));
  }

  if (available < requestedItem.quantity) {
    return {
      slug: bundle.slug,
      kind: 'bundle',
      name: bundle.title,
      requested: requestedItem.quantity,
      available,
      reason: 'stock'
    };
  }

  if (requestedItem.priceCents != null && requestedItem.priceCents !== bundle.priceCents) {
    return {
      slug: bundle.slug,
      kind: 'bundle',
      name: bundle.title,
      requested: requestedItem.quantity,
      available,
      reason: 'price',
      priceCents: bundle.priceCents
    };
  }

  return null;
}

export function checkoutAdjustmentNotice(change: {
  name: string;
  available: number;
  reason?: 'stock' | 'price' | 'unavailable' | 'size';
  priceCents?: number;
}) {
  if (change.reason === 'price' && change.priceCents != null) {
    return `${change.name} is now ${formatMoney(change.priceCents)} — total updated.`;
  }
  if (change.reason === 'unavailable') {
    return `${change.name} is no longer available and was removed.`;
  }
  if (change.reason === 'size') {
    return `${change.name} is no longer sold in that size — please choose a size again.`;
  }
  if (change.available <= 0) return `${change.name} sold out and was removed.`;
  return `Only ${change.available} of ${change.name} left — quantity updated.`;
}

/**
 * The compact backup snapshot written into Stripe session metadata. Fulfillment
 * prefers the reserved order row; this only has to resolve a session that is
 * already in flight when the hold row is missing.
 *
 * A per-line price is deliberately not in here: it costs about nine characters
 * a line to protect a path that only runs when the order row is gone, and the
 * budget it would spend is the scarce one guarded below.
 */
export type SnapshotLine =
  | { kind?: 'product'; product: { id: string }; quantity: number; size?: string | null }
  | { kind: 'bundle'; bundle: { id: string }; quantity: number };

export function encodeCheckoutItems(items: SnapshotLine[]) {
  return JSON.stringify(
    items.map((line) =>
      line.kind === 'bundle'
        ? // `k` marks the id as a bundle's. Without it a set and a product that
          // happened to share an id would resolve to whichever was found first.
          { id: line.bundle.id, q: line.quantity, k: 'b' }
        : {
            id: line.product.id,
            q: line.quantity,
            ...(line.size ? { s: line.size } : {})
          }
    )
  );
}

/**
 * Stripe metadata values are capped at 500 characters. A reserved order is the
 * source of truth (`orderId` is always sent); this snapshot is only a backup
 * for sessions that outlive a deploy. Once the cart is large enough that the
 * JSON no longer fits, omitting it is safer than throwing — `sessions.create`
 * would 500 and the customer could not pay for a basket the shop was happy to
 * sell.
 *
 * A size label costs another dozen or so characters a line, so a sized basket
 * reaches that ceiling sooner. Omitting the whole value stays the right answer:
 * a *truncated* snapshot would be worse than none, because the legacy path only
 * checks that it resolved as many lines as it parsed, so a short list would look
 * complete and record a paid order missing whatever had been cut.
 */
export const STRIPE_METADATA_VALUE_MAX = 500;

export function stripeCheckoutItemsMetadata(items: SnapshotLine[]) {
  const encoded = encodeCheckoutItems(items);
  return encoded.length <= STRIPE_METADATA_VALUE_MAX ? encoded : undefined;
}

export type ParsedCheckoutItem = { id: string; q: number; p?: number; s?: string; k?: 'b' };

export function parseCheckoutItems(value: string | null | undefined): ParsedCheckoutItem[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    const merged = new Map<string, ParsedCheckoutItem>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as { id?: unknown; q?: unknown; p?: unknown; s?: unknown; k?: unknown };
      const id = String(item.id || '').trim();
      if (!id) continue;
      const bundle = item.k === 'b';
      const s = bundle
        ? ''
        : String(item.s ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, SIZE_LABEL_MAX);
      const q = Math.max(1, Math.min(20, Math.floor(Number(item.q) || 1)));
      const price = Number(item.p);
      const key = basketLineKey(bundle ? 'bundle' : 'product', id, s);
      const current = merged.get(key);
      merged.set(key, {
        id,
        ...(bundle ? { k: 'b' as const } : {}),
        ...(s ? { s } : {}),
        q: Math.min(20, (current?.q || 0) + q),
        ...(Number.isFinite(price) && price >= 0
          ? { p: Math.round(price) }
          : current?.p != null
            ? { p: current.p }
            : {})
      });
    }
    return [...merged.values()];
  } catch {
    return [];
  }
}

/**
 * Turns a resolved bundle and a number of sets into the checkout line that
 * Stripe, the reservation and the order row all read from.
 */
export function bundleCheckoutLine(
  bundle: BundleForSale & {
    id: string;
    tagline?: string | null;
    description?: string | null;
    imageUrl?: string | null;
  },
  quantity: number
): CheckoutBundleLine {
  const { lines, skipped } = bundleStockLines(bundle, quantity);
  const fulfillment = bundleFulfillment(bundle);
  return {
    kind: 'bundle',
    bundle: {
      id: bundle.id,
      slug: bundle.slug,
      title: bundle.title,
      tagline: bundle.tagline ?? null,
      description: bundle.description ?? '',
      imageUrl: bundle.imageUrl ?? null,
      priceCents: bundle.priceCents
    },
    quantity,
    unitCents: bundle.priceCents,
    components: lines,
    skipped,
    contents: bundleContentsLine(bundle),
    ships: fulfillment.ships,
    pickup: fulfillment.pickup
  };
}
