'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';

type GalleryItem = {
  id: string;
  title: string;
  imageUrl: string;
  caption: string | null;
};

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selected) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const timer = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelected(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [selected]);

  const openItem = (item: GalleryItem, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setSelected(item);
  };

  return (
    <>
      <div className="grid">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <button
              type="button"
              onClick={(event) => openItem(item, event.currentTarget)}
              style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in', position: 'relative' }}
              aria-label={`Enlarge ${item.title}`}
            >
              <ResilientImage
                className="photo"
                src={item.imageUrl}
                fallbackSrc="/images/botanical-placeholder.svg"
                alt={item.title}
                width={1000}
                height={750}
                loading="lazy"
                decoding="async"
              />
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
        <div className="drawer-layer">
          <button
            className="drawer-backdrop"
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close image"
            tabIndex={-1}
          />
          <div
            className="gallery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-dialog-title"
            style={{
              position: 'absolute',
              inset: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
              width: 'min(1000px, calc(100% - 24px))',
              maxWidth: '1000px',
              maxHeight: 'calc(100dvh - 24px)',
              margin: 'auto',
              alignSelf: 'center',
              background: 'white',
              borderRadius: 18,
              overflow: 'auto',
              overscrollBehavior: 'contain',
              boxShadow: 'var(--shadow)'
            }}
          >
            <button
              className="icon-button"
              ref={closeButtonRef}
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close image"
              style={{ position: 'absolute', top: 14, right: 14, zIndex: 3 }}
            >
              <X />
            </button>
            <ResilientImage
              src={selected.imageUrl}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={selected.title}
              width={1400}
              height={1050}
              loading="eager"
              decoding="async"
              style={{ width: '100%', maxHeight: '75dvh', objectFit: 'contain', background: 'var(--cream)' }}
            />
            <div className="cardbody">
              <div className="eyebrow">The Hillside Gardens</div>
              <h2 id="gallery-dialog-title" className="display-title" style={{ color: 'var(--forest)', fontSize: 36, margin: '5px 0' }}>
                {selected.title}
              </h2>
              {selected.caption && <p>{selected.caption}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
