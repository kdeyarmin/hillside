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
  const maxSeats = Math.max(1, Math.min(6, seatsLeft));

  async function register() {
    setLoading(true);
    try {
      const response = await fetch('/api/classes/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, seats })
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Unable to register.');
      window.location.assign(result.url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to register.');
      setLoading(false);
    }
  }

  return (
    <div className="class-booking-wrap">
      <div className="class-booking">
        <select
          className="form-input"
          value={seats}
          onChange={(event) => setSeats(Number(event.target.value))}
          aria-label="Number of seats"
        >
          {Array.from({ length: maxSeats }, (_, index) => index + 1).map((value) => (
            <option value={value} key={value}>{value} {value === 1 ? 'seat' : 'seats'}</option>
          ))}
        </select>
        <button className="btn" type="button" onClick={register} disabled={loading || seatsLeft <= 0}>
          <CreditCard size={17} /> {loading ? 'Opening checkout…' : 'Reserve with Stripe'}
        </button>
      </div>
      {online && (
        <p className="class-checkout-email-note">
          <MailCheck size={15} /> Your private Telnyx classroom link will be emailed after payment.
        </p>
      )}
    </div>
  );
}
