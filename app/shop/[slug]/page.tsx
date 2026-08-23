import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Package, Truck } from 'lucide-react';
import AddToCartButton from '@/components/AddToCartButton';
import BundleGrid from '@/components/BundleGrid';
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
import { specKindFor } from '@/lib/product-categories';
import { productPhotos } from '@/lib/product-photos';
import { specSections } from '@/lib/product-specs';
import { ratingForProduct } from '@/lib/reviews';
import { jsonLd } from '@/lib/json-ld';
import {
  comparableAtCents,
  formatSizePriceRange,
  fulfillmentAcrossVariants,
  productSizes,
  sizeFieldLabel,
  sizePriceRange,
  variantsDifferOnFulfillment
} from '@/lib/product-sizes';
import { breadcrumbJsonLd, pageMetadata, productJsonLd, productOffers } from '@/lib/seo';
import { merchandisingBadges } from '@/lib/merchandising';
import { merchandisingFlagsFor } from '@/lib/merchandising-data';
import { normalizeTags, tagLabel } from '@/lib/product-tags';
import {
  discountPercent,
  formatMoney,
  freeShippingThresholdCents,
  productTypeLabel,
  resolveImageUrl
} from '@/lib/store';
import { fulfillmentBlurb } from '@/lib/fulfillment';

export const dynamic = 'force-dynamic';

/** Card fields for the hand-picked products shown beside this one. */

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
    ratingForProduct(product.id),
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
  const flags = (await merchandisingFlagsFor([product])).get(product.id);
  const primaryCollection = product.collections[0] || null;
  /**
   * Only the attributes Tammy assigned. The derived ones — in stock, ships, on
   * sale — are already stated plainly further up the page, and repeating them as
   * chips would pad the page with things the shopper just read.
   */
  const attributes = normalizeTags(product.tags);

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

  const offers = productOffers({
    slug: product.slug,
    type: product.type,
    sku: product.sku,
    ships: product.ships,
    inventory: product.inventory,
    priceCents: product.priceCents,
    sizes
  });

  const productSchema = productJsonLd({
    product,
    offers,
    rating,
    reviews
  });

  const breadcrumbSchema = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    /**
     * The category is the structural parent — a product has exactly one — so it
     * is the crumb. A collection cuts across categories and is not a path down
     * to this page; it is only used where a product has no category yet.
     */
    ...(product.category
      ? [{ name: product.category.title, path: `/categories/${product.category.slug}` }]
      : primaryCollection
        ? [{ name: primaryCollection.title, path: `/collections/${primaryCollection.slug}` }]
        : []),
    { name: product.name, path: `/shop/${product.slug}` }
  ]);

  return (
    <section className="content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
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
              <Link href={`/categories/${product.category.slug}`}>{product.category.title}</Link>
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
              photos={productPhotos(product)}
            />
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow">
              {product.category ? (
                <Link
                  className="product-category-link"
                  href={`/categories/${product.category.slug}`}
                >
                  {product.category.title}
                </Link>
              ) : (
                categoryName
              )}
            </div>
            <div className="product-detail-badges">
              {merchandisingBadges(
                product,
                {
                  savingPercent: saving,
                  isBestSeller: flags?.isBestSeller,
                  isNew: flags?.isNew,
                  isInSeason: flags?.isInSeason
                },
                3
              ).map((badge) => (
                <span className={`pill ${badge.tone}`} key={`${badge.tone}-${badge.label}`}>
                  {badge.label}
                </span>
              ))}
            </div>
            <h1>{product.name}</h1>
            {product.botanical && (
              <p className="product-botanical">
                <i>{product.botanical}</i>
              </p>
            )}
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

            {attributes.length > 0 && (
              <div className="product-attributes">
                <b>Good to know</b>
                <ul>
                  {attributes.map((tag) => (
                    <li key={tag}>
                      {/* Each attribute links to the shop already filtered by it,
                          so "Pet safe" on one plant is a route to every other
                          one rather than a decorative label. */}
                      <Link href={`/shop?tags=${tag}`}>{tagLabel(tag)}</Link>
                    </li>
                  ))}
                </ul>
              </div>
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

        {/* Ingredients and brewing are not repeated here: they are structured
            fields, and the specifics section below renders them from the same
            registry the form writes, rather than from a second copy that can
            disagree with it. */}
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
            <BundleGrid bundles={inSets.map(bundleCardData)} />
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
