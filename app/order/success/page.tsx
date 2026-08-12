import Link from 'next/link';
import Stripe from 'stripe';
import OrderSuccessClient from '@/components/OrderSuccessClient';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Order received',
  // A per-customer confirmation carrying an email address and order total has no
  // business in a search index.
  robots: { index: false, follow: false }
};

export default async function Success({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let session: Stripe.Checkout.Session | null = null;
  let invoiceUrl: string | null = null;

  const order = sessionId
    ? await db.order.findUnique({ where: { stripeSessionId: sessionId }, include: { items: true } })
    : null;

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      session = await stripe.checkout.sessions.retrieve(sessionId);

      /**
       * The invoice link is only produced for a session this shop has actually
       * recorded an order against. Anything in the query string used to be
       * retrieved from the Stripe account and rendered, and the hosted invoice
       * shows the customer's full billing name and address — so a session id
       * leaking through browser history, a Referer header or an analytics tool
       * was enough to read it. Session ids are high-entropy, so this was never
       * realistically guessable; it just should not be the only thing in the way.
       */
      if (order) {
        const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
        if (invoiceId) {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          invoiceUrl = invoice.hosted_invoice_url || null;
        }
      }
    } catch (error) {
      console.error('Unable to load checkout confirmation', error);
    }
  }
  const invoiceNumber = order?.invoiceNumber || session?.metadata?.invoiceNumber || 'Pending';
  const totalCents = order?.totalCents ?? session?.amount_total ?? 0;
  const email = order?.email || session?.customer_details?.email || session?.customer_email;

  return (
    <section className="content">
      <div className="print-document" style={{ maxWidth: 780, textAlign: 'center' }}>
        <img src="/logo.webp" alt="The Hillside Gardens" style={{ width: 260, margin: '0 auto 20px' }} />
        <div className="eyebrow">Order received</div>
        <h1 className="display-title" style={{ fontSize: 56, color: 'var(--forest)', margin: '10px 0' }}>
          Thank you for shopping small.
        </h1>
        <p style={{ fontSize: 18 }}>
          Your payment was successful. We will begin preparing your Hillside order.
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
            Your payment is confirmed. The full order details take a few seconds to finish
            recording — refresh this page, or look them up any time on the order-status page.
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
