import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mail, Users, Video } from 'lucide-react';
import TelnyxClassroom from '@/components/TelnyxClassroom';
import { isAdmin } from '@/lib/admin';
import { classFormatLabel, isOnlineClass } from '@/lib/class-access';
import { db } from '@/lib/db';
import { resendClassConfirmation } from '../../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Class Host Studio', robots: { index: false, follow: false } };

export default async function HostClassStudio({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const event = await db.classEvent.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { status: 'PAID' },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!event || !isOnlineClass(event.format)) {
    return (
      <section className="content">
        <div className="narrow classroom-access-card">
          <Video size={36} />
          <h1>Online class not found.</h1>
          <Link className="btn" href="/admin/content">Return to class management</Link>
        </div>
      </section>
    );
  }

  const seats = event.registrations.reduce((total, registration) => total + registration.seats, 0);

  return (
    <section className="classroom-page host-studio-page">
      <div className="container">
        <div className="classroom-event-summary">
          <div className="toolbar">
            <div>
              <span className="pill">Your private host studio</span>
              <h2>{event.title}</h2>
            </div>
            <Link className="btn outline small" href="/admin/content#classes">Manage class</Link>
          </div>
          <div>
            <span><Video size={16} /> {classFormatLabel(event.format)}</span>
            <span><Users size={16} /> {seats} registered seats</span>
            <span>{event.startsAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</span>
          </div>
          <p>
            You can open this host studio before class to test Telnyx, your camera and your microphone.
            Customers can enter only during the configured join window using their emailed private link.
          </p>
        </div>

        <TelnyxClassroom
          classId={event.id}
          title={event.title}
          participantName={process.env.CLASS_HOST_NAME || 'Tammy Hill'}
          host
          recording={event.telnyxRecordingEnabled}
        />

        <div className="admin-card classroom-roster">
          <h2>Registered guests</h2>
          <p className="muted">Resending creates a new private classroom link and invalidates the previous emailed link.</p>
          {event.registrations.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Seats</th><th>Confirmation</th><th>Last joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {event.registrations.map((registration) => (
                    <tr key={registration.id}>
                      <td>{registration.name}</td>
                      <td><a href={`mailto:${registration.email}`}>{registration.email}</a></td>
                      <td>{registration.seats}</td>
                      <td>{registration.confirmationEmailSentAt ? `Sent ${registration.confirmationEmailSentAt.toLocaleString()}` : 'Not sent'}</td>
                      <td>{registration.lastJoinedAt ? registration.lastJoinedAt.toLocaleString() : 'Not yet'}</td>
                      <td>
                        <form action={resendClassConfirmation}>
                          <input type="hidden" name="id" value={registration.id} />
                          <button className="btn outline small" type="submit"><Mail size={15} /> Resend link</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No registrations yet.</p>}
        </div>
      </div>
    </section>
  );
}
