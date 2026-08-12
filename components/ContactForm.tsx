'use client';

import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import FormStatus from '@/components/FormStatus';

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

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
          <input className="form-input" id="contact-name" name="name" autoComplete="name" required />
        </div>
        <div className="form-group">
          <label htmlFor="contact-email">Email</label>
          <input className="form-input" id="contact-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="form-group">
          <label htmlFor="contact-phone">Phone <span className="muted">(optional)</span></label>
          <input className="form-input" id="contact-phone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="form-group">
          <label htmlFor="contact-subject">What can we help with?</label>
          <select className="form-input" id="contact-subject" name="subject" defaultValue="General question" required>
            <option>General question</option>
            <option>Plant care question</option>
            <option>Product or order question</option>
            <option>Planter class</option>
            <option>Private group class</option>
            <option>Custom planter arrangement</option>
            <option>Wholesale or collaboration</option>
          </select>
        </div>
        <div className="form-group full">
          <label htmlFor="contact-message">Message</label>
          <textarea
            className="form-input"
            id="contact-message"
            name="message"
            placeholder="Tell us a little about what you need."
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
      <FormStatus message={message} tone={status === 'error' ? 'error' : 'success'} className="tight" />
    </form>
  );
}
