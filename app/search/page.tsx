import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, FolderOpen, Leaf, Search, ShoppingBag } from 'lucide-react';
import ProductGrid from '@/components/ProductGrid';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
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
  const [productRows, guideRows, collectionRows, classRows, catalogCount] = await Promise.all([
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
            }
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
    searchable && CLASSES_PUBLICLY_VISIBLE
      ? db.classEvent.findMany({
          where: { active: true, startsAt: { gte: new Date() } },
          orderBy: { startsAt: 'asc' },
          take: 50
        })
      : [],
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
  const classes = rankSearchHits(classRows, classSearchFields, term, 6);

  const ratings = await ratingsByProduct(products.map((product) => product.id));
  const shopProducts = products.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0,
    flags: productFlags.get(product.id)
  }));

  const total = products.length + guides.length + collections.length + classes.length;

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
              {total} {total === 1 ? 'result' : 'results'} across the shop, the collections and the
              care library.
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
