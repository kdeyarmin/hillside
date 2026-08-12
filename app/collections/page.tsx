import Link from 'next/link';
import BrandMockupScene from '@/components/BrandMockupScene';
import { db } from '@/lib/db';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  path: '/collections',
  title: 'Shop by collection',
  description:
    'Browse The Hillside Gardens by collection — house plants, carnivorous plants, planters, succulents, air plants, soaps, moss, driftwood, apothecary and terrarium supplies.'
});

export default async function CollectionsIndex() {
  const collections = await db.collection.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { products: { where: { active: true } } } } }
  });

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Shop the garden</div>
          <h1>Every collection.</h1>
          <p>Each collection is curated by hand, so what you see is what we actually have on the bench right now.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          {collections.length ? (
            <>
            <h2 className="sr-only">Collections</h2>
            <div className="editorial-collections">
              {collections.map((collection) => (
                <Link className="editorial-collection" href={`/collections/${collection.slug}`} key={collection.id}>
                  <BrandMockupScene
                    variant="plants"
                    imageSrc={collection.imageUrl}
                    alt={collection.title}
                  />
                  <div>
                    {/* A collection with nothing in it and no tagline used to
                        advertise "0 to browse". */}
                    <span>
                      {collection.tagline ||
                        (collection._count.products > 0
                          ? `${collection._count.products} to browse`
                          : 'Being restocked')}
                    </span>
                    <h3>{collection.title}</h3>
                    <b>Shop collection →</b>
                  </div>
                </Link>
              ))}
            </div>
            </>
          ) : (
            <div className="empty-state">
              <h3>Collections are being arranged.</h3>
              <p>In the meantime, everything we stock is in the shop.</p>
              <Link className="btn" href="/shop">Browse the shop</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
