import Link from 'next/link';
import BrandMockupScene from '@/components/BrandMockupScene';
import ProductGrid from '@/components/ProductGrid';
import type { ProductCardProduct } from '@/components/ProductCard';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { proseBlocks, readFaq, type FaqEntry } from '@/lib/category-content';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, collectionPageJsonLd, faqJsonLd } from '@/lib/seo';

/**
 * The landing page for a browsable grouping — a category or a collection.
 *
 * The shop has two of them and they are the same page. A category is the
 * structural parent (houseplants, carnivorous plants, terrarium supplies); a
 * collection cuts across it (pet friendly, gifts under $30). Both are what a
 * stranger lands on from a search, and both need the same thing: an
 * introduction, the products, the longer writing, the care guides, the
 * questions people ask, and a way onward.
 *
 * Written once, because two copies is how the collection page ends up with a
 * fix the category page never gets. Everything that differs between them —
 * where the breadcrumb points, what the siblings are called, which word the
 * empty state uses — arrives as a prop.
 */

export type GroupingLandingProps = {
  /** Site-relative path this page lives at, e.g. `/categories/houseplants`. */
  path: string;
  title: string;
  tagline?: string | null;
  description?: string | null;
  intro?: string | null;
  body?: string | null;
  /** Raw `faq` column; parsed and validated here. */
  faq?: unknown;
  /** The description the page's structured data should carry. */
  metaDescription: string;
  products: ProductCardProduct[];
  careSheets: Array<{
    id: string;
    slug: string;
    plantName: string;
    summary: string;
    category: string | null;
  }>;
  /** The index page this sits under: its name and path, for the breadcrumb. */
  parent: { name: string; path: string };
  /** What one of these is called in prose — "collection", "category". */
  noun: string;
  /** Where "filter these in the shop" points. */
  shopFilterHref: string;
  /** The other groupings of the same kind, for the links at the foot. */
  siblings: Array<{ slug: string; title: string; href: string }>;
  /** Whether anything at all is for sale, for the restocking empty state. */
  catalogHasStock: boolean;
};

export default function GroupingLanding({
  path,
  title,
  tagline,
  description,
  intro,
  body,
  faq,
  metaDescription,
  products,
  careSheets,
  parent,
  noun,
  shopFilterHref,
  siblings,
  catalogHasStock
}: GroupingLandingProps) {
  const introBlocks = proseBlocks(intro);
  const bodyBlocks = proseBlocks(body);
  const questions: FaqEntry[] = readFaq(faq);

  const pageSchema = collectionPageJsonLd({
    path,
    name: title,
    description: metaDescription,
    products
  });
  const faqSchema = faqJsonLd(path, questions);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: parent.name, path: parent.path },
              { name: title, path }
            ])
          )
        }}
      />
      {/* Only published when the page actually answers questions on it, so the
          markup can never describe an FAQ a reader cannot see. */}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }}
        />
      )}

      <section className="pagehero collection-hero">
        <div className="container">
          <div className="breadcrumbs centered">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href={parent.path}>{parent.name}</Link>
            <span>/</span>
            <span>{title}</span>
          </div>
          <div className="eyebrow">{tagline || 'Shop the garden'}</div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </section>

      <section className="content">
        <div className="container">
          {introBlocks.length > 0 && (
            <div className="category-intro prose">
              {introBlocks.map((block, index) =>
                block.kind === 'heading' ? (
                  <h2 key={index}>{block.text}</h2>
                ) : (
                  <p key={index}>{block.text}</p>
                )
              )}
            </div>
          )}

          {products.length ? (
            <>
              <div className="toolbar">
                <b>
                  {products.length} {products.length === 1 ? 'item' : 'items'}
                </b>
                <Link className="text-link" href={shopFilterHref}>
                  Filter these in the shop →
                </Link>
              </div>
              <ProductGrid products={products} />
            </>
          ) : (
            <div className="empty-state wide">
              <h3>This {noun} is being restocked.</h3>
              <p>
                New pieces are potted and photographed as they are ready. Everything below still
                applies when they land.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                {catalogHasStock ? (
                  <Link className="btn" href="/shop">
                    Browse the shop
                  </Link>
                ) : (
                  <Link className="btn" href="/care">
                    Open the care library
                  </Link>
                )}
                <Link
                  className="btn outline"
                  href={contactHref({
                    subject: 'Availability or restock',
                    message: `I'd like to ask about ${title} — is anything coming back onto the bench soon?`
                  })}
                >
                  Ask what&rsquo;s coming
                </Link>
              </div>
            </div>
          )}

          {bodyBlocks.length > 0 && (
            <div className="category-body prose">
              {bodyBlocks.map((block, index) =>
                block.kind === 'heading' ? (
                  <h3 key={index}>{block.text}</h3>
                ) : (
                  <p key={index}>{block.text}</p>
                )
              )}
            </div>
          )}

          {careSheets.length > 0 && (
            <div className="product-details-section">
              <div className="sectionhead">
                <div className="eyebrow">Before you buy</div>
                <h2>Care guides for these.</h2>
              </div>
              <div className="care-related-grid">
                {careSheets.map((sheet) => (
                  <article className="care-related-card" key={sheet.id}>
                    <span>{sheet.category || 'Care guide'}</span>
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

          {questions.length > 0 && (
            <div className="category-faq narrow">
              <div className="sectionhead">
                <div className="eyebrow">Questions we get</div>
                <h2>About {title.toLowerCase()}.</h2>
              </div>
              <div className="faq-list">
                {questions.map((entry) => (
                  <details key={entry.question}>
                    <summary>{entry.question}</summary>
                    <p className="muted">{entry.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {siblings.length > 0 && (
            <div className="category-links">
              <b>Browse another {noun}</b>
              <ul>
                {siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link href={sibling.href}>{sibling.title}</Link>
                  </li>
                ))}
                <li>
                  <Link href="/care">Plant care library</Link>
                </li>
                <li>
                  <Link href="/visit">Local pickup in Ebensburg</Link>
                </li>
              </ul>
            </div>
          )}

          <div className="collection-crosslinks">
            <BrandMockupScene
              variant="care"
              className="collection-care-scene"
              alt={`Caring for ${title.toLowerCase()}`}
              badge={false}
            />
            <div>
              <span className="eyebrow">Grow it with confidence</span>
              <h2>Free care guides for everything here.</h2>
              <p>
                Our plant care library covers watering, light, soil and the problems that actually
                come up, written for real homes rather than greenhouses.
              </p>
              <div className="actions">
                <Link className="btn" href="/care">
                  Open the care library
                </Link>
                {CLASSES_PUBLICLY_VISIBLE && (
                  <Link className="btn outline" href="/classes">
                    Join a class
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
