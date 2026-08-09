'use client';

import { useState } from 'react';
import { X, ZoomIn } from 'lucide-react';

type GalleryItem = {
  id: string;
  title: string;
  imageUrl: string;
  caption: string | null;
};

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  return (
    <>
      <div className="grid">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <button
              type="button"
              onClick={() => setSelected(item)}
              style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in', position: 'relative' }}
              aria-label={`Enlarge ${item.title}`}
            >
              <img className="photo" src={item.imageUrl} alt={item.title} />
              <span className="product-badge" style={{ left: 'auto', right: 14 }}><ZoomIn size={13} /> View</span>
            </button>
            <div className="cardbody">
              <span className="pill">Hillside arrangement</span>
              <h3>{item.title}</h3>
              {item.caption && <p>{item.caption}</p>}
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={selected.title}>
          <button className="drawer-backdrop" type="button" onClick={() => setSelected(null)} aria-label="Close image" />
          <div style={{ position: 'absolute', inset: 20, maxWidth: 1000, maxHeight: 'calc(100% - 40px)', margin: 'auto', alignSelf: 'center', background: 'white', borderRadius: 22, overflow: 'auto', boxShadow: 'var(--shadow)' }}>
            <button className="icon-button" type="button" onClick={() => setSelected(null)} aria-label="Close image" style={{ position: 'absolute', top: 14, right: 14, zIndex: 3 }}><X /></button>
            <img src={selected.imageUrl} alt={selected.title} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', background: 'var(--cream)' }} />
            <div className="cardbody"><div className="eyebrow">The Hillside Gardens</div><h2 className="display-title" style={{ color: 'var(--forest)', fontSize: 36, margin: '5px 0' }}>{selected.title}</h2>{selected.caption && <p>{selected.caption}</p>}</div>
          </div>
        </div>
      )}
    </>
  );
}
