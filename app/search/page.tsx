import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, FolderOpen, Leaf, Package, Search, ShoppingBag } from 'lucide-react';
import BundleGrid from '@/components/BundleGrid';
import ProductGrid from '@/components/ProductGrid';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
import { db } from '@/lib/db';
import { withCardFacts } from '@/lib/product-cards';
import { classFormatLabel } from '@/lib/class-access';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import {
  careSheetSearchFields,
  classSearchFields,
  collectionSearchFields,
  productSearchFields
} from '@/lib/catalog-search';
import {
  merchandisingFlagsFor,
  PRODUCT_CARD_SELECT,
  tagsWithFlags
} from '@/lib/merchandising-data';
import { normalizeSearchTerm, rankSearchHits, tokenizeSearch } from '@/lib/search';
import { formatMoney } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * How many rows are read before ranking happens in memory.
 *
 * Searching in SQL is what this page used to do, and it could not answer the
 * questions people actually type. "pet safe", "low light" and "beginner" are
 * attributes rather than words in the copy; "pothos" is often a botanical name;
 * "carnivorous" is a category. None of them are a `contains` match on a product
 * description, so all of them returned nothing.
 *
 * With a catalog of a few hundred rows, reading the searchable columns and
 * ranking them here is both better and cheaper than building an index the shop
 * is nowhere near large enough to need. These ceilings exist so that stops being
 * true loudly rather than quietly, if the shop ever grows into it.
 */
