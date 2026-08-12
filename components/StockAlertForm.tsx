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
        body: JSON.stringify({ slug, email })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'We could not add you to the list.');
      setStatus({ type: 'ok', message: result.message || 'We will email you when it is back.' });
      setEmail('');
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
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Adding…' : 'Notify me'}
        </button>
      </div>
      <FormStatus message={status.message} tone={status.type === 'ok' ? 'success' : 'error'} />
    </form>
  );
}
