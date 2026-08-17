import Link from 'next/link';
import BrandMockupScene from '@/components/BrandMockupScene';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  path: '/collections',
  title: 'Shop by collection',
  description:
    'Browse The Hillside Gardens by collection — plants, teas and botanicals grouped the way we keep them.'
});

export default async function CollectionsIndex() {
  const collections = await db.collection.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { products: { where: { active: true } } } } }
  });

  const stocked = collections.filter((collection) => collection._count.products > 0);
  const restocking = collections.filter((collection) => collection._count.products === 0);

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Shop the garden</div>
          <h1>Every collection.</h1>
          <p>
            {stocked.length > 0
              ? 'Each collection is curated by hand. If a collection is on the bench, you will see it here.'
              : 'These are the collections we keep. Nothing is listed for sale right now — ask us what is coming next.'}
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
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
