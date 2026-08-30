import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimited } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/request-body';

export const runtime = 'nodejs';

const schema = z.object({ id: z.string().trim().min(1).max(60) });

/**
 * "Was this helpful?" — the only signal behind the most-helpful ordering.
 *
 * A shop this size has no purchase history to rank reviews by, so the choice is
 * between a vote and no second ordering at all. The vote is deliberately cheap
 * and deliberately weak: one click, no account, no way to vote a review down,
 * and the browser remembers what it has already marked so the obvious
 * double-click does nothing. It is throttled per connection because the count
 * is public and someone will eventually try.
 */
export async function POST(request: Request) {
  if (await rateLimited(request, { name: 'review-helpful', limit: 20, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: 'Too many votes just now.' }, { status: 429 });
  }

  try {
    // Through `readJsonBody`, so a body that is not JSON is the 400 it is
    // rather than a 500 blamed on the shop.
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return NextResponse.json({ error: 'That review was not found.' }, { status: 400 });
    }

    /**
     * Only an approved review can be voted on. A pending one is not public, so
     * a vote against its id could only have come from someone guessing at ids.
     */
    const updated = await db.review.updateMany({
      where: { id: parsed.data.id, status: 'APPROVED' },
      data: { helpfulCount: { increment: 1 } }
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'That review was not found.' }, { status: 404 });
    }

    const review = await db.review.findUnique({
      where: { id: parsed.data.id },
      select: { helpfulCount: true }
    });
    return NextResponse.json({ helpfulCount: review?.helpfulCount ?? 0 });
  } catch (error) {
    console.error('Unable to record a helpful vote', error);
    return NextResponse.json({ error: 'We could not record that just now.' }, { status: 500 });
  }
}
