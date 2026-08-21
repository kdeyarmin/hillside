import Link from 'next/link';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import OrderSuccessClient from '@/components/OrderSuccessClient';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { db } from '@/lib/db';
import { sizedName } from '@/lib/product-sizes';
import { formatMoney } from '@/lib/store';
import { isPickupOrder } from '@/lib/fulfillment';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Order received',
  robots: { index: false, follow: false }
};

export default async function Success({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) notFound();

  const order = await db.order.findUnique({
    where: { stripeSessionId: sessionId },
    include: { items: true }
  });

  let session: Stripe.Checkout.Session | null = null;
  let invoiceUrl: string | null = null;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    session = await stripe.checkout.sessions.retrieve(sessionId);

    /**
     * The invoice link is only produced for a session this shop has actually
     * recorded an order against. A raw session id used to retrieve the hosted
     * invoice (billing name and address) from Stripe directly.
     */
    if (order) {
      const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        invoiceUrl = invoice.hosted_invoice_url || null;
      }
    }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) notFound();
    console.error('Unable to load checkout confirmation', error);
    if (!order) {
      const unreachable =
        error instanceof Stripe.errors.StripeConnectionError ||
        error instanceof Stripe.errors.StripeAPIError ||
        error instanceof Stripe.errors.StripeRateLimitError;
      if (!unreachable) notFound();
    }
  }

  if (
    session &&
    session.payment_status !== 'paid' &&
    session.payment_status !== 'no_payment_required'
  ) {
    notFound();
  }

  const paid = Boolean(
    order?.status === 'PAID' ||
    order?.status === 'FULFILLED' ||
    session?.payment_status === 'paid' ||
    session?.payment_status === 'no_payment_required'
  );
  if (!paid && !order) notFound();

  const invoiceNumber = order?.invoiceNumber || session?.metadata?.invoiceNumber || 'Pending';
  const totalCents = order?.totalCents ?? session?.amount_total ?? 0;
  const email = order?.email || session?.customer_details?.email || session?.customer_email;
  const pickup = order ? isPickupOrder(order) : session?.metadata?.fulfillment === 'PICKUP';
  const catalogEmpty = !(await catalogHasActiveProducts());

  return (
    <section className="content">
      <div className="print-document" style={{ maxWidth: 780, textAlign: 'center' }}>
        <img
          src="/logo.webp"
          alt="The Hillside Gardens"
          width={320}
          height={309}
          style={{ width: 260, height: 'auto', margin: '0 auto 20px' }}
        />
        <div className="eyebrow">Order received</div>
        <h1
          className="display-title"
          style={{ fontSize: 56, color: 'var(--forest)', margin: '10px 0' }}
        >
          Thank you for shopping small.
        </h1>
        <p style={{ fontSize: 18 }}>
          {pickup
            ? 'Your payment was successful. This pickup was arranged with us. We will email when it is ready — please wait for that note before you come by.'
            : 'Your payment was successful. We will begin preparing your Hillside order.'}
        </p>
        <div className="admin-card" style={{ textAlign: 'left', margin: '28px 0' }}>
          <div className="summary-row">
            <span>Order / invoice</span>
            <strong>{invoiceNumber}</strong>
          </div>
          <div className="summary-row">
            <span>Total paid</span>
            <strong>{formatMoney(totalCents)}</strong>
          </div>
          {email && (
            <div className="summary-row">
              <span>
                {order?.confirmationEmailSentAt
                  ? 'Confirmation sent to'
                  : 'Confirmation will be sent to'}
              </span>
              <strong>{email}</strong>
            </div>
          )}
          {order?.giftMessage && (
            <div className="summary-row">
              <span>Gift message</span>
              <strong style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                {order.giftMessage}
              </strong>
            </div>
          )}
          {order?.items.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>
                {sizedName(item.name, item.size)} × {item.quantity}
              </span>
              <span>{formatMoney(item.unitCents * item.quantity)}</span>
            </div>
          ))}
        </div>
        <p>
          {pickup
            ? 'A Stripe receipt and invoice are emailed after purchase. Another update will be sent when the order is ready to pick up.'
            : 'A Stripe receipt and invoice are emailed after purchase. Another update will be sent when the order ships.'}
        </p>
        {!order && (
          <p className="muted" style={{ fontSize: 13 }}>
            Your payment is confirmed. The full order details take a few seconds to finish recording
            — refresh this page, or look them up any time on the order-status page.
          </p>
        )}
        <OrderSuccessClient
          invoiceUrl={invoiceUrl}
          sessionId={sessionId}
          shouldClearCart={paid}
          catalogEmpty={catalogEmpty}
          purchase={
            order
              ? {
                  invoiceNumber: order.invoiceNumber,
                  totalCents: order.totalCents,
                  items: order.items.map((item) => ({
                    name: item.name,
                    size: item.size,
                    quantity: item.quantity,
                    unitCents: item.unitCents
                  }))
                }
              : null
          }
        />
        <p className="no-print" style={{ marginTop: 25 }}>
          <Link className="text-link" href="/order-status">
            Check an order later →
          </Link>
        </p>
      </div>
    </section>
  );
}
