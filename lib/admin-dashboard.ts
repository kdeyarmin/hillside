/**
 * Shared helpers for the owner dashboard. Kept free of Next/Prisma runtime so
 * `npm test` can cover the filter and error mapping Tammy hits every day.
 */

import {
  LOW_STOCK_AT,
  inventorySignals,
  productIsLowStock,
  type InventoryProduct
} from './inventory.ts';
import { needsRealPhoto } from './product-photos.ts';
import { productCompleteness, type CompletenessProduct } from './product-completeness.ts';

/**
 * The chips above the inventory list. Each one is a job: everything on this list
 * is something Tammy might sit down and clear in an afternoon.
 *
 * `archived` is the old spelling of `inactive` and is still accepted, because
 * every "Archive from shop" redirect the dashboard has ever issued links to it.
 */
export type AdminStockFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'out'
  | 'low'
  | 'reorder'
  | 'no-reorder'
  | 'sku'
  | 'supplier'
  | 'photo'
  | 'restocked'
  | 'incomplete';

export type AdminProductFilterable = InventoryProduct &
  CompletenessProduct & {
    name: string;
    slug: string;
    supplierItemNumber?: string | null;
  };

export { LOW_STOCK_AT, productIsLowStock };

/**
 * A product with no photograph of its own falls back to shared catalog artwork,
 * which is why three items could show the same picture. Surfacing it here makes
 * the gap visible to Tammy instead of to customers.
 */
export function productNeedsPhoto(imageUrl: string | null | undefined) {
  return needsRealPhoto(imageUrl);
}

const FILTERS: AdminStockFilter[] = [
  'all',
  'active',
  'inactive',
  'out',
  'low',
  'reorder',
  'no-reorder',
  'sku',
  'supplier',
  'photo',
  'restocked',
  'incomplete'
];

export function parseAdminStockFilter(value?: string | null): AdminStockFilter {
  if (value === 'archived') return 'inactive';
  return FILTERS.includes(value as AdminStockFilter) ? (value as AdminStockFilter) : 'all';
}

/**
 * Whether a product belongs under one chip. Split out from the search so the
 * dashboard can count each chip over the whole catalog while showing only what
 * matches the search box — a count that moved every time she typed a letter
 * would be useless for deciding what to do next.
 */
export function productMatchesStockFilter(
  product: AdminProductFilterable,
  stock: AdminStockFilter,
  now = new Date()
) {
  if (stock === 'all') return true;
  if (stock === 'active') return product.active;
  if (stock === 'inactive') return !product.active;

  const signals = inventorySignals(product, now);
  if (stock === 'out') return signals.outOfStock;
  if (stock === 'low') return signals.lowStock;
  if (stock === 'reorder') return signals.needsReorder;
  if (stock === 'no-reorder') return signals.missingReorderPoint;
  if (stock === 'sku') return signals.missingSku;
  if (stock === 'supplier') return signals.missingSupplier;
  if (stock === 'restocked') return signals.recentlyRestocked;
  if (stock === 'photo') return product.active && productNeedsPhoto(product.imageUrl);
  if (stock === 'incomplete') {
    return product.active && productCompleteness(product).missingRequired.length > 0;
  }
  return true;
}

