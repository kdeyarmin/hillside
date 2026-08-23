import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Truck } from 'lucide-react';
import AddToCartButton from '@/components/AddToCartButton';
import ProductGallery from '@/components/ProductGallery';
import ProductGrid from '@/components/ProductGrid';
import ProductViewTracker from '@/components/ProductViewTracker';
import ProductReviews from '@/components/ProductReviews';
import StockAlertForm from '@/components/StockAlertForm';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { withCardFacts } from '@/lib/product-cards';
import { productPhotos } from '@/lib/product-photos';
import { ratingForProduct } from '@/lib/reviews';
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
  caffeineLabel,
  discountPercent,
  flatShippingCents,
  formatMoney,
  freeShippingThresholdCents,
  HANDLING_MAX_DAYS,
  HANDLING_MIN_DAYS,
  petSafetyLabel,
  priceValidUntil,
  productTypeLabel,
  productTypePlural,
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

/**
 * The facts a shopper checks before buying, as a short list rather than buried
 * in a paragraph: how big the pot is, how much light it wants, whether the cat
 * can be trusted with it, how much tea is in the tin.
 *
 * Every row is omitted when it has no answer. A specification table with five
 * dashes in it looks like a broken page, and worse, an empty "Pet safety" row
 * reads as an answer.
 */
function ProductSpecs({
  product
}: {
  product: {
    potSize: string | null;
    lightNeeds: string | null;
    waterNeeds: string | null;
    petSafe: boolean | null;
    netWeight: string | null;
    caffeineStatus: string | null;
  };
}) {
  const rows: Array<[string, string | null]> = [
    ['Pot size', product.potSize],
    ['Light', product.lightNeeds],
    ['Water', product.waterNeeds],
    ['Pet safety', petSafetyLabel(product.petSafe)],
    ['Net weight', product.netWeight],
    ['Caffeine', caffeineLabel(product.caffeineStatus)]
  ];
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]?.trim()));
  if (!present.length) return null;

  return (
    <dl className="product-specs">
      {present.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await db.product.findFirst({
    where: { slug },
    include: {
      collections: { where: { active: true }, orderBy: { sortOrder: 'asc' }, take: 3 },
      careSheets: { where: { published: true }, take: 2 }
    }
  });
  if (!product) notFound();
  if (!product.active) {
    const catalogEmpty = !(await catalogHasActiveProducts());
    return <RetiredProduct product={product} catalogEmpty={catalogEmpty} />;
  }

  const [related, reviews, rating] = await Promise.all([
    db.product.findMany({
      where: { active: true, id: { not: product.id }, type: product.type },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3
    }),
    db.review.findMany({
      where: { productId: product.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 20
    }),
    ratingForProduct(product.id)
  ]);

  const relatedProducts = await withCardFacts(related);

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
    image: productPhotos(product)
      .map((photo) => absoluteUrl(resolveImageUrl(photo.src)))
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
              photos={productPhotos(product)}
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

            <ProductSpecs product={product} />

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

        {(product.details || product.ingredients || product.brewingInstructions) && (
          <div className="product-details-section narrow prose">
            <div className="eyebrow">Product details</div>
            <h2>About this item</h2>
            {product.details && <p style={{ whiteSpace: 'pre-line' }}>{product.details}</p>}
            {/* Ingredients get their own heading rather than being folded into the
                paragraph above. On a tea or a soap this is the one thing somebody
                with an allergy came to the page to find. */}
            {product.ingredients && (
              <>
                <h3>Ingredients</h3>
                <p style={{ whiteSpace: 'pre-line' }}>{product.ingredients}</p>
              </>
            )}
            {product.brewingInstructions && (
              <>
                <h3>How to brew it</h3>
                <p style={{ whiteSpace: 'pre-line' }}>{product.brewingInstructions}</p>
              </>
            )}
          </div>
        )}

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

        {relatedProducts.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              {/* The query behind this list matches on product type, not on the
                  collections above, so the heading says type — as a plural,
                  because it introduces a shelf of them, not one. */}
              <div className="eyebrow">You may also like</div>
              <h2>More in {productTypePlural(product.type).toLowerCase()}.</h2>
            </div>
            <ProductGrid products={relatedProducts} />
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
    lifestyleImageUrl: string | null;
    detailImageUrl: string | null;
    scaleImageUrl: string | null;
    packagingImageUrl: string | null;
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
              photos={productPhotos(product)}
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