const PRODUCT_SCAN_LIMIT = 400;
const GUIDE_SCAN_LIMIT = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const term = q?.trim();
  return pageMetadata({
    path: '/search',
    title: term ? `Search: ${term}` : 'Search',
    description:
      'Search plants, botanical goods, collections and plant care guides at The Hillside Gardens.',
    noindex: true
  });
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = normalizeSearchTerm(q || '');

  /**
   * A term of pure punctuation cannot match anything — `tokenizeSearch` drops
   * it — so the scans below are gated on there being a token rather than on
   * there being a term. Otherwise `/search?q=!!!` runs four full scans whose
   * every row the ranking then discards.
   */
  const searchable = tokenizeSearch(term).length > 0;

  /**
   * `catalogCount` is asked for whenever there is a term, not only when that
   * term is searchable. It is not part of the search: it decides which empty
   * state a miss gets — "try a shorter word" against a stocked shop, "we are
   * between batches" against an empty one — and a term of pure punctuation
   * lands on that same empty state. Gated alongside the scans it would read
   * zero, and `/search?q=!!!` would tell a shopper the shop was empty while
   * seven products were on the bench.
   */
  const [
    productRows,
    guideRows,
    collectionRows,
    categoryRows,
    classRows,
    bundleRows,
    catalogCount
  ] = await Promise.all([
    searchable
      ? db.product.findMany({
          where: { active: true },
          select: {
            ...PRODUCT_CARD_SELECT,
            sku: true,
            details: true,
            careNotes: true,
            collections: {
              where: { active: true },
              select: { slug: true, title: true, tagline: true, keywords: true }
            },
            /**
             * `slug` as well as the card needs, plus the category's own search
             * words — so a synonym the owner stored there finds the products in
             * it and not only the page.
             */
            category: { select: { slug: true, title: true, keywords: true } }
          },
          orderBy: [{ featured: 'desc' }, { name: 'asc' }],
          take: PRODUCT_SCAN_LIMIT
        })
      : [],
    searchable
      ? db.careSheet.findMany({
          where: { published: true },
          orderBy: [{ featured: 'desc' }, { plantName: 'asc' }],
          take: GUIDE_SCAN_LIMIT
        })
      : [],
    searchable
      ? db.collection.findMany({
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            slug: true,
            title: true,
            tagline: true,
            description: true,
            intro: true,
            keywords: true
          },
          take: 50
        })
      : [],
    /**
     * Categories rank as results in their own right. They are landing pages
     * with their own copy now, and an empty one could otherwise never be
     * found at all — the products were the only route to it.
     */
    searchable
      ? db.category.findMany({
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            slug: true,
            title: true,
            tagline: true,
            description: true,
            intro: true,
            keywords: true
          },
          take: 50
        })
      : [],
    searchable && CLASSES_PUBLICLY_VISIBLE
      ? db.classEvent.findMany({
          where: { active: true, startsAt: { gte: new Date() } },
          orderBy: { startsAt: 'asc' },
          take: 50
        })
      : [],
    /**
     * Sets cannot be filtered in SQL — how many of one can be built is a minimum
     * over its components, and per-size counts live in a JSON column — so the
     * whole (small) shelf is loaded and matched in memory like everything else
     * here. A set the shop cannot build is never in it.
     */
    searchable ? sellableBundles() : [],
    term ? db.product.count({ where: { active: true } }) : 0
  ]);

  // Derived attributes first, so "best seller" and "in stock" are searchable
  // terms rather than things only the filter rail knows about.
  const productFlags = await merchandisingFlagsFor(productRows);

  const products = rankSearchHits(
    productRows,
    (product) => productSearchFields(product, tagsWithFlags(product, productFlags.get(product.id))),
    term
  );
  const guides = rankSearchHits(guideRows, careSheetSearchFields, term);
  const collections = rankSearchHits(collectionRows, collectionSearchFields, term, 6);
  const categories = rankSearchHits(categoryRows, collectionSearchFields, term, 6);
  const classes = rankSearchHits(classRows, classSearchFields, term, 6);
  const bundles = rankSearchHits(
    bundleRows,
    // Matched on what is in the box too: somebody searching "infuser" should
    // find the Tea Starter Set that contains one.
    (bundle) => ({
      primary: [bundle.title],
      secondary: [
        bundle.tagline,
        bundle.description,
        ...bundle.items.map((item) => item.product.name)
      ]
    }),
    term,
    6
  );

  const shopProducts = await withCardFacts(products);

  const total =
    products.length +
    bundles.length +
    guides.length +
    categories.length +
    collections.length +
    classes.length;

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Search</div>
          <h1>{term ? `Results for “${term}”` : 'Search The Hillside Gardens'}</h1>
          <form className="search-page-form" action="/search" role="search">
            <label className="sr-only" htmlFor="search-page-input">
              Search the whole site
            </label>
            <div className="search-wrap">
              <Search size={18} aria-hidden="true" />
              <input
                id="search-page-input"
                className="search-input"
                type="search"
                name="q"
                defaultValue={term}
                placeholder="pothos, pet safe, low light, carnivorous, terrarium"
                enterKeyHint="search"
              />
            </div>
            <button className="btn" type="submit">
              Search
            </button>
          </form>
          {term && (
            <p>
              {total} {total === 1 ? 'result' : 'results'} across the shop, the categories, the
              collections and the care library.
            </p>
          )}
        </div>
      </section>

      <section className="content">
        <div className="container">
          {!term && (
            <div className="empty-state">
              <Search size={38} />
              <h3>What are you looking for?</h3>
              <p>
                Search a plant name, a botanical name, a symptom such as “yellow leaves”, or what
                you need from a plant — “pet safe”, “low light”, “beginner”.
              </p>
            </div>
          )}

          {term && total === 0 && (
            <div className="empty-state wide">
              <Search size={38} />
              <h3>Nothing matched “{term}”.</h3>
              {catalogCount === 0 ? (
                <p>
                  The shop is between batches, so there is nothing for sale to match that word. The
                  care library is still open, and Tammy is happy to talk about what is coming.
                </p>
              ) : (
                <p>Try a shorter word, or browse the shop and care library directly.</p>
              )}
              <div className="actions" style={{ justifyContent: 'center' }}>
                {catalogCount > 0 ? (
                  <Link className="btn" href="/shop">
                    Browse the shop
                  </Link>
                ) : (
                  <Link className="btn" href={contactHref({ subject: 'Availability or restock' })}>
                    Ask what&rsquo;s coming
                  </Link>
                )}
                <Link className="btn outline" href="/care">
                  Plant care library
                </Link>
              </div>
            </div>
          )}

          {shopProducts.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <ShoppingBag size={14} /> Shop
                  </div>
                  <h2>
                    {shopProducts.length} {shopProducts.length === 1 ? 'product' : 'products'}
                  </h2>
                </div>
                <Link className="editorial-link" href={`/shop?q=${encodeURIComponent(term)}`}>
                  Refine in the shop →
                </Link>
              </div>
              <ProductGrid products={shopProducts} />
            </div>
          )}

          {bundles.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <Package size={14} /> Sets &amp; kits
                  </div>
                  <h2>
                    {bundles.length} {bundles.length === 1 ? 'set' : 'sets'}
                  </h2>
                </div>
                <Link className="editorial-link" href="/bundles">
                  All sets &rarr;
                </Link>
              </div>
              <BundleGrid bundles={bundles.map(bundleCardData)} />
            </div>
          )}

          {categories.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <FolderOpen size={14} /> Categories
                  </div>
                  <h2>
                    {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                  </h2>
                </div>
                <Link className="editorial-link" href="/shop">
                  Shop everything →
                </Link>
              </div>
              <div className="care-related-grid">
                {categories.map((category) => (
                  <article className="care-related-card" key={category.id}>
                    <span>Category</span>
                    <h3>
                      <Link href={`/categories/${category.slug}`}>{category.title}</Link>
                    </h3>
                    <p>{category.tagline || category.description}</p>
                    <Link className="text-link" href={`/categories/${category.slug}`}>
                      Browse the category →
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}

          {collections.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <FolderOpen size={14} /> Collections
                  </div>
                  <h2>
                    {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
                  </h2>
                </div>
                <Link className="editorial-link" href="/collections">
                  All collections →
                </Link>
              </div>
              <div className="care-related-grid">
                {collections.map((collection) => (
                  <article className="care-related-card" key={collection.id}>
                    <span>Collection</span>
                    <h3>
                      <Link href={`/collections/${collection.slug}`}>{collection.title}</Link>
                    </h3>
                    <p>{collection.tagline || collection.description}</p>
                    <Link className="text-link" href={`/collections/${collection.slug}`}>
                      Browse the collection →
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}

          {guides.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <Leaf size={14} /> Plant care
                  </div>
                  <h2>
                    {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
                  </h2>
                </div>
                <Link className="editorial-link" href="/care">
                  Open the library →
                </Link>
              </div>
              <div className="care-related-grid">
                {guides.map((guide) => (
                  <article className="care-related-card" key={guide.id}>
                    <span>{guide.category || 'Care guide'}</span>
                    <h3>
                      <Link href={`/care/${guide.slug}`}>{guide.plantName}</Link>
                    </h3>
                    <p>{guide.summary}</p>
                    <Link className="text-link" href={`/care/${guide.slug}`}>
                      Read guide →
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}

          {classes.length > 0 && (
            <div className="search-group">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">
                    <CalendarDays size={14} /> Classes
                  </div>
                  <h2>{classes.length} upcoming</h2>
                </div>
                <Link className="editorial-link" href="/classes">
                  All classes →
                </Link>
              </div>
              <div className="care-related-grid">
                {classes.map((event) => (
                  <article className="care-related-card" key={event.id}>
                    <span>{classFormatLabel(event.format)}</span>
                    <h3>
                      <Link href={`/classes#class-${event.id}`}>{event.title}</Link>
                    </h3>
                    <p>
                      {event.startsAt.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                      })}
                      {' · '}
                      {event.priceCents > 0
                        ? `${formatMoney(event.priceCents)} per person`
                        : 'Free'}
                    </p>
                    <Link className="text-link" href={`/classes#class-${event.id}`}>
                      See the class →
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
