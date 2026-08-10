'use client';

import { useState } from 'react';
import BrandedProductVisual from '@/components/BrandedProductVisual';
import ResilientImage from '@/components/ResilientImage';

/**
 * Products carry a primary photo plus any number of extra angles. With a single
 * image this renders exactly what it always did, so nothing regresses for
 * products that have not been re-photographed yet.
 */
export default function ProductGallery({
  slug,
  name,
  type,
  imageUrl,
  images
}: {
  slug: string;
  name: string;
  type: string;
  imageUrl: string | null;
  images: string[];
}) {
  const all = [imageUrl, ...images].filter((source): source is string => Boolean(source?.trim()));
  const [active, setActive] = useState(0);

  if (all.length <= 1) {
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

  return (
    <div className="product-gallery">
      <ResilientImage
        className="product-detail-image"
        src={all[active]}
        fallbackSrc="/images/botanical-placeholder.svg"
        alt={`${name} — view ${active + 1} of ${all.length}`}
        width={1400}
        height={1288}
        loading="eager"
        decoding="async"
      />
      {/* A plain pressed-state group rather than ARIA tabs: tab semantics promise
          arrow-key navigation and an associated tabpanel that this control does
          not provide. */}
      <div className="product-gallery-thumbs" role="group" aria-label={`${name} photographs`}>
        {all.map((source, index) => (
          <button
            type="button"
            aria-pressed={index === active}
            aria-label={`Show photograph ${index + 1} of ${all.length}`}
            className={index === active ? 'active' : ''}
            onClick={() => setActive(index)}
            key={`${source}-${index}`}
          >
            <ResilientImage
              src={source}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt=""
              aria-hidden="true"
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
