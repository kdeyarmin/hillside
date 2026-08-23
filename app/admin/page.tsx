import Link from 'next/link';
import {
  MessageStatus,
  OrderStatus,
  ProductType,
  RegistrationStatus,
  ReviewStatus
} from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import {
  ADMIN_ERRORS,
  ADMIN_NOTICES,
  adminDashboardPath,
  firstSearchParam,
  incompleteProductFields,
  isCustomPlanterRequest,
  orderMatchesAdminFilter,
  parseAdminOrderFilter,
  parseAdminStockFilter,
  productHasIncompleteInfo,
  productIsLowStock,
  productIsOutOfStock,
  productMatchesAdminFilter,
  productNeedsPhoto
} from '@/lib/admin-dashboard';
import { buildPriorityCards, prioritySummary } from '@/lib/admin-priorities';
import { db } from '@/lib/db';
import { currentAdmin } from '@/lib/admin';
import { GIFT_EXCLUDE_TAG, GIFT_TAG_CHOICES } from '@/lib/gifts';
import { newsletterSourceBreakdown, newsletterSourceLabel } from '@/lib/newsletter-source';
import { AWAITING_SHIPMENT_STATUSES, REVENUE_STATUSES, isAwaitingShipment } from '@/lib/orders';
import { sizedName, sizeLines, sizeStockSummary } from '@/lib/product-sizes';
import { REVIEW_REQUEST_BATCH, REVIEW_REQUEST_DELAY_DAYS } from '@/lib/review-request';
import { countOrdersAwaitingReviewRequest } from '@/lib/review-request-send';
import { formatMoney, productTypeLabel } from '@/lib/store';
import { orderStatusBadge } from '@/lib/tracking';
import {
  loginAdmin,
  logoutAdmin,
  resendClassConfirmation,
  resendOrderConfirmation,
  resendPickupReady,
  saveProduct,
  sendReviewRequests,
  setProductActive,
  updateMessageStatus,
  updateOrder,
  updateRegistration,
  updateReview,
  updateSubscriber
} from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner Dashboard' };

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 11,
  border: '1px solid var(--line)',
  borderRadius: 9,
  marginTop: 5,
  font: 'inherit'
};

/**
 * The per-size split beside a product's total. "9 in stock" on a plant whose 6"
 * pots ran out an hour ago is the number Tammy would otherwise take to the
 * bench; a product counted one way has nothing to add and renders nothing.
 */
function SizeStockNote({ sizes }: { sizes: unknown }) {
  const summary = sizeStockSummary(sizes);
  return summary ? <> ({summary})</> : null;
}

