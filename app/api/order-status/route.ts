import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (rateLimited(request, { name: 'order-status', limit: 12, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many lookups. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 });
    }
    const data = body as { invoiceNumber?: unknown; email?: unknown };
    const invoiceNumber = String(data.invoiceNumber || '')
      .trim()
      .toUpperCase()
      .replaceAll(' ', '');
    const email = String(data.email || '')
      .trim()
      .toLowerCase();
    if (!invoiceNumber || !email) {
      return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { invoiceNumber },
      include: {
        items: {
          select: {
            name: true,
            size: true,
            quantity: true,
            unitCents: true,
            // A set is one line and one price, so the lookup has to be able to
            // say what was in the box.
            components: { select: { name: true, size: true, quantity: true } }
          }
        }
      }
    });
    if (!order || order.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: 'We could not find an order matching that number and email.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      invoiceNumber: order.invoiceNumber,
      status: order.status,
      createdAt: order.createdAt,
      fulfilledAt: order.fulfilledAt,
      totalCents: order.totalCents,
      refundedCents: order.refundedCents,
      trackingCarrier: order.trackingCarrier,
      trackingNumber: order.trackingNumber,
      fulfillmentMethod: order.fulfillmentMethod,
      shippingMethod: order.shippingMethod,
      giftMessage: order.giftMessage,
      pickupNote: order.pickupNote,
      items: order.items
    });
  } catch (error) {
    console.error('Order lookup failed', error);
    return NextResponse.json({ error: 'Unable to check that order right now.' }, { status: 500 });
  }
}
