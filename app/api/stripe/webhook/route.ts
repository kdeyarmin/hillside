import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { findHoldBySessionOrHoldId, releaseHold, seatsRemaining } from '@/lib/class-seats';
import {
  parseCheckoutItems,
  releaseExpiredProductHolds,
  releaseProductHold,
  returnSizeStock,
  takeAvailableInventory
} from '@/lib/checkout';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { sendOrderConfirmationEmail } from '@/lib/order-send';
import { refundedOrderStatus, shouldRestoreInventoryOnRefund } from '@/lib/orders';
import {
  isPickupOrder,
  pickupPlaceholderAddress,
  sanitizeGiftMessage,
  shippingMethodLabel,
  type FulfillmentChoice
} from '@/lib/fulfillment';
import { findSize, productSizes, sizedName } from '@/lib/product-sizes';
import { formatMoney, newInvoiceNumber, ownerNotificationEmails } from '@/lib/store';

export const runtime = 'nodejs';

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
  if (value && typeof value === 'object' && 'id' in value)
    return String((value as { id: unknown }).id);
  return null;
}

function collectedShipping(session: Stripe.Checkout.Session): CollectedShipping | null {
  const collected = (
    session as unknown as {
      collected_information?: { shipping_details?: CollectedShipping | null } | null;
    }
  ).collected_information;
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

async function findReservedOrder(session: Stripe.Checkout.Session) {
  const reservedId = session.metadata?.orderId?.trim();
  if (reservedId) {
    const byId = await db.order.findUnique({ where: { id: reservedId }, include: { items: true } });
    if (byId) return byId;
  }
  return db.order.findUnique({ where: { stripeSessionId: session.id }, include: { items: true } });
}

function giftFromSession(session: Stripe.Checkout.Session, fallback: string | null) {
  const field = session.custom_fields?.find((entry) => entry.key === 'gift_message');
  return (
    sanitizeGiftMessage(field?.text?.value) ||
    sanitizeGiftMessage(session.metadata?.gift) ||
    fallback
  );
}

function fulfillmentFromSession(
  session: Stripe.Checkout.Session,
  fallback: FulfillmentChoice = 'SHIP'
): FulfillmentChoice {
  return session.metadata?.fulfillment === 'PICKUP' || fallback === 'PICKUP' ? 'PICKUP' : 'SHIP';
}

function customerFieldsFromSession(session: Stripe.Checkout.Session, pickup: boolean) {
  const shippingDetails = collectedShipping(session);
  const address = shippingDetails?.address || session.customer_details?.address;
  const placeholder = pickupPlaceholderAddress();
  const line1 = address?.line1 || '';
  return {
    customerName: shippingDetails?.name || session.customer_details?.name || 'Customer',
    email: session.customer_details?.email || session.customer_email || '',
    phone: session.customer_details?.phone || null,
    address1: line1 || (pickup ? placeholder.address1 : ''),
    address2: address?.line2 || null,
    city: address?.city || (pickup ? placeholder.city : ''),
    state: address?.state || (pickup ? placeholder.state : ''),
    postalCode: address?.postal_code || '',
    country: address?.country || 'US'
  };
}

async function completeReservedOrder(
  order: NonNullable<Awaited<ReturnType<typeof findReservedOrder>>>,
  session: Stripe.Checkout.Session
) {
  const pickup = isPickupOrder(order) || fulfillmentFromSession(session) === 'PICKUP';
  const customer = customerFieldsFromSession(session, pickup);
  const taxCents = session.total_details?.amount_tax || 0;
  const discountCents = session.total_details?.amount_discount || 0;
  const totalCents = session.amount_total ?? order.totalCents;
  const shippingCents = pickup
    ? 0
    : (session.shipping_cost?.amount_total ??
      Math.max(0, totalCents - order.subtotalCents - taxCents + discountCents));
  const fulfillmentMethod: 'PICKUP' | 'SHIP' = pickup ? 'PICKUP' : 'SHIP';
  const paidFields = {
    stripeSessionId: session.id,
    paymentIntentId: objectId(session.payment_intent),
    stripeInvoiceId: objectId(session.invoice),
    status: 'PAID' as const,
    ...customer,
    taxCents,
    discountCents,
    totalCents,
    shippingCents,
    fulfillmentMethod,
    giftMessage: giftFromSession(session, order.giftMessage),
    shippingMethod: shippingMethodLabel(fulfillmentMethod, shippingCents)
  };

  let oversold = false;
  await db.$transaction(async (transaction) => {
    const current = await transaction.order.findUnique({
      where: { id: order.id },
      include: { items: true }
    });
    if (!current || (current.status !== 'PENDING' && current.status !== 'CANCELLED')) return;

    const mustReacquire = current.status === 'CANCELLED' || Boolean(current.inventoryRestoredAt);
    if (mustReacquire) {
      for (const item of current.items) {
        const took = await takeAvailableInventory(
          transaction,
          item.productId,
          item.quantity,
          item.size
        );
        if (!took) oversold = true;
      }
    }

    const claimed = await transaction.order.updateMany({
      where: { id: current.id, status: current.status },
      data: { ...paidFields, inventoryRestoredAt: null }
    });
    if (claimed.count === 0) {
      throw new Error(`Lost the claim on order ${current.id} during fulfillment.`);
    }
  });

  if (oversold) {
    await notifyOversell(
      order.invoiceNumber,
      order.items.map((item) => sizedName(item.name, item.size)).join(', ')
    );
  }
}

async function notifyOversell(invoiceNumber: string, items: string) {
  const ownerEmails = ownerNotificationEmails();
  if (!ownerEmails.length) return;
  await sendEmail({
    to: ownerEmails,
    kind: 'ORDER_ADMIN',
    subject: `Oversold order ${invoiceNumber} needs attention`,
    html: emailShell(
      `Oversold order ${invoiceNumber}`,
      `<p>A paid order settled after its inventory hold had already been released.</p><p><strong>Items:</strong> ${escapeHtml(items)}</p><p>Check stock and contact the customer if anything cannot ship.</p>`
    ),
    idempotencyKey: `oversell/${invoiceNumber}`
  });
}

async function fulfillProductOrder(session: Stripe.Checkout.Session) {
  const existing = await findReservedOrder(session);
  if (existing?.confirmationEmailSentAt) return;
  if (existing?.status === 'PAID' || existing?.status === 'FULFILLED') {
    await sendOrderEmails(existing.id);
    return;
  }

  if (existing && (existing.status === 'PENDING' || existing.status === 'CANCELLED')) {
    await completeReservedOrder(existing, session);
    try {
      await subscribeFromCheckout(session);
    } catch (error) {
      console.error(`Newsletter opt-in failed for order ${existing.invoiceNumber}`, error);
    }
    await sendOrderEmails(existing.id);
    return;
  }

  if (existing) {
    await sendOrderEmails(existing.id);
    return;
  }

  await fulfillLegacyProductOrder(session);
}

/**
 * Sessions created before inventory holds existed have no reserved order row.
 * Fulfill from the snapshot in metadata, and refuse to drop a paid line item.
 */
async function fulfillLegacyProductOrder(session: Stripe.Checkout.Session) {
  const requested = parseCheckoutItems(session.metadata?.items);
  const requestedIds = requested.map((item) => item.id);
  const products = await db.product.findMany({
    where: { OR: [{ id: { in: requestedIds } }, { slug: { in: requestedIds } }] }
  });
  const lineItems = requested.flatMap((item) => {
    const product = products.find(
      (candidate) => candidate.id === item.id || candidate.slug === item.id
    );
    if (!product) return [];
    /**
     * The size is carried in metadata; its price is not, because a metadata
     * value is capped at 500 characters. The size list on the product is the
     * cheaper place to look it back up.
     */
    const sizes = productSizes(product.sizes, product.priceCents);
    const chosen = sizes.length ? findSize(sizes, item.s) : null;
    return [
      {
        productId: product.id,
        name: product.name,
        size: chosen?.label || null,
        quantity: item.q,
        unitCents: item.p ?? chosen?.priceCents ?? product.priceCents
      }
    ];
  });
  if (!lineItems.length)
    throw new Error(`No valid line items found for Stripe session ${session.id}`);
  if (lineItems.length !== requested.length) {
    throw new Error(
      `Stripe session ${session.id} paid for ${requested.length} lines but only ${lineItems.length} could be resolved.`
    );
  }

  const fulfillmentMethod: 'PICKUP' | 'SHIP' = fulfillmentFromSession(session);
  const pickup = fulfillmentMethod === 'PICKUP';
  const customer = customerFieldsFromSession(session, pickup);
  const subtotalCents = lineItems.reduce(
    (total, item) => total + item.unitCents * item.quantity,
    0
  );
  const taxCents = session.total_details?.amount_tax || 0;
  const discountCents = session.total_details?.amount_discount || 0;
  const totalCents = session.amount_total ?? subtotalCents;
  const shippingCents = pickup
    ? 0
    : (session.shipping_cost?.amount_total ??
      Math.max(0, totalCents - subtotalCents - taxCents + discountCents));
  const invoiceNumber =
    session.metadata?.invoiceNumber || session.client_reference_id || newInvoiceNumber();

  let order: { id: string; invoiceNumber: string };
  let oversold = false;
  try {
    order = await db.$transaction(async (transaction) => {
      const created = await transaction.order.create({
        data: {
          invoiceNumber,
          stripeSessionId: session.id,
          paymentIntentId: objectId(session.payment_intent),
          stripeInvoiceId: objectId(session.invoice),
          status: 'PAID',
          ...customer,
          subtotalCents,
          shippingCents,
          taxCents,
          totalCents,
          discountCents,
          fulfillmentMethod,
          giftMessage: giftFromSession(session, null),
          shippingMethod: shippingMethodLabel(fulfillmentMethod, shippingCents),
          items: { create: lineItems }
        },
        include: { items: true }
      });

      for (const item of lineItems) {
        const took = await takeAvailableInventory(
          transaction,
          item.productId,
          item.quantity,
          item.size
        );
        if (!took) oversold = true;
      }
      return created;
    });
  } catch (error) {
    /**
     * A retried webhook after a successful create hits the unique session id.
     * Honour the existing row instead of 500-looping Stripe.
     */
    const existing = await db.order.findUnique({
      where: { stripeSessionId: session.id },
      select: { id: true, invoiceNumber: true }
    });
    if (existing) {
      await sendOrderEmails(existing.id);
      return;
    }
    throw error;
  }

  if (oversold) {
    await notifyOversell(
      order.invoiceNumber,
      lineItems.map((item) => sizedName(item.name, item.size)).join(', ')
    );
  }

  try {
    await subscribeFromCheckout(session);
  } catch (error) {
    console.error(`Newsletter opt-in failed for order ${order.invoiceNumber}`, error);
  }

  await sendOrderEmails(order.id);
}

async function sendOrderEmails(orderId: string) {
  const result = await sendOrderConfirmationEmail(orderId);
  /**
   * `not-confirmable` belongs beside these two rather than in the throw below.
   * It means the order has moved past the point a confirmation is sent — Tammy
   * marked it shipped, or it was refunded — which a redelivered
   * `checkout.session.completed` can easily arrive after when the first send
   * never happened (SendGrid unconfigured, say, so `confirmationEmailSentAt` is
   * still null and the guard above does not catch it). Throwing answered Stripe
   * with a 500 and had it redeliver a fulfilled order for days.
   */
  if (
    result.reason === 'already-sent' ||
    result.reason === 'missing' ||
    result.reason === 'not-confirmable'
  ) {
    return;
  }
  if (!result.sent && result.reason !== 'not-configured' && result.reason !== 'no-email') {
    throw new Error(
      `Order ${result.invoiceNumber || orderId} confirmation email not sent: ${result.reason}`
    );
  }
  if (result.reason === 'not-configured') return;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      invoiceNumber: true,
      customerName: true,
      totalCents: true,
      giftMessage: true,
      fulfillmentMethod: true,
      shippingMethod: true
    }
  });
  if (!order) return;
  const pickup = isPickupOrder(order);

  /**
   * Both the shop inbox and Tammy's own address when she has set one, so a
   * paid order reaches her wherever she is. This used to read BUSINESS_EMAIL
   * straight from the environment and send nothing at all when it was unset;
   * the helper always yields at least the shop's published address, because
   * silently dropping the notice for a paid order is the worse failure.
   */
  const ownerEmails = ownerNotificationEmails();
  if (ownerEmails.length) {
    const giftNote = order.giftMessage
      ? `<p><strong>Gift message</strong><br>${escapeHtml(order.giftMessage).replaceAll('\n', '<br>')}</p>`
      : '';
    const pickupNote = pickup
      ? '<p><strong>Local pickup</strong> — email the customer when this is ready. Do not print a shipping label unless they change their mind.</p>'
      : '<p>Open the owner dashboard to review, print the packing slip and create the shipping label.</p>';
    const delivery = await sendEmail({
      to: ownerEmails,
      kind: 'ORDER_ADMIN',
      subject: `${pickup ? 'Pickup order' : 'New order'} ${order.invoiceNumber} • ${formatMoney(order.totalCents)}`,
      html: emailShell(
        `New order ${order.invoiceNumber}`,
        `<p><strong>${escapeHtml(order.customerName)}</strong> placed a paid order for ${formatMoney(order.totalCents)}.</p>${pickupNote}${giftNote}`
      ),
      idempotencyKey: `new-order-admin/${orderId}`
    });
    if (!delivery.sent) {
      console.error(`Admin new-order email failed for ${order.invoiceNumber}: ${delivery.reason}`);
    }
  }
}

