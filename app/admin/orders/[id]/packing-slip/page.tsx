import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packing Slip' };

export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();

  return (
    <section className="content">
      <div className="no-print" style={{ width: 'min(900px, calc(100% - 30px))', margin: '0 auto 12px' }}><PrintButton label="Print packing slip" /></div>
      <article className="print-document">
        <header className="print-header">
          <img src="/logo.png" alt="The Hillside Gardens" />
          <div style={{ textAlign: 'right' }}><h1 style={{ margin: 0, color: 'var(--forest)', font: '500 38px Georgia,serif' }}>Packing slip</h1><b>{order.invoiceNumber}</b><br /><span>{order.createdAt.toLocaleDateString('en-US', { dateStyle: 'long' })}</span></div>
        </header>
        <div className="print-columns">
          <div><div className="eyebrow">Ship to</div><b>{order.customerName}</b><br />{order.address1}{order.address2 && <><br />{order.address2}</>}<br />{order.city}, {order.state} {order.postalCode}<br />{order.country}<br /><br />{order.email}{order.phone && <><br />{order.phone}</>}</div>
          <div><div className="eyebrow">Order information</div><b>Status:</b> {order.status}<br /><b>Shipping:</b> {order.shippingMethod || 'Standard shipping'}<br />{order.trackingNumber && <><b>Tracking:</b> {order.trackingCarrier || ''} {order.trackingNumber}<br /></>}</div>
        </div>
        <table className="table"><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity}</td><td>{formatMoney(item.unitCents)}</td><td>{formatMoney(item.unitCents * item.quantity)}</td></tr>)}</tbody></table>
        <div style={{ marginLeft: 'auto', width: 320, marginTop: 24 }}><div className="summary-row"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div><div className="summary-row"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div><div className="summary-row"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div><div className="summary-row total"><span>Total paid</span><span>{formatMoney(order.totalCents)}</span></div></div>
        <div style={{ marginTop: 45, paddingTop: 20, borderTop: '1px solid var(--line)', textAlign: 'center' }}><b>Thank you for supporting The Hillside Gardens.</b><p>Plants • Teas • Botanicals • Practical plant education</p></div>
      </article>
    </section>
  );
}
