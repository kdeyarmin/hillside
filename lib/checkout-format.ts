import { absoluteUrl, formatMoney, resolveImageUrl } from './store.ts';

/**
 * How long a Stripe Checkout Session may hold stock. Matches the class-seat
 * hold, and stays at or above Stripe's 30-minute minimum for `expires_at`.
 */
export const CHECKOUT_HOLD_MINUTES = 35;

export class InsufficientStockError extends Error {
  slug: string;
  constructor(slug: string) {
    super(`Insufficient stock for ${slug}`);
    this.name = 'InsufficientStockError';
    this.slug = slug;
  }
}

export type CheckoutRequestedItem = { id: string; quantity: number; priceCents?: number };

export type CheckoutAdjustment = {
  slug: string;
  name: string;
  requested: number;
  available: number;
  reason: 'stock' | 'price' | 'unavailable';
  priceCents?: number;
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
  const merged = new Map<string, { quantity: number; priceCents?: number }>();
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as { id?: unknown; quantity?: unknown; priceCents?: unknown };
    const id = String(raw.id || '').trim();
    if (!id) continue;
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
    const priceCents = Number(raw.priceCents);
    const current = merged.get(id);
    merged.set(id, {
      quantity: Math.min(20, (current?.quantity || 0) + quantity),
      ...(Number.isFinite(priceCents) && priceCents >= 0
        ? { priceCents: Math.round(priceCents) }
        : current?.priceCents != null
          ? { priceCents: current.priceCents }
          : {})
    });
  }
  return [...merged].map(([id, value]) => ({ id, ...value }));
}

export function checkoutAdjustments(
  requested: CheckoutRequestedItem[],
  products: Array<{
    slug: string;
    name: string;
    inventory: number;
    priceCents: number;
    active?: boolean;
  }>
): CheckoutAdjustment[] {
  const adjustments: CheckoutAdjustment[] = [];
  for (const requestedItem of requested) {
    const product = products.find((candidate) => candidate.slug === requestedItem.id);
    if (!product || product.active === false) {
      adjustments.push({
        slug: requestedItem.id,
        name: product?.name || 'That item',
        requested: requestedItem.quantity,
        available: 0,
        reason: 'unavailable'
      });
      continue;
    }

    const available = Math.max(0, product.inventory);
    if (available < requestedItem.quantity) {
      adjustments.push({
        slug: requestedItem.id,
        name: product.name,
        requested: requestedItem.quantity,
        available,
        reason: 'stock'
      });
      continue;
    }

    if (requestedItem.priceCents != null && requestedItem.priceCents !== product.priceCents) {
      adjustments.push({
        slug: requestedItem.id,
        name: product.name,
        requested: requestedItem.quantity,
        available,
        reason: 'price',
        priceCents: product.priceCents
      });
    }
  }
  return adjustments;
}

export function checkoutAdjustmentNotice(change: {
  name: string;
  available: number;
  reason?: 'stock' | 'price' | 'unavailable';
  priceCents?: number;
}) {
  if (change.reason === 'price' && change.priceCents != null) {
    return `${change.name} is now ${formatMoney(change.priceCents)} — total updated.`;
  }
  if (change.reason === 'unavailable') {
    return `${change.name} is no longer available and was removed.`;
  }
  if (change.available <= 0) return `${change.name} sold out and was removed.`;
  return `Only ${change.available} of ${change.name} left — quantity updated.`;
}

export function encodeCheckoutItems(items: Array<{ product: { id: string }; quantity: number }>) {
  return JSON.stringify(items.map(({ product, quantity }) => ({ id: product.id, q: quantity })));
}

export type ParsedCheckoutItem = { id: string; q: number; p?: number };

export function parseCheckoutItems(value: string | null | undefined): ParsedCheckoutItem[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    const merged = new Map<string, { q: number; p?: number }>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as { id?: unknown; q?: unknown; p?: unknown };
      const id = String(item.id || '').trim();
      if (!id) continue;
      const q = Math.max(1, Math.min(20, Math.floor(Number(item.q) || 1)));
      const price = Number(item.p);
      const current = merged.get(id);
      merged.set(id, {
        q: Math.min(20, (current?.q || 0) + q),
        ...(Number.isFinite(price) && price >= 0
          ? { p: Math.round(price) }
          : current?.p != null
            ? { p: current.p }
            : {})
      });
    }
    return [...merged].map(([id, value]) => ({ id, ...value }));
  } catch {
    return [];
  }
}
