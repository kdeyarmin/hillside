/**
 * Shared helpers for the owner dashboard. Kept free of Next/Prisma runtime so
 * `npm test` can cover the filter and error mapping Tammy hits every day.
 */

import { readStoredSizes, storedSizesTrackStock } from './product-sizes.ts';

export type AdminStockFilter =
  'all' | 'active' | 'archived' | 'photo' | 'low' | 'out' | 'incomplete';

export type AdminProductFilterable = {
  name: string;
  slug: string;
  sku: string | null;
  active: boolean;
  inventory: number;
  imageUrl: string | null;
  /** Raw `Product.sizes`; only the per-size counts are read from it. */
  sizes?: unknown;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
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

/**
 * A listed product with nothing left to sell. Separated from "low stock"
 * because they are different jobs: one is a reorder note, the other is a
 * listing customers can see and cannot buy from.
 */
export function productIsOutOfStock(product: { active: boolean; inventory: number }) {
  return product.active && product.inventory <= 0;
}

/**
 * What a listing is still missing before it can sell on its own.
 *
 * Only fields a shopper actually feels the absence of: the card blurb that
 * appears in every grid, the long copy on the page, the contents or
 * ingredients panel, and the item number the owner needs to find it again. A
 * missing photograph is deliberately not here — it has its own count, its own
 * chip and its own dashboard card already.
 */
export function incompleteProductFields(product: AdminProductFilterable) {
  const missing: string[] = [];
  if (!product.shortDescription?.trim()) missing.push('card blurb');
  if ((product.description || '').trim().length < 40) missing.push('description');
  if (!product.details?.trim()) missing.push('details');
  if (!product.sku?.trim()) missing.push('SKU');
  return missing;
}

export function productHasIncompleteInfo(product: AdminProductFilterable) {
  return product.active && incompleteProductFields(product).length > 0;
}

export function parseAdminStockFilter(value?: string | null): AdminStockFilter {
  if (
    value === 'active' ||
    value === 'archived' ||
    value === 'photo' ||
    value === 'low' ||
    value === 'out' ||
    value === 'incomplete'
  )
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
  if (stock === 'out') return productIsOutOfStock(product);
  if (stock === 'incomplete') return productHasIncompleteInfo(product);
  return true;
}

export type AdminOrderFilter = 'all' | 'awaiting' | 'pickup';

export function parseAdminOrderFilter(value?: string | null): AdminOrderFilter {
  if (value === 'awaiting' || value === 'pickup') return value;
  return 'all';
}

/**
 * Which orders the list shows. "Pickup" means a pickup order that still owes
 * the customer something — a collected one is finished, and leaving it in the
 * list would make the dashboard's own count disagree with what it renders.
 */
export function orderMatchesAdminFilter(
  order: { awaiting: boolean; pickup: boolean },
  filter: AdminOrderFilter
) {
  if (filter === 'awaiting') return order.awaiting;
  if (filter === 'pickup') return order.pickup && order.awaiting;
  return true;
}

/**
 * A message that reads like someone asking for a planter to be made for them.
 *
 * These arrive through the ordinary contact form, and the contact page's own
 * subject list is where most of them are labelled — but people also type it in
 * their own words, so the body is searched too. Being generous here is the
 * right failure: a false positive costs Tammy one glance at a message she was
 * going to read anyway, while a miss loses a custom order.
 */
const PLANTER_PHRASES = [
  'custom planter',
  'custom arrangement',
  'planter arrangement',
  'custom pot',
  'made to order',
  'centerpiece',
  'centrepiece',
  'dish garden',
  'arrangement for'
];

export function isCustomPlanterRequest(message: { subject: string; message?: string | null }) {
  const haystack = `${message.subject} ${message.message || ''}`.toLowerCase();
  return PLANTER_PHRASES.some((phrase) => haystack.includes(phrase));
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
  'review-requests-sent': 'Review requests sent. Each of those orders is only ever asked once.',
  'review-requests-none': 'Nobody was due a review request, so nothing was sent.',
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
  'collection-invalid': 'A collection needs a name.',
  'collection-missing': 'That collection is no longer here.',
  'collection-locked':
    'That collection is part of the site header and cannot be renamed away, hidden or deleted.',
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
  'message-missing': 'That customer message is no longer here.',
  'review-requests-failed':
    'The review requests could not be sent. Check that SENDGRID_API_KEY is set — those orders are marked as asked either way, so they will not queue up again.'
};