async function fulfillClassRegistration(session: Stripe.Checkout.Session) {
  const classEventId = session.metadata?.classEventId || '';
  const event = await db.classEvent.findUnique({ where: { id: classEventId } });
  if (!event)
    throw new Error(`Class ${classEventId} was not found for Stripe session ${session.id}`);

  const seats = Math.max(1, Math.min(6, Number(session.metadata?.seats) || 1));
  const name = session.customer_details?.name || 'Class guest';
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();

  const existing = await findHoldBySessionOrHoldId(session.id, session.metadata?.holdId);
  if (existing?.status === 'PAID' && existing.confirmationEmailSentAt) return;

  const needsCredential = isOnlineClass(event.format) && !existing?.confirmationEmailSentAt;
  const credential = needsCredential ? createClassJoinCredential() : null;

  const result = existing
    ? await updatePaidRegistration({ existing, session, name, email, seats, credential })
    : {
        registration: await createRegistrationForSweptHold({
          event,
          session,
          name,
          email,
          seats,
          credential
        }),
        sendEmail: true,
        accessToken: credential?.token ?? null
      };

  try {
    await subscribeFromCheckout(session);
  } catch (error) {
    console.error(
      `Newsletter opt-in failed for class registration ${result.registration.id}`,
      error
    );
  }

  if (!result.sendEmail) return;

  await sendClassRegistrationEmails({
    event,
    registration: result.registration,
    accessToken: result.accessToken
  });
}

