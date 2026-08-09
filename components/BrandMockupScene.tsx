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
  'house-plants': 'House plants styled with The Hillside Gardens branded plant tags',
  'carnivorous-plants':
    'Carnivorous plants including pitcher plants, sundews and Venus flytraps with Hillside Gardens branding',
  'live-plant-planters':
    'Finished live plant planters arranged in warm natural light with Hillside Gardens tags',
  'homemade-soaps':
    'Handmade botanical soaps displayed in The Hillside Gardens branded packaging',
  moss: 'Preserved and decorative moss products arranged with The Hillside Gardens packaging',
  succulents:
    'A curated collection of succulents in neutral planters with Hillside Gardens branding',
  driftwood:
    'Natural driftwood and botanical display materials styled for The Hillside Gardens',
  apothecary:
    'Hillside Gardens apothecary goods, herbal blends, jars and botanical products',
  'air-plants':
    'Air plants displayed on driftwood and in decorative holders with Hillside Gardens branding',
  'terrarium-supplies':
    'Terrarium supplies, moss, soil, stones and a planted glass terrarium from The Hillside Gardens'
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
