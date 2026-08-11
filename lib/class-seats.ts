import crypto from 'crypto';
import { Prisma } from '@prisma/client';
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


export type Reservation =
  | { ok: true; holdId: string; expiresAt: Date }
  | { ok: false; seatsLeft: number };

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
  | { ok: true; registrationId: string }
  | { ok: false; reason: 'duplicate' }
  | { ok: false; reason: 'sold-out'; seatsLeft: number };

/**
 * Claims seats on a free class in one atomic step.
 *
 * The free path used to read `seatsRemaining`, then create the registration in a
 * separate statement — the same read-then-write window `reserveSeats` was written
 * to close for paid classes, just never applied here. Concurrent submissions for
 * the last seats all passed the check and all committed. The duplicate-email
 * check had the same shape, so one person double-clicking got two registrations.
 *
 * Both checks now run inside the transaction that holds the advisory lock, which
 * is what makes them decisive. A `@@unique([classEventId, email])` constraint
 * would be the more obvious fix, but it would also reject a *paid* customer's
 * second, legitimate purchase for the same class — after their card was charged.
 * The lock gets the guarantee without that cost.
 */
export async function claimFreeSeat({
  classEventId,
  capacity,
  seats,
  name,
  email,
  phone,
  joinTokenHash
}: {
  classEventId: string;
  capacity: number;
  seats: number;
  name: string;
  email: string;
  phone: string | null;
  joinTokenHash: string | null;
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
    if (duplicate) return { ok: false, reason: 'duplicate' } as const;

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
        status: 'PAID',
        joinTokenHash
      }
    });

    return { ok: true, registrationId: created.id } as const;
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
  await db.classRegistration.deleteMany({ where: { stripeSessionId: holdId } });
}
