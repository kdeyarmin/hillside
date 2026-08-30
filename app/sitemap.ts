import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { sellableBundles } from '@/lib/bundle-queries';
import { SITEMAP_TTL_SECONDS } from '@/lib/cache';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { db } from '@/lib/db';
import { giftGuideProducts, loadGiftCatalog } from '@/lib/gift-catalog';
import { GIFT_GUIDES, giftGuidePath } from '@/lib/gifts';
import { absoluteUrl } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    '',
    '/shop',
    '/gifts',
    '/collections',
    '/bundles',
    // Submitting a 404 is how a sitemap loses a crawler's trust for the URLs in
    // it that are real, so the classes entry leaves with the page.
    ...(CLASSES_PUBLICLY_VISIBLE ? ['/classes'] : []),
    '/care',
    '/visit',
    '/gallery',
    '/amazon',
    '/about',
    '/contact',
    '/faq',
    '/shipping-returns',
    '/privacy',
    '/terms'
  ];

  const [products, careGuides, collections, categories, bundles, giftCatalog] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true }
    }),
    db.careSheet.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true, featured: true }
    }),
    db.collection.findMany({
      where: { active: true, products: { some: { active: true } } },
      select: { slug: true, updatedAt: true }
    }),
    /**
     * A category has a page of its own now, with its own title, its own
     * description and its own stock — which is what a crawler needs before it
     * is worth listing. Only the ones that hold something are, for the same
     * reason a homepage tile is.
     */
    db.category.findMany({
      where: { active: true, products: { some: { active: true } } },
      /**
       * The page renders the category's copy, its products and its care guides,
       * so its lastmod is the newest of the three. `category.updatedAt` alone
       * would sit still while a product was added or a guide rewritten, and a
       * crawler that finds changed content behind an unchanged date learns to
       * stop trusting the field.
       */
      select: {
        slug: true,
        updatedAt: true,
        products: { where: { active: true }, select: { updatedAt: true } },
        careSheets: { where: { published: true }, select: { updatedAt: true } }
      }
    }),
    // Only the sets that can actually be built: a kit whose last component sold
    // is a page that will not sell anything, and submitting it teaches a crawler
    // to trust the rest of this file less.
    sellableBundles(),
    loadGiftCatalog()
  ]);

  /**
   * `lastModified` on the static pages is derived from the newest thing each one
   * actually shows, not from `new Date()`. Stamping "modified right now" on every
   * fetch is worse than omitting the field: a crawler that checks twice and sees
   * the timestamp move without the content changing learns to disregard lastmod
   * across the whole sitemap, including the product and guide entries where it is
   * accurate and useful.
   */
  const newest = (dates: Date[]) =>
    dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;

  const productsModified = newest(products.map((product) => product.updatedAt));
  const guidesModified = newest(careGuides.map((guide) => guide.updatedAt));
  const collectionsModified = newest(collections.map((collection) => collection.updatedAt));
  const bundlesModified = newest(bundles.map((bundle) => bundle.updatedAt));
  const anyModified = newest(
    [productsModified, guidesModified, collectionsModified, bundlesModified].filter(
      (date): date is Date => Boolean(date)
    )
  );

  const staticModified: Record<string, Date | undefined> = {
    '': anyModified,
    '/shop': productsModified,
    '/gifts': productsModified,
    '/collections': collectionsModified,
    '/bundles': bundlesModified,
    '/care': guidesModified
  };

  const staticPages: MetadataRoute.Sitemap = pages.map((path, index) => ({
    url: absoluteUrl(path || '/'),
    // Undefined for the policy and contact pages: they are edited in the source,
    // and there is nothing here that honestly knows when that last happened.
    lastModified: staticModified[path],
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority:
      index === 0
        ? 1
        : path === '/shop' || path === '/care'
          ? 0.9
          : // The local page is the one static page that answers a search
            // ("plant shop near Ebensburg") rather than a policy question.
            path === '/visit' || path === '/collections'
            ? 0.8
            : 0.7
  }));

  const bundlePages: MetadataRoute.Sitemap = bundles.map((bundle) => ({
    url: absoluteUrl(`/bundles/${bundle.slug}`),
    lastModified: bundle.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.85
  }));

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/shop/${product.slug}`),
    lastModified: product.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8
  }));

  const guidePages: MetadataRoute.Sitemap = careGuides.map((guide) => ({
    url: absoluteUrl(`/care/${guide.slug}`),
    lastModified: guide.updatedAt,
    changeFrequency: 'monthly',
    priority: guide.featured ? 0.85 : 0.75
  }));

  const collectionPages: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: absoluteUrl(`/collections/${collection.slug}`),
    lastModified: collection.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.85
  }));

  /**
   * Only the gift guides that currently hold something. A guide is a view over
   * the catalog rather than a row of its own, so an empty one is a real page
   * with an honest empty state — and submitting it would spend crawl budget on
   * a page with nothing to index.
   */
  const giftPages: MetadataRoute.Sitemap = GIFT_GUIDES.filter(
    (guide) => giftGuideProducts(giftCatalog, guide).length > 0
  ).map((guide) => ({
    url: absoluteUrl(giftGuidePath(guide.slug)),
    lastModified: productsModified,
    changeFrequency: 'weekly',
    priority: 0.8
  }));

  /**
   * The category's own page, not `/shop?category=`. A filtered shop view
   * canonicalises to `/shop`, so submitting it here asked crawlers to index a
   * URL that tells them to look somewhere else — the fastest way to have a
   * sitemap's entries disregarded.
   */
  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: absoluteUrl(`/categories/${category.slug}`),
    lastModified:
      newest([
        category.updatedAt,
        ...category.products.map((product) => product.updatedAt),
        ...category.careSheets.map((sheet) => sheet.updatedAt)
      ]) || category.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.85
  }));

  return [
    ...staticPages,
    ...categoryPages,
    ...collectionPages,
    ...bundlePages,
    ...giftPages,
    ...productPages,
    ...guidePages
  ];
}

/**
 * Built at most once an hour rather than on every fetch.
 *
 * Six queries go into this file, including every active product, every category
 * with its products and care guides, and the full set-buildability check — and
 * a sitemap is fetched by crawlers, repeatedly, on their schedule rather than
 * ours. Nothing in it is time-critical: a product listed an hour after it was
 * published is well inside the window a crawler takes to come and look.
 *
 * `lastModified` survives the cache as an ISO string rather than a `Date`, which
 * is one of the two shapes Next accepts for the field, and serializes to exactly
 * the same `<lastmod>`.
 */
export default unstable_cache(buildSitemap, ['sitemap'], { revalidate: SITEMAP_TTL_SECONDS });
