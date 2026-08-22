'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MessageStatus } from '@prisma/client';
import { isAdmin } from '@/lib/admin';
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
import { clientKeyFromHeaders, rateLimitedByKey } from '@/lib/rate-limit';
import { businessEmail } from '@/lib/store';

const text = (form: FormData, name: string) => String(form.get(name) || '').trim();

async function guard() {
  if (!(await isAdmin())) redirect('/admin');
}

/**
 * An authenticated form that can send mail to any address is worth a ceiling of
 * its own. Tammy answering a morning's messages is nowhere near this; a session
 * someone else got hold of being used as a relay runs into it quickly.
 */
async function throttled() {
  const identity = clientKeyFromHeaders(await headers());
  return rateLimitedByKey(identity, { name: 'admin-email', limit: 40, windowMs: 60 * 60_000 });
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
export async function sendOwnerEmail(formData: FormData) {
  await guard();
  if (await throttled()) redirect(adminEmailPath({ error: 'email-throttled' }));

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

  const delivery = await sendEmail({
    to: addresses,
    kind: 'MANUAL',
    subject,
    replyTo: businessEmail(),
    html: emailShell(subject, `${markOwnerText(ownerMessageHtml(body))}${ownerSignature()}`)
  });

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
  await guard();
  if (await throttled()) redirect(adminEmailPath({ error: 'email-throttled' }));

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
   */
  if (delivery.sent && message.status === MessageStatus.NEW) {
    await db.contactMessage.update({
      where: { id: message.id },
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
