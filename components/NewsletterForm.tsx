'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight } from 'lucide-react';

export default function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          website: data.get('website')
        })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      setStatus('success');
      setMessage(result.message || 'You’re on the list.');
      form.reset();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <form className={`newsletter-form${compact ? ' compact' : ''}`} onSubmit={submit}>
      {!compact && <input name="name" type="text" placeholder="First name" autoComplete="given-name" />}
      <input name="email" type="email" placeholder="Email address" autoComplete="email" required />
      <input className="honeypot" name="website" type="text" tabIndex={-1} autoComplete="off" />
      <button className="btn gold" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Joining…' : 'Join the list'} <ArrowRight size={16} />
      </button>
      {message && (
        <span className={`form-status ${status}`} role="status" aria-live="polite">
          {message}
        </span>
      )}
    </form>
  );
}