export function productMatchesAdminFilter(
  product: AdminProductFilterable,
  query: string,
  stock: AdminStockFilter,
  now = new Date()
) {
  const needle = query.trim().toLowerCase();
  if (needle) {
    // Supplier and their item number are in here because a restock starts from a
    // packing slip: she has the vendor's number in front of her, not ours.
    const haystack =
      `${product.name} ${product.slug} ${product.sku || ''} ${product.supplier || ''} ${product.supplierItemNumber || ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return productMatchesStockFilter(product, stock, now);
}

/** The chips, in the order they read across the top of the inventory list. */
export const ADMIN_STOCK_FILTERS: Array<{ key: AdminStockFilter; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'active', label: 'In the shop' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'out', label: 'Out of stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'reorder', label: 'Needs reorder' },
  { key: 'no-reorder', label: 'No reorder point' },
  { key: 'sku', label: 'Missing SKU' },
  { key: 'supplier', label: 'Missing supplier' },
  { key: 'photo', label: 'Missing photograph' },
  { key: 'incomplete', label: 'Incomplete' },
  { key: 'restocked', label: 'Recently restocked' }
];

export function adminStockFilterCounts(products: AdminProductFilterable[], now = new Date()) {
  const counts = new Map<AdminStockFilter, number>();
  for (const { key } of ADMIN_STOCK_FILTERS) {
    counts.set(
      key,
      products.filter((product) => productMatchesStockFilter(product, key, now)).length
    );
  }
  return counts;
}

/**
 * One line of the Needs attention panel: a count, the sentence it reads as, and
 * the chip that shows exactly those products.
 */
export type AttentionItem = {
  key: AdminStockFilter;
  count: number;
  /** The sentence without its leading number, so a UI can style the two apart. */
  detail: string;
  /** The whole sentence: "3 products are out of stock". */
  message: string;
  href: string;
};

const many = (count: number) => (count === 1 ? 'product' : 'products');
const verb = (count: number) => (count === 1 ? 'is' : 'are');
const has = (count: number) => (count === 1 ? 'has' : 'have');
const its = (count: number) => (count === 1 ? 'its' : 'their');

/**
 * What is actually worth doing something about, most urgent first.
 *
 * Deliberately shorter than the chip row above it. Every filter is a view Tammy
 * may want; only some of them are a problem, and a panel that lists twelve
 * numbers every morning is one she stops reading. Anything at zero is left out
 * entirely rather than shown as a reassuring nought.
 */
export function inventoryAttention(
  catalog: AdminProductFilterable[],
  now = new Date()
): AttentionItem[] {
  const counts = adminStockFilterCounts(catalog, now);
  const at = (key: AdminStockFilter) => counts.get(key) || 0;

  const lines: Array<{ key: AdminStockFilter; detail: (count: number) => string }> = [
    { key: 'out', detail: (n) => `${many(n)} ${verb(n)} out of stock` },
    { key: 'reorder', detail: (n) => `${many(n)} ${has(n)} reached ${its(n)} reorder point` },
    { key: 'low', detail: (n) => `${many(n)} ${verb(n)} running low` },
    { key: 'photo', detail: (n) => `${many(n)} ${verb(n)} missing product photographs` },
    { key: 'incomplete', detail: (n) => `${many(n)} ${has(n)} incomplete required information` },
    { key: 'sku', detail: (n) => `${many(n)} ${verb(n)} missing a SKU` },
    { key: 'supplier', detail: (n) => `${many(n)} ${verb(n)} missing a supplier` },
    { key: 'no-reorder', detail: (n) => `${many(n)} ${has(n)} no reorder point set` }
  ];

  return lines.flatMap(({ key, detail }) => {
    const count = at(key);
    if (count === 0) return [];
    const text = detail(count);
    return [
      {
        key,
        count,
        detail: text,
        message: `${count} ${text}`,
        href: adminDashboardPath({ stock: key, section: 'inventory' })
      }
    ];
  });
}

export type AdminOrderFilter = 'all' | 'awaiting' | 'pickup';

export function parseAdminOrderFilter(value?: string | null): AdminOrderFilter {
  if (value === 'awaiting' || value === 'pickup') return value;
  return 'all';
}

/**
 * Which orders the list shows, and — just as importantly — the two views
 * partition the outstanding work rather than overlapping.
 *
 * Packing a parcel and preparing a pickup are different jobs: one is a box, a
 * label and a carrier, the other is setting something aside and emailing a
 * window. A pickup counted in both put one order on the Today board twice and
 * added it to the day's total twice over. "To pack" is therefore what still
 * has to be *shipped*, and pickups have their own filter and their own card.
 *
 * "Pickup" means one that still owes the customer something. A collected
 * order is finished, and leaving it in the list would make the dashboard's
 * own count disagree with what it renders.
 */
export function orderMatchesAdminFilter(
  order: { awaiting: boolean; pickup: boolean },
  filter: AdminOrderFilter
) {
  if (filter === 'awaiting') return order.awaiting && !order.pickup;
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

export function adminDiscountsPath(query: Record<string, string | undefined | null> = {}) {
  return adminDashboardPath(query).replace(/^\/admin/, '/admin/discounts');
}

export function adminMerchandisingPath(query: Record<string, string | undefined | null> = {}) {
  return adminDashboardPath(query).replace(/^\/admin/, '/admin/merchandising');
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
  'stock-received': 'Delivery recorded. The quantity and the restock date are updated.',
  'product-saved-draft':
    'Saved as a draft. It is not listed in the shop until the information below is filled in.',
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
  'review-requests-sent':
    'Review requests sent. Each of those orders is only ever asked once — if more were waiting than one batch holds, press it again for the rest.',
  'review-requests-none': 'Nobody was due a review request, so nothing was sent.',
  'care-saved': 'Care sheet saved.',
  'care-created': 'Care sheet published.',
  'bundle-saved': 'Set saved.',
  'bundle-created': 'Set created.',
  'bundle-archived': 'Set archived. It is no longer offered on the website.',
  'bundle-live':
    'Set is live — it will appear on the website whenever every piece in it is in stock.',
  'bundle-deleted': 'Set deleted. Past orders that contained it are unchanged.',
  'relations-saved': 'Recommendations saved.',
  'traits-saved': 'Traits saved. They are what the automatic suggestions match on.',
  'guide-products-saved': 'Products on that guide saved.',
  'content-archived': 'Archived. It is no longer on the public website.',
  'section-saved': 'Homepage row saved.',
  'section-created': 'Homepage row added.',
  'section-deleted': 'Homepage row removed.',
  'sections-arranged': 'Homepage order saved.',
  'products-arranged': 'Product order saved.',
  'collections-arranged': 'Collection order saved.',
  'merchandising-saved': 'Merchandising updated.',
  'email-sent': 'Email sent.',
  'reply-sent': 'Reply sent. It is saved with the message below.',
  'promotion-saved': 'Promo code saved.',
  'promotion-created': 'Promo code created. It works in the cart straight away.',
  'promotion-deleted': 'Promo code deleted.',
  'promotion-live': 'Promo code is being accepted again.',
  'promotion-paused': 'Promo code paused. Nobody can redeem it until you switch it back on.',
  'promotions-generated': 'Codes generated. They are at the top of the list below.',
  'promotions-generated-partial':
    'Codes generated. One or two were already in use, so those were left exactly as they were.',
  'gift-cards-created': 'Gift cards issued. They are at the top of the list below.',
  'gift-card-emailed': 'Gift card emailed to its recipient.',
  'gift-card-adjusted': 'Gift card balance updated.',
  'gift-card-live': 'Gift card is spendable again.',
  'gift-card-paused': 'Gift card put on hold. It cannot be spent until you switch it back on.'
};

export const ADMIN_ERRORS: Record<string, string> = {
  slug: 'That product URL is already in use. Choose a different slug.',
  sku: 'That SKU is already in use. Choose a different item number.',
  inventory:
    'Stock changed while you were editing. Refresh the page and save again so you do not overwrite a live checkout hold.',
  'product-invalid': 'A product needs a name, a description and a price of zero or more.',
  /**
   * The one place completeness refuses rather than advises. Everything else on
   * the checklist is a nudge; net contents and an ingredient list on something
   * people drink or put on their skin are not ours to skip.
   */
  'publish-blocked':
    'A tea, soap or lotion needs its net weight and ingredient list before it can be listed for sale. Everything else was saved as a draft — fill those two in, then tick “Active in shop”.',
  'restock-invalid':
    'Enter how many arrived — a whole number of one or more, against a size this product is sold in.',
  'product-missing': 'That product is no longer here. Refresh the page and look again.',
  'order-missing': 'That order is no longer here.',
  'order-email-failed':
    'The confirmation email could not be sent. Check that SENDGRID_API_KEY is set.',
  'order-no-email': 'That order has no customer email to write to.',
  'order-not-confirmable':
    'Confirmation mail is only sent for paid orders that have not shipped yet.',
  'order-status': 'That is not a status this shop uses. Refresh the page and try again.',
  'order-gift-card-returned':
    'That order’s gift card was already put back on the card, and it may well have been spent since — so the order cannot be made live again without the shop paying for it twice. Place a new order instead, which charges the card properly.',
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
  'category-in-promotion':
    'A promo code is narrowed to that category, and deleting it would quietly turn that code into a storewide one. Point the code at another category, or delete the code, then try again.',
  'category-in-use':
    'That category still holds products, and deleting it would drop them out of every filter that leads to them. Move them to another category first, or hide this one instead.',
  'collection-invalid': 'A collection needs a name.',
  'section-invalid': 'A homepage row needs a heading, and a collection row needs a collection.',
  'section-missing': 'That homepage row is no longer here.',
  'merchandising-missing': 'That product is no longer here.',
  'collection-missing': 'That collection is no longer here.',
  'class-room-failed':
    'The class was saved, but the Telnyx room could not be prepared. Check TELNYX_API_KEY and try Prepare room again.',
  'content-invalid': 'That form was missing a required field.',
  'content-missing': 'That item is no longer here.',
  'bundle-invalid': 'A set needs a name, a description and a price.',
  'bundle-empty':
    'A set needs at least one required item in it. An "extra" on its own is not something we can pack.',
  'bundle-slug': 'That set URL is already in use. Choose a different one.',
  'bundle-missing': 'That set is no longer here.',
  'bundle-product-missing':
    'One of the products in that set is no longer available to add. Refresh the page and choose again.',
  'relation-invalid': 'Choose a product before saving its recommendations.',
  'guide-missing': 'That care guide is no longer here.',
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
  'promotion-code':
    'A promo code needs at least three letters or numbers, and cannot be one you are already using.',
  'promotion-value':
    'Say what the code takes off: a percentage between 1 and 100, or an amount above zero.',
  'promotion-dates': 'The end of a promotion cannot come before its start.',
  'promotion-missing': 'That promo code is no longer here.',
  'promotion-redeemed':
    'That code has already been used on an order, so deleting it would leave those orders pointing at nothing. Pause it instead — it stops working immediately either way.',
  'gift-card-amount': 'A gift card needs an amount between $1 and $1,000.',
  'gift-card-count': 'Choose how many to make — between 1 and 100 at a time.',
  'gift-card-missing': 'That gift card is no longer here.',
  'gift-card-recipient': 'Add the recipient’s email address to the card before sending it to them.',
  'gift-card-email-failed':
    'The gift card could not be emailed, so the recipient has not been sent it. Check that SENDGRID_API_KEY is set, then try again — the card itself is safe and its number is below.',
  'gift-card-adjust': 'Enter how much to add or take off, as an amount other than zero.',
  'review-requests-failed':
    'The review requests could not be sent. Check that SENDGRID_API_KEY is set — those orders are marked as asked either way, so they will not queue up again.'
};
