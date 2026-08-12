import type { Metadata } from 'next';
import Link from 'next/link';
import ShopClient from '@/components/ShopClient';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { categoryLabel } from '@/lib/store';
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
    return pageMetadata({
      path: '/shop',
      title: `${categoryLabel(category)} — Shop`,
      description: `Shop ${categoryLabel(category).toLowerCase()} from The Hillside Gardens.`
    });
  }
  return pageMetadata({
    path: '/shop',
    title: 'Shop Plants, Teas & Botanicals',
    description:
      'Shop potted plants, loose-leaf tea, tea supplies, handmade soap and botanical lotion from The Hillside Gardens.'
  });
}

export default async function Shop({ searchParams }: { searchParams: Promise<ShopParams> }) {
  const params = await searchParams;
  const [products, collections] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }]
    }),
    db.collection.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
      take: 8
    })
  ]);

  const ratings = await ratingsByProduct(products.map((product) => product.id));
  const withRatings = products.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Plants • Teas • Botanicals</div>
          <h1>Shop The Hillside.</h1>
          <p>Hand-selected plants and small-batch goods from our garden-inspired collection.</p>
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
          <ShopClient
            products={withRatings}
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