function ProductFields({
  product,
  collections
}: {
  collections: Array<{ id: string; title: string }>;
  product?: {
    giftTags?: string[];
    bundle?: boolean;
    bundleItems?: string[];
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    shortDescription: string | null;
    description: string;
    details: string | null;
    careNotes: string | null;
    shippingNote: string | null;
    ships?: boolean;
    pickup?: boolean;
    type: ProductType;
    priceCents: number;
    compareAtCents: number | null;
    inventory: number;
    imageUrl: string | null;
    badge: string | null;
    active: boolean;
    featured: boolean;
    sortOrder: number;
    galleryImages: string[];
    sizes: unknown;
    sizeLabel: string | null;
    collections?: Array<{ id: string }>;
  };
}) {
  const assigned = new Set((product?.collections || []).map((collection) => collection.id));
  const sizeStock = sizeStockSummary(product?.sizes);
  const giftTags = new Set(product?.giftTags || []);
  const notAGift = giftTags.has(GIFT_EXCLUDE_TAG);
  return (
    <>
      {product && <input type="hidden" name="id" value={product.id} />}
      {product && <input type="hidden" name="expectedInventory" value={product.inventory} />}
      <div className="admin-form-grid">
        <label className="admin-label">
          Product name
          <input className="admin-input" name="name" defaultValue={product?.name} required />
        </label>
        <label className="admin-label">
          URL slug
          <input
            className="admin-input"
            name="slug"
            defaultValue={product?.slug}
            placeholder="created-from-name"
          />
        </label>
        <label className="admin-label">
          SKU / item number
          <input className="admin-input" name="sku" defaultValue={product?.sku || ''} />
        </label>
        <label className="admin-label">
          Category
          <select
            className="admin-input"
            name="type"
            defaultValue={product?.type || ProductType.PLANT}
          >
            {Object.values(ProductType).map((type) => (
              <option value={type} key={type}>
                {productTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-label">
          Price
          <input
            className="admin-input"
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product ? (product.priceCents / 100).toFixed(2) : ''}
            required
          />
        </label>
        <label className="admin-label">
          Compare-at price
          <input
            className="admin-input"
            name="compareAt"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : ''}
          />
        </label>
        <label className="admin-label">
          Quantity on hand
          <input
            className="admin-input"
            name="inventory"
            type="number"
            min="0"
            defaultValue={product?.inventory ?? 0}
            required
          />
          {/* Counted sizes own this number — it is the sum of them — so saying
              so here is the only way the box explains itself on a form that has
              no scripting to grey it out. */}
          <span className="admin-hint">
            {sizeStock
              ? `Added up from the sizes below: ${sizeStock}. Change a size's quantity to change this.`
              : 'Leave this as the whole shelf. Count the sizes separately below if you want a quantity for each.'}
          </span>
        </label>
        <label className="admin-label">
          Display order
          <input
            className="admin-input"
            name="sortOrder"
            type="number"
            defaultValue={product?.sortOrder ?? 0}
          />
        </label>
        <label className="admin-label">
          Badge
          <input
            className="admin-input"
            name="badge"
            defaultValue={product?.badge || ''}
            placeholder="Our pick"
          />
        </label>
        <label className="admin-label">
          Photo URL
          <input
            className="admin-input"
            name="imageUrl"
            type="text"
            defaultValue={product?.imageUrl || ''}
          />
        </label>
        <label className="admin-label full">
          Short card description
          <input
            className="admin-input"
            name="shortDescription"
            defaultValue={product?.shortDescription || ''}
          />
        </label>
        <label className="admin-label full">
          Main description
          <textarea
            className="admin-input"
            name="description"
            rows={4}
            defaultValue={product?.description}
            required
          />
        </label>
        <label className="admin-label full">
          Product details, ingredients or contents
          <textarea
            className="admin-input"
            name="details"
            rows={4}
            defaultValue={product?.details || ''}
          />
        </label>
        <label className="admin-label full">
          Plant care note
          <textarea
            className="admin-input"
            name="careNotes"
            rows={2}
            defaultValue={product?.careNotes || ''}
          />
        </label>
        <label className="admin-label full">
          Shipping / pickup note
          <textarea
            className="admin-input"
            name="shippingNote"
            rows={2}
            defaultValue={product?.shippingNote || ''}
          />
        </label>
        <label className="admin-label">
          What the size dropdown is called
          <input
            className="admin-input"
            name="sizeLabel"
            defaultValue={product?.sizeLabel || ''}
            placeholder="Size"
          />
        </label>
        <label className="admin-label full">
          Sizes to choose from (one per line, leave empty if this is sold one way)
          <textarea
            className="admin-input"
            name="sizes"
            rows={3}
            defaultValue={sizeLines(product?.sizes)}
            placeholder={'4" pot | 18.00 | 6\n6" pot | 24.00 | 4\n8" pot | 32.00 | 2'}
          />
          <span className="admin-hint">
            One size per line: <b>name | price | quantity on hand</b>. Leave the price out —{' '}
            <code>6&quot; pot | | 4</code> — and the size uses the price above. Leave the quantity
            out on every line and all the sizes share the one quantity on hand; put a quantity on
            any line and each size is counted on its own, so a size you leave blank is treated as
            none left.
          </span>
        </label>
        <label className="admin-label full">
          Extra photo URLs (one per line)
          <textarea
            className="admin-input"
            name="galleryImages"
            rows={3}
            defaultValue={(product?.galleryImages || []).join('\n')}
            placeholder={'/media/second-angle.jpg\n/media/detail.jpg'}
          />
        </label>
      </div>
      <fieldset className="admin-collection-picker admin-gift-picker">
        <legend>Gifting</legend>
        <p className="admin-hint">
          The gift pages already place products by price, category and wording — a plant is in
          “gifts for plant lovers” without you doing anything. Tick a guide to put this one
          somewhere it would not land on its own.
        </p>
        <div className="admin-checkbox-row">
          {GIFT_TAG_CHOICES.map((guide) => (
            <label className="admin-checkbox" key={guide.slug}>
              <input
                type="checkbox"
                name="giftTags"
                value={guide.slug}
                defaultChecked={giftTags.has(guide.slug)}
              />{' '}
              {guide.shortTitle}
            </label>
          ))}
          <label className="admin-checkbox">
            <input
              type="checkbox"
              name="giftTags"
              value={GIFT_EXCLUDE_TAG}
              defaultChecked={notAGift}
            />{' '}
            Not a gift — keep it off the gift pages
          </label>
        </div>
        <label className="admin-checkbox" style={{ marginTop: 12 }}>
          <input name="bundle" type="checkbox" defaultChecked={product?.bundle ?? false} /> This is
          a gift bundle
        </label>
        <label className="admin-label full" style={{ marginTop: 10 }}>
          What is in the bundle (one item per line)
          <textarea
            className="admin-input"
            name="bundleItems"
            rows={3}
            defaultValue={(product?.bundleItems || []).join('\n')}
            placeholder={'One tin of Hillside Calm tea\nStainless infuser\nGarden herb soap'}
          />
          <span className="admin-hint">
            A bundle is an ordinary product — one price, one quantity on hand, one line at checkout.
            This list is what the product page shows under “what is in this bundle”.
          </span>
        </label>
      </fieldset>
      {collections.length > 0 && (
        <fieldset className="admin-collection-picker">
          <legend>Collections this product belongs to</legend>
          {collections.map((collection) => (
            <label className="admin-checkbox" key={collection.id}>
              <input
                type="checkbox"
                name="collectionIds"
                value={collection.id}
                defaultChecked={assigned.has(collection.id)}
              />{' '}
              {collection.title}
            </label>
          ))}
        </fieldset>
      )}
      <div className="admin-actions">
        <label className="admin-checkbox">
          <input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active in
          shop
        </label>
        <label className="admin-checkbox">
          <input name="featured" type="checkbox" defaultChecked={product?.featured ?? false} />{' '}
          Featured
        </label>
        <label className="admin-checkbox">
          <input name="ships" type="checkbox" defaultChecked={product?.ships ?? true} /> Ships
        </label>
        <label className="admin-checkbox">
          <input name="pickup" type="checkbox" defaultChecked={product?.pickup ?? true} /> Local
          pickup
        </label>
      </div>
    </>
  );
}

export default async function Admin({
  searchParams
}: {
  searchParams: Promise<{
    error?: string | string[];
    notice?: string | string[];
    product?: string | string[];
    order?: string | string[];
    message?: string | string[];
    review?: string | string[];
    q?: string | string[];
    stock?: string | string[];
    orders?: string | string[];
    messages?: string | string[];
    section?: string | string[];
  }>;
}) {
  const admin = await currentAdmin();
  const params = await searchParams;

  if (!admin) {
    return (
      <section className="content">
        <div className="container" style={{ maxWidth: 520 }}>
          <div className="card">
            <div className="cardbody">
              <img
                src="/logo.webp"
                alt="The Hillside Gardens"
                style={{ width: 260, margin: '0 auto 25px' }}
              />
              <h1
                className="display-title"
                style={{ color: 'var(--forest)', fontSize: 42, textAlign: 'center' }}
              >
                Owner sign in
              </h1>
              <p style={{ textAlign: 'center' }}>
                Sign in with your admin email address and password.
              </p>
              {firstSearchParam(params.error) && (
                <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>
                  <b>{ADMIN_ERRORS[firstSearchParam(params.error)] || ADMIN_ERRORS['1']}</b>
                </p>
              )}
              <form action={loginAdmin}>
                {/* A placeholder is not a label: it disappears on the first keystroke
                  and is not reliably announced, so this field had no accessible
                  name at all. */}
                <label className="sr-only" htmlFor="admin-email">
                  Admin email address
                </label>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="Email address"
                  style={{ ...input, marginBottom: 12 }}
                />
                <label className="sr-only" htmlFor="admin-password">
                  Admin password
                </label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  style={{ ...input, marginBottom: 14 }}
                />
                <button className="btn full">Sign in</button>
              </form>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /**
   * The counts behind the priority board are read as counts, not derived from
   * the pages of rows rendered below. The order list stops at 75 and the
   * restock list at 100, so a busy week would have had the board quietly
   * under-report the very numbers it exists to be trusted on.
   */
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    products,
    orders,
    revenue,
    registrations,
    messages,
    subscribers,
    reviews,
    stockAlerts,
    collections,
    ordersToFulfilCount,
    pickupsToPrepareCount,
    undeliveredEmailCount,
    restockDemandCount,
    reviewsToApproveCount,
    reviewRequestsDue,
    recentlySold,
    newSubscribers,
    subscriberSources,
    unreadMessageCount,
    unreadMessageRows
  ] = await Promise.all([
    db.product.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { collections: { select: { id: true } } }
    }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 75, include: { items: true } }),
    /**
     * Net revenue: partially refunded orders still earned everything that was not
     * given back, so they belong in the figure with their refund subtracted rather
     * than dropped from it. Previously any refund at all — including a few dollars
     * of shipping — marked the order REFUNDED and removed its whole value here.
     */
    db.order.aggregate({
      _sum: { totalCents: true, refundedCents: true },
      where: { status: { in: [...REVENUE_STATUSES] } }
    }),
    db.classRegistration.findMany({
      orderBy: { createdAt: 'desc' },
      take: 75,
      include: { classEvent: true }
    }),
    db.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    db.review.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 60,
      include: { product: { select: { name: true, slug: true } } }
    }),
    db.stockAlert.findMany({
      where: { notifiedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { product: { select: { name: true, slug: true, inventory: true } } }
    }),
    db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true }
    }),
    /**
     * Shipments only. A pickup awaiting preparation has its own card and its
     * own job; counted here as well it appeared on the Today board twice and
     * was added to the day's total twice over.
     */
    db.order.count({
      where: {
        status: { in: [...AWAITING_SHIPMENT_STATUSES] },
        fulfilledAt: null,
        fulfillmentMethod: { not: 'PICKUP' }
      }
    }),
    db.order.count({
      where: {
        status: { in: [...AWAITING_SHIPMENT_STATUSES] },
        fulfilledAt: null,
        fulfillmentMethod: 'PICKUP'
      }
    }),
    /**
     * Never delivered, rather than "has an error on it". An order whose
     * confirmation went out and whose later resend failed has the receipt the
     * customer needed, and counting it here sent Tammy looking for a problem
     * that had already been solved.
     */
    db.order.count({
      where: { confirmationEmailError: { not: null }, confirmationEmailSentAt: null }
    }),
    db.stockAlert.count({ where: { notifiedAt: null } }),
    db.review.count({ where: { status: ReviewStatus.PENDING } }),
    countOrdersAwaitingReviewRequest(),
    /** What actually left the shop this week, busiest line first. */
    db.orderItem.groupBy({
      by: ['name'],
      where: {
        order: { status: { in: [...REVENUE_STATUSES] }, createdAt: { gte: sevenDaysAgo } }
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 6
    }),
    db.newsletterSubscriber.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    /**
     * Grouped in SQL rather than counted from the hundred rows the table below
     * renders — the whole point of the breakdown is the shape of the entire
     * list, which the most recent hundred would misreport as soon as there are
     * more than a hundred.
     */
    db.newsletterSubscriber.groupBy({
      by: ['source', 'active'],
      _count: { _all: true }
    }),
    db.contactMessage.count({ where: { status: MessageStatus.NEW } }),
    /**
     * Every unread message, not the fifty the list below renders. Whether one
     * reads as a custom planter request is a question about its wording, which
     * SQL cannot ask on its own — so the unread ones are read in full and
     * matched here. There is no realistic inbox where that is a large set, and
     * the alternative was a board that under-reports the very work it exists
     * to surface.
     */
    db.contactMessage.findMany({
      where: { status: MessageStatus.NEW },
      select: { subject: true, message: true },
      take: 500
    })
  ]);

  /**
   * Which reviewer emails actually appear on a paid order for that product.
   * A reviewer cannot claim the badge themselves, so this is the evidence Tammy
   * needs to grant it during moderation.
   */
  const reviewPurchaseMatches = new Set(
    (
      await db.orderItem.findMany({
        where: {
          productId: { in: reviews.map((review) => review.productId) },
          order: {
            status: {
              in: [OrderStatus.PAID, OrderStatus.FULFILLED, OrderStatus.PARTIALLY_REFUNDED]
            },
            email: {
              in: reviews.map((review) => review.email || '').filter(Boolean),
              mode: 'insensitive'
            }
          }
        },
        select: { productId: true, order: { select: { email: true } } }
      })
    ).map((item) => `${item.productId}:${item.order.email.toLowerCase()}`)
  );

  const lowStock = products.filter(productIsLowStock).length;
  const outOfStock = products.filter(productIsOutOfStock).length;
  const incompleteProducts = products.filter(productHasIncompleteInfo).length;
  const unreadMessages = unreadMessageCount;
  const planterRequests = unreadMessageRows.filter(isCustomPlanterRequest).length;
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.active).length;
  const missingPhotos = products.filter(
    (product) => product.active && productNeedsPhoto(product.imageUrl)
  ).length;
  const activeCount = products.filter((product) => product.active).length;
  const archivedCount = products.length - activeCount;
  const undeliveredEmails = undeliveredEmailCount;

  /**
   * The board. Every count on it links at the list that clears it, and anything
   * at zero is left off rather than rendered as a reassuring nought.
   */
  const priorityCards = buildPriorityCards({
    ordersToFulfil: ordersToFulfilCount,
    pickupsToPrepare: pickupsToPrepareCount,
    undeliveredEmails: undeliveredEmailCount,
    newMessages: unreadMessages,
    customPlanterRequests: planterRequests,
    outOfStock,
    needsReorder: lowStock,
    backInStockDemand: restockDemandCount,
    reviewsToApprove: reviewsToApproveCount,
    reviewRequestsDue,
    missingPhotos,
    incompleteProducts
  });

  const sourceBreakdown = newsletterSourceBreakdown(
    subscriberSources.map((row) => ({
      source: row.source,
      active: row.active,
      count: row._count._all
    }))
  );
  const soldThisWeek = recentlySold.filter((row) => (row._sum.quantity || 0) > 0);
  const soldCount = soldThisWeek.reduce((total, row) => total + (row._sum.quantity || 0), 0);

  const stockFilter = parseAdminStockFilter(firstSearchParam(params.stock));
  const orderFilter = parseAdminOrderFilter(firstSearchParam(params.orders));
  const planterOnly = firstSearchParam(params.messages) === 'planter';
  const productQuery = firstSearchParam(params.q);
  const visibleProducts = products.filter((product) =>
    productMatchesAdminFilter(product, productQuery, stockFilter)
  );
  const visibleOrders = orders.filter((order) =>
    orderMatchesAdminFilter(
      {
        awaiting: isAwaitingShipment(order.status, order.fulfilledAt),
        pickup: order.fulfillmentMethod === 'PICKUP'
      },
      orderFilter
    )
  );
  const visibleMessages = planterOnly ? messages.filter(isCustomPlanterRequest) : messages;
  const archivedProducts = products.filter((product) => !product.active);
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];
  const focusProduct = firstSearchParam(params.product);
  const focusOrder = firstSearchParam(params.order);
  const focusMessage = firstSearchParam(params.message);
  const focusReview = firstSearchParam(params.review);
  const focusSection = firstSearchParam(params.section);

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={focusSection || undefined}
        focusId={
          (focusProduct && `product-${focusProduct}`) ||
          (focusOrder && `order-${focusOrder}`) ||
          (focusMessage && `message-${focusMessage}`) ||
          (focusReview && `review-${focusReview}`) ||
          undefined
        }
      />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Owner Business Center</b>
        <a href="#today">Today</a>
        <a href="#orders">Orders & shipping</a>
        <a href="#inventory">Inventory & products</a>
        <a href="#add-product">Add a product</a>
        <a href="#registrations">Class registrations</a>
        <a href="#messages">Customer messages</a>
        <a href="#subscribers">Email subscribers</a>
        <a href="#reviews">Reviews</a>
        <a href="#review-requests">Ask for reviews</a>
        <a href="#restock">Restock requests</a>
        <Link href="/admin/email">Email</Link>
        <Link href="/admin/content">Website content</Link>
        <Link href="/admin/care">Plant care library</Link>
        <Link href="/admin/accounts">Admin accounts</Link>
        <Link href="/">View public website</Link>
        {/* Not `.muted`: that token is tuned for text on white and measures
            2.2:1 against the sidebar's forest green. This is the colour the
            links beside it already use. */}
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 14, color: '#dce6de' }}>
          Signed in as {admin.name}
        </p>
        <form action={logoutAdmin}>
          <button className="btn gold small" style={{ marginTop: 8 }}>
            Sign out
          </button>
        </form>
      </aside>

      <div className="adminmain">
        <div className="toolbar" id="today">
          <div>
            <div className="eyebrow">The Hillside Gardens</div>
            <h1>Today</h1>
            <p className="muted">{prioritySummary(priorityCards)}</p>
          </div>
          <div className="admin-actions">
            <a className="btn" href="/api/admin/shipping.csv">
              Export shipping CSV
            </a>
            <a className="btn outline" href="/api/admin/orders.csv">
              Export all orders
            </a>
            <Link className="btn gold" href="/admin/content">
              Manage website content
            </Link>
            <Link className="btn outline" href="/admin/email">
              Email
            </Link>
            <Link className="btn outline" href="/admin/care">
              Plant care library
            </Link>
          </div>
        </div>

        {/* The board only ever shows work that is actually waiting. A row of
            zeros is not reassurance, it is ten things to read past to find the
            two that matter — and a shop's revenue figure, however nice, is not
            a job anybody can do today. */}
        {priorityCards.length > 0 ? (
          <div className="priority-board">
            {priorityCards.map((card) => (
              <Link className={`priority-card ${card.tone}`} href={card.href} key={card.key}>
                <strong>{card.count}</strong>
                <span className="priority-label">{card.label}</span>
                <span className="priority-detail">{card.detail}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-card admin-notice" role="status">
            <b>Nothing is waiting on you.</b>
            <p className="muted" style={{ marginBottom: 0 }}>
              No orders to pack, no unread messages, nothing out of stock and no reviews to read.
              This is the whole list — when something needs doing it appears here.
            </p>
          </div>
        )}

        {/* Kept apart from the board on purpose: these are worth a glance, but
            none of them is a job, and mixing them in is how a to-do list turns
            back into a wall of numbers. */}
        <section className="admin-pulse" aria-label="The last week at a glance">
          <div>
            <span>Sold in the last 7 days</span>
            <strong>{soldCount}</strong>
            <small>
              {soldThisWeek.length
                ? soldThisWeek
                    .slice(0, 3)
                    .map((row) => `${row.name} ×${row._sum.quantity || 0}`)
                    .join(' · ')
                : 'Nothing has gone out this week.'}
            </small>
          </div>
          <div>
            <span>New subscribers, 30 days</span>
            <strong>{newSubscribers}</strong>
            <small>
              {activeSubscribers} active on the list
              {sourceBreakdown[0] ? ` · mostly from ${sourceBreakdown[0].label.toLowerCase()}` : ''}
            </small>
          </div>
          <div>
            <span>Net revenue, all time</span>
            <strong>
              {formatMoney(
                Math.max(0, (revenue._sum.totalCents || 0) - (revenue._sum.refundedCents || 0))
              )}
            </strong>
            <small>Paid and shipped orders, less anything refunded.</small>
          </div>
          <div>
            <span>Listed in the shop</span>
            <strong>{activeCount}</strong>
            <small>
              {archivedCount} archived ·{' '}
              <Link className="text-link" href={adminDashboardPath({ section: 'inventory' })}>
                open the catalog
              </Link>
            </small>
          </div>
        </section>

        {notice && (
          <div className="admin-card admin-notice" role="status">
            <b>{notice}</b>
          </div>
        )}
        {errorMessage && (
          <div className="admin-card admin-alert" role="alert">
            <b>{errorMessage}</b>
          </div>
        )}

        {activeCount === 0 && (
          <div className="admin-card admin-alert" role="status">
            <b>The public shop is empty.</b>
            <p className="muted">
              {archivedCount > 0 ? (
                <>
                  {archivedCount} {archivedCount === 1 ? 'product is' : 'products are'} archived, so
                  customers see nothing for sale.{' '}
                  <a className="text-link" href="#restore-archived">
                    Put one back in the shop
                  </a>
                  {' or '}
                  <a className="text-link" href="#add-product">
                    add a new product
                  </a>
                  .
                </>
              ) : (
                <>
                  Add a product below. Nothing is listed for sale until you do.{' '}
                  <a className="text-link" href="#add-product">
                    Add a product
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        )}

        {undeliveredEmails > 0 && (
          <div className="admin-card admin-alert" role="alert">
            <b>
              {undeliveredEmails} order {undeliveredEmails === 1 ? 'confirmation' : 'confirmations'}{' '}
              could not be emailed.
            </b>
            <p className="muted">
              Check that SENDGRID_API_KEY is set —{' '}
              <a className="text-link" href="/api/health">
                open the health check
              </a>{' '}
              — then contact the affected customers directly. Each order below shows its delivery
              status.
            </p>
          </div>
        )}

        <section className="admin-section" id="orders">
          <div className="toolbar">
            <div>
              <h2>Orders and fulfillment</h2>
              <p className="muted">
                Update tracking, print documents and mark orders shipped or picked up.
              </p>
            </div>
            <div className="admin-actions">
              <a className="btn small" href="/api/admin/shipping.csv">
                Download addresses to ship
              </a>
              <a className="btn outline small" href="/api/admin/orders.csv">
                Export all orders
              </a>
            </div>
          </div>

          {/* Chips rather than a dropdown: they are the destination the
              priority board links at, so each one has to be a real address. */}
          <div className="filter-row" aria-label="Order filters">
            {(
              [
                ['all', 'Recent orders', orders.length],
                [
                  'awaiting',
                  'To pack',
                  orders.filter(
                    (order) =>
                      isAwaitingShipment(order.status, order.fulfilledAt) &&
                      order.fulfillmentMethod !== 'PICKUP'
                  ).length
                ],
                [
                  'pickup',
                  'Pickups',
                  orders.filter(
                    (order) =>
                      order.fulfillmentMethod === 'PICKUP' &&
                      isAwaitingShipment(order.status, order.fulfilledAt)
                  ).length
                ]
              ] as const
            ).map(([key, label, count]) => (
              <Link
                key={key}
                className={`filter-chip${orderFilter === key ? ' active' : ''}`}
                href={adminDashboardPath({
                  section: 'orders',
                  orders: key === 'all' ? undefined : key
                })}
              >
                {label} ({count})
              </Link>
            ))}
          </div>

          {visibleOrders.length ? (
            <div className="admin-list">
              {visibleOrders.map((order) => (
                <details
                  open={
                    isAwaitingShipment(order.status, order.fulfilledAt) || order.id === focusOrder
                  }
                  id={`order-${order.id}`}
                  key={order.id}
                >
                  <summary>
                    <span>
                      {order.invoiceNumber} • {order.customerName} • {formatMoney(order.totalCents)}
                      {order.fulfillmentMethod === 'PICKUP' ? ' • Pickup' : ''}
                      {order.giftMessage ? ' • Gift note' : ''}
                    </span>
                    <span className={`status-badge ${order.status}`}>
                      {orderStatusBadge(order.status, order.fulfillmentMethod)}
                    </span>
                  </summary>
                  <div>
                    <div className="grid three">
                      <div>
                        <b>Customer</b>
                        <br />
                        {order.customerName}
                        <br />
                        <a className="text-link" href={`mailto:${order.email}`}>
                          {order.email}
                        </a>
                        {order.phone && (
                          <>
                            <br />
                            {order.phone}
                          </>
                        )}
                      </div>
                      <div>
                        <b>Confirmation email</b>
                        <br />
                        {order.confirmationEmailSentAt ? (
                          <span className="stock">
                            Sent {order.confirmationEmailSentAt.toLocaleString()}
                            {order.confirmationEmailError
                              ? ` · last retry failed (${order.confirmationEmailError})`
                              : ''}
                          </span>
                        ) : order.confirmationEmailError ? (
                          <span className="stock out">
                            Not sent ({order.confirmationEmailError})
                          </span>
                        ) : (
                          <span className="muted">No record yet</span>
                        )}
                      </div>
                      <div>
                        <b>{order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Ship to'}</b>
                        <br />
                        {order.fulfillmentMethod === 'PICKUP' ? (
                          <>
                            Local pickup in Ebensburg
                            {order.phone && (
                              <>
                                <br />
                                {order.phone}
                              </>
                            )}
                            <br />
                            {order.email}
                          </>
                        ) : (
                          <>
                            {order.address1}
                            {order.address2 && (
                              <>
                                <br />
                                {order.address2}
                              </>
                            )}
                            <br />
                            {order.city}, {order.state} {order.postalCode}
                            <br />
                            {order.country}
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ margin: '18px 0' }}>
                      {order.items.map((item) => (
                        <div className="summary-row" key={item.id}>
                          <span>
                            {sizedName(item.name, item.size)} × {item.quantity}
                          </span>
                          <span>{formatMoney(item.unitCents * item.quantity)}</span>
                        </div>
                      ))}
                      <div className="summary-row">
                        <span>{order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Shipping'}</span>
                        <span>{formatMoney(order.shippingCents)}</span>
                      </div>
                      <div className="summary-row">
                        <span>Tax</span>
                        <span>{formatMoney(order.taxCents)}</span>
                      </div>
                      <div className="summary-row total">
                        <span>Total</span>
                        <span>{formatMoney(order.totalCents)}</span>
                      </div>
                    </div>
                    {order.giftMessage && (
                      <div
                        className="note-box"
                        style={{ marginBottom: 18, whiteSpace: 'pre-wrap' }}
                      >
                        <b>Gift message</b>
                        {order.giftMessage}
                      </div>
                    )}
                    <form action={updateOrder}>
                      <input type="hidden" name="id" value={order.id} />
                      <div className="admin-form-grid">
                        <label className="admin-label">
                          Status
                          <select className="admin-input" name="status" defaultValue={order.status}>
                            {Object.values(OrderStatus).map((status) => (
                              <option value={status} key={status}>
                                {orderStatusBadge(status, order.fulfillmentMethod)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {order.fulfillmentMethod !== 'PICKUP' && (
                          <label className="admin-label">
                            Carrier
                            <input
                              className="admin-input"
                              name="trackingCarrier"
                              defaultValue={order.trackingCarrier || ''}
                              placeholder="USPS, UPS, FedEx"
                            />
                          </label>
                        )}
                        {order.fulfillmentMethod !== 'PICKUP' && (
                          <label className="admin-label">
                            Tracking number
                            <input
                              className="admin-input"
                              name="trackingNumber"
                              defaultValue={order.trackingNumber || ''}
                            />
                          </label>
                        )}
                        {order.fulfillmentMethod === 'PICKUP' && (
                          <label className="admin-label full">
                            Pickup window to email the customer
                            <textarea
                              className="admin-input"
                              name="pickupNote"
                              rows={3}
                              defaultValue={order.pickupNote || ''}
                              placeholder="Saturday 10–11am at the greenhouse door. Ring when you arrive."
                            ></textarea>
                          </label>
                        )}
                        <label className="admin-label full">
                          Private order notes
                          <textarea
                            className="admin-input"
                            name="internalNotes"
                            rows={3}
                            defaultValue={order.internalNotes || ''}
                          />
                        </label>
                      </div>
                      <div className="admin-actions">
                        <button className="btn small">Save order update</button>
                        <Link
                          className="btn outline small"
                          href={`/admin/orders/${order.id}/packing-slip`}
                        >
                          Packing slip
                        </Link>
                        <Link
                          className="btn outline small"
                          href={`/admin/orders/${order.id}/label`}
                        >
                          {order.fulfillmentMethod === 'PICKUP' ? 'Pickup ticket' : '4 × 6 label'}
                        </Link>
                      </div>
                    </form>
                    {isAwaitingShipment(order.status, order.fulfilledAt) && (
                      <form action={resendOrderConfirmation} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={order.id} />
                        <button className="text-button">
                          {order.confirmationEmailError
                            ? 'Retry confirmation email'
                            : 'Resend confirmation email'}
                        </button>
                      </form>
                    )}
                    {order.fulfillmentMethod === 'PICKUP' && order.pickupNote && (
                      <form action={resendPickupReady} style={{ marginTop: 10 }}>
                        <input type="hidden" name="id" value={order.id} />
                        <button className="text-button">Resend pickup email</button>
                      </form>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="admin-card">
              <p>
                {orders.length
                  ? orderFilter === 'pickup'
                    ? 'No pickup orders are waiting to be prepared.'
                    : 'Nothing is waiting to be packed.'
                  : 'No orders yet.'}
                {orders.length > 0 && orderFilter !== 'all' && (
                  <>
                    {' '}
                    <Link className="text-link" href={adminDashboardPath({ section: 'orders' })}>
                      Show recent orders
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          )}
        </section>

        <section className="admin-section" id="inventory">
          <div className="toolbar">
            <div>
              <h2>Inventory and products</h2>
              <p className="muted">
                Open any product to change price, stock, descriptions, photos or shop visibility.
              </p>
            </div>
            <a className="btn small" href="#add-product">
              Add a product
            </a>
          </div>

          <form className="admin-inventory-tools" action="/admin" method="get">
            <input type="hidden" name="section" value="inventory" />
            <input type="hidden" name="stock" value={stockFilter === 'all' ? '' : stockFilter} />
            <label className="sr-only" htmlFor="admin-product-search">
              Find a product
            </label>
            <input
              id="admin-product-search"
              className="admin-input"
              name="q"
              defaultValue={productQuery}
              placeholder="Find by name, slug or SKU"
            />
            <button className="btn small">Find</button>
          </form>

          <div className="filter-row" aria-label="Inventory filters">
            {(
              [
                ['all', 'Everything', products.length],
                ['active', 'In the shop', activeCount],
                ['archived', 'Archived', archivedCount],
                ['out', 'Sold out', outOfStock],
                ['low', 'Low stock', lowStock],
                ['photo', 'Needs a photo', missingPhotos],
                ['incomplete', 'Missing information', incompleteProducts]
              ] as const
            ).map(([key, label, count]) => (
              <Link
                key={key}
                className={`filter-chip${stockFilter === key ? ' active' : ''}`}
                href={adminDashboardPath({
                  q: productQuery || undefined,
                  stock: key === 'all' ? undefined : key,
                  section: 'inventory'
                })}
              >
                {label} ({count})
              </Link>
            ))}
          </div>

          {activeCount === 0 && archivedProducts.length > 0 && (
            <div className="admin-card" id="restore-archived">
              <h3 style={{ marginTop: 0 }}>Archived — hidden from the shop</h3>
              <p className="muted">
                These are already in the catalog. Putting one back in the shop lists it for sale
                immediately.
              </p>
              <ul className="admin-restore-list">
                {archivedProducts.map((product) => (
                  <li key={product.id}>
                    <span>
                      <b>{product.name}</b>
                      <span className="muted">
                        {' '}
                        · {formatMoney(product.priceCents)} · {product.inventory} on hand
                      </span>
                    </span>
                    <form action={setProductActive}>
                      <input type="hidden" name="id" value={product.id} />
                      <input type="hidden" name="active" value="true" />
                      <button className="btn small">Put back in shop</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="admin-card" id="add-product" style={{ marginTop: 24 }}>
            <h2 style={{ marginTop: 0 }}>Add a product</h2>
            <p className="muted">
              Uncheck “Active in shop” to save a draft. Leave it checked to list the piece as soon
              as you create it.
            </p>
            <form action={saveProduct}>
              <ProductFields collections={collections} />
              <button className="btn" style={{ marginTop: 16 }}>
                Create product
              </button>
            </form>
          </div>

          <div className="admin-list" style={{ marginTop: 24 }}>
            {visibleProducts.length ? (
              visibleProducts.map((product) => (
                <details
                  open={product.slug === focusProduct}
                  id={`product-${product.slug}`}
                  key={product.id}
                >
                  <summary>
                    <span>
                      {product.name} • {formatMoney(product.priceCents)} • {product.inventory} in
                      stock
                      <SizeStockNote sizes={product.sizes} />
                      {product.bundle && <> • bundle</>}
                      {productNeedsPhoto(product.imageUrl) && (
                        <>
                          {' '}
                          • <b className="needs-photo">needs a photo</b>
                        </>
                      )}
                      {/* Named rather than counted. "3 fields missing" sends
                          Tammy hunting through the form for which three. */}
                      {productHasIncompleteInfo(product) && (
                        <>
                          {' '}
                          •{' '}
                          <b className="needs-photo">
                            no {incompleteProductFields(product).join(', no ')}
                          </b>
                        </>
                      )}
                    </span>
                    <span className={`status-badge ${product.active ? 'PAID' : 'CANCELLED'}`}>
                      {product.active ? 'Active' : 'Archived'}
                    </span>
                  </summary>
                  <div>
                    <form action={saveProduct}>
                      <ProductFields product={product} collections={collections} />
                      <div className="admin-actions">
                        <button className="btn small">Save product</button>
                        <Link className="btn outline small" href={`/shop/${product.slug}`}>
                          View product
                        </Link>
                      </div>
                    </form>
                    <form action={setProductActive} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={product.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={product.active ? 'false' : 'true'}
                      />
                      <button className={`text-button${product.active ? ' danger' : ''}`}>
                        {product.active ? 'Archive from shop' : 'Put back in shop'}
                      </button>
                    </form>
                  </div>
                </details>
              ))
            ) : (
              <div className="admin-card">
                <p>
                  {products.length
                    ? 'No products matched that search. Clear the filter to see everything.'
                    : 'No products yet. Use the form above to add the first one.'}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="admin-section" id="registrations">
          <h2>Class registrations</h2>
          {registrations.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Guest</th>
                    <th>Seats</th>
                    <th>Paid</th>
                    <th>Status</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((registration) => (
                    <tr key={registration.id}>
                      <td>{registration.createdAt.toLocaleDateString()}</td>
                      <td>
                        {registration.classEvent.title}
                        <br />
                        <small>{registration.classEvent.startsAt.toLocaleString()}</small>
                      </td>
                      <td>
                        {registration.name}
                        <br />
                        <a href={`mailto:${registration.email}`}>{registration.email}</a>
                        {registration.phone && (
                          <>
                            <br />
                            {registration.phone}
                          </>
                        )}
                      </td>
                      <td>{registration.seats}</td>
                      <td>{formatMoney(registration.amountCents)}</td>
                      <td>
                        <form action={updateRegistration}>
                          <input type="hidden" name="id" value={registration.id} />
                          <select
                            className="admin-input"
                            name="status"
                            defaultValue={registration.status}
                          >
                            {Object.values(RegistrationStatus).map((status) => (
                              <option value={status} key={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button className="btn small" style={{ marginTop: 6 }}>
                            Save
                          </button>
                        </form>
                      </td>
                      <td>
                        {registration.status === RegistrationStatus.PAID && (
                          <form action={resendClassConfirmation}>
                            <input type="hidden" name="id" value={registration.id} />
                            <input type="hidden" name="next" value="dashboard" />
                            <button className="btn outline small">Resend confirmation</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-card">
              <p>No paid class registrations yet.</p>
            </div>
          )}
        </section>

        <section className="admin-section" id="messages">
          <h2>Customer messages</h2>
          <div className="filter-row" aria-label="Message filters">
            {(
              [
                ['all', 'Every message', messages.length],
                [
                  'planter',
                  'Custom planter requests',
                  messages.filter(isCustomPlanterRequest).length
                ]
              ] as const
            ).map(([key, label, count]) => (
              <Link
                key={key}
                className={`filter-chip${(planterOnly ? 'planter' : 'all') === key ? ' active' : ''}`}
                href={adminDashboardPath({
                  section: 'messages',
                  messages: key === 'all' ? undefined : key
                })}
              >
                {label} ({count})
              </Link>
            ))}
          </div>
          {visibleMessages.length ? (
            <div className="admin-list">
              {visibleMessages.map((message) => (
                <details
                  open={message.status === MessageStatus.NEW || message.id === focusMessage}
                  id={`message-${message.id}`}
                  key={message.id}
                >
                  <summary>
                    <span>
                      {message.subject} • {message.name}
                      {isCustomPlanterRequest(message) && (
                        <>
                          {' '}
                          • <b className="needs-photo">custom planter</b>
                        </>
                      )}
                    </span>
                    <span className={`status-badge ${message.status}`}>{message.status}</span>
                  </summary>
                  <div>
                    <p>
                      <b>From:</b> {message.name} •{' '}
                      <a className="text-link" href={`mailto:${message.email}`}>
                        {message.email}
                      </a>
                      {message.phone && <> • {message.phone}</>}
                    </p>
                    <p style={{ whiteSpace: 'pre-line' }}>{message.message}</p>
                    <form action={updateMessageStatus}>
                      <input type="hidden" name="id" value={message.id} />
                      <div className="admin-actions">
                        <button className="btn small" name="status" value={MessageStatus.READ}>
                          Mark read
                        </button>
                        <button
                          className="btn outline small"
                          name="status"
                          value={MessageStatus.ARCHIVED}
                        >
                          Archive
                        </button>
                        <Link
                          className="btn gold small"
                          href={`/admin/email?message=${message.id}`}
                        >
                          Reply by email
                        </Link>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="admin-card">
              <p>
                {messages.length
                  ? 'Nothing here reads like a custom planter request.'
                  : 'No website messages yet.'}
                {messages.length > 0 && planterOnly && (
                  <>
                    {' '}
                    <Link className="text-link" href={adminDashboardPath({ section: 'messages' })}>
                      Show every message
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          )}
        </section>

        <section className="admin-section" id="reviews">
          <h2>Customer reviews</h2>
          <p className="muted">
            Reviews stay hidden until you approve them. Approved reviews show star ratings on the
            product page and in Google results.
          </p>
          {reviews.length ? (
            <div className="admin-list">
              {reviews.map((review) => (
                <details
                  open={review.status === ReviewStatus.PENDING || review.id === focusReview}
                  id={`review-${review.id}`}
                  key={review.id}
                >
                  <summary>
                    <span>
                      {'★'.repeat(review.rating)}
                      {'☆'.repeat(5 - review.rating)} • {review.product.name} • {review.authorName}
                    </span>
                    <span
                      className={`status-badge ${review.status === ReviewStatus.APPROVED ? 'PAID' : review.status === ReviewStatus.REJECTED ? 'CANCELLED' : 'NEW'}`}
                    >
                      {review.status}
                    </span>
                  </summary>
                  <div>
                    {review.title && (
                      <p>
                        <b>{review.title}</b>
                      </p>
                    )}
                    <p style={{ whiteSpace: 'pre-line' }}>{review.body}</p>
                    <p className="muted">
                      {review.email || 'No email'} • {review.createdAt.toLocaleDateString()}
                    </p>
                    <form action={updateReview}>
                      <input type="hidden" name="id" value={review.id} />
                      <label className="admin-label full">
                        Public reply (optional)
                        <textarea
                          className="admin-input"
                          name="ownerReply"
                          rows={2}
                          defaultValue={review.ownerReply || ''}
                        />
                      </label>
                      <label className="admin-checkbox">
                        <input
                          type="checkbox"
                          name="verifiedPurchase"
                          defaultChecked={review.verifiedPurchase}
                        />{' '}
                        Show the &ldquo;verified purchase&rdquo; badge
                        {reviewPurchaseMatches.has(
                          `${review.productId}:${(review.email || '').toLowerCase()}`
                        )
                          ? ' — this email is on a paid order for this product'
                          : ' — no paid order matches this email'}
                      </label>
                      <div className="admin-actions">
                        <button className="btn small" name="status" value={ReviewStatus.APPROVED}>
                          Approve &amp; publish
                        </button>
                        <button
                          className="btn outline small"
                          name="status"
                          value={ReviewStatus.PENDING}
                        >
                          Keep hidden
                        </button>
                        <button
                          className="btn danger small"
                          name="status"
                          value={ReviewStatus.REJECTED}
                        >
                          Reject
                        </button>
                        <Link
                          className="btn outline small"
                          href={`/shop/${review.product.slug}#reviews`}
                        >
                          View product
                        </Link>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="admin-card">
              <p>No reviews yet. Reviews can be left on any product page.</p>
            </div>
          )}
        </section>

        <section className="admin-section" id="review-requests">
          <h2>Ask customers for a review</h2>
          <p className="muted">
            Orders you marked fulfilled at least {REVIEW_REQUEST_DELAY_DAYS} days ago, where the
            customer has never been asked. Each one gets a single email naming what they bought,
            with a link to each product. Nobody is asked twice, and orders older than three months
            are left alone.
          </p>
          <div className="admin-card">
            {reviewRequestsDue > 0 ? (
              <>
                <p style={{ marginTop: 0 }}>
                  <b>
                    {reviewRequestsDue} {reviewRequestsDue === 1 ? 'order is' : 'orders are'} ready
                    to ask.
                  </b>
                  {/* One run sends at most a batch. The button used to offer to
                      send all of them and then quietly send 25, which is a
                      promise the shop does not keep. */}
                  {reviewRequestsDue > REVIEW_REQUEST_BATCH && (
                    <span className="muted">
                      {' '}
                      This sends the {REVIEW_REQUEST_BATCH} oldest. Press it again for the rest.
                    </span>
                  )}
                </p>
                <form action={sendReviewRequests}>
                  <button className="btn">
                    {reviewRequestsDue === 1
                      ? 'Send the request'
                      : `Send ${Math.min(reviewRequestsDue, REVIEW_REQUEST_BATCH)} requests`}
                  </button>
                </form>
              </>
            ) : (
              <p style={{ margin: 0 }}>
                Nobody is due a review request. Fulfilled orders appear here{' '}
                {REVIEW_REQUEST_DELAY_DAYS} days after you mark them shipped or collected.
              </p>
            )}
          </div>
        </section>

        <section className="admin-section" id="restock">
          <h2>Restock requests</h2>
          <p className="muted">
            Customers waiting on a sold-out product. Everyone here is emailed automatically the
            moment you raise that product&rsquo;s quantity above zero.
          </p>
          {stockAlerts.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>In stock</th>
                    <th>Email</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {stockAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <Link className="text-link" href={`/shop/${alert.product.slug}`}>
                          {alert.product.name}
                        </Link>
                      </td>
                      <td>{alert.product.inventory}</td>
                      <td>
                        <a className="text-link" href={`mailto:${alert.email}`}>
                          {alert.email}
                        </a>
                      </td>
                      <td>{alert.createdAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-card">
              <p>Nobody is waiting on a restock right now.</p>
            </div>
          )}
        </section>

        <section className="admin-section" id="subscribers">
          <div className="toolbar">
            <div>
              <h2>Email subscribers</h2>
              <p className="muted">
                {activeSubscribers} active {activeSubscribers === 1 ? 'address' : 'addresses'},{' '}
                {newSubscribers} joined in the last 30 days. Export-ready records are stored here;
                connect an email campaign platform before sending bulk marketing messages.
              </p>
            </div>
            <a className="btn small" href="/api/admin/subscribers.csv">
              Export subscribers CSV
            </a>
          </div>

          {/* Which forms are actually earning their place. Counted over the
              whole list, not the hundred rows below, so the two do not
              disagree once the list outgrows one page. */}
          {sourceBreakdown.length > 0 && (
            <div className="admin-card source-breakdown">
              <h3>Where signups come from</h3>
              <ul>
                {sourceBreakdown.map((entry) => (
                  <li key={entry.key}>
                    <span className="source-label">{entry.label}</span>
                    <span className="source-track" role="presentation">
                      <span
                        style={{
                          width: `${Math.round((entry.total / (sourceBreakdown[0]?.total || 1)) * 100)}%`
                        }}
                      />
                    </span>
                    <span className="source-count">
                      {entry.total}
                      {entry.active !== entry.total && (
                        <span className="muted"> ({entry.active} active)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {subscribers.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Came from</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((subscriber) => (
                    <tr key={subscriber.id}>
                      <td>{subscriber.email}</td>
                      <td>{subscriber.name || '—'}</td>
                      <td>
                        {newsletterSourceLabel(subscriber.source)}
                        {subscriber.sourceDetail && (
                          <>
                            <br />
                            <small className="muted">{subscriber.sourceDetail}</small>
                          </>
                        )}
                      </td>
                      <td>{subscriber.createdAt.toLocaleDateString()}</td>
                      <td>
                        <form action={updateSubscriber}>
                          <input type="hidden" name="id" value={subscriber.id} />
                          <label className="admin-checkbox">
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={subscriber.active}
                            />{' '}
                            Active
                          </label>
                          <button className="btn small" style={{ marginTop: 5 }}>
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-card">
              <p>No subscribers yet.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
