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
import { ratingsByProduct } from '@/lib/reviews';
import { jsonLd } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import {
  absoluteUrl,
  discountPercent,
  flatShippingCents,
  formatMoney,
  freeShippingThresholdCents,
  priceValidUntil,
  productTypeLabel,
  returnPolicyForType,
  resolveImageUrl
} from '@/lib/store';

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
    ratingsByProduct([product.id]).then((map) => map.get(product.id) || { average: 0, count: 0 })
  ]);

  const relatedRatings = await ratingsByProduct(related.map((item) => item.id));
  const relatedProducts = related.map((item) => ({
    ...item,
    averageRating: relatedRatings.get(item.id)?.average ?? null,
    reviewCount: relatedRatings.get(item.id)?.count ?? 0
  }));

  const saving = discountPercent(product.priceCents, product.compareAtCents);
  const threshold = freeShippingThresholdCents();
  const soldOut = product.inventory <= 0;

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
      '@type': 'Offer',
      url: absoluteUrl(`/shop/${product.slug}`),
      priceCurrency: 'USD',
      price: (product.priceCents / 100).toFixed(2),
      priceValidUntil: priceValidUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@id': absoluteUrl('/#business') },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: (
            (threshold > 0 && product.priceCents >= threshold ? 0 : flatShippingCents()) / 100
          ).toFixed(2),
          currency: 'USD'
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'US'
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' }
        }
      },
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
              {formatMoney(product.priceCents)}
              {saving > 0 && product.compareAtCents && (
                <span className="compare-price">{formatMoney(product.compareAtCents)}</span>
              )}
            </p>
            <p className={`stock ${soldOut ? 'out' : product.inventory <= 3 ? 'low' : ''}`}>
              {soldOut
                ? 'Currently sold out'
                : product.inventory <= 3
                  ? `Only ${product.inventory} available`
                  : `${product.inventory} available`}
            </p>

            {threshold > 0 && (
              <p className="shipping-nudge">
                <Truck size={17} aria-hidden="true" />
                {product.priceCents >= threshold
                  ? 'This order qualifies for free standard shipping.'
                  : `Free standard shipping on orders over ${formatMoney(threshold)}.`}
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
                <b>Secure checkout</b>Payment is processed by Stripe. A receipt and invoice are
                emailed after purchase.
              </div>
            </div>

            {soldOut ? (
              <StockAlertForm slug={product.slug} name={product.name} />
            ) : (
              <AddToCartButton
                product={{
                  slug: product.slug,
                  name: product.name,
                  priceCents: product.priceCents,
                  imageUrl: product.imageUrl,
                  inventory: product.inventory,
                  type: product.type
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

        {product.details && (
          <div className="product-details-section narrow prose">
            <div className="eyebrow">Product details</div>
            <h2>About this item</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{product.details}</p>
          </div>
        )}

        {product.careSheets.length > 0 && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">Keep it thriving</div>
              <h2>Care guides for this plant.</h2>
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
                  collections above, so the heading says type. */}
              <div className="eyebrow">You may also like</div>
              <h2>More in {productTypeLabel(product.type).toLowerCase()}.</h2>
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
              <h2>Care guides for this plant.</h2>
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
