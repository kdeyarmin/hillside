'use client';

import { useEffect, useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
};

const DEFAULT_FALLBACK = '/images/botanical-placeholder.svg';

const LEGACY_IMAGE_REPLACEMENTS: Array<[string, string]> = [
  [
    'photo-1614594575810-51b862c2d7b6',
    '/images/catalog/house-plants.webp'
  ],
  [
    'photo-1593691509543-c55fb32e5cee',
    '/images/catalog/house-plants.webp'
  ],
  [
    'photo-1593482892290-f54927ae2bb0',
    '/images/catalog/live-plant-planters.webp'
  ],
  [
    'photo-1509423350716-97f2360af8e4',
    '/images/scenes/potting-bench.webp'
  ]
];

function normalizeSource(source: string, fallbackSrc: string) {
  const trimmed = source.trim();
  if (!trimmed) return fallbackSrc;

  const replacement = LEGACY_IMAGE_REPLACEMENTS.find(([legacyId]) => trimmed.includes(legacyId));
  return replacement?.[1] || trimmed;
}

export default function ResilientImage({
  src,
  fallbackSrc = DEFAULT_FALLBACK,
  alt,
  onError,
  onLoad,
  srcSet,
  ...props
}: ResilientImageProps) {
  const preferredSrc = useMemo(
    () => normalizeSource(typeof src === 'string' ? src : '', fallbackSrc),
    [fallbackSrc, src]
  );
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);

  useEffect(() => {
    setCurrentSrc(preferredSrc);
  }, [preferredSrc]);

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    onError?.(event);
    const image = event.currentTarget;

    if (image.dataset.fallbackApplied !== 'true') {
      image.dataset.fallbackApplied = 'true';
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.src = fallbackSrc;
      setCurrentSrc(fallbackSrc);
      return;
    }

    image.dataset.imageFailed = 'true';
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    delete image.dataset.imageFailed;
    if (currentSrc !== fallbackSrc) delete image.dataset.fallbackApplied;
    onLoad?.(event);
  }

  const usingFallback = currentSrc === fallbackSrc;

  return (
    <img
      {...props}
      src={currentSrc}
      srcSet={usingFallback ? undefined : srcSet}
      sizes={usingFallback ? undefined : props.sizes}
      alt={alt}
      draggable={props.draggable ?? false}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
