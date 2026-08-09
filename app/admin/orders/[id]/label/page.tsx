import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shipping Label' };

export default async function ShippingLabel({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();
  const returnAddress = process.env.BUSINESS_RETURN_ADDRESS || 'The Hillside Gardens';

  return (
    <section className="content">
      <div className="no-print" style={{ width: '4in', maxWidth: 'calc(100% - 30px)', margin: '0 auto 12px' }}><PrintButton label="Print 4 × 6 label" /></div>
      <article className="label-sheet">
        <div style={{ fontSize: 11 }}><b>FROM</b><br /><span style={{ whiteSpace: 'pre-line' }}>{returnAddress}</span></div>
        <div className="recipient"><b>SHIP TO</b><br /><strong>{order.customerName}</strong><br />{order.address1}{order.address2 && <><br />{order.address2}</>}<br />{order.city}, {order.state} {order.postalCode}<br />{order.country}</div>
        <div className="invoice"><b>{order.invoiceNumber}</b><br />{order.items.map((item) => `${item.quantity} × ${item.name}`).join(' • ')}</div>
        <div style={{ marginTop: 25, borderTop: '1px solid #111', paddingTop: 10, textAlign: 'center', fontWeight: 800 }}>THE HILLSIDE GARDENS</div>
      </article>
    </section>
  );
}
