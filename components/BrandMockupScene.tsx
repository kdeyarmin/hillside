'use client';

import ResilientImage from '@/components/ResilientImage';

export type BrandMockupVariant =
  | 'hero'
  | 'plants'
  | 'tea'
  | 'botanicals'
  | 'about'
  | 'class'
  | 'care'
  | 'shipping'
  | 'gifts'
  | 'picks';

type BrandMockupSceneProps = {
  variant: BrandMockupVariant;
  className?: string;
  backgroundSrc?: string | null;
  alt?: string;
};

type ApprovedPhoto = {
  src: string;
  alt: string;
};

const approvedPhotos: Record<BrandMockupVariant, ApprovedPhoto> = {
  hero: {
    src: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1800&q=90',
    alt: 'A warm botanical lifestyle scene with healthy potted plants and natural home accents'
  },
  plants: {
    src: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1500&q=88',
    alt: 'Healthy green houseplants photographed in soft natural light'
  },
  tea: {
    src: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1500&q=88',
    alt: 'A refined herbal tea ritual photographed with warm light and botanical details'
  },
  botanicals: {
    src: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1500&q=88',
    alt: 'Professional botanical skin-care and wellness products in a clean lifestyle photograph'
  },
  about: {
    src: 'https://images.unsplash.com/photo-1525498128493-380d1990a112?auto=format&fit=crop&w=1500&q=88',
    alt: 'A bright greenhouse filled with healthy plants'
  },
  class: {
    src: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1500&q=88',
    alt: 'Plants and gardening materials ready for a hands-on planter workshop'
  },
  care: {
    src: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1500&q=88',
    alt: 'A professional plant-care workspace with healthy plants and gardening supplies'
  },
  shipping: {
    src: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1800&q=88',
    alt: 'Hillside-style botanical goods presented carefully in a warm home setting'
  },
  gifts: {
    src: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1500&q=88',
    alt: 'A refined collection of botanical self-care goods suitable for thoughtful gifting'
  },
  picks: {
    src: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1500&q=88',
    alt: 'Useful plant tools and gardening supplies selected for everyday plant care'
  }
};

const responsiveWidths = [480, 720, 960, 1200, 1500, 1800];

function isOwnerProvidedPhoto(source?: string | null) {
  if (!source?.trim()) return false;

  const normalized = source.toLowerCase();
  return !(
    normalized.includes('images.unsplash.com') ||
    normalized.includes('source.unsplash.com') ||
    normalized.includes('/images/botanical-placeholder') ||
    normalized.includes('botanical-placeholder.svg') ||
    normalized.includes('/images/brand/')
  );
}

function buildUnsplashSrcSet(source: string) {
  try {
    const parsed = new URL(source);
    if (parsed.hostname !== 'images.unsplash.com') return undefined;

    return responsiveWidths
      .map((width) => {
        const candidate = new URL(parsed);
        candidate.searchParams.set('auto', 'format');
        candidate.searchParams.set('fit', 'crop');
        candidate.searchParams.set('w', String(width));
        candidate.searchParams.set('q', width <= 720 ? '78' : '86');
        return `${candidate.toString()} ${width}w`;
      })
      .join(', ');
  } catch {
    return undefined;
  }
}

function responsiveSizes(variant: BrandMockupVariant) {
  if (variant === 'hero') return '(max-width: 900px) 100vw, 57vw';
  if (variant === 'plants' || variant === 'tea' || variant === 'botanicals' || variant === 'gifts') {
    return '(max-width: 620px) calc(100vw - 24px), (max-width: 1060px) 50vw, 33vw';
  }
  return '(max-width: 900px) calc(100vw - 32px), 50vw';
}

export default function BrandMockupScene({
  variant,
  className = '',
  backgroundSrc,
  alt
}: BrandMockupSceneProps) {
  const approvedPhoto = approvedPhotos[variant];
  const ownerProvided = isOwnerProvidedPhoto(backgroundSrc);
  const source = ownerProvided ? backgroundSrc! : approvedPhoto.src;
  const srcSet = ownerProvided ? undefined : buildUnsplashSrcSet(source);

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={alt || approvedPhoto.alt}
    >
      <ResilientImage
        className="brand-mockup-background"
        src={source}
        srcSet={srcSet}
        sizes={srcSet ? responsiveSizes(variant) : undefined}
        fallbackSrc="/images/botanical-placeholder.svg"
        alt=""
        aria-hidden="true"
        width={1600}
        height={1200}
        loading={variant === 'hero' ? 'eager' : 'lazy'}
        fetchPriority={variant === 'hero' ? 'high' : 'auto'}
        decoding="async"
      />
      <span className="brand-mockup-wash" aria-hidden="true" />
      {!ownerProvided && (
        <span className="brand-photo-badge" aria-hidden="true">
          <img src="/logo.svg" alt="" width="720" height="658" loading="lazy" />
        </span>
      )}
    </div>
  );
}
