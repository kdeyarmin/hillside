import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 });
    }
    const data = body as { invoiceNumber?: unknown; email?: unknown };
    const invoiceNumber = String(data.invoiceNumber || '').trim().toUpperCase().replaceAll(' ', '');
    const email = String(data.email || '').trim().toLowerCase();
    if (!invoiceNumber || !email) {
      return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { invoiceNumber },
      include: { items: { select: { name: true, quantity: true, unitCents: true } } }
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
      trackingCarrier: order.trackingCarrier,
      trackingNumber: order.trackingNumber,
      items: order.items
    });
  } catch (error) {
    console.error('Order lookup failed', error);
    return NextResponse.json({ error: 'Unable to check that order right now.' }, { status: 500 });
  }
}
