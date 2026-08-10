import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClassJoinCredential, isOnlineClass } from '@/lib/class-access';
import { sendClassRegistrationEmails } from '@/lib/class-registration-email';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { formatMoney } from '@/lib/store';

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
  if (existing) return;

  const requested = parseRequestedItems(session.metadata?.items);
  const products = await db.product.findMany({ where: { slug: { in: requested.map((item) => item.id) } } });
  const lineItems = requested.flatMap((item) => {
    const product = products.find((candidate) => candidate.slug === item.id);
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
  const totalCents = session.amount_total || subtotalCents;
  const shippingCents =
    session.shipping_cost?.amount_total ?? Math.max(0, totalCents - subtotalCents - taxCents);
  const invoiceNumber = session.metadata?.invoiceNumber || session.client_reference_id || `HG-${Date.now()}`;

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

  await subscribeFromCheckout(session);

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
    await sendEmail({
      to: order.email,
      subject: `We received your Hillside order ${order.invoiceNumber}`,
      html: customerHtml,
      idempotencyKey: `order-confirmation/${order.id}`
    });
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

  const existing = await db.classRegistration.findUnique({ where: { stripeSessionId: session.id } });
  if (existing) {
    if (existing.confirmationEmailSentAt) return;
    const credential = isOnlineClass(event.format) ? createClassJoinCredential() : null;
    const registration = credential
      ? await db.classRegistration.update({
          where: { id: existing.id },
          data: { joinTokenHash: credential.hash }
        })
      : existing;
    await sendClassRegistrationEmails({ event, registration, accessToken: credential?.token });
    return;
  }

  const seats = Math.max(1, Math.min(6, Number(session.metadata?.seats) || 1));
  const name = session.customer_details?.name || 'Class guest';
  const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
  const credential = isOnlineClass(event.format) ? createClassJoinCredential() : null;
  const registration = await db.classRegistration.create({
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

  await subscribeFromCheckout(session);
  await sendClassRegistrationEmails({
    event,
    registration,
    accessToken: credential?.token
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
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = objectId(charge.payment_intent);
      if (paymentIntentId) {
        await Promise.all([
          db.order.updateMany({ where: { paymentIntentId }, data: { status: 'REFUNDED' } }),
          db.classRegistration.updateMany({
            where: { paymentIntentId },
            data: { status: 'REFUNDED' }
          })
        ]);
      }
    }
  } catch (error) {
    console.error('Stripe fulfillment failed', error);
    return new NextResponse('Fulfillment failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
