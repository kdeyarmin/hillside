import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { seatsRemaining } from '@/lib/class-seats';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { formatMoney, newInvoiceNumber } from '@/lib/store';

export const runtime = 'nodejs';

type RequestedItem = { id: string; q: number };
type AddressLike = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};
type CollectedShipping = { name?: string | null; address?: AddressLike | null };

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id);
  return null;
}

function parseRequestedItems(value: string | null | undefined): RequestedItem[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as { id?: unknown; q?: unknown };
      const id = String(item.id || '').trim();
      const q = Math.max(1, Math.min(20, Math.floor(Number(item.q) || 1)));
      return id ? [{ id, q }] : [];
    });
  } catch {
    return [];
  }
}

function collectedShipping(session: Stripe.Checkout.Session): CollectedShipping | null {
  const collected = (session as unknown as {
    collected_information?: { shipping_details?: CollectedShipping | null } | null;
  }).collected_information;
  return collected?.shipping_details || null;
}

async function subscribeFromCheckout(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email || session.customer_email;
  if (email && session.consent?.promotions === 'opt_in') {
    await db.newsletterSubscriber.upsert({
      where: { email: email.toLowerCase() },
      update: { active: true, unsubscribedAt: null, source: 'stripe-checkout' },
      create: {
        email: email.toLowerCase(),
        name: session.customer_details?.name || null,
        source: 'stripe-checkout'
      }
    });
  }
}

async function fulfillProductOrder(session: Stripe.Checkout.Session) {
  const existing = await db.order.findUnique({ where: { stripeSessionId: session.id } });
  /**
   * The order committing is not the whole job — the confirmation email is sent
   * afterwards, and a failure there returns 500 so Stripe retries. A bare
   * `if (existing) return` meant the retry saw the order, returned early, and
   * the customer never received a confirmation for a purchase they had paid for.
   * Re-entering while the email is still outstanding is exactly what should
   * happen, so the guard only short-circuits once that has succeeded too.
   */
  if (existing?.confirmationEmailSentAt) return;
  if (existing) {
    await sendOrderEmails(existing.id);
    return;
  }

  const requested = parseRequestedItems(session.metadata?.items);
  const requestedIds = requested.map((item) => item.id);
  // Matched on id *or* slug: new sessions carry the immutable id, but sessions
  // created before that change carry a slug and must still fulfil.
  const products = await db.product.findMany({
    where: { OR: [{ id: { in: requestedIds } }, { slug: { in: requestedIds } }] }
  });
  const lineItems = requested.flatMap((item) => {
    const product = products.find(
      (candidate) => candidate.id === item.id || candidate.slug === item.id
    );
    return product
      ? [{ productId: product.id, name: product.name, quantity: item.q, unitCents: product.priceCents }]
      : [];
  });
  if (!lineItems.length) throw new Error(`No valid line items found for Stripe session ${session.id}`);

  const shippingDetails = collectedShipping(session);
  const address = shippingDetails?.address || session.customer_details?.address;
  const customerName = shippingDetails?.name || session.customer_details?.name || 'Customer';
  const email = session.customer_details?.email || session.customer_email || '';
  const subtotalCents = lineItems.reduce(
    (total, item) => total + item.unitCents * item.quantity,
    0
  );
  const taxCents = session.total_details?.amount_tax || 0;
  /**
   * Promotion codes are enabled at checkout, and the discount has to be recorded
   * or the totals cannot be made to add up: `subtotalCents` is recomputed from
   * current product prices while `totalCents` is what Stripe actually charged, so
   * a discounted order printed a packing slip reading
   * Subtotal + Shipping + Tax ≠ Total with nothing to explain the gap.
   */
  const discountCents = session.total_details?.amount_discount || 0;
  const totalCents = session.amount_total ?? subtotalCents;
  const shippingCents =
    session.shipping_cost?.amount_total ??
    Math.max(0, totalCents - subtotalCents - taxCents + discountCents);
  const invoiceNumber =
    session.metadata?.invoiceNumber || session.client_reference_id || newInvoiceNumber();

  const order = await db.$transaction(async (transaction) => {
    const created = await transaction.order.create({
      data: {
        invoiceNumber,
        stripeSessionId: session.id,
        paymentIntentId: objectId(session.payment_intent),
        stripeInvoiceId: objectId(session.invoice),
        status: 'PAID',
        customerName,
        email,
        phone: session.customer_details?.phone || null,
        address1: address?.line1 || '',
        address2: address?.line2 || null,
        city: address?.city || '',
        state: address?.state || '',
        postalCode: address?.postal_code || '',
        country: address?.country || 'US',
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        discountCents,
        shippingMethod: shippingCents === 0 ? 'Free standard shipping' : 'Standard shipping',
        items: { create: lineItems }
      },
      include: { items: true }
    });

    for (const item of lineItems) {
      const result = await transaction.product.updateMany({
        where: { id: item.productId, inventory: { gte: item.quantity } },
        data: { inventory: { decrement: item.quantity } }
      });
      if (result.count === 0) {
        await transaction.product.update({ where: { id: item.productId }, data: { inventory: 0 } });
      }
    }
    return created;
  });

  /**
   * A newsletter opt-in is the least important thing happening in this function.
   * It used to run unguarded after the order committed, so a write conflict on
   * the subscriber row threw, the handler returned 500, and Stripe's retry hit
   * the idempotency guard and returned early — costing the customer their order
   * confirmation over a mailing-list row.
   */
  try {
    await subscribeFromCheckout(session);
  } catch (error) {
    console.error(`Newsletter opt-in failed for order ${order.invoiceNumber}`, error);
  }

  await sendOrderEmails(order.id);
}

