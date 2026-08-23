import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BrandMockupScene from '@/components/BrandMockupScene';
import ProductGrid from '@/components/ProductGrid';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { categoryDescription, proseBlocks, readFaq } from '@/lib/category-content';
import { db } from '@/lib/db';
import { PRODUCT_CARD_SELECT, withCardFacts } from '@/lib/product-cards';
import { resolveImageUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, collectionPageJsonLd, faqJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

async function loadCollection(slug: string) {
  return db.collection.findFirst({
    where: { slug, active: true },
    include: {
      // Card fields only — the long-form product copy is never rendered here.
      products: {
        where: { active: true },
        select: PRODUCT_CARD_SELECT,
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        take: 200
      },
      /**
       * The care guides that belong with this category. A page about carnivorous
       * plants that cannot point at how to water one is half a page — and these
       * links are also the only route from a category into the library, which is
       * the part of this site strangers actually arrive at.
       */
      careSheets: {
        where: { published: true },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { plantName: 'asc' }],
        select: { id: true, slug: true, plantName: true, summary: true, category: true },
        take: 6
      }
    }
  });
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await loadCollection(slug);
  if (!collection) return { title: 'Collection not found' };

  return pageMetadata({
    path: `/collections/${collection.slug}`,
    title: collection.metaTitle?.trim() || collection.title,
    description: categoryDescription(collection),
    image: resolveImageUrl(collection.imageUrl),
    imageAlt: collection.title,
    keywords: collection.keywords
  });
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await loadCollection(slug);
  if (!collection) notFound();

  const products = await withCardFacts(collection.products);

  const [catalogCount, siblings] = await Promise.all([
    products.length > 0
      ? Promise.resolve(products.length)
      : db.product.count({ where: { active: true } }),
    /**
     * The other categories, for the internal links at the foot of the page.
     * Every one of them is a real page with its own copy, so this is a route
     * between them rather than a footer of keywords.
     */
    db.collection.findMany({
      where: { active: true, slug: { not: collection.slug } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
      take: 8
    })
  ]);

  const intro = proseBlocks(collection.intro);
  const body = proseBlocks(collection.body);
  const faq = readFaq(collection.faq);
  const path = `/collections/${collection.slug}`;

  const pageSchema = collectionPageJsonLd({
    path,
    name: collection.title,
    description: categoryDescription(collection),
    products
  });
  const faqSchema = faqJsonLd(path, faq);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Collections', path: '/collections' },
              { name: collection.title, path }
            ])
          )
        }}
      />
      {/* Only published when the category actually answers questions on the
          page, so the markup can never describe an FAQ a reader cannot see. */}
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
            <Link href="/collections">Collections</Link>
            <span>/</span>
            <span>{collection.title}</span>
          </div>
          <div className="eyebrow">{collection.tagline || 'Shop the garden'}</div>
          <h1>{collection.title}</h1>
          {collection.description && <p>{collection.description}</p>}
        </div>
      </section>

      <section className="content">
        <div className="container">
          {intro.length > 0 && (
            <div className="category-intro prose">
              {intro.map((block, index) =>
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
                <Link className="text-link" href={`/shop?collection=${collection.slug}`}>
                  Filter these in the shop →
                </Link>
              </div>
              <ProductGrid products={products} />
            </>
          ) : (
            <div className="empty-state wide">
              <h3>This collection is being restocked.</h3>
              <p>
                New pieces are potted and photographed as they are ready. Everything below still
                applies when they land.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                {catalogCount > 0 ? (
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
                    message: `I'd like to ask about the ${collection.title} collection — is anything coming back onto the bench soon?`
                  })}
                >
                  Ask what&rsquo;s coming
                </Link>
              </div>
            </div>
          )}

          {body.length > 0 && (
            <div className="category-body prose">
              {body.map((block, index) =>
                block.kind === 'heading' ? (
                  <h3 key={index}>{block.text}</h3>
                ) : (
                  <p key={index}>{block.text}</p>
                )
              )}
            </div>
          )}

          {collection.careSheets.length > 0 && (
            <div className="product-details-section">
              <div className="sectionhead">
                <div className="eyebrow">Before you buy</div>
                <h2>Care guides for this collection.</h2>
              </div>
              <div className="care-related-grid">
                {collection.careSheets.map((sheet) => (
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

          {faq.length > 0 && (
            <div className="category-faq narrow">
              <div className="sectionhead">
                <div className="eyebrow">Questions we get</div>
                <h2>About {collection.title.toLowerCase()}.</h2>
              </div>
              <div className="faq-list">
                {faq.map((entry) => (
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
              <b>Browse another collection</b>
              <ul>
                {siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link href={`/collections/${sibling.slug}`}>{sibling.title}</Link>
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
              alt={`Caring for the ${collection.title.toLowerCase()} collection`}
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
