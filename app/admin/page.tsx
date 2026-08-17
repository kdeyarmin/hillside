import Link from 'next/link';
import { MessageStatus, OrderStatus, ProductType, RegistrationStatus, ReviewStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { currentAdmin } from '@/lib/admin';
import { REVENUE_STATUSES, isAwaitingShipment } from '@/lib/orders';
import { formatMoney, productTypeLabel } from '@/lib/store';
import {
  archiveProduct,
  loginAdmin,
  logoutAdmin,
  saveProduct,
  updateMessageStatus,
  updateOrder,
  updateRegistration,
  updateReview,
  updateSubscriber
} from './actions';

/**
 * A product with no photograph of its own falls back to shared catalog artwork,
 * which is why three items could show the same picture. Surfacing it here makes
 * the gap visible to Tammy instead of to customers.
 */
function needsPhoto(imageUrl: string | null) {
  if (!imageUrl?.trim()) return true;
  return imageUrl.includes('/images/catalog/') || imageUrl.includes('/images/scenes/');
}

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

function ProductFields({
  product,
  collections
}: {
  collections: Array<{ id: string; title: string }>;
  product?: {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string;
  details: string | null;
  careNotes: string | null;
  shippingNote: string | null;
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
  collections?: Array<{ id: string }>;
} }) {
  const assigned = new Set((product?.collections || []).map((collection) => collection.id));
  return (
    <>
      {product && <input type="hidden" name="id" value={product.id} />}
      {product && <input type="hidden" name="expectedInventory" value={product.inventory} />}
      <div className="admin-form-grid">
        <label className="admin-label">Product name<input className="admin-input" name="name" defaultValue={product?.name} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={product?.slug} placeholder="created-from-name" /></label>
        <label className="admin-label">SKU / item number<input className="admin-input" name="sku" defaultValue={product?.sku || ''} /></label>
        <label className="admin-label">Category<select className="admin-input" name="type" defaultValue={product?.type || ProductType.PLANT}>{Object.values(ProductType).map((type) => <option value={type} key={type}>{productTypeLabel(type)}</option>)}</select></label>
        <label className="admin-label">Price<input className="admin-input" name="price" type="number" min="0" step="0.01" defaultValue={product ? (product.priceCents / 100).toFixed(2) : ''} required /></label>
        <label className="admin-label">Compare-at price<input className="admin-input" name="compareAt" type="number" min="0" step="0.01" defaultValue={product?.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : ''} /></label>
        <label className="admin-label">Quantity on hand<input className="admin-input" name="inventory" type="number" min="0" defaultValue={product?.inventory ?? 0} required /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} /></label>
        <label className="admin-label">Badge<input className="admin-input" name="badge" defaultValue={product?.badge || ''} placeholder="Our pick" /></label>
        <label className="admin-label">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={product?.imageUrl || ''} /></label>
        <label className="admin-label full">Short card description<input className="admin-input" name="shortDescription" defaultValue={product?.shortDescription || ''} /></label>
        <label className="admin-label full">Main description<textarea className="admin-input" name="description" rows={4} defaultValue={product?.description} required /></label>
        <label className="admin-label full">Product details, ingredients or contents<textarea className="admin-input" name="details" rows={4} defaultValue={product?.details || ''} /></label>
        <label className="admin-label full">Plant care note<textarea className="admin-input" name="careNotes" rows={2} defaultValue={product?.careNotes || ''} /></label>
        <label className="admin-label full">Shipping / pickup note<textarea className="admin-input" name="shippingNote" rows={2} defaultValue={product?.shippingNote || ''} /></label>
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
        <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active in shop</label>
        <label className="admin-checkbox"><input name="featured" type="checkbox" defaultChecked={product?.featured ?? false} /> Featured</label>
      </div>
    </>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const admin = await currentAdmin();
  const params = await searchParams;

  if (!admin) {
    return (
      <section className="content">
        <div className="container" style={{ maxWidth: 520 }}>
          <div className="card"><div className="cardbody">
            <img src="/logo.webp" alt="The Hillside Gardens" style={{ width: 260, margin: '0 auto 25px' }} />
            <h1 className="display-title" style={{ color: 'var(--forest)', fontSize: 42, textAlign: 'center' }}>Owner sign in</h1>
            <p style={{ textAlign: 'center' }}>Sign in with your admin email address and password.</p>
            {params.error && (
              <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>
                <b>
                  {params.error === 'throttled'
                    ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
                    : params.error === 'slug'
                      ? 'That product URL is already in use. Choose a different slug.'
                      : 'That email address and password didn’t match an admin account.'}
                </b>
              </p>
            )}
            <form action={loginAdmin}>
              {/* A placeholder is not a label: it disappears on the first keystroke
                  and is not reliably announced, so this field had no accessible
                  name at all. */}
              <label className="sr-only" htmlFor="admin-email">Admin email address</label>
              <input id="admin-email" name="email" type="email" required autoComplete="username" placeholder="Email address" style={{ ...input, marginBottom: 12 }} />
              <label className="sr-only" htmlFor="admin-password">Admin password</label>
              <input id="admin-password" name="password" type="password" required autoComplete="current-password" placeholder="Password" style={{ ...input, marginBottom: 14 }} />
              <button className="btn full">Sign in</button>
            </form>
          </div></div>
        </div>
      </section>
    );
  }

  const [products, orders, revenue, registrations, messages, subscribers, reviews, stockAlerts, collections] = await Promise.all([
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
    db.classRegistration.findMany({ orderBy: { createdAt: 'desc' }, take: 75, include: { classEvent: true } }),
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
    db.collection.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: { id: true, title: true } })
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
            status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED, OrderStatus.PARTIALLY_REFUNDED] },
            email: { in: reviews.map((review) => review.email || '').filter(Boolean), mode: 'insensitive' }
          }
        },
        select: { productId: true, order: { select: { email: true } } }
      })
    ).map((item) => `${item.productId}:${item.order.email.toLowerCase()}`)
  );

  const lowStock = products.filter((product) => product.active && product.inventory <= 3).length;
  const openOrders = orders.filter((order) => isAwaitingShipment(order.status)).length;
  const unreadMessages = messages.filter((message) => message.status === MessageStatus.NEW).length;
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.active).length;
  const pendingReviews = reviews.filter((review) => review.status === ReviewStatus.PENDING).length;
  const missingPhotos = products.filter((product) => product.active && needsPhoto(product.imageUrl)).length;
  const undeliveredEmails = orders.filter((order) => Boolean(order.confirmationEmailError)).length;

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Owner Business Center</b>
        <a href="#overview">Overview</a>
        <a href="#orders">Orders & shipping</a>
        <a href="#inventory">Inventory & products</a>
        <a href="#registrations">Class registrations</a>
        <a href="#messages">Customer messages</a>
        <a href="#subscribers">Email subscribers</a>
        <a href="#reviews">Reviews</a>
        <a href="#restock">Restock requests</a>
        <Link href="/admin/content">Website content</Link>
        <Link href="/admin/accounts">Admin accounts</Link>
        <Link href="/">View public website</Link>
        <p className="muted" style={{ marginTop: 16, marginBottom: 0, fontSize: 14 }}>Signed in as {admin.name}</p>
        <form action={logoutAdmin}><button className="btn gold small" style={{ marginTop: 8 }}>Sign out</button></form>
      </aside>

      <div className="adminmain">
        <div className="toolbar" id="overview">
          <div>
            <div className="eyebrow">The Hillside Gardens</div>
            <h1>Business dashboard</h1>
            <p className="muted">Orders, inventory, classes, customer messages and website operations in one place.</p>
          </div>
          <div className="admin-actions">
            <a className="btn" href="/api/admin/shipping.csv">Export shipping CSV</a>
            <Link className="btn gold" href="/admin/content">Manage website content</Link>
          </div>
        </div>

        <div className="statgrid">
          <div className="stat"><span>Paid revenue</span><strong>{formatMoney(Math.max(0, (revenue._sum.totalCents || 0) - (revenue._sum.refundedCents || 0)))}</strong></div>
          <div className="stat"><span>Orders to ship</span><strong>{openOrders}</strong></div>
          <div className="stat"><span>Active products</span><strong>{products.filter((product) => product.active).length}</strong></div>
          <div className="stat"><span>Low stock</span><strong>{lowStock}</strong></div>
          <div className="stat"><span>New messages</span><strong>{unreadMessages}</strong></div>
          <div className="stat"><span>Email subscribers</span><strong>{activeSubscribers}</strong></div>
          <div className="stat"><span>Reviews to approve</span><strong>{pendingReviews}</strong></div>
          <div className="stat"><span>Products needing a photo</span><strong>{missingPhotos}</strong></div>
          <div className="stat"><span>Waiting on restock</span><strong>{stockAlerts.length}</strong></div>
        </div>

        {params.error === 'slug' && (
          <div className="admin-card admin-alert" role="alert">
            <b>That product URL is already in use.</b>
            <p className="muted">Choose a different slug and save again.</p>
          </div>
        )}
        {params.error === 'inventory' && (
          <div className="admin-card admin-alert" role="alert">
            <b>Stock changed while you were editing.</b>
            <p className="muted">
              Someone reserved or returned units of that product. Refresh the page and save again so
              you do not overwrite a live checkout hold.
            </p>
          </div>
        )}

        {undeliveredEmails > 0 && (
          <div className="admin-card admin-alert" role="alert">
            <b>{undeliveredEmails} order {undeliveredEmails === 1 ? 'confirmation' : 'confirmations'} could not be emailed.</b>
            <p className="muted">
              Check that RESEND_API_KEY is set — <a className="text-link" href="/api/health">open the health check</a> — then
              contact the affected customers directly. Each order below shows its delivery status.
            </p>
          </div>
        )}

        <section className="admin-section" id="orders">
          <div className="toolbar"><div><h2>Orders and fulfillment</h2><p className="muted">Update tracking, print documents and mark orders shipped.</p></div><a className="btn small" href="/api/admin/shipping.csv">Download unshipped addresses</a></div>
          {orders.length ? (
            <div className="admin-list">
              {orders.map((order) => (
                <details open={isAwaitingShipment(order.status)} key={order.id}>
                  <summary>
                    <span>{order.invoiceNumber} • {order.customerName} • {formatMoney(order.totalCents)}</span>
                    <span className={`status-badge ${order.status}`}>{order.status}</span>
                  </summary>
                  <div>
                    <div className="grid three">
                      <div>
                        <b>Customer</b><br />{order.customerName}<br /><a className="text-link" href={`mailto:${order.email}`}>{order.email}</a>{order.phone && <><br />{order.phone}</>}
                      </div>
                      <div>
                        <b>Confirmation email</b><br />
                        {order.confirmationEmailError ? (
                          <span className="stock out">Not sent ({order.confirmationEmailError})</span>
                        ) : order.confirmationEmailSentAt ? (
                          <span className="stock">Sent {order.confirmationEmailSentAt.toLocaleString()}</span>
                        ) : (
                          <span className="muted">No record yet</span>
                        )}
                      </div>
                      <div><b>Ship to</b><br />{order.address1}{order.address2 && <><br />{order.address2}</>}<br />{order.city}, {order.state} {order.postalCode}<br />{order.country}</div>
                    </div>
                    <div style={{ margin: '18px 0' }}>
                      {order.items.map((item) => <div className="summary-row" key={item.id}><span>{item.name} × {item.quantity}</span><span>{formatMoney(item.unitCents * item.quantity)}</span></div>)}
                      <div className="summary-row"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
                      <div className="summary-row"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
                      <div className="summary-row total"><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
                    </div>
                    <form action={updateOrder}>
                      <input type="hidden" name="id" value={order.id} />
                      <div className="admin-form-grid">
                        <label className="admin-label">Status<select className="admin-input" name="status" defaultValue={order.status}>{Object.values(OrderStatus).map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
                        <label className="admin-label">Carrier<input className="admin-input" name="trackingCarrier" defaultValue={order.trackingCarrier || ''} placeholder="USPS, UPS, FedEx" /></label>
                        <label className="admin-label">Tracking number<input className="admin-input" name="trackingNumber" defaultValue={order.trackingNumber || ''} /></label>
                        <label className="admin-label full">Private order notes<textarea className="admin-input" name="internalNotes" rows={3} defaultValue={order.internalNotes || ''} /></label>
                      </div>
                      <div className="admin-actions">
                        <button className="btn small">Save order update</button>
                        <Link className="btn outline small" href={`/admin/orders/${order.id}/packing-slip`}>Packing slip</Link>
                        <Link className="btn outline small" href={`/admin/orders/${order.id}/label`}>4 × 6 label</Link>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="admin-card"><p>No orders yet.</p></div>}
        </section>

        <section className="admin-section" id="inventory">
          <h2>Inventory and products</h2>
          <p className="muted">Open any product to change price, stock, descriptions, photos or shop visibility.</p>
          <div className="admin-list">
            {products.map((product) => (
              <details key={product.id}>
                <summary>
                  <span>
                    {product.name} • {formatMoney(product.priceCents)} • {product.inventory} in stock
                    {needsPhoto(product.imageUrl) && <> • <b className="needs-photo">needs a photo</b></>}
                  </span>
                  <span className={`status-badge ${product.active ? 'PAID' : 'CANCELLED'}`}>{product.active ? 'Active' : 'Archived'}</span>
                </summary>
                <div>
                  <form action={saveProduct}>
                    <ProductFields product={product} collections={collections} />
                    <div className="admin-actions"><button className="btn small">Save product</button><Link className="btn outline small" href={`/shop/${product.slug}`}>View product</Link></div>
                  </form>
                  {product.active && <form action={archiveProduct} style={{ marginTop: 10 }}><input type="hidden" name="id" value={product.id} /><button className="text-button danger">Archive from shop</button></form>}
                </div>
              </details>
            ))}
          </div>

          <div className="admin-card" style={{ marginTop: 24 }}>
            <h2 style={{ marginTop: 0 }}>Add a product</h2>
            <form action={saveProduct}>
              <ProductFields collections={collections} />
              <button className="btn" style={{ marginTop: 16 }}>Create product</button>
            </form>
          </div>
        </section>

        <section className="admin-section" id="registrations">
          <h2>Class registrations</h2>
          {registrations.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Class</th><th>Guest</th><th>Seats</th><th>Paid</th><th>Status</th></tr></thead><tbody>{registrations.map((registration) => <tr key={registration.id}><td>{registration.createdAt.toLocaleDateString()}</td><td>{registration.classEvent.title}<br /><small>{registration.classEvent.startsAt.toLocaleString()}</small></td><td>{registration.name}<br /><a href={`mailto:${registration.email}`}>{registration.email}</a>{registration.phone && <><br />{registration.phone}</>}</td><td>{registration.seats}</td><td>{formatMoney(registration.amountCents)}</td><td><form action={updateRegistration}><input type="hidden" name="id" value={registration.id} /><select className="admin-input" name="status" defaultValue={registration.status}>{Object.values(RegistrationStatus).map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="btn small" style={{ marginTop: 6 }}>Save</button></form></td></tr>)}</tbody></table></div> : <div className="admin-card"><p>No paid class registrations yet.</p></div>}
        </section>

        <section className="admin-section" id="messages">
          <h2>Customer messages</h2>
          {messages.length ? <div className="admin-list">{messages.map((message) => <details open={message.status === MessageStatus.NEW} key={message.id}><summary><span>{message.subject} • {message.name}</span><span className={`status-badge ${message.status}`}>{message.status}</span></summary><div><p><b>From:</b> {message.name} • <a className="text-link" href={`mailto:${message.email}`}>{message.email}</a>{message.phone && <> • {message.phone}</>}</p><p style={{ whiteSpace: 'pre-line' }}>{message.message}</p><form action={updateMessageStatus}><input type="hidden" name="id" value={message.id} /><div className="admin-actions"><button className="btn small" name="status" value={MessageStatus.READ}>Mark read</button><button className="btn outline small" name="status" value={MessageStatus.ARCHIVED}>Archive</button><a className="btn gold small" href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}>Reply by email</a></div></form></div></details>)}</div> : <div className="admin-card"><p>No website messages yet.</p></div>}
        </section>

        <section className="admin-section" id="reviews">
          <h2>Customer reviews</h2>
          <p className="muted">Reviews stay hidden until you approve them. Approved reviews show star ratings on the product page and in Google results.</p>
          {reviews.length ? (
            <div className="admin-list">
              {reviews.map((review) => (
                <details open={review.status === ReviewStatus.PENDING} key={review.id}>
                  <summary>
                    <span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} • {review.product.name} • {review.authorName}</span>
                    <span className={`status-badge ${review.status === ReviewStatus.APPROVED ? 'PAID' : review.status === ReviewStatus.REJECTED ? 'CANCELLED' : 'NEW'}`}>
                      {review.status}
                    </span>
                  </summary>
                  <div>
                    {review.title && <p><b>{review.title}</b></p>}
                    <p style={{ whiteSpace: 'pre-line' }}>{review.body}</p>
                    <p className="muted">
                      {review.email || 'No email'} • {review.createdAt.toLocaleDateString()}

                    </p>
                    <form action={updateReview}>
                      <input type="hidden" name="id" value={review.id} />
                      <label className="admin-label full">
                        Public reply (optional)
                        <textarea className="admin-input" name="ownerReply" rows={2} defaultValue={review.ownerReply || ''} />
                      </label>
                      <label className="admin-checkbox">
                        <input
                          type="checkbox"
                          name="verifiedPurchase"
                          defaultChecked={review.verifiedPurchase}
                        />{' '}
                        Show the &ldquo;verified purchase&rdquo; badge
                        {reviewPurchaseMatches.has(`${review.productId}:${(review.email || '').toLowerCase()}`)
                          ? ' — this email is on a paid order for this product'
                          : ' — no paid order matches this email'}
                      </label>
                      <div className="admin-actions">
                        <button className="btn small" name="status" value={ReviewStatus.APPROVED}>Approve &amp; publish</button>
                        <button className="btn outline small" name="status" value={ReviewStatus.PENDING}>Keep hidden</button>
                        <button className="btn danger small" name="status" value={ReviewStatus.REJECTED}>Reject</button>
                        <Link className="btn outline small" href={`/shop/${review.product.slug}#reviews`}>View product</Link>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="admin-card"><p>No reviews yet. Reviews can be left on any product page.</p></div>}
        </section>

        <section className="admin-section" id="restock">
          <h2>Restock requests</h2>
          <p className="muted">Customers waiting on a sold-out product. Everyone here is emailed automatically the moment you raise that product&rsquo;s quantity above zero.</p>
          {stockAlerts.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Product</th><th>In stock</th><th>Email</th><th>Requested</th></tr></thead>
                <tbody>
                  {stockAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td><Link className="text-link" href={`/shop/${alert.product.slug}`}>{alert.product.name}</Link></td>
                      <td>{alert.product.inventory}</td>
                      <td><a className="text-link" href={`mailto:${alert.email}`}>{alert.email}</a></td>
                      <td>{alert.createdAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="admin-card"><p>Nobody is waiting on a restock right now.</p></div>}
        </section>

        <section className="admin-section" id="subscribers">
          <h2>Email subscribers</h2>
          <p className="muted">Export-ready subscriber records are stored here. Connect an email campaign platform before sending bulk marketing messages.</p>
          {subscribers.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Joined</th><th>Status</th></tr></thead><tbody>{subscribers.map((subscriber) => <tr key={subscriber.id}><td>{subscriber.email}</td><td>{subscriber.name || '—'}</td><td>{subscriber.source || 'website'}</td><td>{subscriber.createdAt.toLocaleDateString()}</td><td><form action={updateSubscriber}><input type="hidden" name="id" value={subscriber.id} /><label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={subscriber.active} /> Active</label><button className="btn small" style={{ marginTop: 5 }}>Save</button></form></td></tr>)}</tbody></table></div> : <div className="admin-card"><p>No subscribers yet.</p></div>}
        </section>
      </div>
    </div>
  );
}
