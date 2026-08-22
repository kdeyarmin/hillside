import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/request-body';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  slug: z.string().trim().min(1).max(140),
  email: z.string().trim().email().max(254)
});

export async function POST(request: Request) {
  if (rateLimited(request, { name: 'stock-alerts', limit: 10, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const product = await db.product.findFirst({ where: { slug: parsed.data.slug } });
    if (!product) {
      return NextResponse.json({ error: 'That product was not found.' }, { status: 404 });
    }
    if (!product.active) {
      return NextResponse.json(
        { error: 'That piece isn’t on the bench. Ask us about something similar.' },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    await db.stockAlert.upsert({
      where: { productId_email: { productId: product.id, email } },
      update: { notifiedAt: null },
      create: { productId: product.id, email }
    });

    return NextResponse.json({
      message: `You're on the list — we'll email you when ${product.name} is back.`
    });
  } catch (error) {
    console.error('Unable to record stock alert', error);
    return NextResponse.json(
      { error: 'We could not add you to the list right now.' },
      { status: 500 }
    );
  }
}
