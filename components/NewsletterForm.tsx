'use client';

import { FormEvent, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import FormStatus from '@/components/FormStatus';
import type { NewsletterSourceKey } from '@/lib/newsletter-source';

export default function NewsletterForm({
  compact = false,
  /**
   * Which placement this is. Every form on the site names itself, so the
   * dashboard can say where the list is actually growing instead of reporting
   * "website" for all of it.
   */
  source = 'website',
  /**
   * The page behind the signup, when the placement alone is not specific
   * enough — the footer is on every page. Defaults to the current path.
   */
  sourceDetail
}: {
  compact?: boolean;
  source?: NewsletterSourceKey;
  sourceDetail?: string;
}) {
  const formId = useId();
  const pathname = usePathname();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const nameId = `${formId}-name`;
  const emailId = `${formId}-email`;
  const statusId = `${formId}-status`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          website: data.get('website'),
          source,
          sourceDetail: sourceDetail ?? pathname
        }),
        signal: controller.signal
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Please try again.');
      setStatus('success');
      setMessage(result.message || 'You’re on the list.');
      form.reset();
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'The request took too long. Please check your connection and try again.'
          : error instanceof Error
            ? error.message
            : 'Please try again.'
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <form
      className={`newsletter-form${compact ? ' compact' : ''}`}
      onSubmit={submit}
      aria-busy={status === 'loading'}
    >
      {!compact && (
        <>
          <label className="sr-only" htmlFor={nameId}>First name</label>
          <input
            id={nameId}
            name="name"
            type="text"
            placeholder="First name"
            autoComplete="given-name"
            enterKeyHint="next"
          />
        </>
      )}
      <label className="sr-only" htmlFor={emailId}>Email address</label>
      <input
        id={emailId}
        name="email"
        type="email"
        inputMode="email"
        placeholder="Email address"
        autoComplete="email"
        enterKeyHint="send"
        spellCheck={false}
        required
        aria-describedby={message ? statusId : undefined}
      />
      <input
        className="honeypot"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <button className="btn gold" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Joining…' : 'Join the list'} <ArrowRight size={16} />
      </button>
      <FormStatus id={statusId} message={message} tone={status === 'error' ? 'error' : 'success'} />
    </form>
  );
}
