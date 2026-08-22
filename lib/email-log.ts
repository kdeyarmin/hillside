/**
 * The owner's record of outbound mail.
 *
 * Everything above `recordEmail` is deliberately free of Prisma and Next, so
 * `npm test` can cover the filtering and the plain-text rendering that the
 * email page depends on. `recordEmail` reaches the database through a dynamic
 * import for the same reason: `lib/email.ts` is unit-tested directly, and a
 * top-level `@prisma/client` import there would drag a generated client into
 * the test runner.
 */

import { escapeHtml } from './email.ts';
import { validEmailAddress } from './store.ts';

export { validEmailAddress };

export type EmailKindValue =
  | 'ORDER_CONFIRMATION'
  | 'ORDER_ADMIN'
  | 'PICKUP_READY'
  | 'SHIPPING_UPDATE'
  | 'CLASS_CONFIRMATION'
  | 'CLASS_ADMIN'
  | 'STOCK_ALERT'
  | 'NEWSLETTER'
  | 'CART_RECOVERY'
  | 'CONTACT'
  | 'REVIEW'
  | 'REPLY'
  | 'MANUAL'
  | 'OTHER';

export type EmailStatusValue = 'SENT' | 'FAILED';

/** How many rows one page of the sent-mail log shows. */
export const EMAIL_LOG_PAGE_SIZE = 50;

/** How many customer messages one page shows. */
export const MESSAGE_PAGE_SIZE = 25;

/** The longest body the compose box accepts, matching the contact form's cap. */
export const EMAIL_BODY_MAX = 5000;

/** How many addresses one composed email may be sent to. */
export const RECIPIENT_MAX = 5;

export const EMAIL_KIND_LABELS: Record<EmailKindValue, string> = {
  ORDER_CONFIRMATION: 'Order confirmation',
  ORDER_ADMIN: 'New order notice',
  PICKUP_READY: 'Pickup ready',
  SHIPPING_UPDATE: 'Shipping update',
  CLASS_CONFIRMATION: 'Class confirmation',
  CLASS_ADMIN: 'Class registration notice',
  STOCK_ALERT: 'Back-in-stock alert',
  NEWSLETTER: 'Newsletter',
  CART_RECOVERY: 'Saved cart reminder',
  CONTACT: 'Contact form',
  REVIEW: 'Review to approve',
  REPLY: 'Reply to a customer',
  MANUAL: 'Written by hand',
  OTHER: 'Other'
};

const EMAIL_KINDS = Object.keys(EMAIL_KIND_LABELS) as EmailKindValue[];

export function emailKindLabel(kind: string) {
  return EMAIL_KIND_LABELS[kind as EmailKindValue] || kind.replaceAll('_', ' ').toLowerCase();
}

/**
 * Why a send failed, said the way Tammy would need to hear it. The raw reasons
 * come from `sendEmail` and mean nothing on their own in a dashboard.
 */
export const EMAIL_FAILURE_REASONS: Record<string, string> = {
  'not-configured': 'SendGrid is not connected, so nothing was sent.',
  'no-email': 'There was no address to send to.',
  'provider-error': 'SendGrid refused the message. It was not delivered.',
  'network-error': 'The connection to SendGrid failed. It was not delivered.'
};

export function emailFailureLabel(reason: string | null | undefined) {
  if (!reason) return 'It was not delivered.';
  return EMAIL_FAILURE_REASONS[reason] || `It was not delivered (${reason}).`;
}

export function parseEmailKindFilter(value: unknown): EmailKindValue | 'all' {
  return EMAIL_KINDS.includes(value as EmailKindValue) ? (value as EmailKindValue) : 'all';
}

export function parseEmailStatusFilter(value: unknown): EmailStatusValue | 'all' {
  return value === 'SENT' || value === 'FAILED' ? value : 'all';
}

/**
 * Turns a stored HTML body back into something readable in a list row. The page
 * shows the full message in a sandboxed frame; this is the one-line preview and
 * the text the search query is matched against.
 */
export function emailPlainText(html: string | null | undefined) {
  return (
    String(html || '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&#039;', "'")
      .replaceAll('&quot;', '"')
      .replaceAll('&gt;', '>')
      .replaceAll('&lt;', '<')
      // Ampersand last: decoding it first would turn "&amp;lt;" back into a tag.
      .replaceAll('&amp;', '&')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim()
  );
}

