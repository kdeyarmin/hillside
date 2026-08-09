import Link from 'next/link';
import { CalendarDays, Clock3, MapPin, Users } from 'lucide-react';
import ClassBookingButton from '@/components/ClassBookingButton';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Planter Classes',
  description: 'Join Tammy Hill for approachable, hands-on planter workshops from The Hillside Gardens.'
};

export default async function Classes() {
  const classes = await db.classEvent.findMany({
    where: { active: true, startsAt: { gte: new Date() } },
    include: { registrations: { where: { status: 'PAID' }, select: { seats: true } } },
    orderBy: { startsAt: 'asc' }
  });

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Hands-on with Tammy</div>
          <h1>Planter workshops.</h1>
          <p>
            Learn what works together, why it works, and how to care for your finished planter after
            you take it home.
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {classes.length > 0 ? (
            <div className="grid two">
              {classes.map((event) => {
                const reserved = event.registrations.reduce(
                  (total, registration) => total + registration.seats,
                  0
                );
                const seatsLeft = Math.max(0, event.capacity - reserved);
                const registrationClosed =
                  Boolean(event.registrationDeadline && event.registrationDeadline <= new Date());

                return (
                  <article className="card class-card" id={`class-${event.id}`} key={event.id}>
                    {event.imageUrl && <img className="photo" src={event.imageUrl} alt={event.title} />}
                    <div className="cardbody">
                      <span className="pill">In-person workshop</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="class-meta">
                        <span><CalendarDays size={15} /> <b>{event.startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</b></span>
                        <span><Clock3 size={15} /> {event.startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} • About {event.durationMinutes} minutes</span>
                        <span><MapPin size={15} /> {event.location}</span>
                        <span><Users size={15} /> {seatsLeft} of {event.capacity} seats remaining</span>
                      </div>
                      {event.whatToBring && <p><b>What to bring:</b> {event.whatToBring}</p>}
                      <p className="price">{formatMoney(event.priceCents)} per person</p>

                      {seatsLeft <= 0 ? (
                        <span className="status-badge CANCELLED">Sold out</span>
                      ) : registrationClosed ? (
                        <span className="status-badge CANCELLED">Registration closed</span>
                      ) : event.priceCents > 0 ? (
                        <ClassBookingButton classId={event.id} seatsLeft={seatsLeft} />
                      ) : (
                        <a
                          className="btn"
                          href={`mailto:hello@thehillsidegardens.com?subject=${encodeURIComponent(`Class registration: ${event.title}`)}`}
                        >
                          Request a seat
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="split">
              <img
                className="portrait"
                src="https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1100&q=85"
                alt="Plants ready for a workshop"
              />
              <div>
                <span className="pill">In person</span>
                <h2 className="display-title" style={{ fontSize: 48, color: 'var(--forest)' }}>
                  Build a beautiful planter.
                </h2>
                <p>
                  Tammy walks the group through choosing a container, combining plants with compatible
                  needs, arranging for balance and texture, potting correctly and caring for the finished
                  piece.
                </p>
                <p>New dates are being planned now.</p>
                <a className="btn" href="mailto:hello@thehillsidegardens.com?subject=Planter%20Class%20Interest">
                  Ask about the next class
                </a>
              </div>
            </div>
          )}

          <div className="newsletter" style={{ marginTop: 56 }}>
            <div>
              <div className="eyebrow">Private groups</div>
              <h3>Plan a class for friends, a garden club or a special gathering.</h3>
            </div>
            <Link className="btn gold" href="/contact">Ask Tammy about a private class</Link>
          </div>
        </div>
      </section>
    </>
  );
}
