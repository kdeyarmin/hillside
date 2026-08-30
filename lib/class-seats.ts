import crypto from 'crypto';
import { Prisma, type ClassRegistration } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * How long a checkout session may hold a seat before the seat returns to the pool.
 * Stripe requires a Checkout Session to expire between 30 minutes and 24 hours
 * out, so this must stay at or above 30.
 */
const HOLD_MINUTES = 35;

export function holdExpiry(now = new Date()) {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/** The same instant as a Unix timestamp, for Stripe's `expires_at`. */
export function holdExpiryUnix(expiresAt: Date) {
  return Math.floor(expiresAt.getTime() / 1000);
}

/**
 * Availability used to count only paid registrations, so nothing stood between
 * creating a Stripe session and the webhook arriving — two people could buy the
 * same last seat. Unpaid holds now occupy a seat until they expire, and expired
 * holds are swept before every count.
 */
export async function releaseExpiredHolds() {
  await db.classRegistration.deleteMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: new Date() } }
  });
}

export async function seatsTaken(classEventId: string) {
  await releaseExpiredHolds();
  const totals = await db.classRegistration.aggregate({
    where: {
      classEventId,
      OR: [{ status: 'PAID' }, { status: 'PENDING', holdExpiresAt: { gte: new Date() } }]
    },
    _sum: { seats: true }
  });
  return totals._sum.seats || 0;
}

export async function seatsRemaining(classEventId: string, capacity: number) {
  return Math.max(0, capacity - (await seatsTaken(classEventId)));
}

/**
 * Seat counts for several classes at once.
 *
 * The class list and the homepage both mapped `seatsRemaining` over their events,
 * and every call ran `releaseExpiredHolds()` first — a global `deleteMany`. So
 * rendering N classes issued 2N queries, N of them identical writes, on pages
 * that are hit by every visitor. The sweep is global, so N−1 of those deletes
 * could never have found anything left to delete.
 *
 * One sweep, then one grouped aggregate.
 */
export async function seatsRemainingFor(
  events: ReadonlyArray<{ id: string; capacity: number }>
): Promise<Map<string, number>> {
  const remaining = new Map<string, number>();
  if (!events.length) return remaining;

  await releaseExpiredHolds();

  const now = new Date();
  const grouped = await db.classRegistration.groupBy({
    by: ['classEventId'],
    where: {
      classEventId: { in: events.map((event) => event.id) },
      OR: [{ status: 'PAID' }, { status: 'PENDING', holdExpiresAt: { gte: now } }]
    },
    _sum: { seats: true }
  });

  const taken = new Map(grouped.map((row) => [row.classEventId, row._sum.seats || 0]));
  for (const event of events) {
    remaining.set(event.id, Math.max(0, event.capacity - (taken.get(event.id) || 0)));
  }
  return remaining;
}

export type Reservation =
  { ok: true; holdId: string; expiresAt: Date } | { ok: false; seatsLeft: number };

/**
 * Reserves seats atomically.
 *
 * Checking availability and then inserting the hold as two statements leaves a
 * window — widened by the Stripe API round trip that used to sit between them —
 * where two buyers both pass the check and the class oversells. A transaction
 * advisory lock keyed on the class serializes reservations for that class only,
 * so the count and the insert cannot interleave.
 */
export async function reserveSeats({
  classEventId,
  capacity,
  seats,
  amountCents
}: {
  classEventId: string;
  capacity: number;
  seats: number;
  amountCents: number;
}): Promise<Reservation> {
  const expiresAt = holdExpiry();
  const holdId = `hold_${crypto.randomUUID()}`;

  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(1, hashtext(${classEventId}))`
    );

    await transaction.classRegistration.deleteMany({
      where: { classEventId, status: 'PENDING', holdExpiresAt: { lt: new Date() } }
    });

    const totals = await transaction.classRegistration.aggregate({
      where: {
        classEventId,
        OR: [{ status: 'PAID' }, { status: 'PENDING', holdExpiresAt: { gte: new Date() } }]
      },
      _sum: { seats: true }
    });

    const seatsLeft = Math.max(0, capacity - (totals._sum.seats || 0));
    if (seats > seatsLeft) return { ok: false, seatsLeft } as const;

    await transaction.classRegistration.create({
      data: {
        classEventId,
        stripeSessionId: holdId,
        name: 'Reserved seat',
        email: '',
        seats,
        amountCents,
        status: 'PENDING',
        holdExpiresAt: expiresAt
      }
    });

    return { ok: true, holdId, expiresAt } as const;
  });
}

export type FreeSeatResult =
  | { ok: true; registration: ClassRegistration }
  | { ok: false; reason: 'duplicate'; pending?: ClassRegistration }
  | { ok: false; reason: 'sold-out'; seatsLeft: number };

/**
 * Holds seats on a free class until the guest confirms the email we send them.
 *
 * Marking the row PAID at submit time let anyone occupy a seat with an address
 * they did not control — a filled form was enough to empty a class. The seat is
 * now PENDING until they open the mailed link, and the hold expires if they
 * never do.
 *
 * Both the duplicate-email check and the capacity check still run inside the
 * transaction that holds the advisory lock.
 */
export async function claimFreeSeat({
  classEventId,
  capacity,
  seats,
  name,
  email,
  phone,
  holdExpiresAt
}: {
  classEventId: string;
  capacity: number;
  seats: number;
  name: string;
  email: string;
  phone: string | null;
  holdExpiresAt: Date;
}): Promise<FreeSeatResult> {
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(1, hashtext(${classEventId}))`
    );

    await transaction.classRegistration.deleteMany({
      where: { classEventId, status: 'PENDING', holdExpiresAt: { lt: new Date() } }
    });

    const duplicate = await transaction.classRegistration.findFirst({
      where: { classEventId, email, status: { in: ['PENDING', 'PAID'] } }
    });
    if (duplicate) {
      return {
        ok: false,
        reason: 'duplicate',
        ...(duplicate.status === 'PENDING' ? { pending: duplicate } : {})
      } as const;
    }

    const totals = await transaction.classRegistration.aggregate({
      where: {
        classEventId,
        OR: [{ status: 'PAID' }, { status: 'PENDING', holdExpiresAt: { gte: new Date() } }]
      },
      _sum: { seats: true }
    });

    const seatsLeft = Math.max(0, capacity - (totals._sum.seats || 0));
    if (seats > seatsLeft) return { ok: false, reason: 'sold-out', seatsLeft } as const;

    const created = await transaction.classRegistration.create({
      data: {
        classEventId,
        stripeSessionId: `free_${crypto.randomUUID()}`,
        name,
        email,
        phone,
        seats,
        amountCents: 0,
        status: 'PENDING',
        holdExpiresAt
      }
    });

    return { ok: true, registration: created } as const;
  });
}

/** Attaches the real Stripe session to a hold once checkout has been created. */
export async function attachSessionToHold(holdId: string, stripeSessionId: string) {
  await db.classRegistration.update({
    where: { stripeSessionId: holdId },
    data: { stripeSessionId }
  });
}

export async function releaseHold(holdId: string) {
  if (!holdId) return;
  await db.classRegistration.deleteMany({
    where: { stripeSessionId: holdId, status: 'PENDING' }
  });
}

export async function findHoldBySessionOrHoldId(sessionId: string, holdId?: string | null) {
  const bySession = await db.classRegistration.findUnique({
    where: { stripeSessionId: sessionId }
  });
  if (bySession) return bySession;
  if (!holdId || holdId === sessionId) return null;
  return db.classRegistration.findUnique({ where: { stripeSessionId: holdId } });
}
