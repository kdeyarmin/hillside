import Link from 'next/link';
import { CalendarDays, Clock3, MailCheck, MapPin, Users, Video } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import ClassBookingButton from '@/components/ClassBookingButton';
import FreeClassRegistrationForm from '@/components/FreeClassRegistrationForm';
import {
  classFormatLabel,
  classLocationLabel,
  isOnlineClass
} from '@/lib/class-access';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Plant & Planter Classes',
  description:
    'Join Tammy Hill for approachable planter workshops in person or online through Telnyx Video.'
};

export default async function Classes({
  searchParams
}: {
  searchParams: Promise<{ access?: string }>;
}) {
  const { access } = await searchParams;
  const classes = await db.classEvent.findMany({
    where: { active: true, startsAt: { gte: new Date() } },
    include: { registrations: { where: { status: 'PAID' }, select: { seats: true } } },
    orderBy: { startsAt: 'asc' }
  });

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Learn with Tammy</div>
          <h1>Plant and planter classes.</h1>
          <p>
            Join Tammy in person or from home through a secure Telnyx Video classroom. Learn what
            works together, why it works and how to keep your plants thriving.
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {access === 'invalid' && (
            <div className="class-access-alert error" role="alert">
              That private classroom link is not valid. Use the most recent confirmation email or
              contact Tammy for a new link.
            </div>
          )}
          {access === 'expired' && (
            <div className="class-access-alert" role="alert">
              That online classroom has closed. Contact Tammy if you need class follow-up.
            </div>
          )}

          {classes.length > 0 ? (
            <div className="grid two class-list-grid">
              {classes.map((event) => {
                const reserved = event.registrations.reduce(
                  (total, registration) => total + registration.seats,
                  0
                );
                const seatsLeft = Math.max(0, event.capacity - reserved);
                const registrationClosed =
                  Boolean(event.registrationDeadline && event.registrationDeadline <= new Date());
                const online = isOnlineClass(event.format);

                return (
                  <article className="card class-card" id={`class-${event.id}`} key={event.id}>
                    <BrandMockupScene
                      variant="class"
                      backgroundSrc={event.imageUrl || undefined}
                      alt={`${event.title} workshop image with The Hillside Gardens class materials`}
                    />
                    <div className="cardbody">
                      <span className="pill">{classFormatLabel(event.format)}</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="class-meta">
                        <span>
                          <CalendarDays size={15} />{' '}
                          <b>
                            {event.startsAt.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </b>
                        </span>
                        <span>
                          <Clock3 size={15} />{' '}
                          {event.startsAt.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit'
                          })}{' '}
                          • About {event.durationMinutes} minutes
                        </span>
                        <span>
                          {online ? <Video size={15} /> : <MapPin size={15} />}{' '}
                          {classLocationLabel(event)}
                        </span>
                        <span><Users size={15} /> {seatsLeft} of {event.capacity} seats remaining</span>
                      </div>

                      {online && (
                        <div className="online-class-note">
                          <MailCheck size={19} />
                          <div>
                            <b>Your private classroom link is emailed after registration.</b>
                            <span>
                              The secure Hillside link opens the Telnyx Video classroom; no Telnyx
                              account is required for attendees.
                            </span>
                          </div>
                        </div>
                      )}
                      {event.onlineInstructions && online && (
                        <p><b>Online class notes:</b> {event.onlineInstructions}</p>
                      )}
                      {event.telnyxRecordingEnabled && online && (
                        <p className="class-recording-note">
                          <b>Recording notice:</b> Audio and video may be recorded during this class.
                        </p>
                      )}
                      {event.whatToBring && <p><b>What to bring / what is included:</b> {event.whatToBring}</p>}
                      <p className="price">
                        {event.priceCents > 0 ? `${formatMoney(event.priceCents)} per person` : 'Free registration'}
                      </p>

                      {seatsLeft <= 0 ? (
                        <span className="status-badge CANCELLED">Sold out</span>
                      ) : registrationClosed ? (
                        <span className="status-badge CANCELLED">Registration closed</span>
                      ) : event.priceCents > 0 ? (
                        <ClassBookingButton
                          classId={event.id}
                          seatsLeft={seatsLeft}
                          online={online}
                        />
                      ) : (
                        <FreeClassRegistrationForm
                          classId={event.id}
                          seatsLeft={seatsLeft}
                          online={online}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="split">
              <BrandMockupScene variant="class" className="portrait about-brand-scene" />
              <div>
                <span className="pill">In person and online</span>
                <h2 className="display-title" style={{ fontSize: 48, color: 'var(--forest)' }}>
                  Learn to grow with confidence.
                </h2>
                <p>
                  Tammy offers hands-on planter workshops and online classes through Telnyx Video.
                  New dates are being planned now.
                </p>
                <a className="btn" href="mailto:hello@thehillsidegardens.com?subject=Class%20Interest">
                  Ask about the next class
                </a>
              </div>
            </div>
          )}

          <div className="newsletter" style={{ marginTop: 56 }}>
            <div>
              <div className="eyebrow">Private groups</div>
              <h3>Plan an in-person or online class for your group.</h3>
            </div>
            <Link className="btn gold" href="/contact">Ask Tammy about a private class</Link>
          </div>
        </div>
      </section>
    </>
  );
}
