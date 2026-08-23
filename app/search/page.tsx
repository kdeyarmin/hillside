import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Leaf, Package, Search, ShoppingBag } from 'lucide-react';
import BundleCard from '@/components/BundleCard';
import ProductGrid from '@/components/ProductGrid';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { classFormatLabel } from '@/lib/class-access';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { SEARCH_CANDIDATE_LIMIT, filterSearchHits, normalizeSearchTerm } from '@/lib/search';
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
  const contains = { contains: term, mode: 'insensitive' as const };

  const [productCandidates, guideCandidates, classCandidates, bundleCandidates, catalogCount] = term
    ? await Promise.all([
        db.product.findMany({
          where: {
            active: true,
            OR: [{ name: contains }, { shortDescription: contains }, { description: contains }]
          },
          orderBy: [{ featured: 'desc' }, { name: 'asc' }],
          take: SEARCH_CANDIDATE_LIMIT
        }),
        db.careSheet.findMany({
          where: {
            published: true,
            OR: [
              { plantName: contains },
              { botanical: contains },
              { summary: contains },
              { symptoms: contains },
              { category: contains }
            ]
          },
          orderBy: [{ featured: 'desc' }, { plantName: 'asc' }],
          take: SEARCH_CANDIDATE_LIMIT
        }),
        CLASSES_PUBLICLY_VISIBLE
          ? db.classEvent.findMany({
              where: {
                active: true,
                startsAt: { gte: new Date() },
                OR: [{ title: contains }, { description: contains }]
              },
              orderBy: { startsAt: 'asc' },
              take: SEARCH_CANDIDATE_LIMIT
            })
          : [],
        /**
         * Sets are filtered by availability rather than by SQL, so the whole
         * (small) shelf is loaded and matched in memory like everything else
         * here — and a set the shop cannot build never reaches the results.
         */
        sellableBundles(),
        db.product.count({ where: { active: true } })
      ])
    : [[], [], [], [], 0];

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
              <div className="product-grid">
                {bundles.map((bundle) => (
                  <BundleCard bundle={bundleCardData(bundle)} key={bundle.slug} />
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
