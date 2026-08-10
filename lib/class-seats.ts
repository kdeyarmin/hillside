import { db } from '@/lib/db';

/** How long a checkout session may hold a seat before the seat returns to the pool. */
const HOLD_MINUTES = 35;

export function holdExpiry(now = new Date()) {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
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
