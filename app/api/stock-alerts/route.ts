import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/request-body';
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

    let joined = false;
    if (parsed.data.joinNewsletter) {
      /**
       * Add-only, and in one statement.
       *
       * An address already on the list keeps the source it arrived with, and —
       * more importantly — someone who has since unsubscribed is not silently
       * resubscribed by ticking a box on a different form. Reading first and
       * then creating expressed that, but left a gap: two requests for the
       * same address (a double-tapped button, a retry) could both find nothing
       * and both insert, and the loser hit the unique constraint on `email`.
       * That threw, and the throw was caught by the handler below — so the
       * customer was told their restock request had failed when it had in fact
       * already been saved.
       *
       * `createMany` with `skipDuplicates` is a single `on conflict do
       * nothing`: no gap to lose, and `count` still says whether this request
       * is the one that added them.
       */
      const created = await db.newsletterSubscriber.createMany({
        data: [{ email, source: 'back-in-stock', sourceDetail: `/shop/${product.slug}` }],
        skipDuplicates: true
      });
      joined = created.count > 0;
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
