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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendEmail(input: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'The Hillside Gardens <orders@thehillsidegarden.com>';
  if (!apiKey) return { sent: false, reason: 'not-configured' as const };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {})
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo
      })
    });

    if (!response.ok) {
      console.error('Email send failed', response.status, await response.text());
      return { sent: false, reason: 'provider-error' as const };
    }

    const data = (await response.json()) as { id?: string };
    return { sent: true, id: data.id || null };
  } catch (error) {
    console.error('Email send failed', error);
    return { sent: false, reason: 'network-error' as const };
  }
}

export function emailShell(title: string, content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#1d2a21"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #dfe4dc;border-radius:18px;overflow:hidden"><div style="background:#203f2b;color:#ffffff;padding:24px 28px"><h1 style="font-family:Georgia,serif;font-weight:500;margin:0;font-size:30px">${escapeHtml(title)}</h1></div><div style="padding:28px">${content}</div><div style="padding:18px 28px;background:#edf1e9;color:#315a3d;font-size:12px">The Hillside Gardens • Plants • Teas • Botanicals</div></div></div></body></html>`;
}
