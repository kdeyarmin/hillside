'use client';

import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import FormStatus from '@/components/FormStatus';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { allowedContactSubjects, type ContactSubject } from '@/lib/contact';

const SUBJECTS = allowedContactSubjects(CLASSES_PUBLICLY_VISIBLE);

export default function ContactForm({
  initialSubject = 'General question',
  initialMessage = ''
}: {
  initialSubject?: ContactSubject;
  initialMessage?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialMessage);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone'),
          subject: data.get('subject'),
          message: data.get('message'),
          website: data.get('website')
        })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to send your message.');
      setStatus('success');
      setMessage(result.message || 'Thanks — we received your message.');
      form.reset();
      /**
       * `reset()` restores `defaultValue`, so a visitor who arrived with
       * `?subject=&message=` would see the prefill come back and think the
       * send failed. Clear the controlled fields so the form is actually empty.
       */
      setSubject('General question');
      setBody('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to send your message.');
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="contact-name">Name</label>
          <input
            className="form-input"
            id="contact-name"
            name="name"
            autoComplete="name"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="contact-email">Email</label>
          <input
            className="form-input"
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="contact-phone">
            Phone <span className="muted">(optional)</span>
          </label>
          <input
            className="form-input"
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
          />
        </div>
        <div className="form-group">
          <label htmlFor="contact-subject">What can we help with?</label>
          <select
            className="form-input"
            id="contact-subject"
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value as ContactSubject)}
            required
          >
            {SUBJECTS.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>
        </div>
        <div className="form-group full">
          <label htmlFor="contact-message">Message</label>
          <textarea
            className="form-input"
            id="contact-message"
            name="message"
            placeholder="Tell us a little about what you need."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            minLength={10}
          />
        </div>
      </div>
      <input
        className="honeypot"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <button className="btn" type="submit" disabled={status === 'loading'}>
        <Send size={17} /> {status === 'loading' ? 'Sending…' : 'Send message'}
      </button>
      <FormStatus
        message={message}
        tone={status === 'error' ? 'error' : 'success'}
        className="tight"
      />
    </form>
  );
}
