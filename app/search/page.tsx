import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Leaf, Package, Search, ShoppingBag } from 'lucide-react';
import BundleGrid from '@/components/BundleGrid';
import ProductGrid from '@/components/ProductGrid';
import { Prisma } from '@prisma/client';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { classFormatLabel } from '@/lib/class-access';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import {
  SEARCH_CANDIDATE_LIMIT,
  filterSearchHits,
  normalizeSearchTerm,
  searchTokenFilters,
  tokenizeSearch
} from '@/lib/search';
import { formatMoney } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

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
    description: 'Search plants, botanicals and plant care guides at The Hillside Gardens.',
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
   * The candidate query asks for each word separately rather than for the typed
   * phrase, because the word-aware filter below accepts the words in any order
   * and spread across different fields. Asked for the phrase, the database never
   * handed those rows over: "rot root" and "yellow pattern" returned nothing
   * against guides that plainly matched.
   *
   * Gated on the tokens rather than on `term`, so a query that is only
   * punctuation stops here instead of running three unfiltered table scans whose
   * every row the filter would then drop.
   */
  const searchable = tokenizeSearch(term).length > 0;

  /**
   * `catalogCount` is asked for whenever there is a term, not only when that
   * term is searchable. It is not part of the search: it decides which empty
   * state a miss gets — "try a shorter word" against a stocked shop, "we are
   * between batches" against an empty one — and a term of pure punctuation
   * lands on that same empty state. Gated alongside the candidates it read
   * zero, and `/search?q=!!!` told a shopper the shop was empty while seven
   * products were on the bench.
   */
  const [productCandidates, guideCandidates, classCandidates, bundleCandidates, catalogCount] =
    await Promise.all([
      searchable
        ? db.product.findMany({
            where: {
              active: true,
              AND: searchTokenFilters(term, [
                'name',
                'shortDescription',
                'description'
              ]) as Prisma.ProductWhereInput[]
            },
            orderBy: [{ featured: 'desc' }, { name: 'asc' }],
            take: SEARCH_CANDIDATE_LIMIT
          })
        : [],
      searchable
        ? db.careSheet.findMany({
            where: {
              published: true,
              AND: searchTokenFilters(term, [
                'plantName',
                'botanical',
                'summary',
                'symptoms',
                'category'
              ]) as Prisma.CareSheetWhereInput[]
            },
            orderBy: [{ featured: 'desc' }, { plantName: 'asc' }],
            take: SEARCH_CANDIDATE_LIMIT
          })
        : [],
      searchable && CLASSES_PUBLICLY_VISIBLE
        ? db.classEvent.findMany({
            where: {
              active: true,
              startsAt: { gte: new Date() },
              AND: searchTokenFilters(term, [
                'title',
                'description'
              ]) as Prisma.ClassEventWhereInput[]
            },
            orderBy: { startsAt: 'asc' },
            take: SEARCH_CANDIDATE_LIMIT
          })
        : [],
      /**
       * Sets cannot be filtered in SQL — how many of one can be built is a
       * minimum over its components, and per-size counts live in a JSON column
       * — so the whole (small) shelf is loaded and matched in memory like
       * everything else here. A set the shop cannot build is never in it.
       */
      searchable ? sellableBundles() : [],
      term ? db.product.count({ where: { active: true } }) : 0
    ]);

  /**
   * Prisma can only do substring `contains`. The word-aware filter is what
   * stops "tea" from matching a Monstera guide that mentions "steady watering".
   * Candidates are over-fetched so a page of false positives cannot hide a
   * real hit sitting just behind them.
   */
  const products = filterSearchHits(
    productCandidates,
    (product) => [product.name, product.shortDescription, product.description],
    term
  );
  const guides = filterSearchHits(
    guideCandidates,
    (guide) => [guide.plantName, guide.botanical, guide.summary, guide.symptoms, guide.category],
    term
  );
  const classes = filterSearchHits(
    classCandidates,
    (event) => [event.title, event.description],
    term,
    6
  );
  const bundles = filterSearchHits(
    bundleCandidates,
    // Matched on what is in the box too: somebody searching "infuser" should
    // find the Tea Starter Set that contains one.
    (bundle) => [
      bundle.title,
      bundle.tagline,
      bundle.description,
      ...bundle.items.map((item) => item.product.name)
    ],
    term,
    6
  );

  const ratings = await ratingsByProduct(products.map((product) => product.id));
  const shopProducts = products.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));

  const total = products.length + bundles.length + guides.length + classes.length;

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
                placeholder="Plants, symptoms, care topics"
                enterKeyHint="search"
              />
            </div>
            <button className="btn" type="submit">
              Search
            </button>
          </form>
          {term && (
            <p>
              {total} {total === 1 ? 'result' : 'results'} across the shop and care library.
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
              <p>Search a plant name, a symptom such as “yellow leaves”, or a product.</p>
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
