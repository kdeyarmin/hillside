'use client';

import { Printer } from 'lucide-react';

export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button className="btn no-print" type="button" onClick={() => window.print()}>
      <Printer size={17} /> {label}
    </button>
  );
}
