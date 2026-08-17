import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';
import { isPickupOrder } from '@/lib/fulfillment';
import { orderStatusBadge } from '@/lib/tracking';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packing Slip' };

export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();
  const pickup = isPickupOrder(order);

  return (
    <section className="content">
      <div
        className="no-print"
        style={{ width: 'min(900px, calc(100% - 30px))', margin: '0 auto 12px' }}
      >
        <PrintButton label="Print packing slip" />
      </div>
      <article className="print-document">
        <header className="print-header">
          <img src="/logo.webp" alt="The Hillside Gardens" />
          <div style={{ textAlign: 'right' }}>
            <h1 className="print-document-title">Packing slip</h1>
            <b>{order.invoiceNumber}</b>
            <br />
            <span>{order.createdAt.toLocaleDateString('en-US', { dateStyle: 'long' })}</span>
          </div>
        </header>
        <div className="print-columns">
          <div>
            <div className="eyebrow">{pickup ? 'Customer pickup' : 'Ship to'}</div>
            <b>{order.customerName}</b>
            <br />
            {pickup ? (
              <>
                Local pickup in Ebensburg
                <br />
                {order.email}
                {order.phone && (
                  <>
                    <br />
                    {order.phone}
                  </>
                )}
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
                <br />
                <br />
                {order.email}
                {order.phone && (
                  <>
                    <br />
                    {order.phone}
                  </>
                )}
              </>
            )}
          </div>
          <div>
            <div className="eyebrow">Order information</div>
            <b>Status:</b> {orderStatusBadge(order.status, order.fulfillmentMethod)}
            <br />
            <b>{pickup ? 'Fulfillment:' : 'Shipping:'}</b>{' '}
            {order.shippingMethod || (pickup ? 'Local pickup' : 'Standard shipping')}
            <br />
            {order.trackingNumber && (
              <>
                <b>Tracking:</b> {order.trackingCarrier || ''} {order.trackingNumber}
                <br />
              </>
            )}
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.unitCents)}</td>
                <td>{formatMoney(item.unitCents * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The discount and refund rows only appear when they are non-zero, but
            they have to exist: without the discount line a promotion-code order
            printed a slip whose subtotal, shipping and tax did not add up to the
            total, with nothing on the page to account for the difference. */}
        <div style={{ marginLeft: 'auto', width: 320, marginTop: 24 }}>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="summary-row">
              <span>Discount</span>
              <span>−{formatMoney(order.discountCents)}</span>
            </div>
          )}
          <div className="summary-row">
            <span>{pickup ? 'Pickup' : 'Shipping'}</span>
            <span>{formatMoney(order.shippingCents)}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(order.taxCents)}</span>
          </div>
          <div className="summary-row total">
            <span>Total paid</span>
            <span>{formatMoney(order.totalCents)}</span>
          </div>
          {order.refundedCents > 0 && (
            <div className="summary-row">
              <span>Refunded</span>
              <span>−{formatMoney(order.refundedCents)}</span>
            </div>
          )}
        </div>
        {order.giftMessage && (
          <div className="note-box" style={{ marginTop: 28 }}>
            <b>Gift message — include with the order</b>
            <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{order.giftMessage}</p>
          </div>
        )}
        {pickup && order.pickupNote && (
          <div className="note-box" style={{ marginTop: 16 }}>
            <b>Arranged pickup window</b>
            <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{order.pickupNote}</p>
          </div>
        )}
        <div
          style={{
            marginTop: 45,
            paddingTop: 20,
            borderTop: '1px solid var(--line)',
            textAlign: 'center'
          }}
        >
          <b>Thank you for supporting The Hillside Gardens.</b>
          <p>Plants • Teas • Botanicals • Practical plant education</p>
        </div>
      </article>
    </section>
  );
}
