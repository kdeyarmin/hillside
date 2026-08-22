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
  slug: string;
  size: string | null;
  constructor(slug: string, size: string | null = null) {
    super(`Insufficient stock for ${slug}`);
    this.name = 'InsufficientStockError';
    this.slug = slug;
    this.size = size;
  }
}

export type CheckoutRequestedItem = {
  id: string;
  quantity: number;
  priceCents?: number;
  /** The chosen size, for products sold in more than one. */
  size?: string;
};

export type CheckoutAdjustment = {
  slug: string;
  name: string;
  requested: number;
  available: number;
  reason: 'stock' | 'price' | 'unavailable' | 'size';
  priceCents?: number;
  size?: string;
};

export type CheckoutLine = {
  product: {
    id: string;
    slug: string;
    name: string;
    shortDescription: string | null;
    description: string;
    priceCents: number;
    inventory: number;
    imageUrl: string | null;
  };
  quantity: number;
  size?: string | null;
  /** What this line is charged, which for a sized line is the size's price. */
  unitCents: number;
};

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
   * Keyed by product *and* size: a basket holding a 4" and a 6" pot of the same
   * plant is two lines, and merging them on the slug alone would have charged
   * for two of whichever size happened to arrive first.
   */
  const merged = new Map<string, CheckoutRequestedItem>();
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as { id?: unknown; quantity?: unknown; priceCents?: unknown; size?: unknown };
    const id = String(raw.id || '').trim();
    if (!id) continue;
    const size = String(raw.size ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SIZE_LABEL_MAX);
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
    const priceCents = Number(raw.priceCents);
    const current = merged.get(cartLineKey(id, size));
    merged.set(cartLineKey(id, size), {
      id,
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

export function checkoutAdjustments(
  requested: CheckoutRequestedItem[],
  products: Array<{
    slug: string;
    name: string;
    inventory: number;
    priceCents: number;
    active?: boolean;
    sizes?: unknown;
  }>
): CheckoutAdjustment[] {
  const adjustments: CheckoutAdjustment[] = [];
  /**
   * Stock is spent line by line rather than each line being checked against the
   * shelf independently, because two lines drawing on the same shelf would
   * otherwise each pass on the last three jars.
   *
   * Which shelf a line draws on depends on the product. Sizes the owner did not
   * count separately share the product's one count, so every line of that
   * product meters against the same key; sizes she did count have their own, so
   * a basket holding the last 4" pot and the last 6" pot is two lines against
   * two shelves and both are honoured.
   */
  const remaining = new Map<string, number>();

  for (const requestedItem of requested) {
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
    const shelf = sizesTrackStock(sizes) ? cartLineKey(product.slug, chosen?.label) : product.slug;
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
export function encodeCheckoutItems(
  items: Array<{ product: { id: string }; quantity: number; size?: string | null }>
) {
  return JSON.stringify(
    items.map(({ product, quantity, size }) => ({
      id: product.id,
      q: quantity,
      ...(size ? { s: size } : {})
    }))
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

export function stripeCheckoutItemsMetadata(
  items: Array<{ product: { id: string }; quantity: number; size?: string | null }>
) {
  const encoded = encodeCheckoutItems(items);
  return encoded.length <= STRIPE_METADATA_VALUE_MAX ? encoded : undefined;
}

export type ParsedCheckoutItem = { id: string; q: number; p?: number; s?: string };

export function parseCheckoutItems(value: string | null | undefined): ParsedCheckoutItem[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    const merged = new Map<string, ParsedCheckoutItem>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as { id?: unknown; q?: unknown; p?: unknown; s?: unknown };
      const id = String(item.id || '').trim();
      if (!id) continue;
      const s = String(item.s ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, SIZE_LABEL_MAX);
      const q = Math.max(1, Math.min(20, Math.floor(Number(item.q) || 1)));
      const price = Number(item.p);
      const current = merged.get(cartLineKey(id, s));
      merged.set(cartLineKey(id, s), {
        id,
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
