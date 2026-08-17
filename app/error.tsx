'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Hillside page error', error);
  }, [error]);

  return (
    <section className="content error-shell">
      <div className="container">
        <div className="error-card" role="alert">
          <AlertTriangle size={44} aria-hidden="true" />
          <div className="eyebrow">Something needs a little care</div>
          <h1>We couldn’t finish loading this page.</h1>
          <p>
            Your cart and information are still safe. Try loading the page again, or return home.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={reset}>
              <RefreshCw size={17} /> Try again
            </button>
            <Link className="btn outline" href="/">
              Return home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
