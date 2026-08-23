/**
 * Shared helpers for the owner dashboard. Kept free of Next/Prisma runtime so
 * `npm test` can cover the filter and error mapping Tammy hits every day.
 */

import { readStoredSizes, storedSizesTrackStock } from './product-sizes.ts';

export type AdminStockFilter = 'all' | 'active' | 'archived' | 'photo' | 'low';

export type AdminProductFilterable = {
  name: string;
  slug: string;
  sku: string | null;
  active: boolean;
  inventory: number;
  imageUrl: string | null;
  /** Raw `Product.sizes`; only the per-size counts are read from it. */
  sizes?: unknown;
};

/** Where "Only 3 left" starts, on the shop card and on the dashboard chip. */
export const LOW_STOCK_AT = 3;

/**
 * A product with no photograph of its own falls back to shared catalog artwork,
 * which is why three items could show the same picture. Surfacing it here makes
 * the gap visible to Tammy instead of to customers.
 */
export function productNeedsPhoto(imageUrl: string | null | undefined) {
  if (!imageUrl?.trim()) return true;
  return imageUrl.includes('/images/catalog/') || imageUrl.includes('/images/scenes/');
}

/**
 * What the Low stock chip counts. On a product counted per size that is any one
 * size running down, not the total: a plant with nine on the bench and none of
 * them in 6" pots has a size to pot up, and the total alone would keep it off
 * the list Tammy works from until the 4" ones ran out too.
 */
export function productIsLowStock(product: {
  active: boolean;
  inventory: number;
  sizes?: unknown;
}) {
  if (!product.active) return false;
  const stored = readStoredSizes(product.sizes);
  if (storedSizesTrackStock(stored)) {
    return stored.some((size) => (size.inventory ?? 0) <= LOW_STOCK_AT);
  }
  return product.inventory <= LOW_STOCK_AT;
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
  if (stock === 'low') return productIsLowStock(product);
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

export function adminContentPath(query: Record<string, string | undefined | null> = {}) {
  return adminDashboardPath(query).replace(/^\/admin/, '/admin/content');
}

export function adminEmailPath(query: Record<string, string | undefined | null> = {}) {
  return adminDashboardPath(query).replace(/^\/admin/, '/admin/email');
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
  'registration-emailed': 'Class confirmation emailed.',
  'category-saved': 'Category saved.',
  'category-created': 'Category created.',
  'category-deleted': 'Category deleted.',
  'category-hidden': 'Category hidden. It no longer appears in the shop filters.',
  'category-shown': 'Category is showing in the shop again.',
  'collection-saved': 'Collection saved.',
  'collection-created': 'Collection created.',
  'collection-deleted': 'Collection deleted.',
  'class-saved': 'Class saved.',
  'class-created': 'Class created.',
  'class-room-ready': 'Telnyx room prepared.',
  'gallery-saved': 'Gallery item saved.',
  'gallery-created': 'Gallery item added.',
  'gallery-deleted': 'Gallery photo deleted.',
  'amazon-saved': 'Amazon pick saved.',
  'amazon-created': 'Amazon pick published.',
  'amazon-added': 'Added from the link. The name, photo and details came from Amazon.',
  'amazon-added-basic':
    'Added from the link and live on the picks page. Amazon did not send the item’s details just now — open the pick to add a photo, or use “Get details from Amazon” to try again.',
  'amazon-duplicate': 'That item is already one of your picks. Here it is.',
  'amazon-filled': 'Filled in from Amazon. Anything you had written yourself was kept.',
  'amazon-fill-empty':
    'Amazon sent nothing new, so the pick is unchanged. It is still live — add a photo below if it needs one.',
  'care-saved': 'Care sheet saved.',
  'care-created': 'Care sheet published.',
  'content-archived': 'Archived. It is no longer on the public website.',
  'email-sent': 'Email sent.',
  'reply-sent': 'Reply sent. It is saved with the message below.'
};

export const ADMIN_ERRORS: Record<string, string> = {
  slug: 'That product URL is already in use. Choose a different slug.',
  sku: 'That SKU is already in use. Choose a different item number.',
  inventory:
    'Stock changed while you were editing. Refresh the page and save again so you do not overwrite a live checkout hold.',
  'product-invalid': 'A product needs a name, a description and a price of zero or more.',
  'order-missing': 'That order is no longer here.',
  'order-email-failed':
    'The confirmation email could not be sent. Check that SENDGRID_API_KEY is set.',
  'order-no-email': 'That order has no customer email to write to.',
  'order-not-confirmable':
    'Confirmation mail is only sent for paid orders that have not shipped yet.',
  'order-status': 'That is not a status this shop uses. Refresh the page and try again.',
  'order-already-paid':
    'That checkout finished paying while you were cancelling it, so the order was left paid. Refresh and look at it again.',
  'pickup-note':
    'Add the arranged pickup window before marking this ready. The customer is told to check their email for the time.',
  'pickup-email-failed':
    'The pickup-ready email could not be sent. The window is saved on the order — use Resend pickup email after checking SENDGRID_API_KEY.',
  'registration-email-failed':
    'The class confirmation could not be sent. The guest’s previous classroom link is still valid. Check that SENDGRID_API_KEY is set.',
  'category-invalid': 'A category needs a name.',
  'category-required':
    'Choose a category for this product. It decides which details the product is asked for and which shop filter it appears under.',
  'category-slug': 'That category address is already in use. Choose a different name or slug.',
  'category-missing': 'That category is no longer here.',
  'category-in-use':
    'That category still holds products, and deleting it would drop them out of every filter that leads to them. Move them to another category first, or hide this one instead.',
  'collection-invalid': 'A collection needs a name.',
  'collection-missing': 'That collection is no longer here.',
  'class-room-failed':
    'The class was saved, but the Telnyx room could not be prepared. Check TELNYX_API_KEY and try Prepare room again.',
  'content-invalid': 'That form was missing a required field.',
  'content-missing': 'That item is no longer here.',
  'amazon-url':
    'That does not look like an Amazon link. Paste the item’s own address — an amazon.com one (or any other Amazon country address), or a shortened a.co or amzn.to link.',
  throttled: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  '1': 'That email address and password didn’t match an admin account.',
  'email-recipient':
    'Check the address you are writing to. Separate more than one with a comma, up to five.',
  'email-empty': 'An email needs a subject and a message.',
  'email-long': 'That message is too long to send. Shorten it and try again.',
  'email-failed':
    'The email could not be sent, so nothing left the shop. Check that SENDGRID_API_KEY is set, then try again.',
  'email-throttled':
    'That is a lot of email in a short time. Wait a few minutes and send the rest.',
  'message-missing': 'That customer message is no longer here.'
};
