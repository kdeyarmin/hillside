import type { Metadata } from 'next';
import Link from 'next/link';
import ShopClient from '@/components/ShopClient';
import { db } from '@/lib/db';
import { withCategory } from '@/lib/product-categories';
import { ratingsByProduct } from '@/lib/reviews';
import { categoryLabel, isLegacyCategoryFilter } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type ShopParams = { category?: string; q?: string; sort?: string; sale?: string };

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<ShopParams>;
}): Promise<Metadata> {
  const { q, category } = await searchParams;
  if (q?.trim()) {
    return {
      ...pageMetadata({
        path: '/shop',
        title: `Search: ${q.trim()}`,
        description: `Products matching “${q.trim()}” at The Hillside Gardens.`
      }),
      robots: { index: false, follow: true }
    };
  }
  // A filtered view is the shop with a narrower selection, not a page of its own,
  // so it keeps the shop's canonical while carrying its own title and card.
  if (category && category.toUpperCase() !== 'ALL') {
    /**
     * The category's own row supplies the title and the sentence under it, so a
     * shared `/shop?category=carnivorous-plants` link previews as what Tammy
     * called the shelf rather than as a slug. A legacy `?category=BOTANICAL`
     * link has no row, and `categoryLabel` is what answers for it.
     */
    const row = isLegacyCategoryFilter(category)
      ? null
      : await db.category.findUnique({
          where: { slug: category },
          select: { title: true, description: true, tagline: true }
        });
    const title = row?.title || categoryLabel(category);
    return pageMetadata({
      path: '/shop',
      title: `${title} — Shop`,
      description:
        row?.description || row?.tagline || `Shop ${title.toLowerCase()} from The Hillside Gardens.`
    });
  }
  return pageMetadata({
    path: '/shop',
    title: 'Shop Plants, Botanical Goods & Creative Planting',
    description:
      'Shop houseplants, carnivorous plants, succulents, air plants, living arrangements, terrarium supplies, moss, driftwood, handmade soap, botanical lotion and tea from The Hillside Gardens.'
  });
}

export default async function Shop({ searchParams }: { searchParams: Promise<ShopParams> }) {
  const params = await searchParams;
  const [products, collections, categories] = await Promise.all([
    /**
     * Only the fields a card renders, and a ceiling on the row count.
     *
     * This read the whole product table with no `select` and no `take`, then
     * handed full rows to `ShopClient`, which is a client component — so
     * `details`, `careNotes`, `shippingNote`, `galleryImages`, `sku` and the
     * timestamps were serialized twice per request (once into the HTML, once into
     * the RSC payload) having never been read. Filtering and sorting happen in the
     * browser, so the whole catalog does have to arrive; it just does not have to
     * arrive twice over in full.
     */
    db.product.findMany({
      where: { active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        shortDescription: true,
        description: true,
        type: true,
        priceCents: true,
        compareAtCents: true,
        inventory: true,
        imageUrl: true,
        badge: true,
        sizes: true,
        sizeLabel: true,
        featured: true,
        sortOrder: true,
        createdAt: true,
        ships: true,
        pickup: true,
        // Two strings, not the joined row: a card renders one pill from it and
        // the whole catalog is serialized into the browser twice over.
        category: { select: { slug: true, title: true } }
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      // A ceiling, not a page size. The client-side filter needs the full catalog;
      // this only stops one runaway import from producing an unbounded response.
      take: 500
    }),
    db.collection.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
      take: 8
    }),
    // Every category the owner has not hidden, in her order. The chips are
    // narrowed to the ones that hold something in the browser, where the
    // catalog being filtered already is.
    db.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true }
    })
  ]);

  const ratings = await ratingsByProduct(products.map((product) => product.id));
  const withRatings = products.map((product) => ({
    ...withCategory(product),
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));

  const catalogEmpty = products.length === 0;

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Plants • Botanical goods • Creative planting</div>
          {catalogEmpty ? (
            <>
              <h1>The bench is between batches.</h1>
              <p>
                We only list what is actually ready to go home. New plants and small-batch goods
                appear here as they are potted and photographed.
              </p>
            </>
          ) : (
            <>
              <h1>Shop The Hillside.</h1>
              <p>
                Houseplants, carnivorous plants, succulents and air plants; living arrangements and
                terrarium supplies; moss, driftwood, handmade soap, botanical lotion and tea.
                Shipped across the US, or collected here in Ebensburg.
              </p>
            </>
          )}
          {collections.length > 0 && (
            <div className="pagehero-links">
              <span>Jump to a collection:</span>
              {collections.map((collection) => (
                <Link href={`/collections/${collection.slug}`} key={collection.slug}>
                  {collection.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="content">
        <div className="container">
          <h2 className="sr-only">Products</h2>
          <ShopClient
            key={`${params.category || 'ALL'}|${params.q || ''}|${params.sort || 'featured'}|${params.sale === 'true'}`}
            products={withRatings}
            categories={categories}
            initialCategory={params.category || 'ALL'}
            initialSearch={params.q || ''}
            initialSort={params.sort || 'featured'}
            initialOnSaleOnly={params.sale === 'true'}
          />
        </div>
      </section>
    </>
  );
}