export function emailPreview(html: string | null | undefined, length = 160) {
  const text = emailPlainText(html).replace(/\s+/g, ' ');
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/**
 * Just the message, without the letterhead `emailShell` wraps every send in.
 * The thread under a customer message shows what Tammy actually wrote; the
 * shop's header and footer repeated under each reply is noise she has to read
 * past. The full HTML is what the log stores and what the preview frame shows,
 * so nothing here changes the record of what was sent.
 *
 * Comment markers rather than a selector: the shell's styling has been edited
 * before and would take a regex over its markup with it.
 */
export function emailBodyHtml(html: string | null | undefined) {
  const value = String(html || '');
  const open = value.indexOf(BODY_OPEN);
  const close = value.lastIndexOf(BODY_CLOSE);
  if (open === -1 || close === -1 || close < open) return value;
  return value.slice(open + BODY_OPEN.length, close);
}

const BODY_OPEN = '<!--body-->';
const BODY_CLOSE = '<!--/body-->';
const SAID_OPEN = '<!--said-->';
const SAID_CLOSE = '<!--/said-->';

/**
 * Wraps the words the owner actually typed, so the thread can show them back
 * without the greeting, the signature and the quoted message that are part of
 * the same sent body.
 */
export function markOwnerText(html: string) {
  return `${SAID_OPEN}${html}${SAID_CLOSE}`;
}

/**
 * What Tammy wrote, for the thread under a customer message. Falls back to the
 * whole body when there is no mark — anything sent by another path, where the
 * body *is* the message.
 */
export function ownerSaidHtml(html: string | null | undefined) {
  const value = String(html || '');
  const open = value.indexOf(SAID_OPEN);
  const close = value.lastIndexOf(SAID_CLOSE);
  if (open === -1 || close === -1 || close < open) return emailBodyHtml(value);
  return value.slice(open + SAID_OPEN.length, close);
}

export type EmailLogSearchable = {
  to: string[];
  subject: string;
  html: string;
};

/**
 * Matched against the recipient, the subject and the body text, because the
 * question is usually "what did we send to this person" and sometimes "which
 * email mentioned the pickup window".
 */
export function emailLogMatches(entry: EmailLogSearchable, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  // Exactly what `emailSearchText` stores, so an in-memory match and the SQL
  // one on the page cannot disagree about whether a row matches.
  const haystack = `${entry.subject} ${emailSearchText(entry.to, entry.html)}`.toLowerCase();
  return haystack.includes(needle);
}

/**
 * The addresses a compose or reply is sent to. Up to five, deduplicated, and
 * every one of them valid — a list with a typo in it is rejected whole rather
 * than quietly sent to the addresses that happened to parse, which would leave
 * Tammy believing she had written to someone she had not.
 */
export function parseRecipients(value: string): { addresses: string[]; invalid: string[] } {
  const entries = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const addresses: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const valid = validEmailAddress(entry);
    if (!valid) {
      invalid.push(entry);
      continue;
    }
    if (addresses.some((seen) => seen.toLowerCase() === valid.toLowerCase())) continue;
    /**
     * Past the cap the address is reported rather than dropped. Truncating to
     * the first five silently was the same failure this function exists to
     * prevent: the sender believing they had written to someone they had not.
     */
    if (addresses.length >= RECIPIENT_MAX) invalid.push(valid);
    else addresses.push(valid);
  }
  return { addresses, invalid };
}

/**
 * The owner types a plain message; this is what actually goes out. Escaped
 * first and only then given paragraph breaks, so a customer name with an
 * ampersand in it survives and a pasted `<script>` does not become one.
 */
export function ownerMessageHtml(body: string) {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

/**
 * The quoted message under a reply, so the customer can see what they wrote.
 */
export function quotedMessageHtml(from: string, sentAt: Date, message: string) {
  return `<hr style="border:none;border-top:1px solid #dfe4dc;margin:24px 0"><p style="color:#5a6b5e;font-size:13px;margin:0 0 8px">On ${escapeHtml(
    sentAt.toLocaleDateString('en-US', { dateStyle: 'medium' })
  )}, ${escapeHtml(from)} wrote:</p><blockquote style="margin:0;padding-left:14px;border-left:3px solid #dfe4dc;color:#5a6b5e;font-size:14px">${ownerMessageHtml(
    message
  )}</blockquote>`;
}

/**
 * What a row is searched on: who it went to, and the message itself.
 *
 * `ownerSaidHtml` rather than the whole body, because a reply carries the
 * shop's sign-off and the customer's quoted words as well as Tammy's own. It
 * falls back to the full body for automated mail, which is all message.
 */
export function emailSearchText(to: string[], html: string | null | undefined) {
  return `${to.join(' ')} ${emailPlainText(ownerSaidHtml(html))}`.trim();
}

/**
 * Strips the live credentials out of a body before it is stored.
 *
 * `ClassRegistration.joinTokenHash` holds a SHA-256 *hash* precisely so that
 * reading the database cannot yield a working classroom link — the plaintext
 * token is supposed to exist only in the customer's own inbox. Storing the sent
 * HTML put it back in the database in the clear, which handed anyone who can
 * read this table, or a backup of it, a live class credential. Seat-confirmation
 * links and newsletter unsubscribe tokens go the same way: one confirms someone
 * else's seat, the other unsubscribes them.
 *
 * The email stays readable and the link stays visible as a link; only the
 * secret in it is replaced. Nothing is lost by that — resending a classroom
 * link is its own action in the class studio, and it mints a fresh token.
 */
export function redactSecretLinks(html: string | null | undefined) {
  return String(html || '')
    .replace(/(\/classes\/(?:access|confirm)\/)[A-Za-z0-9._~%-]+/g, '$1[removed]')
    .replace(/([?&]token=)[^"'&\s<>]+/g, '$1[removed]');
}

export type RecordEmailInput = {
  to: string[];
  subject: string;
  html: string;
  kind?: EmailKindValue;
  status: EmailStatusValue;
  reason?: string | null;
  providerId?: string | null;
  contactMessageId?: string | null;
};

/**
 * Writes one attempt to the log. Never throws: an email that went out is not
 * un-sent by a failure to write the row, and a webhook that returned 500
 * because of this would make Stripe redeliver a fulfilled order.
 */
export async function recordEmail(entry: RecordEmailInput) {
  try {
    const { db } = await import('./db.ts');
    // Redacted before it is stored, not on the way out: a row that never held
    // the token cannot leak it through a backup, an export or a later feature.
    const html = redactSecretLinks(entry.html);
    await db.emailLog.create({
      data: {
        to: entry.to,
        subject: entry.subject.slice(0, 500),
        html,
        searchText: emailSearchText(entry.to, html),
        kind: entry.kind || 'OTHER',
        status: entry.status,
        reason: entry.reason || null,
        providerId: entry.providerId || null,
        contactMessageId: entry.contactMessageId || null
      }
    });
  } catch (error) {
    console.error('Unable to record outbound email in the log', error);
  }
}
