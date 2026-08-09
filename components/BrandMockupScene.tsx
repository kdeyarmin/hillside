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

export type HillsideCatalogImage =
  | 'house-plants'
  | 'carnivorous-plants'
  | 'live-plant-planters'
  | 'homemade-soaps'
  | 'moss'
  | 'succulents'
  | 'driftwood'
  | 'apothecary'
  | 'air-plants'
  | 'terrarium-supplies';

type BrandMockupSceneProps = {
  variant: BrandMockupVariant;
  className?: string;
  backgroundSrc?: string | null;
  alt?: string;
  catalogImage?: HillsideCatalogImage;
};

const defaultCatalogImage: Record<BrandMockupVariant, HillsideCatalogImage> = {
  hero: 'house-plants',
  plants: 'house-plants',
  tea: 'apothecary',
  botanicals: 'homemade-soaps',
  about: 'live-plant-planters',
  class: 'live-plant-planters',
  care: 'terrarium-supplies',
  shipping: 'moss',
  gifts: 'apothecary',
  picks: 'air-plants'
};

const catalogAlt: Record<HillsideCatalogImage, string> = {
  'house-plants': 'Illustration representing the house plants category',
  'carnivorous-plants': 'Illustration representing the carnivorous plants category',
  'live-plant-planters': 'Illustration representing the live plant planters category',
  'homemade-soaps': 'Illustration representing the homemade soaps category',
  moss: 'Illustration representing the moss category',
  succulents: 'Illustration representing the succulents category',
  driftwood: 'Illustration representing the driftwood category',
  apothecary: 'Illustration representing the apothecary category',
  'air-plants': 'Illustration representing the air plants category',
  'terrarium-supplies': 'Illustration representing the terrarium supplies category'
};

/** Catalog image paths — individual files under public/images/catalog/. */
const catalogSrc: Record<HillsideCatalogImage, string> = {
  'house-plants': '/images/catalog/house-plants.svg',
  'carnivorous-plants': '/images/catalog/carnivorous-plants.svg',
  'live-plant-planters': '/images/catalog/live-plant-planters.svg',
  'homemade-soaps': '/images/catalog/homemade-soaps.svg',
  moss: '/images/catalog/moss.svg',
  succulents: '/images/catalog/succulents.svg',
  driftwood: '/images/catalog/driftwood.svg',
  apothecary: '/images/catalog/apothecary.svg',
  'air-plants': '/images/catalog/air-plants.svg',
  'terrarium-supplies': '/images/catalog/terrarium-supplies.svg'
};

function isOwnerProvidedPhoto(source?: string | null) {
  if (!source?.trim()) return false;

  const normalized = source.toLowerCase();
  return !(
    normalized.includes('images.unsplash.com') ||
    normalized.includes('source.unsplash.com') ||
    normalized.includes('/images/botanical-placeholder') ||
    normalized.includes('botanical-placeholder.svg') ||
    normalized.includes('/images/brand/') ||
    normalized.includes('/images/catalog/')
  );
}

export default function BrandMockupScene({
  variant,
  className = '',
  backgroundSrc,
  alt,
  catalogImage
}: BrandMockupSceneProps) {
  const ownerProvided = isOwnerProvidedPhoto(backgroundSrc);
  const selectedCatalogImage = catalogImage || defaultCatalogImage[variant];
  const imageSrc = ownerProvided ? backgroundSrc! : catalogSrc[selectedCatalogImage];
  const imageAlt = alt || catalogAlt[selectedCatalogImage];

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={imageAlt}
    >
      <ResilientImage
        className="brand-mockup-background"
        src={imageSrc}
        fallbackSrc="/images/botanical-placeholder.svg"
        alt=""
        aria-hidden="true"
        width={800}
        height={600}
        loading={variant === 'hero' ? 'eager' : 'lazy'}
        fetchPriority={variant === 'hero' ? 'high' : 'auto'}
        decoding="async"
      />
      <span className="brand-mockup-wash" aria-hidden="true" />
    </div>
  );
}
