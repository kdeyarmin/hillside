import Link from 'next/link';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import { MailCheck, Video } from 'lucide-react';
import {
  classDateLabel,
  classFormatLabel,
  classLocationLabel,
  classTimeLabel,
  isOnlineClass
} from '@/lib/class-access';
import { CLASSES_EXIT_LINK } from '@/lib/class-visibility';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Class registration confirmed',
  robots: { index: false, follow: false }
};

export default async function ClassSuccess({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  /**
   * This page is a receipt, not a page anyone can open. It used to render "We
   * saved your seat" and "Your payment was successful" for a bare `/classes/
   * success` with no session at all — confirming a payment that may never have
   * happened, and, now that classes are hidden, standing as the one class
   * surface a stranger could still walk into.
   */
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) notFound();

  let session: Stripe.Checkout.Session | null = null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error('Unable to load class confirmation', error);
    /**
     * Only a genuine outage earns the benefit of the doubt — Stripe unreachable
     * must not stand between a customer who has just paid and their
     * confirmation. Everything else (a session id Stripe does not recognise, a
     * key that does not authenticate) means this request cannot be shown to be
     * a real registration, and an unverifiable receipt is exactly what should
     * not be rendered.
     */
    const unreachable =
      error instanceof Stripe.errors.StripeConnectionError ||
      error instanceof Stripe.errors.StripeAPIError ||
      error instanceof Stripe.errors.StripeRateLimitError;
    if (!unreachable) notFound();
  }

  const classId = session?.metadata?.classEventId;
  if (session && (session.payment_status === 'unpaid' || !classId)) notFound();
  const event = classId ? await db.classEvent.findUnique({ where: { id: classId } }) : null;
  const seats = Math.max(1, Number(session?.metadata?.seats) || 1);
  const online = Boolean(event && isOnlineClass(event.format));

  return (
    <section className="content">
      <div className="container" style={{ maxWidth: 760, textAlign: 'center', paddingTop: 45 }}>
        <div className="eyebrow">Registration confirmed</div>
        <h1
          className="display-title"
          style={{ fontSize: 58, color: 'var(--forest)', margin: '10px 0' }}
        >
          We saved your seat.
        </h1>
        {event ? (
          <div className="admin-card" style={{ textAlign: 'left', margin: '28px 0' }}>
            <h2 style={{ marginTop: 0 }}>{event.title}</h2>
            <div className="summary-row">
              <span>Format</span>
              <strong>{classFormatLabel(event.format)}</strong>
            </div>
            <div className="summary-row">
              <span>Date</span>
              <strong>
                {classDateLabel(event.startsAt)} at {classTimeLabel(event.startsAt)}
              </strong>
            </div>
            <div className="summary-row">
              <span>Location</span>
              <strong>{classLocationLabel(event)}</strong>
            </div>
            <div className="summary-row">
              <span>Seats</span>
              <strong>{seats}</strong>
            </div>
            <div className="summary-row">
              <span>Paid</span>
              <strong>{formatMoney(session?.amount_total || event.priceCents * seats)}</strong>
            </div>
            {event.whatToBring && (
              <p>
                <b>What to bring / what is included:</b> {event.whatToBring}
              </p>
            )}
          </div>
        ) : (
          <p>Your payment was successful and your class registration is being recorded.</p>
        )}

        {online ? (
          <div className="class-success-email-note">
            <MailCheck size={30} />
            <div>
              <h2>Check your email for the private classroom link.</h2>
              <p>
                The confirmation email contains a secure Hillside link that opens your classroom
                right in your browser. Keep that email and do not forward the link.
              </p>
              <p>
                <Video size={16} /> The classroom opens shortly before the scheduled class time.
              </p>
            </div>
          </div>
        ) : (
          <p>
            A confirmation and Stripe receipt will be sent to the email entered during checkout.
          </p>
        )}

        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" href={CLASSES_EXIT_LINK.href}>
            {CLASSES_EXIT_LINK.label}
          </Link>
          <Link className="btn gold" href="/care">
            Explore plant care
          </Link>
        </div>
      </div>
    </section>
  );
}
