import Link from 'next/link';
import { Leaf } from 'lucide-react';

export default function NotFound() {
  return (
    <section className="content">
      <div className="container empty-state" style={{ minHeight: 520, display: 'grid', placeContent: 'center' }}>
        <Leaf size={46} />
        <div className="eyebrow">Page not found</div>
        <h1 className="display-title" style={{ color: 'var(--forest)', fontSize: 58, margin: '5px 0' }}>
          This path didn’t take root.
        </h1>
        <p>The page may have moved, or the item may no longer be available.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/">Return home</Link>
          <Link className="btn outline" href="/shop">Browse the shop</Link>
        </div>
      </div>
    </section>
  );
}
