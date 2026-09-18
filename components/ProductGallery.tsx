'use client';

import { useCallback, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import PhotoLightbox from '@/components/PhotoLightbox';
import ResilientImage from '@/components/ResilientImage';
import { needsRealPhoto, type ProductPhoto } from '@/lib/product-photos';

/**
 * Products carry a primary photo plus any number of named views — in a home, a
 * detail, something for scale, the packaging — and then whatever extra angles
 * were uploaded. With a single image this renders exactly what it always did, so
 * nothing regresses for products that have not been re-photographed yet.
 *
 * The views are named rather than numbered because "Size" and "Packaging" are
 * the two thumbnails a shopper is actually hunting for, and "photograph 4 of 6"
 * makes them hunt.
 *
 * Any real photograph opens full-size on a tap, and zooms from there — the one
 * thing shoppers kept trying to do to a picture that would not grow. The
 * catalogue artwork that stands in for a photograph nobody has taken yet does
 * not: there is nothing in it to look at more closely.
 */
export default function ProductGallery({
  slug,
  name,
  type,
  imageUrl,
  photos
}: {
  slug: string;
  name: string;
  type: string;
  imageUrl: string | null;
  photos: ProductPhoto[];
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  /** Whatever opened the lightbox, so closing it puts focus back there. */
  const triggerRef = useRef<HTMLElement | null>(null);

  const openLightbox = (trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpen(true);
  };
  const closeLightbox = useCallback(() => {
    setOpen(false);
    if (triggerRef.current?.isConnected) triggerRef.current.focus();
  }, []);

  const single = photos.length <= 1;
  if (single && (photos.length === 0 || needsRealPhoto(photos[0].src))) {
    return (
      <BrandedProductVisual
        slug={slug}
        name={name}
        type={type}
        imageUrl={imageUrl}
        className="product-detail-image"
        detail
        loading="eager"
      />
    );
  }

  /**
   * Resolved below the early return, where the list is known to hold something.
   * `Math.min` keeps the index inside the list when a product loses a photograph
   * between renders and `active` is left pointing past the end.
   */
  const index = Math.min(active, photos.length - 1);
  const current = photos[index];

  return (
    <div className="product-gallery">
      <div className="product-gallery-stage">
        {single ? (
          <BrandedProductVisual
            slug={slug}
            name={name}
            type={type}
            imageUrl={imageUrl}
            className="product-detail-image"
            detail
            loading="eager"
          />
        ) : (
          <>
            <ResilientImage
              className="product-detail-image"
              src={current.src}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={`${name} — ${current.caption.toLowerCase()}`}
              width={1400}
              height={1288}
              loading="eager"
              decoding="async"
            />
            <span className="product-gallery-caption" aria-hidden="true">
              {current.caption}
            </span>
          </>
        )}
        {/* Laid over the photograph rather than wrapped around it, so the
            image keeps the exact layout the pinned column depends on. */}
        <button
          className="product-gallery-zoom"
          type="button"
          onClick={(event) => openLightbox(event.currentTarget)}
          aria-label={
            single ? 'Enlarge the photograph' : `Enlarge the photograph: ${current.caption}`
          }
        >
          <span aria-hidden="true">
            <ZoomIn size={14} /> Zoom
          </span>
        </button>
      </div>
      {!single && (
        /* A plain pressed-state group rather than ARIA tabs: tab semantics
           promise arrow-key navigation and an associated tabpanel that this
           control does not provide. */
        <div className="product-gallery-thumbs" role="group" aria-label={`${name} photographs`}>
          {photos.map((photo, thumbIndex) => (
            <button
              type="button"
              aria-pressed={thumbIndex === index}
              aria-label={`Show ${photo.caption.toLowerCase()} — photograph ${thumbIndex + 1} of ${photos.length}`}
              className={thumbIndex === index ? 'active' : ''}
              onClick={() => setActive(thumbIndex)}
              key={`${photo.src}-${thumbIndex}`}
            >
              <ResilientImage
                sizeRole="thumb"
                src={photo.src}
                fallbackSrc="/images/botanical-placeholder.svg"
                alt=""
                aria-hidden="true"
                width={160}
                height={160}
                loading="lazy"
                decoding="async"
              />
              <span aria-hidden="true">{photo.caption}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <PhotoLightbox
          photos={photos}
          name={name}
          index={index}
          onChange={setActive}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
