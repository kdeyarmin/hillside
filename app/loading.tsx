import { Leaf } from 'lucide-react';

export default function Loading() {
  return (
    <section className="content loading-shell" aria-busy="true" aria-label="Loading page">
      <div className="container">
        <div className="loading-card">
          <Leaf className="loading-leaf" aria-hidden="true" />
          <div className="eyebrow">The Hillside Gardens</div>
          <div className="loading-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="sr-only">Loading the page</span>
        </div>
      </div>
    </section>
  );
}
