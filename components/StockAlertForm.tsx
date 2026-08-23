'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';
import FormStatus from '@/components/FormStatus';

/**
 * A sold-out product used to offer nothing but a disabled button. This turns
 * that dead end into a waiting list Tammy can pot against.
 */
export default function StockAlertForm({ slug, name }: { slug: string; name: string }) {
  const [email, setEmail] = useState('');
  const [joinNewsletter, setJoinNewsletter] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'error'; message?: string }>({
    type: 'idle'
  });
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setStatus({ type: 'idle' });
    try {
      const response = await fetch('/api/stock-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, joinNewsletter })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'We could not add you to the list.');
      setStatus({ type: 'ok', message: result.message || 'We will email you when it is back.' });
      setEmail('');
      setJoinNewsletter(false);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'We could not add you to the list.'
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stock-alert" onSubmit={submit}>
      <div className="stock-alert-head">
        <BellRing size={20} aria-hidden="true" />
        <div>
          <b>Sold out for now</b>
          <span>Leave your email and we&rsquo;ll tell you the moment {name} is back.</span>
        </div>
      </div>
      <div className="stock-alert-row">
        <label className="sr-only" htmlFor={`stock-alert-${slug}`}>Email address</label>
        <input
          id={`stock-alert-${slug}`}
          className="form-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Adding…' : 'Notify me'}
        </button>
      </div>
      {/* Unticked, and it only ever adds an address that is not already on the
          list — the restock note is what they asked for, the newsletter is a
          separate thing they have to choose. */}
      <label className="stock-alert-optin" htmlFor={`stock-alert-notes-${slug}`}>
        <input
          id={`stock-alert-notes-${slug}`}
          type="checkbox"
          checked={joinNewsletter}
          onChange={(event) => setJoinNewsletter(event.target.checked)}
        />
        <span>
          Also send me The Hillside Notes — occasional seasonal tips and new arrivals. Unsubscribe
          any time.
        </span>
      </label>
      <FormStatus message={status.message} tone={status.type === 'ok' ? 'success' : 'error'} />
    </form>
  );
}
