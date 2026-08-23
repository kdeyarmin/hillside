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

export type ReviewRequestResult = {
  sent: number;
  failed: number;
  /** Orders another run had already claimed between the read and the send. */
  skipped: number;
  considered: number;
};

/**
 * Sends the follow-up to every order that is due.
 *
 * Each order is **claimed before its email goes out**, never after. The claim
 * is an `updateMany` that also requires `reviewRequestSentAt` to still be null,
 * so it stamps only a row nobody has stamped yet and `count` says whether this
 * run won it. That is what makes "asked once, ever" true rather than merely
 * likely, and it closes two ways the same customer could be written to twice:
 *
 * - a crash, a lost connection or a throw in the gap between the send and the
 *   stamp, which would leave the order looking due with the mail already gone;
 * - two runs overlapping — Tammy pressing the dashboard button while the
 *   scheduled job is working through the same batch.
 *
 * The cost is the opposite failure: a crash between the claim and the send
 * loses that one invitation. That is the right way round. An invitation nobody
 * receives is a review we never get; a second one is a shop that nags.
 *
 * A send that *fails* keeps its stamp for the same reason it always did — a
 * retry loop on a mail failure is how a customer ends up with four copies of
 * the same note. The failure is on the owner's sent-mail page like any other,
 * and she can write to that customer herself.
 */
export async function sendDueReviewRequests(
  options: { now?: Date; limit?: number } = {}
): Promise<ReviewRequestResult> {
  const now = options.now || new Date();
  const orders = await ordersAwaitingReviewRequest(now, options.limit ?? REVIEW_REQUEST_BATCH);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const order of orders) {
    const claimed = await db.order.updateMany({
      where: { id: order.id, reviewRequestSentAt: null },
      data: { reviewRequestSentAt: new Date() }
    });
    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    const delivery = await sendEmail({
      to: order.email,
      kind: 'REVIEW',
      subject: reviewRequestSubject(order),
      html: reviewRequestHtml(order),
      idempotencyKey: `review-request/${order.id}`
    });
    if (delivery.sent) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skipped, considered: orders.length };
}
