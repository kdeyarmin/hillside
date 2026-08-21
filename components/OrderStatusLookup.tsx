'use client';

import { FormEvent, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { formatMoney } from '@/lib/store';
import { isPickupOrder, orderStatusHeading } from '@/lib/fulfillment';
import { describeTracking, orderStatusBadge } from '@/lib/tracking';

type OrderResult = {
  invoiceNumber: string;
  status: string;
  createdAt: string;
  fulfilledAt: string | null;
  totalCents: number;
  refundedCents: number;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  fulfillmentMethod?: string | null;
  shippingMethod?: string | null;
  giftMessage?: string | null;
  pickupNote?: string | null;
  items: { name: string; quantity: number; unitCents: number }[];
};

export default function OrderStatusLookup() {
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setOrder(null);
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber: data.get('invoiceNumber'), email: data.get('email') })
      });
      const result = (await response.json()) as OrderResult & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Order not found.');
      setOrder(result);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Order not found.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="narrow">
      <form className="form-card" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="order-number">Order / invoice number</label>
            <input
              className="form-input"
              id="order-number"
              name="invoiceNumber"
              placeholder="HG-12345678"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="order-email">Email used at checkout</label>
            <input
              className="form-input"
              id="order-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
        </div>
        <button className="btn" type="submit" disabled={loading}>
          <PackageSearch size={17} /> {loading ? 'Looking up order…' : 'Check order status'}
        </button>
        {error && (
          <p className="form-status error" role="alert">
            {error}
          </p>
        )}
      </form>

      {order && (
        <div className="admin-card" style={{ marginTop: 24 }}>
          <div className="toolbar">
            <div>
              <div className="eyebrow">Order {order.invoiceNumber}</div>
              <h2
                className="display-title"
                style={{ color: 'var(--forest)', fontSize: 38, margin: '5px 0' }}
              >
                {orderStatusHeading(order)}
              </h2>
            </div>
            <span className={`status-badge ${order.status}`}>
              {orderStatusBadge(order.status, order.fulfillmentMethod)}
            </span>
          </div>
          <p className="muted">
            Placed {new Date(order.createdAt).toLocaleDateString('en-US', { dateStyle: 'long' })}
          </p>
          {isPickupOrder(order) && (
            <div className="note-box">
              <b>Local pickup</b>
              {order.status === 'FULFILLED' || order.fulfilledAt ? (
                order.pickupNote ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{order.pickupNote}</span>
                ) : (
                  'This order is ready in Ebensburg. Check the email we sent for the pickup window.'
                )
              ) : (
                'We will email when this is ready. Please do not come until you hear from us.'
              )}
            </div>
          )}
          {order.giftMessage && (
            <div className="note-box">
              <b>Gift message</b>
              <span style={{ whiteSpace: 'pre-wrap' }}>{order.giftMessage}</span>
            </div>
          )}
          {!isPickupOrder(order) && order.trackingNumber && (
            <TrackingNote number={order.trackingNumber} carrier={order.trackingCarrier} />
          )}
          <div style={{ marginTop: 20 }}>
            {order.items.map((item, index) => (
              <div className="summary-row" key={`${item.name}-${index}`}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatMoney(item.unitCents * item.quantity)}</span>
              </div>
            ))}
            <div className="summary-row total">
              <span>Total</span>
              <span>{formatMoney(order.totalCents)}</span>
            </div>
            {order.refundedCents > 0 && (
              <div className="summary-row">
                <span>Refunded</span>
                <span>−{formatMoney(order.refundedCents)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackingNote({ number, carrier }: { number: string; carrier: string | null }) {
  const track = describeTracking(number, carrier);
  return (
    <div className="note-box">
      <b>Tracking information</b>
      <div>
        {track.url ? (
          <a href={track.url} target="_blank" rel="noopener noreferrer">
            {track.label}
          </a>
        ) : (
          track.label
        )}
      </div>
    </div>
  );
}