async function updatePaidRegistration({
  existing,
  session,
  name,
  email,
  seats,
  credential
}: {
  existing: { id: string; joinTokenHash: string | null };
  session: Stripe.Checkout.Session;
  name: string;
  email: string;
  seats: number;
  credential: { hash: string; token: string } | null;
}) {
  const updated = await db.classRegistration.updateMany({
    where: {
      id: existing.id,
      confirmationEmailSentAt: null,
      joinTokenHash: existing.joinTokenHash
    },
    data: {
      status: 'PAID',
      holdExpiresAt: null,
      stripeSessionId: session.id,
      paymentIntentId: objectId(session.payment_intent),
      name,
      email,
      phone: session.customer_details?.phone || null,
      seats,
      amountCents: session.amount_total || undefined,
      joinTokenHash: credential?.hash || existing.joinTokenHash
    }
  });

  if (updated.count === 0) {
    const winner = await db.classRegistration.findUnique({ where: { id: existing.id } });
    if (!winner)
      throw new Error(`Class registration ${existing.id} disappeared during fulfillment.`);
    return { registration: winner, sendEmail: false, accessToken: null };
  }

  const saved = await db.classRegistration.findUnique({ where: { id: existing.id } });
  if (!saved) throw new Error(`Class registration ${existing.id} disappeared during fulfillment.`);
  return { registration: saved, sendEmail: true, accessToken: credential?.token ?? null };
}

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
  const overbooked = seats > seatsLeft;
  if (overbooked) {
    console.error(
      `Overbooked "${event.title}" (${event.id}): honouring a paid registration for ${seats} ` +
        `seat(s) with only ${seatsLeft} remaining, because the seat hold had already expired ` +
        `when Stripe session ${session.id} settled. Contact the customer.`
    );
    const ownerEmails = ownerNotificationEmails();
    if (ownerEmails.length) {
      await sendEmail({
        to: ownerEmails,
        kind: 'CLASS_ADMIN',
        subject: `Overbooked class: ${event.title}`,
        html: emailShell(
          'A paid class registration overbooked a class',
          `<p><strong>${escapeHtml(name)}</strong> paid for ${seats} ${seats === 1 ? 'seat' : 'seats'} in <strong>${escapeHtml(event.title)}</strong> after the hold expired.</p><p>Only ${seatsLeft} ${seatsLeft === 1 ? 'seat was' : 'seats were'} left. Contact the customer.</p>`
        ),
        idempotencyKey: `class-overbook/${session.id}`
      });
    }
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

async function applyRefund(charge: Stripe.Charge) {
  const paymentIntentId = objectId(charge.payment_intent);
  if (!paymentIntentId) return;

  const fullyRefunded = charge.refunded || charge.amount_refunded >= charge.amount;

  await db.classRegistration.updateMany({
    where: { paymentIntentId },
    data: { status: fullyRefunded ? 'REFUNDED' : undefined }
  });

  const order = await db.order.findFirst({
    where: { paymentIntentId },
    include: { items: true }
  });
  if (!order) return;

  const status = refundedOrderStatus({ fullyRefunded });

  await db.$transaction(async (transaction) => {
    const current = await transaction.order.findUnique({
      where: { id: order.id },
      select: { fulfilledAt: true }
    });
    if (!current) return;

    const applied = await transaction.order.updateMany({
      where: { id: order.id, refundedCents: { lte: charge.amount_refunded } },
      data: { status, refundedCents: charge.amount_refunded }
    });
    if (applied.count === 0) return;

    if (
      !shouldRestoreInventoryOnRefund({
        fullyRefunded,
        alreadyFulfilled: Boolean(current.fulfilledAt)
      })
    ) {
      return;
    }

    const claimed = await transaction.order.updateMany({
      where: { id: order.id, inventoryRestoredAt: null, fulfilledAt: null },
      data: { inventoryRestoredAt: new Date() }
    });
    if (claimed.count === 0) return;

    for (const item of order.items) {
      await transaction.product.update({
        where: { id: item.productId },
        data: { inventory: { increment: item.quantity } }
      });
      // Back onto the size that was refunded, not onto the product at large.
      await returnSizeStock(transaction, item.productId, item.size, item.quantity);
    }
  });
}

async function expireSession(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind === 'CLASS_REGISTRATION') {
    await releaseHold(session.id);
    if (session.metadata.holdId) await releaseHold(session.metadata.holdId);
    return;
  }

  const reservedId = session.metadata?.orderId?.trim();
  if (reservedId) {
    await releaseProductHold(reservedId);
    return;
  }

  const order = await db.order.findUnique({ where: { stripeSessionId: session.id } });
  if (order) await releaseProductHold(order.id);
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
  if (!secret || !webhookSecret)
    return new NextResponse('Stripe is not configured', { status: 503 });

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
    await releaseExpiredProductHolds();

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await fulfillSession(event.data.object as Stripe.Checkout.Session);
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      await expireSession(event.data.object as Stripe.Checkout.Session);
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