/**
 * Split out of `fulfillProductOrder` so a Stripe retry can re-attempt delivery
 * for an order that committed but whose confirmation never sent. Safe to call
 * repeatedly: `sendEmail` is given an idempotency key, and the function returns
 * immediately once the confirmation is recorded as sent.
 */
async function sendOrderEmails(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.confirmationEmailSentAt) return;

  const itemRows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #dfe4dc">${escapeHtml(item.name)} × ${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #dfe4dc;text-align:right">${formatMoney(item.unitCents * item.quantity)}</td></tr>`
    )
    .join('');
  const customerHtml = emailShell(
    `Order ${order.invoiceNumber} received`,
    `<p>Hi ${escapeHtml(order.customerName)},</p><p>Thank you for shopping with The Hillside Gardens. Your payment was successful and we will begin preparing your order.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${itemRows}<tr><td style="padding-top:12px"><strong>Total</strong></td><td style="padding-top:12px;text-align:right"><strong>${formatMoney(order.totalCents)}</strong></td></tr></table><p><strong>Ship to</strong><br>${escapeHtml(order.address1)}${order.address2 ? `<br>${escapeHtml(order.address2)}` : ''}<br>${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.postalCode)}</p><p>You’ll receive another update when the order ships.</p>`
  );
  if (order.email) {
    const delivery = await sendEmail({
      to: order.email,
      subject: `We received your Hillside order ${order.invoiceNumber}`,
      html: customerHtml,
      idempotencyKey: `order-confirmation/${order.id}`
    });
    // A confirmation that never sent used to vanish without a trace. The outcome
    // is stored on the order so the dashboard can show it and Tammy can follow up.
    await db.order.update({
      where: { id: order.id },
      data: delivery.sent
        ? { confirmationEmailSentAt: new Date(), confirmationEmailError: null }
        : { confirmationEmailError: delivery.reason || 'unknown-error' }
    });
    if (!delivery.sent) {
      console.error(`Order ${order.invoiceNumber} confirmation email not sent: ${delivery.reason}`);
    }
  }

  const businessEmail = process.env.BUSINESS_EMAIL;
  if (businessEmail) {
    await sendEmail({
      to: businessEmail,
      subject: `New order ${order.invoiceNumber} • ${formatMoney(order.totalCents)}`,
      html: emailShell(
        `New order ${order.invoiceNumber}`,
        `<p><strong>${escapeHtml(order.customerName)}</strong> placed a paid order for ${formatMoney(order.totalCents)}.</p><p>Open the owner dashboard to review, print the packing slip and create the shipping label.</p>`
      ),
      idempotencyKey: `new-order-admin/${order.id}`
    });
  }
}

