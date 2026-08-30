import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readUnsubscribeToken } from '@/lib/newsletter';
import { rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

async function tokenFrom(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get('token')?.trim() || '';
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    return String(body.token || fromQuery).trim();
  }

  if (contentType.includes('form')) {
    const form = await request.formData();
    return String(form.get('token') || fromQuery).trim();
  }

  return fromQuery;
}

function formReply(request: Request, status: 'done' | 'invalid') {
  const next = new URL(`/newsletter/unsubscribe?${status}=1`, request.url);
  return NextResponse.redirect(next, 303);
}

export async function POST(request: Request) {
  if (await rateLimited(request, { name: 'newsletter-unsub', limit: 20, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many unsubscribe attempts. Please try again shortly.' },
      { status: 429 }
    );
  }

  const isForm = (request.headers.get('content-type') || '').includes('form');
  const token = await tokenFrom(request);
  const email = readUnsubscribeToken(token);

  if (!email) {
    if (isForm) return formReply(request, 'invalid');
    return NextResponse.json({ error: 'This unsubscribe link is not valid.' }, { status: 400 });
  }

  await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { active: false, unsubscribedAt: new Date() }
  });

  if (isForm) return formReply(request, 'done');
  return NextResponse.json({ message: 'You have been unsubscribed from The Hillside Notes.' });
}
