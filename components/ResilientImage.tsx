'use client';

import { useEffect, useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import { IMAGE_SIZES, imageSrcSet, type ImageSizeRole } from '@/lib/image-srcset';
import { resolveImageUrl } from '@/lib/store';

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
  /**
   * Which layout slot this image fills, which decides its `sizes`. Every call
   * site should set one: the responsive variants exist, but a browser with no
   * `sizes` assumes full viewport width and picks the largest candidate anyway.
   */
  sizeRole?: ImageSizeRole;
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
  sizeRole,
  ...props
}: ResilientImageProps) {
  const preferredSrc = useMemo(
    () => normalizeSource(typeof src === 'string' ? src : '', fallbackSrc),
    [fallbackSrc, src]
  );
  const [currentSrc, setCurrentSrc] = useState(preferredSrc);

  /**
   * Resolved here rather than at each call site, so every image on the site picks
   * up its responsive variants without twelve components having to remember. An
   * explicitly passed `srcSet` still wins, and anything without generated
   * variants — owner uploads from /media, remote URLs, the SVG placeholder —
   * resolves to undefined and renders exactly as it did before.
   */
  const resolvedSrcSet = srcSet ?? imageSrcSet(preferredSrc);
  const resolvedSizes = props.sizes ?? (sizeRole ? IMAGE_SIZES[sizeRole] : undefined);

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
      srcSet={usingFallback ? undefined : resolvedSrcSet}
      sizes={usingFallback ? undefined : resolvedSizes}
      alt={alt}
      draggable={props.draggable ?? false}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