async function fulfillClassRegistration(session: Stripe.Checkout.Session) {
  const classEventId = session.metadata?.classEventId || '';
  const event = await db.classEvent.findUnique({ where: { id: classEventId } });
  if (!event) throw new Error(`Class ${classEventId} was not found for Stripe session ${session.id}`);

  const seats = Math.max(1, Math.min(6, Number(session.metadata?.seats) || 1));
  const name = session.customer_details?.name || 'Class guest';
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();

  // The checkout route reserves the seats as a PENDING hold. Payment converts
  // that same row rather than adding a second registration.
  const existing = await db.classRegistration.findUnique({ where: { stripeSessionId: session.id } });
  if (existing?.status === 'PAID' && existing.confirmationEmailSentAt) return;

  /**
   * Minted after the guard, and keyed on whether a link has ever been *delivered*
   * rather than on whether a token exists.
   *
   * Two failure modes have to be avoided at once. Minting unconditionally — as
   * this once did, above the guard — rotated `joinTokenHash` on Stripe's second
   * delivery of the same purchase and broke links already in the customer's
   * inbox. But refusing to mint whenever a hash exists is just as bad: only the
   * hash is stored, never the token, so a registration whose first email failed
   * could never produce a working link again, and the retry would send a
   * confirmation with no way to join and mark it as sent.
   *
   * `confirmationEmailSentAt` distinguishes the two exactly. If it is set, a link
   * reached the customer and must not be rotated — and the guard above has
   * already returned. If it is null, nothing usable was ever delivered, so
   * minting a fresh token breaks nothing.
   */
  const needsCredential = isOnlineClass(event.format) && !existing?.confirmationEmailSentAt;
  const credential = needsCredential ? createClassJoinCredential() : null;

  const registration = existing
    ? await db.classRegistration.update({
        where: { id: existing.id },
        data: {
          status: 'PAID',
          holdExpiresAt: null,
          paymentIntentId: objectId(session.payment_intent),
          name,
          email,
          phone: session.customer_details?.phone || null,
          seats,
          amountCents: session.amount_total || event.priceCents * seats,
          joinTokenHash: credential?.hash || existing.joinTokenHash
        }
      })
    : await createRegistrationForSweptHold({ event, session, name, email, seats, credential });

  try {
    await subscribeFromCheckout(session);
  } catch (error) {
    console.error(`Newsletter opt-in failed for class registration ${registration.id}`, error);
  }

  await sendClassRegistrationEmails({
    event,
    registration,
    accessToken: credential?.token
  });
}

/**
 * The payment landed but the PENDING hold is gone — the customer took longer than
 * the 35 minute window, or paid by a method that settles asynchronously and the
 * sweep in `releaseExpiredHolds` reached the row first.
 *
 * The seat has to be granted regardless: the money is already captured, and a
 * webhook is the wrong place to decide someone should be refunded. What this must
 * not do is grant it *silently* — the previous code created the registration with
 * no capacity check at all, so a class could quietly go over capacity with nothing
 * anywhere to say so. Capacity is therefore still evaluated, under the same
 * advisory lock the reservation path uses, purely so an overbooking is loud.
 */
