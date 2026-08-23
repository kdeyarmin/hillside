import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Package, Truck } from 'lucide-react';
import AddToCartButton from '@/components/AddToCartButton';
import BundleCard from '@/components/BundleCard';
import ProductGallery from '@/components/ProductGallery';
import ProductGrid from '@/components/ProductGrid';
import ProductViewTracker from '@/components/ProductViewTracker';
import ProductReviews from '@/components/ProductReviews';
import StockAlertForm from '@/components/StockAlertForm';
import { bundleCardData, sellableBundlesContaining } from '@/lib/bundle-queries';
import { careGuideTypeLabel } from '@/lib/care-guides';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { recommendationsForProduct } from '@/lib/recommendation-queries';
import { ratingsByProduct } from '@/lib/reviews';
import { jsonLd } from '@/lib/json-ld';
import {
  comparableAtCents,
  formatSizePriceRange,
  productSizes,
  sizePriceRange
} from '@/lib/product-sizes';
import { pageMetadata } from '@/lib/seo';
import {
  absoluteUrl,
  discountPercent,
  flatShippingCents,
  formatMoney,
  freeShippingThresholdCents,
  HANDLING_MAX_DAYS,
  HANDLING_MIN_DAYS,
  priceValidUntil,
  productTypeLabel,
  returnPolicyForType,
  resolveImageUrl
} from '@/lib/store';
import { fulfillmentBlurb, offersPickup, offersShipping } from '@/lib/fulfillment';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await db.product.findFirst({ where: { slug } });
  if (!product) return { title: 'Product not found' };
  if (!product.active) {
    return pageMetadata({
      path: `/shop/${product.slug}`,
      title: `${product.name} is no longer listed`,
      description: `${product.name} is not for sale right now.`,
      image: resolveImageUrl(product.imageUrl),
      imageAlt: product.name,
      noindex: true
    });
  }
  return pageMetadata({
    path: `/shop/${product.slug}`,
    title: product.name,
    description: product.shortDescription || product.description,
    image: resolveImageUrl(product.imageUrl),
    imageAlt: product.name
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await db.product.findFirst({
    where: { slug },
    include: {
      collections: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 3 },
      /**
       * Both the guide this product is the subject of and any guide that
       * features it, so a venus flytrap reaches its own profile *and* the
       * watering guide that keeps it alive.
       */
      careSheets: { where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 3 },
      careGuides: {
        where: { careSheet: { published: true } },
        orderBy: { sortOrder: 'asc' },
        include: { careSheet: true },
        take: 4
      }
    }
  });
  if (!product) notFound();
  if (!product.active) {
    const catalogEmpty = !(await catalogHasActiveProducts());
    return <RetiredProduct product={product} catalogEmpty={catalogEmpty} />;
  }

  const [reviews, rating, rails, inSets] = await Promise.all([
    db.review.findMany({
      where: { productId: product.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 20
    }),
    ratingsByProduct([product.id]).then((map) => map.get(product.id) || { average: 0, count: 0 }),
    recommendationsForProduct(product),
    sellableBundlesContaining(product.id)
  ]);

  /**
   * Every guide that touches this product, the subject one first, with
   * duplicates folded out — a guide can be both the product's own profile and a
   * featured link, and listing it twice looks like a mistake.
   */
  const guides = [
    ...product.careSheets,
    ...product.careGuides.map((link) => link.careSheet)
  ].filter((sheet, index, all) => all.findIndex((other) => other.id === sheet.id) === index);
  const primaryGuide = guides[0] || null;

  const threshold = freeShippingThresholdCents();
  const soldOut = product.inventory <= 0;
  const sizes = productSizes(product.sizes, product.priceCents);
  const compareAt = comparableAtCents(sizes, product.priceCents, product.compareAtCents);
  const saving = discountPercent(product.priceCents, compareAt);
  /**
   * A product sold in several sizes advertises the span, not one figure. The
   * exact price arrives with the choice, in the dropdown and beneath it.
   */
  const priceSpan = sizePriceRange(sizes, product.priceCents);

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || product.description,
    image: [product.imageUrl, ...product.galleryImages]
      .filter(Boolean)
      .map((source) => absoluteUrl(resolveImageUrl(source)))
      .slice(0, 6),
    sku: product.sku || undefined,
    brand: { '@type': 'Brand', name: 'The Hillside Gardens' },
    ...(rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.average,
            reviewCount: rating.count
          }
        }
      : {}),
    ...(reviews.length
      ? {
          review: reviews.slice(0, 5).map((review) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: review.authorName },
            datePublished: review.createdAt.toISOString().slice(0, 10),
            name: review.title || undefined,
            reviewBody: review.body,
            reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 }
          }))
        }
      : {}),
    /**
     * `itemCondition`, `priceValidUntil` and the shipping and returns details are
     * all fields Search Console warns about when they are absent from an Offer.
     * The shipping figures come from the same configuration the cart charges by,
     * so the rich result cannot advertise a rate the checkout does not honour.
     */
    offers: {
      ...(priceSpan.minCents === priceSpan.maxCents
        ? { '@type': 'Offer', price: (priceSpan.minCents / 100).toFixed(2) }
        : {
            '@type': 'AggregateOffer',
            lowPrice: (priceSpan.minCents / 100).toFixed(2),
            highPrice: (priceSpan.maxCents / 100).toFixed(2),
            offerCount: sizes.length
          }),
      url: absoluteUrl(`/shop/${product.slug}`),
      priceCurrency: 'USD',
      priceValidUntil: priceValidUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@id': absoluteUrl('/#business') },
      ...(offersShipping(product)
        ? {
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingRate: {
                '@type': 'MonetaryAmount',
                value: (
                  (threshold > 0 && priceSpan.minCents >= threshold ? 0 : flatShippingCents()) / 100
                ).toFixed(2),
                currency: 'USD'
              },
              shippingDestination: {
                '@type': 'DefinedRegion',
                addressCountry: 'US'
              },
              deliveryTime: {
                '@type': 'ShippingDeliveryTime',
                handlingTime: {
                  '@type': 'QuantitativeValue',
                  minValue: HANDLING_MIN_DAYS,
                  maxValue: HANDLING_MAX_DAYS,
                  unitCode: 'DAY'
                },
                transitTime: {
                  '@type': 'QuantitativeValue',
                  minValue: 3,
                  maxValue: 7,
                  unitCode: 'DAY'
                }
              }
            }
          }
        : {}),
      hasMerchantReturnPolicy: returnPolicyForType(product.type)
    }
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: absoluteUrl('/shop') },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.name,
        item: absoluteUrl(`/shop/${product.slug}`)
      }
    ]
  };

  return (
    <section className="content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <ProductViewTracker
        slug={product.slug}
        name={product.name}
        type={product.type}
        priceCents={product.priceCents}
      />
      <div className="container">
        <div className="breadcrumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/shop">Shop</Link>
          <span>/</span>
          <span>{product.name}</span>
        </div>
        <div className="product-detail">
          <div className="product-detail-image-wrap">
            <ProductGallery
              slug={product.slug}
              name={product.name}
              type={product.type}
              imageUrl={product.imageUrl}
              images={product.galleryImages}
            />
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow">{productTypeLabel(product.type)}</div>
            <div className="product-detail-badges">
              {saving > 0 && <span className="pill sale">Save {saving}%</span>}
              {product.badge && <span className="pill">{product.badge}</span>}
            </div>
            <h1>{product.name}</h1>
            {rating.count > 0 && (
              <p className="rating-inline">
                <span className="rating-stars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span className={step <= Math.round(rating.average) ? 'on' : ''} key={step}>
                      ★
                    </span>
                  ))}
                </span>
                <a href="#reviews">
                  {rating.average.toFixed(1)} · {rating.count}{' '}
                  {rating.count === 1 ? 'review' : 'reviews'}
                </a>
              </p>
            )}
            {product.shortDescription && <p className="lead">{product.shortDescription}</p>}
            <p>{product.description}</p>
            <p className="product-detail-price">
              {formatSizePriceRange(sizes, product.priceCents)}
              {saving > 0 && compareAt && (
                <span className="compare-price">
                  <span className="sr-only">Was </span>
                  {formatMoney(compareAt)}
                </span>
              )}
            </p>
            <p className={`stock ${soldOut ? 'out' : product.inventory <= 3 ? 'low' : ''}`}>
              {soldOut
                ? 'Currently sold out'
                : product.inventory <= 3
                  ? `Only ${product.inventory} available`
                  : `${product.inventory} available`}
            </p>

            {threshold > 0 && offersShipping(product) && (
              <p className="shipping-nudge">
                <Truck size={17} aria-hidden="true" />
                {/* Quoted against the cheapest size, so the promise holds
                    whichever one the shopper picks. */}
                {priceSpan.minCents >= threshold
                  ? 'This item alone qualifies for free standard shipping on a shipped order.'
                  : `Free standard shipping on orders over ${formatMoney(threshold)}.`}
              </p>
            )}
            {!offersShipping(product) && offersPickup(product) && (
              <p className="shipping-nudge">
                <Truck size={17} aria-hidden="true" />
                Local pickup only — this piece does not ship.
              </p>
            )}

            <div className="product-detail-notes">
              {product.careNotes && (
                <div className="note-box">
                  <b>Care at a glance</b>
                  {product.careNotes}
                </div>
              )}
              {product.shippingNote && (
                <div className="note-box">
                  <b>Shipping note</b>
                  {product.shippingNote}
                </div>
              )}
              <div className="note-box">
                <b>How it gets home</b>
                {fulfillmentBlurb(product)}
              </div>
              <div className="note-box">
                <b>Secure checkout</b>Payment is processed by Stripe. A receipt and invoice are
                emailed after purchase.
              </div>
            </div>

            {/* Above the Add button, not buried at the foot of the page: the
                care guide is what tells a nervous first-time buyer this plant is
                survivable, and that decision is made here. */}
            {primaryGuide && (
              <div className="care-guide-link">
                <BookOpen size={22} aria-hidden="true" />
                <div>
                  <b>
                    {primaryGuide.guideType === 'PLANT'
                      ? `How to keep ${product.name} alive`
                      : primaryGuide.plantName}
                  </b>
                  <span>{primaryGuide.summary}</span>
                </div>
                <Link className="btn outline small" href={`/care/${primaryGuide.slug}`}>
                  Read the care guide
                </Link>
              </div>
            )}

            {soldOut ? (
              <StockAlertForm slug={product.slug} name={product.name} />
            ) : (
              <AddToCartButton
                sizes={sizes}
                sizeLabel={product.sizeLabel}
                product={{
                  slug: product.slug,
                  name: product.name,
                  priceCents: product.priceCents,
                  imageUrl: product.imageUrl,
                  inventory: product.inventory,
                  type: product.type,
                  ships: product.ships,
                  pickup: product.pickup
                }}
              />
            )}

            {/* Sets that contain this exact product, and only while every other
                piece in them is on the bench too — so the nudge can never point
                at a box the shop cannot pack. */}
            {inSets.map((set) => {
              const card = bundleCardData(set);
              return (
                <div className="bundle-nudge" key={set.slug}>
                  <div>
                    <b>
                      <Package size={15} aria-hidden="true" /> Also in the {set.title}
                    </b>
                    <span>
                      {card.contents}
                      {card.savingsCents > 0 ? ` — ${card.savingsNote?.toLowerCase()}` : ''}
                    </span>
                  </div>
                  <Link className="btn outline small" href={`/bundles/${set.slug}`}>
                    See the set
                  </Link>
                </div>
              );
            })}

            {product.collections.length > 0 && (
              <p className="product-collections">
                Part of{' '}
                {product.collections.map((collection, index) => (
                  <span key={collection.id}>
                    {index > 0 && ', '}
                    <Link className="text-link" href={`/collections/${collection.slug}`}>
                      {collection.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {product.sku && (
              <p className="muted" style={{ fontSize: 12 }}>
                Item number: {product.sku}
              </p>
            )}
          </div>
        </div>

        {product.details && (
          <div className="product-details-section narrow prose">
            <div className="eyebrow">Product details</div>
            <h2>About this item</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{product.details}</p>
          </div>
        )}

        {guides.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">Keep it thriving</div>
              <h2>
                {product.type === 'PLANT'
                  ? 'Care guides for this plant.'
                  : 'Care guides for this item.'}
              </h2>
              <p>Written here, free to read before you buy, and printable once it is home.</p>
            </div>
            <div className="care-related-grid">
              {guides.map((sheet) => (
                <article className="care-related-card" key={sheet.id}>
                  <span>{careGuideTypeLabel(sheet.guideType)}</span>
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

        <ProductReviews
          productSlug={product.slug}
          productName={product.name}
          average={rating.average}
          count={rating.count}
          reviews={reviews.map((review) => ({
            id: review.id,
            authorName: review.authorName,
            rating: review.rating,
            title: review.title,
            body: review.body,
            verifiedPurchase: review.verifiedPurchase,
            ownerReply: review.ownerReply,
            createdAt: review.createdAt.toISOString()
          }))}
        />

        {/*
          Four separate questions, each with its own heading, rather than one
          "More in plants" shelf. A rail only renders when something genuinely
          answers it — an empty "Complete the setup" is a better answer than a
          full one that is wrong, because a shopper shown a bar of soap under a
          fly trap stops reading the section entirely.
        */}
        {rails.length > 0 && (
          <div className="product-details-section">
            {rails.map((rail) => (
              <section className="recommendation-rail" key={rail.key}>
                <div className="recommendation-rail-head">
                  <div>
                    <div className="eyebrow">
                      {rail.key === 'complete' ? 'Goes with it' : 'Our suggestion'}
                    </div>
                    <h2>{rail.title}</h2>
                  </div>
                  <p>{rail.blurb}</p>
                </div>
                <ProductGrid products={rail.products} eagerCount={0} />
              </section>
            ))}
          </div>
        )}

        {inSets.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">Buy it as a set</div>
              <h2>
                {product.name} is part of {inSets.length === 1 ? 'a kit' : 'these kits'}.
              </h2>
              <p>Priced below what the pieces cost on their own.</p>
            </div>
            <div className="product-grid">
              {inSets.map((set) => (
                <BundleCard bundle={bundleCardData(set)} key={set.slug} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RetiredProduct({
  product,
  catalogEmpty
}: {
  catalogEmpty: boolean;
  product: {
    name: string;
    slug: string;
    type: string;
    shortDescription: string | null;
    description: string;
    imageUrl: string | null;
    galleryImages: string[];
    careSheets: Array<{ id: string; slug: string; plantName: string; summary: string }>;
  };
}) {
  const inquiry = contactHref({
    subject: 'Availability or restock',
    message: `Is there anything similar to ${product.name} coming back?`
  });

  return (
    <section className="content">
      <div className="container">
        <div className="product-detail">
          <div className="product-detail-image-wrap">
            <ProductGallery
              slug={product.slug}
              name={product.name}
              type={product.type}
              imageUrl={product.imageUrl}
              images={product.galleryImages}
            />
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow">No longer listed</div>
            <h1>{product.name} has left the bench.</h1>
            <p className="lead">
              We don’t list what we can’t send home. This piece is not for sale right now.
            </p>
            {product.shortDescription && <p>{product.shortDescription}</p>}
            <div className="actions">
              <Link className="btn" href={inquiry}>
                Ask about something similar
              </Link>
              <Link className="btn outline" href="/care">
                Plant care library
              </Link>
              {!catalogEmpty && (
                <Link className="btn outline" href="/shop">
                  Browse the shop
                </Link>
              )}
            </div>
          </div>
        </div>

        {product.careSheets.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">Keep it thriving</div>
              <h2>
                {product.type === 'PLANT'
                  ? 'Care guides for this plant.'
                  : 'Care guides for this item.'}
              </h2>
            </div>
            <div className="care-related-grid">
              {product.careSheets.map((sheet) => (
                <article className="care-related-card" key={sheet.id}>
                  <span>Plant care</span>
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
      </div>
    </section>
  );
}
