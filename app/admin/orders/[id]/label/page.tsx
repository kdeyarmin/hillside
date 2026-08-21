import { notFound, redirect } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { isPickupOrder } from '@/lib/fulfillment';
import { sizedName } from '@/lib/product-sizes';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    select: { fulfillmentMethod: true, shippingMethod: true }
  });
  return { title: order && isPickupOrder(order) ? 'Pickup ticket' : 'Shipping Label' };
}

export default async function ShippingLabel({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();
  const returnAddress = process.env.BUSINESS_RETURN_ADDRESS || 'The Hillside Gardens';
  const pickup = isPickupOrder(order);

  return (
    <section className="content">
      <div
        className="no-print"
        style={{ width: '4in', maxWidth: 'calc(100% - 30px)', margin: '0 auto 12px' }}
      >
        <PrintButton label="Print 4 × 6 label" />
      </div>
      <article className="label-sheet">
        <div style={{ fontSize: 11 }}>
          <b>FROM</b>
          <br />
          <span style={{ whiteSpace: 'pre-line' }}>{returnAddress}</span>
        </div>
        <div className="recipient">
          <b>{pickup ? 'PICKUP — DO NOT SHIP' : 'SHIP TO'}</b>
          <br />
          <strong>{order.customerName}</strong>
          <br />
          {pickup ? (
            <>
              Local pickup in Ebensburg
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
            </>
          )}
        </div>
        <div className="invoice">
          <b>{order.invoiceNumber}</b>
          <br />
          {/* The size is on the ticket the packer works from, not only on the
              packing slip: two sizes of one plant are indistinguishable without it. */}
          {order.items
            .map((item) => `${item.quantity} × ${sizedName(item.name, item.size)}`)
            .join(' • ')}
        </div>
        <div
          style={{
            marginTop: 25,
            borderTop: '1px solid #111',
            paddingTop: 10,
            textAlign: 'center',
            fontWeight: 800
          }}
        >
          THE HILLSIDE GARDENS
        </div>
      </article>
    </section>
  );
}
