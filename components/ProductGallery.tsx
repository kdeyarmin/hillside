'use client';

import { useState } from 'react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import ResilientImage from '@/components/ResilientImage';
import type { ProductPhoto } from '@/lib/product-photos';

/**
 * Products carry a primary photo plus any number of named views — in a home, a
 * detail, something for scale, the packaging — and then whatever extra angles
 * were uploaded. With a single image this renders exactly what it always did, so
 * nothing regresses for products that have not been re-photographed yet.
 *
 * The views are named rather than numbered because "Size" and "Packaging" are
 * the two thumbnails a shopper is actually hunting for, and "photograph 4 of 6"
 * makes them hunt. Beyond that this stays a picture and a row of thumbnails: no
 * lightbox, no zoom, no carousel timer.
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

  if (photos.length <= 1) {
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
  const current = photos[Math.min(active, photos.length - 1)];

  return (
    <div className="product-gallery">
      <div className="product-gallery-stage">
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
      </div>
      {/* A plain pressed-state group rather than ARIA tabs: tab semantics promise
          arrow-key navigation and an associated tabpanel that this control does
          not provide. */}
      <div className="product-gallery-thumbs" role="group" aria-label={`${name} photographs`}>
        {photos.map((photo, index) => (
          <button
            type="button"
            aria-pressed={index === active}
            aria-label={`Show ${photo.caption.toLowerCase()} — photograph ${index + 1} of ${photos.length}`}
            className={index === active ? 'active' : ''}
            onClick={() => setActive(index)}
            key={`${photo.src}-${index}`}
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
    </div>
  );
}
