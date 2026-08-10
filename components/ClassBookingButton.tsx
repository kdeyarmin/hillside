'use client';

import { useState } from 'react';
import { CreditCard, MailCheck } from 'lucide-react';

export default function ClassBookingButton({
  classId,
  seatsLeft,
  online = false
}: {
  classId: string;
  seatsLeft: number;
  online?: boolean;
}) {
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const maxSeats = Math.max(1, Math.min(6, seatsLeft));

  /**
   * A failed reservation used to arrive as a browser `alert()` — unstyled, modal
   * and impossible to read alongside the seat picker it refers to. Every other
   * form on the site reports inline, so this one does too.
   */
  async function register() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/classes/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, seats })
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Unable to register.');
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to register.');
      setLoading(false);
    }
  }

  return (
    <div className="class-booking-wrap">
      <div className="class-booking">
        <label className="sr-only" htmlFor={`class-seats-${classId}`}>Number of seats</label>
        <select
          className="form-input"
          id={`class-seats-${classId}`}
          value={seats}
          onChange={(event) => setSeats(Number(event.target.value))}
        >
          {Array.from({ length: maxSeats }, (_, index) => index + 1).map((value) => (
            <option value={value} key={value}>{value} {value === 1 ? 'seat' : 'seats'}</option>
          ))}
        </select>
        <button
          className="btn"
          type="button"
          onClick={register}
          disabled={loading || seatsLeft <= 0}
          aria-busy={loading}
        >
          <CreditCard size={17} /> {loading ? 'Opening checkout…' : 'Reserve your seat'}
        </button>
      </div>
      {error && <p className="form-status error" role="alert">{error}</p>}
      <p className="class-checkout-email-note">
        <CreditCard size={15} /> Payment is handled securely by Stripe.
      </p>
      {online && (
        <p className="class-checkout-email-note">
          <MailCheck size={15} /> Your private classroom link is emailed as soon as you pay.
        </p>
      )}
    </div>
  );
}
