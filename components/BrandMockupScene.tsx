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
    src: '/images/brand/hillside-hero-products.webp',
    alt: 'The Hillside Gardens tea, candle, mug and potted plants arranged on a warm wooden table'
  },
  plants: {
    src: '/images/brand/plant-care-display.webp',
    alt: 'Healthy houseplants displayed with an elegant Hillside Gardens plant-care guide and branded plant tag'
  },
  tea: {
    src: '/images/brand/tea-still-life.webp',
    alt: 'The Hillside Gardens loose-leaf tea pouch beside a glass cup, lavender and dried botanicals'
  },
  botanicals: {
    src: '/images/brand/botanical-spa.webp',
    alt: 'The Hillside Gardens botanical body wash, facial oil, soap and candle in a professional lifestyle photograph'
  },
  about: {
    src: '/images/brand/plant-care-display.webp',
    alt: 'Potted houseplants with The Hillside Gardens plant-care guide in a warm natural-light setting'
  },
  class: {
    src: '/images/brand/gardening-workspace.webp',
    alt: 'A professional planter-workshop scene with potted plants, tools and The Hillside Gardens care guide'
  },
  care: {
    src: '/images/brand/gardening-workspace.webp',
    alt: 'Plants, gardening tools and The Hillside Gardens Rooted in Care plant-care guide on a wooden worktable'
  },
  shipping: {
    src: '/images/brand/hillside-hero-products.webp',
    alt: 'The Hillside Gardens products prepared in a polished botanical lifestyle setting'
  },
  gifts: {
    src: '/images/brand/botanical-spa.webp',
    alt: 'A refined collection of Hillside Gardens botanical products suitable for thoughtful gifting'
  },
  picks: {
    src: '/images/brand/gardening-workspace.webp',
    alt: 'Tammy’s plant tools and care essentials presented in a professional Hillside Gardens workspace'
  }
};

function isOwnerProvidedPhoto(source?: string | null) {
  if (!source?.trim()) return false;

  const normalized = source.toLowerCase();
  return !(
    normalized.includes('images.unsplash.com') ||
    normalized.includes('source.unsplash.com') ||
    normalized.includes('/images/botanical-placeholder') ||
    normalized.includes('botanical-placeholder.svg')
  );
}

export default function BrandMockupScene({
  variant,
  className = '',
  backgroundSrc,
  alt
}: BrandMockupSceneProps) {
  const approvedPhoto = approvedPhotos[variant];
  const source = isOwnerProvidedPhoto(backgroundSrc) ? backgroundSrc! : approvedPhoto.src;

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={alt || approvedPhoto.alt}
    >
      <ResilientImage
        className="brand-mockup-background"
        src={source}
        fallbackSrc={approvedPhoto.src}
        alt=""
        aria-hidden="true"
        width={1600}
        height={1200}
        loading={variant === 'hero' ? 'eager' : 'lazy'}
        decoding="async"
      />
      <span className="brand-mockup-wash" aria-hidden="true" />
    </div>
  );
}
