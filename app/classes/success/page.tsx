import Link from 'next/link';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Class registration confirmed' };

export default async function ClassSuccess({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let session: Stripe.Checkout.Session | null = null;
  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      console.error('Unable to load class confirmation', error);
    }
  }

  const classId = session?.metadata?.classEventId;
  const event = classId ? await db.classEvent.findUnique({ where: { id: classId } }) : null;
  const seats = Math.max(1, Number(session?.metadata?.seats) || 1);

  return (
    <section className="content">
      <div className="container" style={{ maxWidth: 760, textAlign: 'center', paddingTop: 45 }}>
        <div className="eyebrow">Registration confirmed</div>
        <h1 className="display-title" style={{ fontSize: 58, color: 'var(--forest)', margin: '10px 0' }}>
          Tammy saved your seat.
        </h1>
        {event ? (
          <div className="admin-card" style={{ textAlign: 'left', margin: '28px 0' }}>
            <h2 style={{ marginTop: 0 }}>{event.title}</h2>
            <div className="summary-row"><span>Date</span><strong>{event.startsAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</strong></div>
            <div className="summary-row"><span>Location</span><strong>{event.location}</strong></div>
            <div className="summary-row"><span>Seats</span><strong>{seats}</strong></div>
            <div className="summary-row"><span>Paid</span><strong>{formatMoney(session?.amount_total || event.priceCents * seats)}</strong></div>
            {event.whatToBring && <p><b>What to bring:</b> {event.whatToBring}</p>}
          </div>
        ) : (
          <p>Your payment was successful and your class registration is being recorded.</p>
        )}
        <p>A confirmation and Stripe receipt will be sent to the email entered during checkout.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/classes">View all classes</Link>
          <Link className="btn gold" href="/care">Explore plant care</Link>
        </div>
      </div>
    </section>
  );
}
