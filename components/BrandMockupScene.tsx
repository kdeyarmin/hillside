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

const defaults: Record<BrandMockupVariant, { src: string | null; alt: string }> = {
  hero: {
    src: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1800&q=90',
    alt: 'The Hillside Gardens tea, candle and plants arranged on a warm wooden table'
  },
  plants: {
    src: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1400&q=88',
    alt: 'Healthy houseplants with a branded Hillside plant-care card'
  },
  tea: {
    src: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1400&q=88',
    alt: 'A warm herbal tea ritual with a branded Hillside tea pouch'
  },
  botanicals: {
    src: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1400&q=88',
    alt: 'Amber botanical bottles and handmade goods labeled for The Hillside Gardens'
  },
  about: {
    src: 'https://images.unsplash.com/photo-1525498128493-380d1990a112?auto=format&fit=crop&w=1400&q=88',
    alt: 'A greenhouse scene with a branded Hillside Gardens story card'
  },
  class: {
    src: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1400&q=88',
    alt: 'Plants and planter supplies with a branded Hillside workshop guide'
  },
  care: {
    src: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1400&q=88',
    alt: 'Houseplants beside a branded Hillside plant-care guide'
  },
  shipping: {
    src: null,
    alt: 'A Hillside Gardens parcel, logo seal and packing card prepared with care'
  },
  gifts: {
    src: null,
    alt: 'A botanical gift wrapped with The Hillside Gardens logo and a handwritten-style card'
  },
  picks: {
    src: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1400&q=88',
    alt: 'Plant tools and supplies presented with a branded Tammy’s Picks card'
  }
};

function LogoLabel({ className = '' }: { className?: string }) {
  return (
    <span className={`mockup-logo-label ${className}`} aria-hidden="true">
      <img src="/logo.svg" alt="" />
    </span>
  );
}

function Pouch() {
  return (
    <span className="mockup-pouch" aria-hidden="true">
      <span className="mockup-pouch-seal" />
      <LogoLabel />
      <span className="mockup-pouch-window"><i /><i /><i /><i /><i /><i /><i /></span>
    </span>
  );
}

function Candle() {
  return (
    <span className="mockup-candle" aria-hidden="true">
      <span className="mockup-candle-flame" />
      <LogoLabel />
    </span>
  );
}

function Mug() {
  return <span className="mockup-mug" aria-hidden="true"><i /></span>;
}

function Booklet({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="mockup-booklet" aria-hidden="true">
      <span className="mockup-booklet-spine" />
      <img src="/logo.svg" alt="" />
      <b>{title}</b>
      <small>{subtitle}</small>
      <i />
    </span>
  );
}

function PlantTag() {
  return (
    <span className="mockup-plant-tag" aria-hidden="true">
      <img src="/logo.svg" alt="" />
    </span>
  );
}

function Bottle({ small = false }: { small?: boolean }) {
  return (
    <span className={`mockup-bottle${small ? ' small' : ''}`} aria-hidden="true">
      <span className="mockup-bottle-cap" />
      <LogoLabel />
    </span>
  );
}

function Soap() {
  return (
    <span className="mockup-soap" aria-hidden="true">
      <LogoLabel />
    </span>
  );
}

function BrandCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="mockup-brand-card" aria-hidden="true">
      <img src="/logo.svg" alt="" />
      <span><b>{title}</b><small>{subtitle}</small></span>
    </span>
  );
}

function Seal() {
  return (
    <span className="mockup-seal" aria-hidden="true">
      <img src="/logo.svg" alt="" />
    </span>
  );
}

function Package() {
  return (
    <span className="mockup-package" aria-hidden="true">
      <span className="mockup-package-ribbon horizontal" />
      <span className="mockup-package-ribbon vertical" />
      <Seal />
    </span>
  );
}

export default function BrandMockupScene({
  variant,
  className = '',
  backgroundSrc,
  alt
}: BrandMockupSceneProps) {
  const definition = defaults[variant];
  const source = backgroundSrc === undefined ? definition.src : backgroundSrc;

  return (
    <div
      className={`brand-mockup-scene brand-mockup-${variant} ${className}`.trim()}
      role="img"
      aria-label={alt || definition.alt}
    >
      {source && (
        <ResilientImage
          className="brand-mockup-background"
          src={source}
          fallbackSrc="/images/botanical-placeholder.svg"
          alt=""
          aria-hidden="true"
          width={1400}
          height={1000}
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
      <span className="brand-mockup-wash" aria-hidden="true" />

      {variant === 'hero' && <><Pouch /><Candle /><Mug /></>}
      {variant === 'plants' && <><Booklet title="PLANT CARE CARD" subtitle="Tammy’s quick guide" /><PlantTag /></>}
      {variant === 'tea' && <><Pouch /><BrandCard title="SLOW BOTANICAL RITUAL" subtitle="Loose-leaf tea" /></>}
      {variant === 'botanicals' && <><Bottle /><Bottle small /><Soap /></>}
      {variant === 'about' && <><Pouch /><BrandCard title="ROOTED IN CARE" subtitle="The Hillside story" /></>}
      {variant === 'class' && <><Booklet title="PLANTER WORKSHOP" subtitle="Hands-on with Tammy" /><BrandCard title="YOUR CLASS KIT" subtitle="Plants • Soil • Guidance" /></>}
      {variant === 'care' && <><Booklet title="HOUSEPLANT CARE" subtitle="Light • Water • Soil" /><BrandCard title="CARE WITH CONFIDENCE" subtitle="Simple practical guidance" /></>}
      {variant === 'shipping' && <><Package /><BrandCard title="PACKED WITH CARE" subtitle="Secure thoughtful fulfillment" /></>}
      {variant === 'gifts' && <><Package /><BrandCard title="A GIFT FROM THE GARDEN" subtitle="Packed by Tammy" /></>}
      {variant === 'picks' && <><Booklet title="TAMMY’S PICKS" subtitle="Useful tools she recommends" /><PlantTag /></>}
    </div>
  );
}
