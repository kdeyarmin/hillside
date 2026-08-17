/**
 * Shared helpers for the owner dashboard. Kept free of Next/Prisma runtime so
 * `npm test` can cover the filter and error mapping Tammy hits every day.
 */

export type AdminStockFilter = 'all' | 'active' | 'archived' | 'photo' | 'low';

export type AdminProductFilterable = {
  name: string;
  slug: string;
  sku: string | null;
  active: boolean;
  inventory: number;
  imageUrl: string | null;
};

/**
 * A product with no photograph of its own falls back to shared catalog artwork,
 * which is why three items could show the same picture. Surfacing it here makes
 * the gap visible to Tammy instead of to customers.
 */
export function productNeedsPhoto(imageUrl: string | null | undefined) {
  if (!imageUrl?.trim()) return true;
  return imageUrl.includes('/images/catalog/') || imageUrl.includes('/images/scenes/');
}

export function parseAdminStockFilter(value?: string | null): AdminStockFilter {
  if (value === 'active' || value === 'archived' || value === 'photo' || value === 'low')
    return value;
  return 'all';
}

export function productMatchesAdminFilter(
  product: AdminProductFilterable,
  query: string,
  stock: AdminStockFilter
) {
  const needle = query.trim().toLowerCase();
  if (needle) {
    const haystack = `${product.name} ${product.slug} ${product.sku || ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (stock === 'active') return product.active;
  if (stock === 'archived') return !product.active;
  if (stock === 'photo') return product.active && productNeedsPhoto(product.imageUrl);
  if (stock === 'low') return product.active && product.inventory <= 3;
  return true;
}

/**
 * Prisma reports a unique-constraint target as an array of column names, or
 * occasionally as the constraint name (`Product_sku_key`). Either way the
 * dashboard needs to tell Tammy *which* field collided — a generic "already in
 * use" on a SKU form that she thought was a slug is how duplicate products get
 * created.
 */
export function uniqueConstraintField(target: unknown): 'sku' | 'slug' | 'unknown' {
  const raw = Array.isArray(target) ? target.map(String).join(' ') : String(target || '');
  const lower = raw.toLowerCase();
  if (lower.includes('sku')) return 'sku';
  if (lower.includes('slug')) return 'slug';
  return 'unknown';
}

export function adminDashboardPath(query: Record<string, string | undefined | null> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `/admin?${encoded}` : '/admin';
}

/**
 * Next can hand a repeated query string through as `string[]`. The dashboard
 * used to call `.trim()` on `params.q` directly, so `/admin?q=one&q=two`
 * crashed the whole owner page.
 */
export function firstSearchParam(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string');
    return typeof first === 'string' ? first : '';
  }
  return '';
}

export const ADMIN_NOTICES: Record<string, string> = {
  'product-saved': 'Product saved.',
  'product-created': 'Product created.',
  'product-archived': 'Product archived. It is no longer listed in the shop.',
  'product-live': 'Product is live in the shop.',
  'stock-saved': 'Quantity updated.',
  'order-saved': 'Order updated.',
  'order-emailed': 'Confirmation email sent.',
  'message-saved': 'Message updated.',
  'review-saved': 'Review updated.',
  'subscriber-saved': 'Subscriber updated.',
  'registration-saved': 'Registration updated.',
  'registration-emailed': 'Class confirmation emailed.'
};

export const ADMIN_ERRORS: Record<string, string> = {
  slug: 'That product URL is already in use. Choose a different slug.',
  sku: 'That SKU is already in use. Choose a different item number.',
  inventory:
    'Stock changed while you were editing. Refresh the page and save again so you do not overwrite a live checkout hold.',
  'product-invalid': 'A product needs a name, a description and a price of zero or more.',
  'order-missing': 'That order is no longer here.',
  'order-email-failed':
    'The confirmation email could not be sent. Check that RESEND_API_KEY is set.',
  'order-no-email': 'That order has no customer email to write to.',
  'order-not-confirmable':
    'Confirmation mail is only sent for paid orders that have not shipped yet.',
  'registration-email-failed':
    'The class confirmation could not be sent. The guest’s previous classroom link is still valid. Check that RESEND_API_KEY is set.',
  throttled: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  '1': 'That email address and password didn’t match an admin account.'
};
