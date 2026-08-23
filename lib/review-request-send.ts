import { OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  isReviewRequestDue,
  REVIEW_REQUEST_BATCH,
  reviewRequestDueBefore,
  reviewRequestHtml,
  reviewRequestSubject,
  reviewRequestTooOldBefore
} from '@/lib/review-request';

const candidateInclude = {
  items: {
    select: {
      name: true,
      size: true,
      productId: true,
      product: { select: { slug: true, name: true } }
    }
  }
} as const;

/**
 * Orders that are ready to be asked for a review: fulfilled long enough ago to
 * have arrived, recent enough to remember, and never asked before.
 *
 * The window is applied in SQL as well as in `isReviewRequestDue` — the query
 * so a shop with years of history does not read all of it, the predicate so
 * the rule lives in one tested place and the two cannot drift into disagreeing.
 */
export async function ordersAwaitingReviewRequest(now = new Date(), take = REVIEW_REQUEST_BATCH) {
  const orders = await db.order.findMany({
    where: {
      status: OrderStatus.FULFILLED,
      reviewRequestSentAt: null,
      fulfilledAt: { lte: reviewRequestDueBefore(now), gte: reviewRequestTooOldBefore(now) },
      email: { not: '' },
      items: { some: {} }
    },
    orderBy: { fulfilledAt: 'asc' },
    take,
    include: candidateInclude
  });
  return orders.filter((order) => isReviewRequestDue(order, now));
}

export async function countOrdersAwaitingReviewRequest(now = new Date()) {
  return db.order.count({
    where: {
      status: OrderStatus.FULFILLED,
      reviewRequestSentAt: null,
      fulfilledAt: { lte: reviewRequestDueBefore(now), gte: reviewRequestTooOldBefore(now) },
      email: { not: '' },
      /* Kept in step with `isReviewRequestDue`, which also refuses an order
         with nothing in it — otherwise the dashboard would offer to send a
         batch that the send then finds nothing in. */
      items: { some: {} }
    }
  });
}

export type ReviewRequestResult = { sent: number; failed: number; considered: number };

/**
 * Sends the follow-up to every order that is due, and stamps each one before
 * moving on.
 *
 * The stamp is written whether or not the send succeeded, and that is the
 * deliberate choice: a retry loop on a mail failure is how a customer ends up
 * with four copies of the same "how did it settle in?" note. A failure is
 * visible on the owner's sent-mail page like any other, and she can write to
 * that customer herself.
 */
export async function sendDueReviewRequests(
  options: { now?: Date; limit?: number } = {}
): Promise<ReviewRequestResult> {
  const now = options.now || new Date();
  const orders = await ordersAwaitingReviewRequest(now, options.limit ?? REVIEW_REQUEST_BATCH);
  let sent = 0;
  let failed = 0;

  for (const order of orders) {
    const delivery = await sendEmail({
      to: order.email,
      kind: 'REVIEW',
      subject: reviewRequestSubject(order),
      html: reviewRequestHtml(order),
      idempotencyKey: `review-request/${order.id}`
    });
    await db.order.update({
      where: { id: order.id },
      data: { reviewRequestSentAt: new Date() }
    });
    if (delivery.sent) sent += 1;
    else failed += 1;
  }

  return { sent, failed, considered: orders.length };
}
