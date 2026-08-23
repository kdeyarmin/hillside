import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package, Sprout, Truck } from 'lucide-react';
import AddBundleButton from '@/components/AddBundleButton';
import BundleCard from '@/components/BundleCard';
import ResilientImage from '@/components/ResilientImage';
import { bundleAvailability, bundleStockNote } from '@/lib/bundles';
import { bundleCardData, bundleSaleInclude, sellableBundles } from '@/lib/bundle-queries';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { fulfillmentBlurb } from '@/lib/fulfillment';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import {
  absoluteUrl,
  formatMoney,
  freeShippingThresholdCents,
  priceValidUntil,
  resolveImageUrl
} from '@/lib/store';

export const dynamic = 'force-dynamic';

async function loadBundle(slug: string) {
  return db.bundle.findFirst({ where: { slug }, include: bundleSaleInclude });
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await loadBundle(slug);
  if (!bundle) return { title: 'Set not found' };
  const listed = bundle.active && bundleAvailability(bundle).sets > 0;
  return pageMetadata({
    path: `/bundles/${bundle.slug}`,
    title: bundle.title,
    description: bundle.tagline || bundle.description,
    image: resolveImageUrl(bundle.imageUrl),
    imageAlt: bundle.title,
    /**
     * A set that cannot be built is not a page worth indexing: it is a shell
     * whose contents are all on their own pages already, and it may come back
     * tomorrow when its last component is repotted.
     */
    noindex: !listed
  });
}

