import type { Metadata } from 'next';
import {
  absoluteUrl,
  businessEmail,
  flatShippingCents,
  freeShippingThresholdCents,
  HANDLING_MAX_DAYS,
  HANDLING_MIN_DAYS,
  priceValidUntil,
  resolveImageUrl,
  returnPolicyForType
} from './store.ts';

const DEFAULT_OG_IMAGE = '/og-image.jpg';
const DEFAULT_OG_ALT = 'Plants growing in a sunlit greenhouse at The Hillside Gardens';

type PageMetadataInput = {
  /** Site-relative path this page canonicalizes to, e.g. `/care` or `/shop/monstera`. */
  path: string;
  title: string;
  description: string;
  /** Site-relative or absolute image URL. Falls back to the shared social image. */
  image?: string | null;
  imageAlt?: string;
  /** `article` for care guides, `website` for everything else. */
  type?: 'website' | 'article';
  noindex?: boolean;
  /**
   * A short list of terms this page is genuinely about. Meta keywords carry no
   * ranking weight anywhere, so this exists to keep a category page's subject
   * written down in one place rather than to influence anything — which is also
   * why it is capped: a page that claims twelve subjects is describing none.
   */
  keywords?: string[];
};

/**
 * Builds the metadata for one page: canonical, Open Graph and Twitter together.
 *
 * These three have to be set per page, and the reason is not obvious. Next merges
 * metadata by top-level field, so a page that does not declare `alternates`
 * inherits the root layout's wholesale. The root layout declared
 * `alternates: { canonical: '/' }` for the homepage's benefit, and fourteen pages
 * that never redefined it — including `/care`, the care library that is the main
 * reason strangers find this site, and `/classes`, which carries all the Event
 * structured data — were consequently telling search engines that their canonical
 * address was the homepage. That is an instruction to drop them from the index.
 *
 * Open Graph inherited identically, and `twitter` was never declared on any page
 * at all, so a product shared on X showed the homepage title, the homepage
 * description and the generic site image while the per-product image built a few
 * lines away went unused.
 *
 * Deriving all three from one call is what stops that recurring: there is no way
 * to set the canonical here and forget the card.
 */
export function pageMetadata({
  path,
  title,
  description,
  image,
  imageAlt,
  type = 'website',
  noindex = false,
  keywords
}: PageMetadataInput): Metadata {
  const imageUrl = absoluteUrl(image?.trim() || DEFAULT_OG_IMAGE);
  const alt = imageAlt || (image ? title : DEFAULT_OG_ALT);

  return {
    title,
    description,
    ...(keywords?.length ? { keywords: keywords.slice(0, 8) } : {}),
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type,
      siteName: 'The Hillside Gardens',
      locale: 'en_US',
      url: path,
      title,
      description,
      images: [{ url: imageUrl, alt }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl]
    }
  };
}

/**
 * Breadcrumb structured data from an ordered trail. The product page had this and
 * nothing else did, even where the page already rendered visual breadcrumbs — so
 * the markup told search engines about a hierarchy the page was showing readers.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: absoluteUrl(step.path)
    }))
  };
}

/**
 * Site-level WebSite node. Search used to be advertised here as a SearchAction
 * targeting `/search?q={search_term_string}`, but `robots.txt` disallows
 * `/search` so crawlers were being pointed at a URL they are told not to fetch.
 * The header search form still works for visitors.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: 'The Hillside Gardens',
    url: absoluteUrl('/'),
    publisher: { '@id': absoluteUrl('/#business') }
  };
}

/**
 * The one business node the whole site refers to, at `#business`.
 *
 * It lives here rather than in the root layout because three other pages were
 * describing the same business inline — the care guide's `publisher`, the class
 * listing's `organizer` — each with a different `@type` and no `@id`. To a
 * crawler that is three organisations that happen to share a name, and the one
 * with the address and opening hours is not the one publishing the guides. Every
 * caller now references `{ '@id': businessRef() }` instead.
 *
 * Every field is environment driven so nothing is published until it is real.
 */
