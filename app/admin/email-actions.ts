'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { MessageStatus } from '@prisma/client';
import { currentAdmin } from '@/lib/admin';
import { adminEmailPath } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import { emailShell, escapeHtml, sendEmail } from '@/lib/email';
import {
  EMAIL_BODY_MAX,
  markOwnerText,
  ownerMessageHtml,
  parseRecipients,
  quotedMessageHtml
} from '@/lib/email-log';
import { rateLimitedByKey } from '@/lib/rate-limit';
import { businessEmail } from '@/lib/store';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();

/**
 * Answers with who is signed in, because the send ceiling below is theirs
 * rather than their network's.
 */
async function guard() {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin');
  return admin;
}

/**
 * An authenticated form that can send mail to any address is worth a ceiling of
 * its own. Tammy answering a morning's messages is nowhere near this; a session
 * someone else got hold of being used as a relay runs into it quickly.
 *
 * Keyed to the signed-in account, not to a header fingerprint. Keyed by address
 * this both shared one bucket between two admins on the same connection and
 * handed a stolen session a fresh bucket for every address it sent from — the
 * relay case is exactly the one the ceiling is for. `null` is the shared
 * ADMIN_PASSWORD session, which is one account and buckets as one.
 */
async function throttled(adminId: string | null) {
  return rateLimitedByKey(adminId || 'shared-owner-login', {
    name: 'admin-email',
    limit: 40,
    windowMs: 60 * 60_000
  });
}

/**
 * The signature under everything Tammy writes from the dashboard, so a customer
 * receiving it can tell it came from the shop and where to write back.
 */
function ownerSignature() {
  const address = escapeHtml(businessEmail());
  return `<p style="margin-top:26px">— Tammy<br><span style="color:#5a6b5e">The Hillside Gardens • <a href="mailto:${address}" style="color:#315a3d">${address}</a></span></p>`;
}

/**
 * Compose to any address. Mail leaves as `EMAIL_FROM` on the authenticated
 * hillside domain whatever the recipient is; `replyTo` is what carries the
 * conversation back to the shop inbox.
 */
/**
 * One send's claim on itself. A double-click on a submit button can reach a
 * server action twice, and these two sends carried no idempotency key at all —
 * every automated sender in the app has one, and a duplicate delivery is the
 * kind of thing the owner hears about from the customer.
 *
 * The claim is taken *before* the send so two clicks racing cannot both get
 * through, and released again when the send fails, so a provider error does not
 * leave her retry answered with a success it never had. That release is the
 * whole reason this is not the rate limiter: claiming through `rateLimitedByKey`
 * cannot be undone, and a failed send would lock out the retry for two minutes
 * while telling her it had gone.
 *
 * A short window: two identical notes a minute apart are a stuck button, two an
 * hour apart are a decision. Best-effort in the same way `sendEmail`'s own key
 * is — this lives in process memory, so a restart or a second replica keeps its
 * own, and the failure it guards against is a double-click rather than a
 * determined caller.
 */
const REPEAT_WINDOW_MS = 2 * 60_000;
const inFlight = new Map<string, number>();

function sendFingerprint(adminId: string | null, parts: string[]) {
  const digest = createHash('sha1').update(parts.join('\u0000')).digest('base64url');
  return `${adminId || 'shared-owner-login'}:${digest}`;
}

/** True when this send is ours to make; false when an identical one just was. */
function claimSend(key: string) {
  const now = Date.now();
  for (const [seen, at] of inFlight) {
    if (now - at > REPEAT_WINDOW_MS) inFlight.delete(seen);
  }
  if (inFlight.has(key)) return false;
  inFlight.set(key, now);
  return true;
}

/** Hands the send back so she can try again at once. */
function releaseSend(key: string) {
  inFlight.delete(key);
}

