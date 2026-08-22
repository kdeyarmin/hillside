import { normalizeHillsideDomain } from './store.ts';

type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  idempotencyKey?: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '\u0026amp;')
    .replaceAll('<', '\u0026lt;')
    .replaceAll('>', '\u0026gt;')
    .replaceAll('"', '\u0026quot;')
    .replaceAll("'", '\u0026#039;');
}

/**
 * SendGrid wants the sender split into parts; EMAIL_FROM is authored as a
 * single RFC 5322 string ("The Hillside Gardens <orders@thehillsidegardens.com>")
 * because that is what Resend accepted and what the variable still holds.
 * Parsing here keeps the environment variable's format unchanged.
 */
function parseSender(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^"|"$/g, '').trim();
  return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
}

/**
 * Best-effort replacement for Resend's `Idempotency-Key` header, which
 * SendGrid's v3 mail/send has no equivalent for.
 *
 * Stripe retries a failed webhook, and three of those retried paths send admin
 * mail keyed by order or session id, so without some guard Tammy gets the same
 * "New order" notice twice. This suppresses a repeat inside the window that
 * actually matters — the hours-to-a-day window in which Stripe retries.
 *
 * It is deliberately NOT presented as a guarantee: the map lives in process
 * memory, so a deploy or a restart clears it, and a second replica would keep
 * its own. The customer-facing confirmation does not rely on this at all —
 * `Order.confirmationEmailSentAt` dedupes that one in the database, which is
 * the copy that would actually embarrass us to send twice.
 */
const RECENT_SEND_TTL_MS = 24 * 60 * 60 * 1000;
const recentSends = new Map<string, number>();

function alreadySent(key: string | undefined) {
  if (!key) return false;
  const now = Date.now();
  for (const [seen, at] of recentSends) {
    if (now - at > RECENT_SEND_TTL_MS) recentSends.delete(seen);
  }
  const at = recentSends.get(key);
  return at !== undefined && now - at <= RECENT_SEND_TTL_MS;
}

export async function sendEmail(input: EmailInput) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = parseSender(
    normalizeHillsideDomain(
      process.env.EMAIL_FROM || 'The Hillside Gardens <orders@thehillsidegardens.com>'
    )
  );
  if (!apiKey) return { sent: false, reason: 'not-configured' as const };

  if (alreadySent(input.idempotencyKey)) {
    return { sent: true, id: null };
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((address) => address.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
  if (!recipients.length) return { sent: false, reason: 'no-email' as const };

  /**
   * SendGrid rejects a content part whose value is empty and requires the
   * parts in ascending MIME order, so the plain-text alternative is included
   * only when there is one and always ahead of the HTML.
   */
  const content = [
    ...(input.text && input.text.trim() ? [{ type: 'text/plain', value: input.text }] : []),
    { type: 'text/html', value: input.html }
  ];

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients }],
        from,
        subject: input.subject,
        content,
        ...(input.replyTo ? { reply_to: { email: input.replyTo } } : {})
      })
    });

    if (!response.ok) {
      console.error('Email send failed', response.status, await response.text());
      return { sent: false, reason: 'provider-error' as const };
    }

    /**
     * A successful send is 202 with an empty body — there is no JSON to parse
     * and no id in it. The message id comes back as a header instead.
     */
    if (input.idempotencyKey) recentSends.set(input.idempotencyKey, Date.now());
    return { sent: true, id: response.headers.get('x-message-id') };
  } catch (error) {
    console.error('Email send failed', error);
    return { sent: false, reason: 'network-error' as const };
  }
}

export function emailShell(title: string, content: string, options?: { unsubscribeUrl?: string }) {
  const unsubscribe = options?.unsubscribeUrl
    ? `<br><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#315a3d">Unsubscribe from The Hillside Notes</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#1d2a21"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #dfe4dc;border-radius:18px;overflow:hidden"><div style="background:#203f2b;color:#ffffff;padding:24px 28px"><h1 style="font-family:Georgia,serif;font-weight:500;margin:0;font-size:30px">${escapeHtml(title)}</h1></div><div style="padding:28px">${content}</div><div style="padding:18px 28px;background:#edf1e9;color:#315a3d;font-size:12px">The Hillside Gardens • Plants • Teas • Botanicals${unsubscribe}</div></div></div></body></html>`;
}
