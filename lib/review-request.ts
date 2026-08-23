/**
 * The one email we send after an order is finished: "how did it settle in?".
 *
 * Deliberately narrow. It goes out once per order and never again, only after
 * the order has actually been fulfilled and had time to arrive, and never for
 * an order that was cancelled or refunded. There is no second reminder, no
 * drip, and no way for the same order to be asked twice — `Order.reviewRequestSentAt`
 * is the record, and the eligibility rules here are what read it.
 *
 * Kept free of Prisma so the rules and the letter are covered by `npm test`;
 * `lib/review-request-send.ts` is the part that touches the database.
 */

import { emailShell, escapeHtml } from './email.ts';
import { sizedName } from './product-sizes.ts';
import { absoluteUrl } from './store.ts';

/**
 * How long after an order is fulfilled before we ask. Long enough that a
 * shipped plant has arrived and been unpacked, short enough that the person
 * still remembers ordering it.
 */
export const REVIEW_REQUEST_DELAY_DAYS = 14;

/**
 * How far back we look. An order fulfilled months ago is not a review
 * opportunity, it is a surprise email about something long forgotten — and
 * without this ceiling, switching the follow-up on would mail every customer
 * the shop has ever had, all at once.
 */
export const REVIEW_REQUEST_MAX_AGE_DAYS = 90;

/** How many go out in one run, so a first run cannot become a mail blast. */
export const REVIEW_REQUEST_BATCH = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Orders fulfilled on or before this moment are old enough to ask about. */
export function reviewRequestDueBefore(now = new Date()) {
  return new Date(now.getTime() - REVIEW_REQUEST_DELAY_DAYS * DAY_MS);
}

/** Orders fulfilled before this moment are too old to ask about. */
export function reviewRequestTooOldBefore(now = new Date()) {
  return new Date(now.getTime() - REVIEW_REQUEST_MAX_AGE_DAYS * DAY_MS);
}

export type ReviewRequestCandidate = {
  status: string;
  email: string | null;
  fulfilledAt: Date | null;
  reviewRequestSentAt: Date | null;
  items: ReadonlyArray<{
    productId: string | null;
    /** A set's line names no product; what came off the shelf is underneath. */
    components?: ReadonlyArray<{ productId: string }>;
  }>;
};

/**
 * Whether this order should be asked for a review right now.
 *
 * Every clause here is a way the shop could annoy someone: asking twice, asking
 * about an order that never shipped, asking about a refund, asking about
 * something bought last spring, or asking an order with nothing in it.
 */
export function isReviewRequestDue(order: ReviewRequestCandidate, now = new Date()) {
  if (order.reviewRequestSentAt) return false;
  if (!order.email) return false;
  if (order.status !== 'FULFILLED') return false;
  if (!order.fulfilledAt) return false;
  if (!order.items.length) return false;
  if (order.fulfilledAt > reviewRequestDueBefore(now)) return false;
  if (order.fulfilledAt < reviewRequestTooOldBefore(now)) return false;
  return true;
}

export type ReviewRequestOrder = {
  invoiceNumber: string;
  customerName: string;
  items: ReadonlyArray<{
    name: string;
    size?: string | null;
    product: { slug: string; name: string } | null;
    /**
     * The pieces inside a set. Its own line has no product page to send anyone
     * to, but every piece does — and a customer who was sent the Tea Starter Set
     * has an opinion about the tea and the infuser, which is the whole point of
     * asking.
     */
    components?: ReadonlyArray<{
      productId?: string | null;
      product: { slug: string; name: string } | null;
      name: string;
    }>;
  }>;
};

/**
 * One line per distinct product, because an order of three of the same plant is
 * still one thing to review, and two sizes of it are still one product page.
 */
export function reviewRequestProducts(order: ReviewRequestOrder) {
  const seen = new Set<string>();
  const products: Array<{ slug: string; name: string }> = [];
  const add = (product: { slug: string; name: string } | null | undefined, fallback: string) => {
    if (!product?.slug || seen.has(product.slug)) return;
    seen.add(product.slug);
    products.push({ slug: product.slug, name: product.name || fallback });
  };
  for (const item of order.items) {
    if (item.product?.slug) {
      add(item.product, item.name);
      continue;
    }
    for (const component of item.components || []) add(component.product, component.name);
  }
  return products;
}

export function reviewRequestSubject(order: ReviewRequestOrder) {
  const products = reviewRequestProducts(order);
  if (products.length === 1) return `How is your ${products[0].name} settling in?`;
  return 'How is your Hillside order settling in?';
}

/**
 * No unsubscribe footer, and that is on purpose: the shell's link opts an
 * address out of The Hillside Notes, which this is not. One email about one
 * order, saying so in its own last line, is the opt-out.
 */
export function reviewRequestHtml(order: ReviewRequestOrder) {
  const products = reviewRequestProducts(order);
  const links = products
    .map((product) => {
      const url = absoluteUrl(`/shop/${product.slug}#reviews`);
      return `<li style="margin-bottom:8px"><a href="${escapeHtml(url)}" style="color:#315a3d">${escapeHtml(
        product.name
      )}</a></li>`;
    })
    .join('');
  const itemised = order.items
    .map((item) => escapeHtml(sizedName(item.name, item.size)))
    .slice(0, 8)
    .join(', ');

  return emailShell(
    'How did it settle in?',
    `<p>Hi ${escapeHtml(order.customerName)},</p>` +
      `<p>A couple of weeks ago you took home ${itemised ? `<strong>${itemised}</strong>` : 'an order'} from The Hillside Gardens (order ${escapeHtml(
        order.invoiceNumber
      )}). We would love to know how it is doing.</p>` +
      `<p>If you have a minute, leaving a short review helps the next person choose — and tells us what to pot more of.</p>` +
      `<ul style="padding-left:18px;margin:18px 0">${links}</ul>` +
      `<p>If something arrived less than perfect, reply to this email instead and we will put it right. This is the only note we will send about this order.</p>`
  );
}
