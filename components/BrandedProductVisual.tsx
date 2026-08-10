'use client';

import BrandMockupScene, {
  type BrandMockupVariant,
  type HillsideCatalogImage
} from '@/components/BrandMockupScene';
import ResilientImage from '@/components/ResilientImage';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

type BrandedProductVisualProps = {
  slug: string;
  name: string;
  type: string;
  imageUrl?: string | null;
  className?: string;
  detail?: boolean;
  loading?: 'eager' | 'lazy';
};

function variantForType(type: string): BrandMockupVariant {
  if (type === 'PLANT') return 'plants';
  if (type === 'TEA' || type === 'TEA_SUPPLY') return 'tea';
  if (type === 'SOAP' || type === 'LOTION') return 'botanicals';
  return 'gifts';
}

/**
 * Products without an owner photograph fall back to catalog artwork. Matching on the
 * product name keeps a grid varied without ever putting, say, air plants on a monstera;
 * anything we cannot place confidently uses the generic artwork for its type.
 */
const artworkKeywords: Array<[HillsideCatalogImage, string[]]> = [
  ['carnivorous-plants', ['carnivor', 'flytrap', 'venus', 'pitcher plant', 'sarracenia', 'nepenthes']],
  ['air-plants', ['air plant', 'airplant', 'tillandsia']],
  ['succulents', ['succulent', 'echeveria', 'sedum', 'jade plant', 'aloe', 'cactus']],
  ['live-plant-planters', ['planter', 'arrangement', 'centerpiece', 'centrepiece', 'dish garden']],
  ['terrarium-supplies', ['terrarium', 'substrate', 'gravel', 'charcoal', 'potting mix', 'soil', 'gift set']],
  ['moss', ['moss']],
  ['driftwood', ['driftwood']],
  ['homemade-soaps', ['soap']],
  ['apothecary', ['tea', 'tisane', 'herbal', 'blend', 'lotion', 'salve', 'balm', 'tincture', 'essential oil']]
];

const artworkForType: Record<string, HillsideCatalogImage> = {
  PLANT: 'house-plants',
  TEA: 'apothecary',
  TEA_SUPPLY: 'apothecary',
  SOAP: 'homemade-soaps',
  LOTION: 'apothecary',
  OTHER: 'terrarium-supplies'
};

function catalogImageForProduct(slug: string, name: string, type: string): HillsideCatalogImage {
  const haystack = `${name} ${slug}`.toLowerCase();
  const matched = artworkKeywords.find(([, keywords]) =>
    keywords.some((keyword) => haystack.includes(keyword))
  );
  return matched?.[0] || artworkForType[type] || artworkForType.OTHER;
}

function isStarterOrPlaceholderImage(imageUrl?: string | null) {
  if (!imageUrl) return true;
  return (
    imageUrl.includes('images.unsplash.com') ||
    imageUrl.includes('/images/botanical-placeholder') ||
    imageUrl.includes('/images/catalog/') ||
    imageUrl.includes('/images/scenes/') ||
    imageUrl === FALLBACK_PRODUCT_IMAGE
  );
}

export default function BrandedProductVisual({
  slug,
  name,
  type,
  imageUrl,
  className = '',
  detail = false,
  loading = 'lazy'
}: BrandedProductVisualProps) {
  if (isStarterOrPlaceholderImage(imageUrl)) {
    return (
      <BrandMockupScene
        variant={variantForType(type)}
        catalogImage={catalogImageForProduct(slug, name, type)}
        badge={detail}
        backgroundSrc={imageUrl || undefined}
        alt={`${name}, illustrated in The Hillside Gardens house style`}
        className={`${detail ? 'branded-product-detail' : 'branded-product-card'} ${className}`.trim()}
      />
    );
  }

  return (
    <ResilientImage
      className={className}
      src={imageUrl}
      fallbackSrc="/images/botanical-placeholder.svg"
      alt={name}
      width={detail ? 1400 : 1200}
      height={detail ? 1400 : 1050}
      loading={loading}
      decoding="async"
      data-product-slug={slug}
    />
  );
}
