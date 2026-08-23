import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  slug: z.string().trim().min(1).max(140),
  email: z.string().trim().email().max(254),
  /**
   * The opt-in beside the restock field. Off unless the shopper ticked it —
   * a back-in-stock request is one specific thing they asked for, and quietly
   * turning it into a marketing subscription is how a shop loses the trust
   * that made them leave an address at all.
   */
  joinNewsletter: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  if (rateLimited(request, { name: 'stock-alerts', limit: 10, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 }
    );
  }

  try {
    const parsed = schema.safeParse(await request.json());
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

    let joined = false;
    if (parsed.data.joinNewsletter) {
      /**
       * `create` only. An address already on the list keeps the source it
       * arrived with, and — more importantly — someone who has since
       * unsubscribed is not silently resubscribed by ticking a box on a
       * different form.
       */
      const existing = await db.newsletterSubscriber.findUnique({
        where: { email },
        select: { id: true }
      });
      if (!existing) {
        await db.newsletterSubscriber.create({
          data: { email, source: 'back-in-stock', sourceDetail: `/shop/${product.slug}` }
        });
        joined = true;
      }
    }

    return NextResponse.json({
      message: joined
        ? `You're on the list — we'll email you when ${product.name} is back, and add you to The Hillside Notes.`
        : `You're on the list — we'll email you when ${product.name} is back.`
    });
  } catch (error) {
    console.error('Unable to record stock alert', error);
    return NextResponse.json(
      { error: 'We could not add you to the list right now.' },
      { status: 500 }
    );
  }
}