async function createRegistrationForSweptHold({
  event,
  session,
  name,
  email,
  seats,
  credential
}: {
  event: { id: string; capacity: number; priceCents: number; title: string };
  session: Stripe.Checkout.Session;
  name: string;
  email: string;
  seats: number;
  credential: { hash: string; token: string } | null;
}) {
  const seatsLeft = await seatsRemaining(event.id, event.capacity);
  if (seats > seatsLeft) {
    console.error(
      `Overbooked "${event.title}" (${event.id}): honouring a paid registration for ${seats} ` +
        `seat(s) with only ${seatsLeft} remaining, because the seat hold had already expired ` +
        `when Stripe session ${session.id} settled. Contact the customer.`
    );
  }

  return db.classRegistration.create({
    data: {
      classEventId: event.id,
      stripeSessionId: session.id,
      paymentIntentId: objectId(session.payment_intent),
      name,
      email,
      phone: session.customer_details?.phone || null,
      seats,
      amountCents: session.amount_total || event.priceCents * seats,
      status: 'PAID',
      joinTokenHash: credential?.hash || null
    }
  });
}

/**
 * `charge.refunded` fires for partial refunds too, and the previous handler
 * treated every one of them as total. Refunding $5 of shipping on a $120 order
 * marked the whole order REFUNDED, and the dashboard's revenue figure excludes
 * REFUNDED orders — so a $5 goodwill gesture erased $120 of reported revenue.
 *
 * Stock is also returned here. Purchase decremented inventory and nothing ever
 * incremented it back, so refunded stock stayed invisible and unsellable until
 * someone noticed and corrected it by hand. `inventoryRestoredAt` makes that
 * restoration happen exactly once however many times Stripe delivers the event.
 */
async function applyRefund(charge: Stripe.Charge) {
  const paymentIntentId = objectId(charge.payment_intent);
  if (!paymentIntentId) return;

  const fullyRefunded = charge.refunded || charge.amount_refunded >= charge.amount;
  const status = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await db.classRegistration.updateMany({
    where: { paymentIntentId },
    // A class seat is either released or it isn't; there is no half a seat, so a
    // partial refund leaves the registration as it stands.
    data: { status: fullyRefunded ? 'REFUNDED' : undefined }
  });

  const order = await db.order.findFirst({
    where: { paymentIntentId },
    include: { items: true }
  });
  if (!order) return;

  await db.$transaction(async (transaction) => {
    /**
     * Monotonic, because refund events can arrive out of order. A charge that was
     * partially refunded and then fully refunded produces two events, and if the
     * older partial one is delivered last an unconditional write would downgrade
     * REFUNDED back to PARTIALLY_REFUNDED and lower `refundedCents` — making the
     * dashboard count revenue that had in fact been returned. Guarding on the
     * stored amount means a stale event is simply ignored.
     */
    const applied = await transaction.order.updateMany({
      where: { id: order.id, refundedCents: { lte: charge.amount_refunded } },
      data: { status, refundedCents: charge.amount_refunded }
    });
    if (applied.count === 0) return;

    if (!fullyRefunded) return;

    /**
     * Claim the restoration with a conditional update rather than by testing the
     * value read before the transaction opened. Two concurrent deliveries of the
     * same full refund would both have seen `inventoryRestoredAt` as null on that
     * earlier read and both incremented, restoring stock twice and overselling.
     * `updateMany` filtered on the null is a single atomic statement, so exactly
     * one caller wins it.
     */
    const claimed = await transaction.order.updateMany({
      where: { id: order.id, inventoryRestoredAt: null },
      data: { inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;

    for (const item of order.items) {
      await transaction.product.update({
        where: { id: item.productId },
        data: { inventory: { increment: item.quantity } }
      });
    }
  });
}

async function fulfillSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return;
  if (session.metadata?.kind === 'CLASS_REGISTRATION') {
    await fulfillClassRegistration(session);
  } else {
    await fulfillProductOrder(session);
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return new NextResponse('Stripe is not configured', { status: 503 });

  const stripe = new Stripe(secret);
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new NextResponse('Missing Stripe signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error('Invalid Stripe webhook signature', error);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await fulfillSession(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === 'charge.refunded') {
      await applyRefund(event.data.object as Stripe.Charge);
    }
  } catch (error) {
    console.error('Stripe fulfillment failed', error);
    return new NextResponse('Fulfillment failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
