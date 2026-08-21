'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { FileText, Printer } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { trackPurchase } from '@/lib/analytics';

export default function OrderSuccessClient({
  invoiceUrl,
  sessionId,
  shouldClearCart,
  catalogEmpty,
  purchase
}: {
  invoiceUrl?: string | null;
  sessionId?: string | null;
  shouldClearCart?: boolean;
  catalogEmpty?: boolean;
  purchase?: {
    invoiceNumber: string;
    totalCents: number;
    items: Array<{ name: string; size?: string | null; quantity: number; unitCents: number }>;
  } | null;
}) {
  const { clearCart } = useCart();

  useEffect(() => {
    if (!shouldClearCart || !sessionId) return;
    const key = `hillside-cleared-${sessionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Private mode can throw; still clear once this mount.
    }
    clearCart();
  }, [clearCart, sessionId, shouldClearCart]);

  useEffect(() => {
    if (!purchase || !sessionId) return;
    const key = `hillside-purchase-${sessionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    trackPurchase(
      purchase.invoiceNumber,
      purchase.items.map((item) => ({
        item_id: item.name,
        item_name: item.name,
        // Reported here too, so a sized line does not collapse into its
        // siblings on the one event that records the sale.
        ...(item.size ? { item_variant: item.size } : {}),
        price: item.unitCents / 100,
        quantity: item.quantity
      })),
      purchase.totalCents
    );
  }, [purchase, sessionId]);

  return (
    <div className="actions no-print" style={{ justifyContent: 'center' }}>
      <button className="btn" type="button" onClick={() => window.print()}>
        <Printer size={17} /> Print this confirmation
      </button>
      {invoiceUrl && (
        <a className="btn gold" href={invoiceUrl} target="_blank" rel="noreferrer">
          <FileText size={17} /> View Stripe invoice
        </a>
      )}
      {catalogEmpty ? (
        <Link className="btn outline" href="/care">
          Plant care library
        </Link>
      ) : (
        <Link className="btn outline" href="/shop">
          Continue shopping
        </Link>
      )}
    </div>
  );
}