export default async function BundlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await loadBundle(slug);
  if (!bundle || !bundle.active) notFound();

  const card = bundleCardData(bundle);
  const availability = bundleAvailability(bundle);
  const soldOut = availability.sets <= 0;
  const threshold = freeShippingThresholdCents();

  /**
   * The care guides for the plants in this set. A kit is where a customer most
   * needs them — they have just taken on several living things at once — and
   * the guides are already written.
   */
  const [careGuides, otherSets] = await Promise.all([
    db.careSheet.findMany({
      where: {
        published: true,
        OR: [
          { productId: { in: bundle.items.map((item) => item.product.id) } },
          { products: { some: { productId: { in: bundle.items.map((item) => item.product.id) } } } }
        ]
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 4
    }),
    sellableBundles({ take: 4 })
  ]);
  const alsoSets = otherSets.filter((other) => other.slug !== bundle.slug).slice(0, 3);

  const bundleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: bundle.title,
    description: bundle.tagline || bundle.description,
    image: [bundle.imageUrl, ...bundle.galleryImages]
      .filter(Boolean)
      .map((source) => absoluteUrl(resolveImageUrl(source)))
      .slice(0, 6),
    brand: { '@type': 'Brand', name: 'The Hillside Gardens' },
    /**
     * `isRelatedTo` rather than `isAccessoryOrSparePartFor`: the components are
     * what the box contains, and each is a product of its own with its own page.
     */
    isRelatedTo: bundle.items.map((item) => ({
      '@type': 'Product',
      name: item.product.name,
      url: absoluteUrl(`/shop/${item.product.slug}`)
    })),
    offers: {
      '@type': 'Offer',
      price: (bundle.priceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      url: absoluteUrl(`/bundles/${bundle.slug}`),
      priceValidUntil: priceValidUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@id': absoluteUrl('/#business') }
    }
  };

  return (
    <section className="content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(bundleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Sets & kits', path: '/bundles' },
              { name: bundle.title, path: `/bundles/${bundle.slug}` }
            ])
          )
        }}
      />
      <div className="container">
        <div className="breadcrumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/bundles">Sets &amp; kits</Link>
          <span>/</span>
          <span>{bundle.title}</span>
        </div>

        <div className="product-detail">
          <div className="product-detail-image-wrap">
            <ResilientImage
              className="product-detail-image"
              sizeRole="detail"
              src={resolveImageUrl(bundle.imageUrl)}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={bundle.title}
              width={1200}
              height={1100}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow">
              <Package size={14} aria-hidden="true" /> Set
            </div>
            <div className="product-detail-badges">
              {card.savingsNote && <span className="pill sale">{card.savingsNote}</span>}
              {bundle.badge && <span className="pill">{bundle.badge}</span>}
            </div>
            <h1>{bundle.title}</h1>
            {bundle.tagline && <p className="lead">{bundle.tagline}</p>}
            <p>{bundle.description}</p>

            <p className="product-detail-price">
              {formatMoney(bundle.priceCents)}
              {card.savingsCents > 0 && (
                <span className="compare-price">
                  <span className="sr-only">Bought separately </span>
                  {formatMoney(card.valueCents)}
                </span>
              )}
            </p>
            <p className={`stock ${soldOut ? 'out' : availability.sets <= 3 ? 'low' : ''}`}>
              {bundleStockNote(availability.sets)}
            </p>

            {threshold > 0 && card.ships && (
              <p className="shipping-nudge">
                <Truck size={17} aria-hidden="true" />
                {bundle.priceCents >= threshold
                  ? 'This set alone qualifies for free standard shipping on a shipped order.'
                  : `Free standard shipping on orders over ${formatMoney(threshold)}.`}
              </p>
            )}

            <div className="product-detail-notes">
              <div className="note-box">
                <b>How the count works</b>
                We do not keep a separate shelf for sets. Every piece in this box is the same stock
                sold on its own page, so this kit is only ever listed while all of it is genuinely
                here.
              </div>
              <div className="note-box">
                <b>How it gets home</b>
                {fulfillmentBlurb({ ships: card.ships, pickup: card.pickup })}
              </div>
            </div>

            {soldOut ? (
              <div className="actions">
                <Link
                  className="btn"
                  href={contactHref({
                    subject: 'Availability or restock',
                    message: `Is the ${bundle.title} coming back?`
                  })}
                >
                  Ask when it is back
                </Link>
                <Link className="btn outline" href="/bundles">
                  See the sets that are ready
                </Link>
              </div>
            ) : (
              <AddBundleButton bundle={card} />
            )}
          </div>
        </div>

        <div className="product-details-section">
          <div className="sectionhead">
            <div className="eyebrow">What is in the box</div>
            <h2>
              {bundle.items.length} {bundle.items.length === 1 ? 'piece' : 'pieces'}, each one
              something we sell on its own.
            </h2>
            <p>
              Every line links to its own page, with its full description, photographs and reviews.
            </p>
          </div>
          <ul className="bundle-manifest">
            {bundle.items.map((item) => (
              <li className="bundle-manifest-item" key={item.id}>
                <Link href={`/shop/${item.product.slug}`}>
                  <ResilientImage
                    sizeRole="thumb"
                    src={resolveImageUrl(item.product.imageUrl)}
                    fallbackSrc="/images/botanical-placeholder.svg"
                    alt={item.product.name}
                    width={92}
                    height={92}
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
                <div>
                  <b>
                    <Link href={`/shop/${item.product.slug}`}>{item.product.name}</Link>
                  </b>
                  <span className="bundle-variant">
                    {item.size ? `${item.size} · ` : ''}
                    {item.quantity > 1 ? `${item.quantity} included` : '1 included'}
                    {item.optional ? ' · while supplies last' : ''}
                  </span>
                  {item.note && <p>{item.note}</p>}
                  {item.product.shortDescription && !item.note && (
                    <p>{item.product.shortDescription}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {card.savingsCents > 0 && (
            <p className="bundle-value-note">
              Bought one at a time these come to {formatMoney(card.valueCents)}. Together they are{' '}
              {formatMoney(bundle.priceCents)}.
            </p>
          )}
        </div>

        {careGuides.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">
                <Sprout size={14} aria-hidden="true" /> Keep it thriving
              </div>
              <h2>The care that goes with this set.</h2>
              <p>Written for these exact plants, and free to read or print before you order.</p>
            </div>
            <div className="care-related-grid">
              {careGuides.map((sheet) => (
                <article className="care-related-card" key={sheet.id}>
                  <span>{sheet.category || 'Plant care'}</span>
                  <h3>
                    <Link href={`/care/${sheet.slug}`}>{sheet.plantName}</Link>
                  </h3>
                  <p>{sheet.summary}</p>
                  <Link className="text-link" href={`/care/${sheet.slug}`}>
                    Read the guide →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        )}

        {alsoSets.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">More sets</div>
              <h2>Other kits ready to go.</h2>
            </div>
            <div className="product-grid">
              {alsoSets.map((other) => (
                <BundleCard bundle={bundleCardData(other)} key={other.slug} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
