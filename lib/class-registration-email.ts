import type { ClassEvent, ClassRegistration } from '@prisma/client';
import { db } from '@/lib/db';
import { classFormatLabel, classLocationLabel, isOnlineClass } from '@/lib/class-access';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import { absoluteUrl, formatMoney } from '@/lib/store';

type RegistrationEmailEvent = Pick<
  ClassEvent,
  | 'id'
  | 'title'
  | 'description'
  | 'startsAt'
  | 'location'
  | 'format'
  | 'durationMinutes'
  | 'whatToBring'
  | 'onlineInstructions'
  | 'telnyxRecordingEnabled'
>;

type RegistrationEmailRegistration = Pick<
  ClassRegistration,
  'id' | 'name' | 'email' | 'phone' | 'seats' | 'amountCents' | 'joinTokenHash'
>;

export async function sendFreeClassConfirmEmail({
  event,
  registration,
  confirmUrl,
  resend = false
}: {
  event: Pick<ClassEvent, 'title' | 'startsAt' | 'format' | 'location' | 'durationMinutes'>;
  registration: Pick<ClassRegistration, 'id' | 'name' | 'email' | 'seats'>;
  confirmUrl: string;
  resend?: boolean;
}) {
  if (!registration.email) return { sent: false as const, reason: 'missing-email' as const };

  const date = event.startsAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return sendEmail({
    to: registration.email,
    subject: `Confirm your seat for ${event.title}`,
    html: emailShell(
      'Confirm your class seat',
      `<p>Hi ${escapeHtml(registration.name)},</p><p>Please confirm your ${registration.seats} ${registration.seats === 1 ? 'seat' : 'seats'} for <strong>${escapeHtml(event.title)}</strong> on ${escapeHtml(date)}.</p><p>This holds the seat until you confirm. If you did not request this, you can ignore the email and the hold will lapse.</p><p style="margin:24px 0"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:13px 20px;border-radius:6px;background:#203f2b;color:#ffffff;text-decoration:none;font-weight:700">Confirm my seat</a></p>`
    ),
    idempotencyKey: resend
      ? `class-confirm/${registration.id}/resend/${Date.now()}`
      : `class-confirm/${registration.id}`
  });
}

export async function sendClassRegistrationEmails({
  event,
  registration,
  accessToken,
  resend = false
}: {
  event: RegistrationEmailEvent;
  registration: RegistrationEmailRegistration;
  accessToken?: string | null;
  resend?: boolean;
}) {
  const online = isOnlineClass(event.format);
  const accessUrl = online && accessToken ? absoluteUrl(`/classes/access/${accessToken}`) : null;
  const date = event.startsAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  });
  const format = classFormatLabel(event.format);
  const location = classLocationLabel(event);
  const joinBlock = accessUrl
    ? `<div style="margin:24px 0;padding:20px;border-radius:14px;background:#edf1e9"><p style="margin-top:0"><strong>Your private online classroom link</strong></p><p>Use this secure link when it is time for class. It will open the Hillside classroom and request camera and microphone access.</p><p style="margin-bottom:0"><a href="${escapeHtml(accessUrl)}" style="display:inline-block;padding:13px 20px;border-radius:6px;background:#203f2b;color:#ffffff;text-decoration:none;font-weight:700">Open my online classroom</a></p></div>`
    : '';
  const onlineNotes =
    online && event.onlineInstructions
      ? `<p><strong>Online class notes:</strong> ${escapeHtml(event.onlineInstructions)}</p>`
      : '';
  const recordingNotice =
    online && event.telnyxRecordingEnabled
      ? '<p><strong>Recording notice:</strong> We have enabled recording for this class. By joining, participants acknowledge that audio and video may be recorded.</p>'
      : '';
  const bring = event.whatToBring
    ? `<p><strong>What to bring / what is included:</strong> ${escapeHtml(event.whatToBring)}</p>`
    : '';

  const customerResult = registration.email
    ? await sendEmail({
        to: registration.email,
        subject: `You’re registered for ${event.title}`,
        html: emailShell(
          'Your class registration is confirmed',
          `<p>Hi ${escapeHtml(registration.name)},</p><p>Your registration for <strong>${escapeHtml(event.title)}</strong> is confirmed for ${registration.seats} ${registration.seats === 1 ? 'seat' : 'seats'}.</p><p><strong>Format:</strong> ${escapeHtml(format)}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Duration:</strong> About ${event.durationMinutes} minutes<br><strong>Location:</strong> ${escapeHtml(location)}<br><strong>Amount paid:</strong> ${formatMoney(registration.amountCents)}</p>${joinBlock}${onlineNotes}${recordingNotice}${bring}<p>Please keep this email. The online classroom link is private and should not be forwarded.</p><p>We look forward to planting with you.</p>`
        ),
        idempotencyKey: resend
          ? `class-confirmation/${registration.id}/resend/${Date.now()}`
          : `class-confirmation/${registration.id}/${registration.joinTokenHash?.slice(0, 12) || 'in-person'}`
      })
    : { sent: false as const, reason: 'missing-email' as const };

  if (customerResult.sent) {
    await db.classRegistration.update({
      where: { id: registration.id },
      data: { confirmationEmailSentAt: new Date() }
    });
  }

  const businessEmail = process.env.BUSINESS_EMAIL;
  if (businessEmail) {
    await sendEmail({
      to: businessEmail,
      subject: `New class registration • ${event.title}`,
      html: emailShell(
        'New class registration',
        `<p><strong>${escapeHtml(registration.name)}</strong> registered ${registration.seats} ${registration.seats === 1 ? 'seat' : 'seats'} for <strong>${escapeHtml(event.title)}</strong>.</p><p><strong>Format:</strong> ${escapeHtml(format)}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Email:</strong> ${escapeHtml(registration.email)}${registration.phone ? `<br><strong>Phone:</strong> ${escapeHtml(registration.phone)}` : ''}<br><strong>Paid:</strong> ${formatMoney(registration.amountCents)}</p>`
      ),
      idempotencyKey: `class-registration-admin/${registration.id}`
    });
  }

  return customerResult;
}