export function businessJsonLd() {
  const streetAddress = process.env.BUSINESS_STREET_ADDRESS?.trim();
  const locality = process.env.BUSINESS_CITY?.trim();
  const region = process.env.BUSINESS_STATE?.trim();
  const postalCode = process.env.BUSINESS_POSTAL_CODE?.trim();
  const telephone = process.env.BUSINESS_PHONE?.trim();
  const openingHours = process.env.BUSINESS_OPENING_HOURS?.trim();
  const hasAddress = Boolean(streetAddress && locality && region && postalCode);

  return {
    '@context': 'https://schema.org',
    '@type': hasAddress ? 'LocalBusiness' : 'Store',
    '@id': absoluteUrl('/#business'),
    name: 'The Hillside Gardens',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/logo.png'),
    image: absoluteUrl('/og-image.jpg'),
    description:
      'A plant shop and garden studio: houseplants, carnivorous plants, succulents, air plants, terrarium supplies, handmade botanical goods and free plant care guides.',
    founder: { '@type': 'Person', name: 'Tammy Hill' },
    email: businessEmail(),
    priceRange: '$$',
    ...(telephone ? { telephone } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress,
            addressLocality: locality,
            addressRegion: region,
            postalCode,
            addressCountry: 'US'
          }
        }
      : {}),
    /**
     * Where the shop actually serves people in person. Stated as places rather
     * than as a radius because the useful answer to "is this near me?" is a
     * county name, and because a made-up radius around an address we may not
     * have published would be a claim we cannot stand behind.
     */
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Cambria County, Pennsylvania' },
      { '@type': 'AdministrativeArea', name: 'Western Pennsylvania' },
      { '@type': 'AdministrativeArea', name: 'Central Pennsylvania' }
    ],
    ...(openingHours
      ? {
          openingHours: openingHours
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean)
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_INSTAGRAM_URL || process.env.NEXT_PUBLIC_FACEBOOK_URL
      ? {
          sameAs: [
            process.env.NEXT_PUBLIC_INSTAGRAM_URL,
            process.env.NEXT_PUBLIC_FACEBOOK_URL
          ].filter(Boolean)
        }
      : {})
  };
}

/** How every other node points at the business instead of redescribing it. */
export function businessRef() {
  return absoluteUrl('/#business');
}

export function websiteRef() {
  return absoluteUrl('/#website');
}

export type FaqEntry = { question: string; answer: string };

/**
 * FAQPage for a page whose questions are visible on it.
 *
 * Returns null for an empty list rather than an empty `mainEntity`, because a
 * FAQPage with no questions is invalid markup that Search Console reports, and
 * because a category page with nothing to answer should publish nothing. The
 * `@id` is per page so two pages that both carry FAQs are two documents rather
 * than one contradictory one.
 */
export function faqJsonLd(path: string, entries: FaqEntry[]) {
  const questions = entries
    .map((entry) => ({ question: entry.question?.trim(), answer: entry.answer?.trim() }))
    .filter((entry) => entry.question && entry.answer);
  if (!questions.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': absoluteUrl(`${path}#faq`),
    url: absoluteUrl(path),
    isPartOf: { '@id': websiteRef() },
    mainEntity: questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer }
    }))
  };
}

/**
 * A category page: what it is, what is on it, and who publishes it. The item
 * list carries names and URLs only — the price and availability of each product
 * belong to that product's own page, and repeating them here is how a category
 * page ends up advertising a price the product page has since changed.
 */
export function collectionPageJsonLd({
  path,
  name,
  description,
  products
}: {
  path: string;
  name: string;
  description?: string | null;
  products: Array<{ slug: string; name: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(`${path}#page`),
    name,
    url: absoluteUrl(path),
    ...(description ? { description } : {}),
    isPartOf: { '@id': websiteRef() },
    publisher: { '@id': businessRef() },
    ...(products.length
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: products.length,
            itemListElement: products.map((product, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: absoluteUrl(`/shop/${product.slug}`),
              name: product.name
            }))
          }
        }
      : {})
  };
}

export type OfferInput = {
  slug: string;
  type: string;
  sku?: string | null;
  ships?: boolean | null;
  /** Total stock, used when the sizes are not counted separately. */
  inventory: number;
  priceCents: number;
  sizes: Array<{
    label: string;
    priceCents: number;
    inventory: number | null;
    sku?: string | null;
  }>;
};

/**
 * The `offers` for a product, one Offer per thing a shopper can actually buy.
 *
 * This used to collapse a multi-size product into a single `AggregateOffer`
 * carrying `availability`, `shippingDetails` and a return policy. Three things
 * were wrong with that, and all three mislead:
 *
 * - `availability` is not a property of an AggregateOffer, so a sold-out 6" pot
 *   was published as in stock alongside the 4" one at the aggregate's low price;
 * - a shopper arriving from a rich result saw the lowest price of the range
 *   attached to a product page that might charge three times that for the size
 *   they wanted;
 * - the size that was actually out of stock had no way to say so.
 *
 * One Offer per size fixes all three: each carries its own price, its own
 * availability from its own count, and its own `sku` suffix so the sizes are
 * distinguishable. A product sold one way still produces exactly one Offer.
 */
