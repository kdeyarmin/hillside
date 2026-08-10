import Link from 'next/link';
import { MessageStatus, OrderStatus, ProductType, RegistrationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import { formatMoney, productTypeLabel } from '@/lib/store';
import {
  archiveProduct,
  loginAdmin,
  logoutAdmin,
  saveProduct,
  updateMessageStatus,
  updateOrder,
  updateRegistration,
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

function ProductFields({ product }: { product?: {
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
} }) {
  return (
    <>
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="admin-form-grid">
        <label className="admin-label">Product name<input className="admin-input" name="name" defaultValue={product?.name} required /></label>
        <label className="admin-label">URL slug<input className="admin-input" name="slug" defaultValue={product?.slug} placeholder="created-from-name" /></label>
        <label className="admin-label">SKU / item number<input className="admin-input" name="sku" defaultValue={product?.sku || ''} /></label>
        <label className="admin-label">Category<select className="admin-input" name="type" defaultValue={product?.type || ProductType.PLANT}>{Object.values(ProductType).map((type) => <option value={type} key={type}>{productTypeLabel(type)}</option>)}</select></label>
        <label className="admin-label">Price<input className="admin-input" name="price" type="number" min="0" step="0.01" defaultValue={product ? (product.priceCents / 100).toFixed(2) : ''} required /></label>
        <label className="admin-label">Compare-at price<input className="admin-input" name="compareAt" type="number" min="0" step="0.01" defaultValue={product?.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : ''} /></label>
        <label className="admin-label">Quantity on hand<input className="admin-input" name="inventory" type="number" min="0" defaultValue={product?.inventory ?? 0} required /></label>
        <label className="admin-label">Display order<input className="admin-input" name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} /></label>
        <label className="admin-label">Badge<input className="admin-input" name="badge" defaultValue={product?.badge || ''} placeholder="Tammy’s pick" /></label>
        <label className="admin-label">Photo URL<input className="admin-input" name="imageUrl" type="text" defaultValue={product?.imageUrl || ''} /></label>
        <label className="admin-label full">Short card description<input className="admin-input" name="shortDescription" defaultValue={product?.shortDescription || ''} /></label>
        <label className="admin-label full">Main description<textarea className="admin-input" name="description" rows={4} defaultValue={product?.description} required /></label>
        <label className="admin-label full">Product details, ingredients or contents<textarea className="admin-input" name="details" rows={4} defaultValue={product?.details || ''} /></label>
        <label className="admin-label full">Plant care note<textarea className="admin-input" name="careNotes" rows={2} defaultValue={product?.careNotes || ''} /></label>
        <label className="admin-label full">Shipping / pickup note<textarea className="admin-input" name="shippingNote" rows={2} defaultValue={product?.shippingNote || ''} /></label>
      </div>
      <div className="admin-actions">
        <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active in shop</label>
        <label className="admin-checkbox"><input name="featured" type="checkbox" defaultChecked={product?.featured ?? false} /> Featured</label>
      </div>
    </>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const authenticated = await isAdmin();
  const params = await searchParams;

  if (!authenticated) {
    return (
      <section className="content">
        <div className="container" style={{ maxWidth: 520 }}>
          <div className="card"><div className="cardbody">
            <img src="/logo.png" alt="The Hillside Gardens" style={{ width: 260, margin: '0 auto 25px' }} />
            <h1 className="display-title" style={{ color: 'var(--forest)', fontSize: 42, textAlign: 'center' }}>Owner sign in</h1>
            <p style={{ textAlign: 'center' }}>Use the private password configured in Railway.</p>
            {params.error && <p style={{ color: 'var(--danger)', textAlign: 'center' }}><b>That password wasn’t correct.</b></p>}
            <form action={loginAdmin}>
              <input name="password" type="password" required placeholder="Admin password" style={{ ...input, marginBottom: 14 }} />
              <button className="btn full">Sign in</button>
            </form>
          </div></div>
        </div>
      </section>
    );
  }

  const [products, orders, revenue, registrations, messages, subscribers] = await Promise.all([
    db.product.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 75, include: { items: true } }),
    db.order.aggregate({ _sum: { totalCents: true }, where: { status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] } } }),
    db.classRegistration.findMany({ orderBy: { createdAt: 'desc' }, take: 75, include: { classEvent: true } }),
    db.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  ]);

  const lowStock = products.filter((product) => product.active && product.inventory <= 3).length;
  const openOrders = orders.filter((order) => order.status === OrderStatus.PAID).length;
  const unreadMessages = messages.filter((message) => message.status === MessageStatus.NEW).length;
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.active).length;

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.png" alt="The Hillside Gardens" />
        <b>Owner Business Center</b>
        <a href="#overview">Overview</a>
        <a href="#orders">Orders & shipping</a>
        <a href="#inventory">Inventory & products</a>
        <a href="#registrations">Class registrations</a>
        <a href="#messages">Customer messages</a>
        <a href="#subscribers">Email subscribers</a>
        <Link href="/admin/content">Website content</Link>
        <Link href="/">View public website</Link>
        <form action={logoutAdmin}><button className="btn gold small" style={{ marginTop: 16 }}>Sign out</button></form>
      </aside>

      <main className="adminmain">
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
          <div className="stat"><span>Paid revenue</span><strong>{formatMoney(revenue._sum.totalCents || 0)}</strong></div>
          <div className="stat"><span>Orders to ship</span><strong>{openOrders}</strong></div>
          <div className="stat"><span>Active products</span><strong>{products.filter((product) => product.active).length}</strong></div>
          <div className="stat"><span>Low stock</span><strong>{lowStock}</strong></div>
          <div className="stat"><span>New messages</span><strong>{unreadMessages}</strong></div>
          <div className="stat"><span>Email subscribers</span><strong>{activeSubscribers}</strong></div>
        </div>

        <section className="admin-section" id="orders">
          <div className="toolbar"><div><h2>Orders and fulfillment</h2><p className="muted">Update tracking, print documents and mark orders shipped.</p></div><a className="btn small" href="/api/admin/shipping.csv">Download unshipped addresses</a></div>
          {orders.length ? (
            <div className="admin-list">
              {orders.map((order) => (
                <details open={order.status === OrderStatus.PAID} key={order.id}>
                  <summary>
                    <span>{order.invoiceNumber} • {order.customerName} • {formatMoney(order.totalCents)}</span>
                    <span className={`status-badge ${order.status}`}>{order.status}</span>
                  </summary>
                  <div>
                    <div className="grid two">
                      <div>
                        <b>Customer</b><br />{order.customerName}<br /><a className="text-link" href={`mailto:${order.email}`}>{order.email}</a>{order.phone && <><br />{order.phone}</>}
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
                  <span>{product.name} • {formatMoney(product.priceCents)} • {product.inventory} in stock</span>
                  <span className={`status-badge ${product.active ? 'PAID' : 'CANCELLED'}`}>{product.active ? 'Active' : 'Archived'}</span>
                </summary>
                <div>
                  <form action={saveProduct}>
                    <ProductFields product={product} />
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
              <ProductFields />
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

        <section className="admin-section" id="subscribers">
          <h2>Email subscribers</h2>
          <p className="muted">Export-ready subscriber records are stored here. Connect an email campaign platform before sending bulk marketing messages.</p>
          {subscribers.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Joined</th><th>Status</th></tr></thead><tbody>{subscribers.map((subscriber) => <tr key={subscriber.id}><td>{subscriber.email}</td><td>{subscriber.name || '—'}</td><td>{subscriber.source || 'website'}</td><td>{subscriber.createdAt.toLocaleDateString()}</td><td><form action={updateSubscriber}><input type="hidden" name="id" value={subscriber.id} /><label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={subscriber.active} /> Active</label><button className="btn small" style={{ marginTop: 5 }}>Save</button></form></td></tr>)}</tbody></table></div> : <div className="admin-card"><p>No subscribers yet.</p></div>}
        </section>
      </main>
    </div>
  );
}
