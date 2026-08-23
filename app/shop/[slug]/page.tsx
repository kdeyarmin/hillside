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
import { specKindFor, withCategory } from '@/lib/product-categories';
import { specSections } from '@/lib/product-specs';
import { ratingsByProduct } from '@/lib/reviews';
import { jsonLd } from '@/lib/json-ld';
import {
  comparableAtCents,
  formatSizePriceRange,
  fulfillmentAcrossVariants,
  productSizes,
  sizeAvailable,
  sizeFieldLabel,
  sizePriceRange,
  variantsDifferOnFulfillment
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
  productTypePlural,
  returnPolicyForType,
  resolveImageUrl
} from '@/lib/store';
import { fulfillmentBlurb } from '@/lib/fulfillment';

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
      category: true,
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
    /**
     * "You may also like" reads the category where there is one, so a flytrap
     * suggests other carnivorous plants rather than every plant in the shop.
     * A product that predates the taxonomy falls back to its broad type, which
     * is the only thing it has.
     */
    db.product.findMany({
      where: {
        active: true,
        id: { not: product.id },
        ...(product.categoryId ? { categoryId: product.categoryId } : { type: product.type })
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3,
      include: { category: { select: { slug: true, title: true } } }
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
    ...withCategory(item),
    averageRating: relatedRatings.get(item.id)?.average ?? null,
    reviewCount: relatedRatings.get(item.id)?.count ?? 0
  }));

  const threshold = freeShippingThresholdCents();
  const soldOut = product.inventory <= 0;
  /**
   * Resolved against the product, so a variant that says nothing about its
   * photograph, its SKU or how it gets home answers with the product's.
   */
  const sizes = productSizes(product.sizes, product.priceCents, {
    sku: product.sku,
    imageUrl: product.imageUrl,
    weightOunces: product.weightOunces,
    dimensions: product.dimensions,
    ships: product.ships,
    pickup: product.pickup
  });
  const specs = specSections(specKindFor(product), product.specs);
  const categoryName = product.category?.title || productTypeLabel(product.type);
  const mixedFulfillment = variantsDifferOnFulfillment(sizes);
  /**
   * How this product actually gets home. Read from the variants where there are
   * any, because they may override the product's own two checkboxes: a plant
   * ticked as shipping whose every variant is pickup-only ships in no sense a
   * customer can act on, and checkout — which resolves the variant — would
   * refuse the order this page had just offered.
   */
  const fulfillment = fulfillmentAcrossVariants(sizes, product);
  /** Whether the section below has anything to say at all. */
  const hasSpecifics = specs.length > 0 || Boolean(product.dimensions);
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
    ...(product.category ? { category: product.category.title } : {}),
    ...(product.weightOunces
      ? {
          weight: {
            '@type': 'QuantitativeValue',
            value: product.weightOunces,
            unitCode: 'ONZ'
          }
        }
      : {}),
    /**
     * How the offer is shaped is decided by how many variants there are, not by
     * whether they are priced differently.
     *
     * Keying it off the price span meant four pots that happen to cost the same
     * collapsed into one plain Offer, throwing away each one's name, its SKU and
     * its own availability — on a product the storefront still makes you choose
     * a variant on. A sold-out 6" pot was published as in stock because the 4"
     * one was.
     */
    offers: {
      ...(sizes.length > 1
        ? {
            '@type': 'AggregateOffer',
            lowPrice: (priceSpan.minCents / 100).toFixed(2),
            highPrice: (priceSpan.maxCents / 100).toFixed(2),
            offerCount: sizes.length,
            /**
             * Each variant as its own offer inside the aggregate, so a search
             * result can name the 6" pot and its price rather than a span with
             * nothing behind it. A variant that carries a SKU carries it here
             * too, which is what lets a shopping feed match one variant to one
             * listing.
             */
            offers: sizes.map((size) => ({
              '@type': 'Offer',
              name: size.label,
              price: (size.priceCents / 100).toFixed(2),
              priceCurrency: 'USD',
              ...(size.sku ? { sku: size.sku } : {}),
              url: absoluteUrl(`/shop/${product.slug}`),
              availability:
                sizeAvailable(size, product.inventory) > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock'
            }))
          }
        : {
            // Sold one way, or in exactly one variant — which still carries its
            // own name and SKU, and is the honest price and availability here.
            '@type': 'Offer',
            price: (priceSpan.minCents / 100).toFixed(2),
            ...(sizes[0]
              ? { name: sizes[0].label, ...(sizes[0].sku ? { sku: sizes[0].sku } : {}) }
              : {})
          }),
      url: absoluteUrl(`/shop/${product.slug}`),
      priceCurrency: 'USD',
      priceValidUntil: priceValidUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@id': absoluteUrl('/#business') },
      ...(fulfillment.ships
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
      ...(product.category
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: product.category.title,
              item: absoluteUrl(`/shop?category=${product.category.slug}`)
            }
          ]
        : []),
      {
        '@type': 'ListItem',
        position: product.category ? 4 : 3,
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
          {product.category && (
            <>
              <span>/</span>
              <Link href={`/shop?category=${product.category.slug}`}>{product.category.title}</Link>
            </>
          )}
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
            <div className="eyebrow">
              {product.category ? (
                <Link
                  className="product-category-link"
                  href={`/shop?category=${product.category.slug}`}
                >
                  {product.category.title}
                </Link>
              ) : (
                categoryName
              )}
            </div>
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

            {threshold > 0 && fulfillment.ships && (
              <p className="shipping-nudge">
                <Truck size={17} aria-hidden="true" />
                {/* Quoted against the cheapest size, so the promise holds
                    whichever one the shopper picks. */}
                {priceSpan.minCents >= threshold
                  ? 'This item alone qualifies for free standard shipping on a shipped order.'
                  : `Free standard shipping on orders over ${formatMoney(threshold)}.`}
              </p>
            )}
            {!fulfillment.ships && fulfillment.pickup && (
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
                {mixedFulfillment
                  ? `This is not sold the same way in every ${sizeFieldLabel(
                      product.sizeLabel
                    ).toLowerCase()} — choose one above and the panel says whether it ships, is collected here, or both.`
                  : fulfillmentBlurb(fulfillment)}
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

        {product.details && (
          <div className="product-details-section narrow prose">
            <div className="eyebrow">Product details</div>
            <h2>About this item</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{product.details}</p>
          </div>
        )}

        {/* The structured detail Tammy filled in for this kind of product — a
            plant's light and water, a tea's steep time and allergens, a bag of
            gravel's dimensions. Anything she left blank is not rendered, so a
            listing says what is known and stays quiet about the rest. */}
        {hasSpecifics && (
          <div className="product-details-section">
            <div className="sectionhead">
              <div className="eyebrow">The specifics</div>
              <h2>{categoryName} details.</h2>
            </div>
            <div className="spec-groups">
              {specs.map((section) => (
                <section className="spec-group" key={section.title}>
                  <h3>{section.title}</h3>
                  <dl>
                    {section.rows.map((row) => (
                      <div className={row.long ? 'spec-row long' : 'spec-row'} key={row.key}>
                        <dt>{row.label}</dt>
                        <dd style={row.long ? { whiteSpace: 'pre-line' } : undefined}>
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {/* Whether a piece can be collected is the product's own answer,
                  not a field somebody has to remember to fill in twice. */}
              <section className="spec-group">
                <h3>Getting it home</h3>
                <dl>
                  <div className="spec-row">
                    <dt>Shipping</dt>
                    <dd>
                      {fulfillment.ships
                        ? mixedFulfillment
                          ? 'Ships to US addresses, depending on the size chosen'
                          : 'Ships to US addresses'
                        : 'Does not ship'}
                    </dd>
                  </div>
                  <div className="spec-row">
                    <dt>Local pickup</dt>
                    <dd>
                      {fulfillment.pickup
                        ? 'Available in Ebensburg, once a time is arranged'
                        : 'Not available'}
                    </dd>
                  </div>
                  {product.dimensions && (
                    <div className="spec-row">
                      <dt>Dimensions</dt>
                      <dd>{product.dimensions}</dd>
                    </div>
                  )}
                  {product.sku && (
                    <div className="spec-row">
                      <dt>Item number</dt>
                      <dd>{product.sku}</dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>
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
              {/* The query behind this list matches on category, not on the
                  collections above, so the heading names the category. A product
                  with none falls back to its broad type, as a plural, because it
                  introduces a shelf of them rather than one. */}
              <div className="eyebrow">You may also like</div>
              <h2>
                More in{' '}
                {product.category
                  ? product.category.title.toLowerCase()
                  : productTypePlural(product.type).toLowerCase()}
                .
              </h2>
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
