'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { FileText, Printer } from 'lucide-react';
import { useCart } from '@/components/CartProvider';

export default function OrderSuccessClient({ invoiceUrl }: { invoiceUrl?: string | null }) {
  const { clearCart } = useCart();
  useEffect(() => clearCart(), [clearCart]);

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
      <Link className="btn outline" href="/shop">Continue shopping</Link>
    </div>
  );
}
