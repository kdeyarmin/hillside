import Link from 'next/link';
import Stripe from 'stripe';
import OrderSuccessClient from '@/components/OrderSuccessClient';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order received' };

export default async function Success({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let session: Stripe.Checkout.Session | null = null;
  let invoiceUrl: string | null = null;

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      session = await stripe.checkout.sessions.retrieve(sessionId);
      const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        invoiceUrl = invoice.hosted_invoice_url;
      }
    } catch (error) {
      console.error('Unable to load checkout confirmation', error);
    }
  }

  const order = sessionId
    ? await db.order.findUnique({ where: { stripeSessionId: sessionId }, include: { items: true } })
    : null;
  const invoiceNumber = order?.invoiceNumber || session?.metadata?.invoiceNumber || 'Pending';
  const totalCents = order?.totalCents ?? session?.amount_total ?? 0;
  const email = order?.email || session?.customer_details?.email || session?.customer_email;

  return (
    <section className="content">
      <div className="print-document" style={{ maxWidth: 780, textAlign: 'center' }}>
        <img src="/logo.svg" alt="The Hillside Gardens" style={{ width: 260, margin: '0 auto 20px' }} />
        <div className="eyebrow">Order received</div>
        <h1 className="display-title" style={{ fontSize: 56, color: 'var(--forest)', margin: '10px 0' }}>
          Thank you for shopping small.
        </h1>
        <p style={{ fontSize: 18 }}>
          Your payment was successful. Tammy will begin preparing your Hillside order.
        </p>
        <div className="admin-card" style={{ textAlign: 'left', margin: '28px 0' }}>
          <div className="summary-row"><span>Order / invoice</span><strong>{invoiceNumber}</strong></div>
          <div className="summary-row"><span>Total paid</span><strong>{formatMoney(totalCents)}</strong></div>
          {email && <div className="summary-row"><span>Confirmation sent to</span><strong>{email}</strong></div>}
          {order?.items.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>{item.name} × {item.quantity}</span>
              <span>{formatMoney(item.unitCents * item.quantity)}</span>
            </div>
          ))}
        </div>
        <p>
          A Stripe receipt and invoice are emailed after purchase. Another update will be sent when
          the order ships.
        </p>
        {!order && sessionId && (
          <p className="muted" style={{ fontSize: 13 }}>
            The order is still syncing to the owner dashboard. This normally finishes within a few seconds.
          </p>
        )}
        <OrderSuccessClient invoiceUrl={invoiceUrl} />
        <p className="no-print" style={{ marginTop: 25 }}>
          <Link className="text-link" href="/order-status">Check an order later →</Link>
        </p>
      </div>
    </section>
  );
}
