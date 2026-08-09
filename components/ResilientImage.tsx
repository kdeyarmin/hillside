'use client';

import { useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
};

const DEFAULT_FALLBACK = '/images/botanical-placeholder.svg';

export default function ResilientImage({
  src,
  fallbackSrc = DEFAULT_FALLBACK,
  alt,
  onError,
  onLoad,
  srcSet,
  ...props
}: ResilientImageProps) {
  const preferredSrc = typeof src === 'string' && src.trim() ? src : fallbackSrc;
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);

  useEffect(() => {
    setCurrentSrc(preferredSrc);
  }, [preferredSrc]);

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    onError?.(event);

    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
    }

    event.currentTarget.dataset.imageFailed = 'true';
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    delete event.currentTarget.dataset.imageFailed;
    onLoad?.(event);
  }

  const usingFallback = currentSrc === fallbackSrc;

  return (
    <img
      {...props}
      src={currentSrc}
      srcSet={usingFallback ? undefined : srcSet}
      alt={alt}
      draggable={props.draggable ?? false}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
