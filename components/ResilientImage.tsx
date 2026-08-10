'use client';

import { useEffect, useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import { resolveImageUrl } from '@/lib/store';

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
};

const DEFAULT_FALLBACK = '/images/botanical-placeholder.svg';

function normalizeSource(source: string, fallbackSrc: string) {
  const trimmed = source.trim();
  if (!trimmed) return fallbackSrc;
  return resolveImageUrl(trimmed);
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
