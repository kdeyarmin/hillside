'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, Mail, UserRound } from 'lucide-react';
import FormStatus from '@/components/FormStatus';
import { HONEYPOT_FIELD } from '@/lib/honeypot';

export default function FreeClassRegistrationForm({
  classId,
  seatsLeft,
  online
}: {
  classId: string;
  seatsLeft: number;
  online: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const maxSeats = Math.max(1, Math.min(6, seatsLeft));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    // React nulls `event.currentTarget` once the handler returns, and this one
    // awaits — so the element has to be captured before the fetch or the reset
    // below throws and a successful registration lands in the catch.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch('/api/classes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          seats: form.get('seats'),
          [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD)
        })
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to register.');
      setComplete(true);
      setMessage(result.message || 'Your registration is confirmed.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to register.');
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div className="class-registration-success" role="status">
        <CheckCircle2 size={24} />
        <div>
          <b>Check your email to confirm</b>
          <p>{message}</p>
          {online && <p>After you confirm, we will email the private online classroom link.</p>}
        </div>
      </div>
    );
  }

  return (
    <form className="free-class-registration" onSubmit={submit}>
      <div className="free-class-registration-heading">
        <UserRound size={20} />
        <div>
          <b>Reserve your place</b>
          <span>
            {online
              ? 'We will email a confirmation link, then your private classroom link.'
              : 'We will email a confirmation link to finish reserving your seat.'}
          </span>
        </div>
      </div>
      <div className="free-class-registration-grid">
        <label>
          <span>Name</span>
          <input className="form-input" name="name" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          <span>Email</span>
          <input
            className="form-input"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          <span>Phone, optional</span>
          <input className="form-input" name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </label>
        <label>
          <span>Seats</span>
          <select className="form-input" name="seats" defaultValue="1">
            {Array.from({ length: maxSeats }, (_, index) => index + 1).map((value) => (
              <option value={value} key={value}>
                {value} {value === 1 ? 'seat' : 'seats'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* Spam honeypot: off-screen, out of the tab order and hidden from
          assistive tech, so only a bot ever fills it. The name is deliberately
          not `website` — browsers autofill that one and every autofilled
          honeypot silently discarded a real registration. See lib/honeypot.ts.

          The offscreen class belongs on the input itself. On the wrapping label
          it left a real 8×33 field in the layout, which is what the responsive
          audit flags as an undersized control on every phone and tablet. */}
      <input
        className="honeypot"
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {/* Always mounted — see FormStatus for why a live region that appears
          already carrying its message often goes unannounced. */}
      <FormStatus message={error} tone="error" />
      <button className="btn" type="submit" disabled={submitting}>
        <Mail size={17} /> {submitting ? 'Sending confirmation…' : 'Email me a confirmation link'}
      </button>
    </form>
  );
}
