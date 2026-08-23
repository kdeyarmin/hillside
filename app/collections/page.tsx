import Link from 'next/link';
import BrandMockupScene from '@/components/BrandMockupScene';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { bestSellingCategory } from '@/lib/merchandising-data';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  path: '/collections',
  title: 'Plant & Botanical Collections',
  description:
    'Browse The Hillside Gardens by collection — beginner friendly, low light, pet friendly and other hand-picked groupings across the whole shop.'
});

export default async function CollectionsIndex() {
  const [collections, bestSelling] = await Promise.all([
    db.collection.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } }
    }),
    /**
     * Worked out from paid orders, and null until enough of them have been
     * placed — so this line appears when it is true and simply is not there when
     * the shop has nothing to say.
     */
    bestSellingCategory()
  ]);

  const stocked = collections.filter((collection) => collection._count.products > 0);
  const restocking = collections.filter((collection) => collection._count.products === 0);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Collections', path: '/collections' }
            ])
          )
        }}
      />
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Chosen by Tammy</div>
          <h1>Every collection.</h1>
          <p>
            {stocked.length > 0
              ? 'A collection answers a question rather than naming a shelf — forgiving for a beginner, happy in low light, safe around a cat. Each one is picked by hand and can hold anything in the shop.'
              : 'These are the collections we keep. Nothing is listed for sale right now — ask us what is coming next.'}
          </p>
          <p className="pagehero-links">
            <span>Looking for a particular kind of thing?</span>
            <Link href="/shop">Browse the shop by category</Link>
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {bestSelling && stocked.length > 0 && (
            <div className="toolbar">
              <b>Most shopped right now: {bestSelling.label}</b>
              <Link className="text-link" href={`/shop?category=${bestSelling.key}`}>
                Shop {bestSelling.label.toLowerCase()} →
              </Link>
            </div>
          )}
          {stocked.length > 0 && (
            <>
              <h2 className="sr-only">Collections on the bench</h2>
              <div className="editorial-collections">
                {stocked.map((collection) => (
                  <Link
                    className="editorial-collection"
                    href={`/collections/${collection.slug}`}
                    key={collection.id}
                  >
                    <BrandMockupScene
                      variant="plants"
                      imageSrc={collection.imageUrl}
                      alt={collection.title}
                    />
                    <div>
                      <span>{collection.tagline || `${collection._count.products} to browse`}</span>
                      <h3>{collection.title}</h3>
                      <b>Shop collection →</b>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {restocking.length > 0 && (
            <div className="restock-panel">
              <div className="eyebrow">Being restocked</div>
              <h2>
                {stocked.length > 0
                  ? 'These collections are off the bench right now.'
                  : 'Nothing in these collections is ready to shop.'}
              </h2>
              <p>
                New pieces are potted and photographed as they are ready. Ask about a specific
                collection if you have something in mind.
              </p>
              <ul className="restock-list">
                {restocking.map((collection) => (
                  <li key={collection.id}>
                    <Link href={`/collections/${collection.slug}`}>{collection.title}</Link>
                    <Link
                      className="text-link"
                      href={contactHref({
                        subject: 'Availability or restock',
                        message: `I'd like to ask about the ${collection.title} collection — is anything coming back onto the bench soon?`
                      })}
                    >
                      Ask about this
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="category-links">
            <b>Also worth a look</b>
            <ul>
              <li>
                <Link href="/shop">Shop everything</Link>
              </li>
              <li>
                <Link href="/care">Plant care library</Link>
              </li>
              <li>
                <Link href="/visit">Local pickup in Ebensburg</Link>
              </li>
              <li>
                <Link href="/shop?tags=pet-safe">Pet safe plants</Link>
              </li>
              <li>
                <Link href="/shop?tags=beginner-friendly">Beginner friendly plants</Link>
              </li>
              <li>
                <Link href="/shop?tags=low-light">Low light plants</Link>
              </li>
            </ul>
          </div>

          {collections.length === 0 && (
            <div className="empty-state">
              <h3>Collections are being arranged.</h3>
              <p>In the meantime, the care library is open and Tammy is happy to talk plants.</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Link className="btn" href="/care">
                  Plant care library
                </Link>
                <Link
                  className="btn outline"
                  href={contactHref({ subject: 'Custom planter arrangement' })}
                >
                  Ask about a custom arrangement
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
