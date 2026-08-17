/**
 * Carrier tracking links and customer-facing order status copy.
 * Kept free of Next/Prisma so `npm test` can cover the URL rules.
 */

export const TRACKING_CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'OnTrac', 'Amazon'] as const;
export type TrackingCarrierName = (typeof TRACKING_CARRIERS)[number];

export type TrackingInfo = {
  number: string;
  carrier: string | null;
  url: string | null;
  label: string;
};

function cleanTrackingNumber(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function normalizeTrackingCarrier(value?: string | null): TrackingCarrierName | null {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('usps') || raw.includes('postal')) return 'USPS';
  if (raw.includes('ups')) return 'UPS';
  if (raw.includes('fedex') || raw.includes('fed ex') || raw.includes('federal express'))
    return 'FedEx';
  if (raw.includes('dhl')) return 'DHL';
  if (raw.includes('ontrac') || raw.includes('on trac')) return 'OnTrac';
  if (raw.includes('amazon')) return 'Amazon';
  return null;
}

export function inferTrackingCarrier(number: string): TrackingCarrierName | null {
  const cleaned = cleanTrackingNumber(number);
  if (!cleaned) return null;
  if (/^1Z[A-Z0-9]{16}$/.test(cleaned)) return 'UPS';
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cleaned)) return 'USPS';
  if (/^JD\d{16,22}$/.test(cleaned)) return 'DHL';
  if (/^9\d{21,25}$/.test(cleaned)) return 'USPS';
  if (/^\d{12}$/.test(cleaned) || /^\d{15}$/.test(cleaned)) return 'FedEx';
  if (/^\d{20,22}$/.test(cleaned)) return 'USPS';
  return null;
}

export function trackingUrl(number: string, carrier?: string | null): string | null {
  const cleaned = cleanTrackingNumber(number);
  if (!cleaned) return null;
  const kind = normalizeTrackingCarrier(carrier) || inferTrackingCarrier(cleaned);
  if (!kind) return null;
  const encoded = encodeURIComponent(cleaned);
  switch (kind) {
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${encoded}`;
    case 'FedEx':
      return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
    case 'DHL':
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
    case 'OnTrac':
      return `https://www.ontrac.com/tracking/?number=${encoded}`;
    case 'Amazon':
      return `https://track.amazon.com/tracking/${encoded}`;
  }
}

export function describeTracking(number: string, carrier?: string | null): TrackingInfo {
  const cleaned = cleanTrackingNumber(number);
  const kind = normalizeTrackingCarrier(carrier) || inferTrackingCarrier(cleaned);
  const displayCarrier = kind || (carrier || '').trim() || null;
  return {
    number: cleaned,
    carrier: displayCarrier,
    url: trackingUrl(cleaned, carrier),
    label: displayCarrier ? `${displayCarrier} ${cleaned}` : cleaned
  };
}

export function orderStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'Payment is still being confirmed.';
    case 'PAID':
      return 'We are preparing your order.';
    case 'FULFILLED':
      return 'Your order has shipped.';
    case 'PARTIALLY_REFUNDED':
      return 'Part of this order was refunded.';
    case 'REFUNDED':
      return 'This order was refunded.';
    case 'CANCELLED':
      return 'This order was cancelled.';
    default:
      return 'We have an update on this order.';
  }
}
