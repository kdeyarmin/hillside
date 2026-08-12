import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/store';

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
  noindex = false
}: PageMetadataInput): Metadata {
  const imageUrl = absoluteUrl(image?.trim() || DEFAULT_OG_IMAGE);
  const alt = imageAlt || (image ? title : DEFAULT_OG_ALT);

  return {
    title,
    description,
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
 * Declares the site's search endpoint so results can carry a sitelinks searchbox.
 * The site has had `/search` and a header search form throughout; it just never
 * said so in a form a crawler reads.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: 'The Hillside Gardens',
    url: absoluteUrl('/'),
    publisher: { '@id': absoluteUrl('/#business') },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/search?q={search_term_string}')
      },
      'query-input': 'required name=search_term_string'
    }
  };
}