export async function sendOwnerEmail(formData: FormData) {
  const admin = await guard();
  if (await throttled(admin.id)) redirect(adminEmailPath({ error: 'email-throttled' }));

  const { addresses, invalid } = parseRecipients(text(formData, 'to'));
  const subject = text(formData, 'subject');
  const body = text(formData, 'body');

  if (!addresses.length || invalid.length) {
    redirect(adminEmailPath({ error: 'email-recipient', section: 'compose' }));
  }
  if (!subject || !body) {
    redirect(adminEmailPath({ error: 'email-empty', section: 'compose' }));
  }
  if (body.length > EMAIL_BODY_MAX) {
    redirect(adminEmailPath({ error: 'email-long', section: 'compose' }));
  }

  /**
   * Answered as the first send's success rather than refused, because to the
   * owner this *was* one send — the same answer `sendEmail` gives when its own
   * idempotency key has already been used.
   */
  const claim = sendFingerprint(admin.id, ['compose', ...addresses, subject, body]);
  if (!claimSend(claim)) {
    redirect(adminEmailPath({ notice: 'email-sent' }));
  }

  const delivery = await sendEmail({
    to: addresses,
    kind: 'MANUAL',
    subject,
    replyTo: businessEmail(),
    html: emailShell(subject, `${markOwnerText(ownerMessageHtml(body))}${ownerSignature()}`)
  });
  if (!delivery.sent) releaseSend(claim);

  revalidatePath('/admin/email');
  redirect(
    adminEmailPath(
      delivery.sent ? { notice: 'email-sent' } : { error: 'email-failed', section: 'compose' }
    )
  );
}

/**
 * Reply to a website message, threaded under it. The customer's own words are
 * quoted below the reply, because a bare answer arriving days later reads as a
 * cold email to the person who wrote it.
 */
export async function replyToCustomerMessage(formData: FormData) {
  const admin = await guard();
  if (await throttled(admin.id)) redirect(adminEmailPath({ error: 'email-throttled' }));

  const id = text(formData, 'id');
  const body = text(formData, 'body');
  const message = id ? await db.contactMessage.findUnique({ where: { id } }) : null;

  if (!message) redirect(adminEmailPath({ error: 'message-missing' }));
  if (!body) redirect(adminEmailPath({ error: 'email-empty', message: id }));
  if (body.length > EMAIL_BODY_MAX) {
    redirect(adminEmailPath({ error: 'email-long', message: id }));
  }
  if (!parseRecipients(message.email).addresses.length) {
    redirect(adminEmailPath({ error: 'email-recipient', message: id }));
  }

  const subject = text(formData, 'subject') || `Re: ${message.subject}`;
  const claim = sendFingerprint(admin.id, ['reply', message.id, subject, body]);
  if (!claimSend(claim)) {
    redirect(adminEmailPath({ notice: 'reply-sent', message: id }));
  }

  const delivery = await sendEmail({
    to: message.email,
    kind: 'REPLY',
    contactMessageId: message.id,
    subject,
    replyTo: businessEmail(),
    html: emailShell(
      'A note from The Hillside Gardens',
      `<p>Hi ${escapeHtml(message.name)},</p>${markOwnerText(ownerMessageHtml(body))}${ownerSignature()}${quotedMessageHtml(
        message.name,
        message.createdAt,
        message.message
      )}`
    )
  });

  /**
   * Answered mail is read mail. Only moved off NEW, so a message Tammy had
   * already archived is not pulled back into the working list by a follow-up.
   *
   * The NEW test belongs in the `where`, not in an `if` over the snapshot read
   * before the send: another admin archiving this message while the mail was in
   * flight would otherwise have that newer status overwritten by this stale one.
   */
  if (!delivery.sent) releaseSend(claim);

  if (delivery.sent) {
    await db.contactMessage.updateMany({
      where: { id: message.id, status: MessageStatus.NEW },
      data: { status: MessageStatus.READ }
    });
  }

  revalidatePath('/admin/email');
  revalidatePath('/admin');
  redirect(
    adminEmailPath(
      delivery.sent ? { notice: 'reply-sent', message: id } : { error: 'email-failed', message: id }
    )
  );
}