export function productOffers(product: OfferInput) {
  const threshold = freeShippingThresholdCents();
  const returnPolicy = returnPolicyForType(product.type);
  const url = absoluteUrl(`/shop/${product.slug}`);

  const shippingFor = (priceCents: number) =>
    product.ships === false
      ? {}
      : {
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            shippingRate: {
              '@type': 'MonetaryAmount',
              value: (
                (threshold > 0 && priceCents >= threshold ? 0 : flatShippingCents()) / 100
              ).toFixed(2),
              currency: 'USD'
            },
            shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
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
        };

  const offer = (input: {
    priceCents: number;
    available: boolean;
    name?: string;
    sku?: string | null;
  }) => ({
    '@type': 'Offer',
    ...(input.name ? { name: input.name } : {}),
    url,
    ...(input.sku ? { sku: input.sku } : {}),
    price: (input.priceCents / 100).toFixed(2),
    priceCurrency: 'USD',
    priceValidUntil: priceValidUntil(),
    itemCondition: 'https://schema.org/NewCondition',
    availability: input.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    seller: { '@id': businessRef() },
    ...shippingFor(input.priceCents),
    hasMerchantReturnPolicy: returnPolicy
  });

  if (!product.sizes.length) {
    return [
      offer({
        priceCents: product.priceCents,
        available: product.inventory > 0,
        sku: product.sku
      })
    ];
  }

  /**
   * A size only knows its own count when the owner chose to count them
   * separately; otherwise every size draws on the one shelf, and the product's
   * total is the honest answer for all of them.
   */
  const countedSeparately = product.sizes.some((size) => size.inventory != null);

  return product.sizes.map((size) =>
    offer({
      priceCents: size.priceCents,
      available: countedSeparately ? (size.inventory ?? 0) > 0 : product.inventory > 0,
      name: size.label,
      /**
       * A variant carrying its own SKU is the one the shop actually picks and
       * ships, so it is the one published. The derived suffix is only for
       * variants that never had one of their own.
       */
      sku: size.sku || (product.sku ? `${product.sku}-${size.label.replace(/\s+/g, '-')}` : null)
    })
  );
}

/**
 * Product markup, with the rating, reviews and offers a rich result is built
 * from. Reviews are capped because the markup is for eligibility, not for
 * republishing the whole page — and every string in them is customer-written, so
 * it reaches the page through `jsonLd()`'s escaping.
 */
export function productJsonLd({
  product,
  offers,
  rating,
  reviews
}: {
  product: {
    name: string;
    slug: string;
    sku?: string | null;
    botanical?: string | null;
    shortDescription?: string | null;
    description: string;
    imageUrl?: string | null;
    galleryImages?: string[];
  };
  offers: ReturnType<typeof productOffers>;
  rating: { average: number; count: number };
  reviews: Array<{
    authorName: string;
    createdAt: Date | string;
    title?: string | null;
    body: string;
    rating: number;
  }>;
}) {
  const images = [product.imageUrl, ...(product.galleryImages || [])]
    .filter(Boolean)
    .map((source) => absoluteUrl(resolveImageUrl(source)))
    .slice(0, 6);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': absoluteUrl(`/shop/${product.slug}#product`),
    name: product.name,
    description: product.shortDescription || product.description,
    url: absoluteUrl(`/shop/${product.slug}`),
    ...(images.length ? { image: images } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    // The Latin name is the same plant under another name, which is exactly what
    // `alternateName` is for — and it is how half of the searches arrive.
    ...(product.botanical ? { alternateName: product.botanical } : {}),
    brand: { '@type': 'Brand', name: 'The Hillside Gardens' },
    ...(rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.average,
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1
          }
        }
      : {}),
    ...(reviews.length
      ? {
          review: reviews.slice(0, 5).map((review) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: review.authorName },
            datePublished: new Date(review.createdAt).toISOString().slice(0, 10),
            ...(review.title ? { name: review.title } : {}),
            reviewBody: review.body,
            reviewRating: {
              '@type': 'Rating',
              ratingValue: review.rating,
              bestRating: 5,
              worstRating: 1
            }
          }))
        }
      : {}),
    // One Offer when it is sold one way; the array is what makes a multi-size
    // product describable without inventing a price nobody can pay.
    offers: offers.length === 1 ? offers[0] : offers
  };
}
