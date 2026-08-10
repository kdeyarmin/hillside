import Link from 'next/link';
import { cookies } from 'next/headers';
import { CalendarDays, Clock3, LockKeyhole, Video } from 'lucide-react';
import TelnyxClassroom from '@/components/TelnyxClassroom';
import {
  classAccessCookieName,
  classJoinWindow,
  classLocationLabel,
  isOnlineClass,
  verifyClassAccessCookie
} from '@/lib/class-access';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Online Classroom', robots: { index: false, follow: false } };

export default async function OnlineClassStudio({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await db.classEvent.findUnique({ where: { id } });
  if (!event || !event.active || !isOnlineClass(event.format)) {
    return (
      <section className="content">
        <div className="narrow classroom-access-card">
          <Video size={36} />
          <h1>Online classroom not found.</h1>
          <p>This class may have ended or been unpublished.</p>
          <Link className="btn" href="/classes">View available classes</Link>
        </div>
      </section>
    );
  }

  const jar = await cookies();
  const access = verifyClassAccessCookie(
    jar.get(classAccessCookieName(event.id))?.value,
    event.id
  );
  const registration = access
    ? await db.classRegistration.findFirst({
        where: {
          id: access.registrationId,
          classEventId: event.id,
          joinTokenHash: access.tokenHash,
          status: 'PAID'
        }
      })
    : null;

  if (!registration) {
    return (
      <section className="content">
        <div className="narrow classroom-access-card">
          <LockKeyhole size={36} />
          <h1>Use your private class link.</h1>
          <p>
            For privacy, this classroom opens only through the secure link in your most recent
            registration confirmation email.
          </p>
          <Link className="btn" href="/classes">Return to classes</Link>
        </div>
      </section>
    );
  }

  const { opensAt, closesAt } = classJoinWindow(event);
  const now = new Date();

  return (
    <section className="classroom-page">
      <div className="container">
        <div className="classroom-event-summary">
          <span className="pill">Online through Telnyx Video</span>
          <h2>{event.title}</h2>
          <div>
            <span><CalendarDays size={16} /> {event.startsAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</span>
            <span><Clock3 size={16} /> About {event.durationMinutes} minutes</span>
            <span><Video size={16} /> {classLocationLabel(event)}</span>
          </div>
          {event.onlineInstructions && <p><b>From us:</b> {event.onlineInstructions}</p>}
          {event.telnyxRecordingEnabled && (
            <p className="classroom-recording-disclosure">
              This class may be recorded. Joining the room acknowledges the recording notice.
            </p>
          )}
        </div>

        {now < opensAt ? (
          <div className="classroom-access-card">
            <Clock3 size={36} />
            <h1>Your classroom is ready, but not open yet.</h1>
            <p>
              The room opens {event.joinOpensMinutesBefore} minutes before class at{' '}
              <strong>{opensAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</strong>.
            </p>
            <p>You can leave this page open and refresh when the room opens.</p>
          </div>
        ) : now > closesAt ? (
          <div className="classroom-access-card">
            <Video size={36} />
            <h1>This online classroom has closed.</h1>
            <p>Contact us if you need follow-up information from the class.</p>
            <Link className="btn" href="/classes">Browse other classes</Link>
          </div>
        ) : (
          <TelnyxClassroom
            classId={event.id}
            title={event.title}
            participantName={registration.name}
            recording={event.telnyxRecordingEnabled}
          />
        )}
      </div>
    </section>
  );
}
