import type { Metadata } from 'next';
import Link from 'next/link';
import ShopClient from '@/components/ShopClient';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import {
  merchandisingFlagsFor,
  PRODUCT_CARD_SELECT,
  tagsWithFlags
} from '@/lib/merchandising-data';
import { ALL_TAGS, tagLabel } from '@/lib/product-tags';
import { parseShopFilters, shopFilterQuery } from '@/lib/shop-filters';
import { categoryLabel } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type ShopParams = Record<string, string | string[] | undefined>;

const KNOWN_TAGS = ALL_TAGS.map((tag) => tag.slug);

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<ShopParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const filters = parseShopFilters(params, KNOWN_TAGS);

  if (filters.search) {
    return {
      ...pageMetadata({
        path: '/shop',
        title: `Search: ${filters.search}`,
        description: `Products matching “${filters.search}” at The Hillside Gardens.`
      }),
      robots: { index: false, follow: true }
    };
  }

  /**
   * A filtered view is the shop with a narrower selection, not a page of its
   * own, so it keeps the shop's canonical while carrying its own title and card.
   * Categories worth their own indexable page are collections, which have one.
   */
  if (filters.tags.length === 1 && filters.category === 'ALL') {
    const label = tagLabel(filters.tags[0]);
    return pageMetadata({
      path: '/shop',
      title: `${label} plants & goods`,
      description: `Browse ${label.toLowerCase()} plants and handmade goods at The Hillside Gardens in Ebensburg, Pennsylvania.`
    });
  }

  if (filters.category !== 'ALL') {
    return pageMetadata({
      path: '/shop',
      title: `${categoryLabel(filters.category)} — Shop`,
      description: `Shop ${categoryLabel(filters.category).toLowerCase()} from The Hillside Gardens, potted and packed by hand in Ebensburg, PA.`
    });
  }

  return pageMetadata({
    path: '/shop',
    title: 'Shop Houseplants, Botanicals & Terrarium Supplies',
    description:
      'Shop houseplants, carnivorous plants, succulents, air plants, terrarium supplies, loose-leaf tea and handmade botanical goods from The Hillside Gardens in Ebensburg, PA. Filter by light, pet safety and more.',
    keywords: [
      'houseplants',
      'carnivorous plants',
      'succulents',
      'air plants',
      'terrarium supplies',
      'botanical goods',
      'pet safe plants',
      'plant shop Cambria County'
    ]
  });
}

export default async function Shop({ searchParams }: { searchParams: Promise<ShopParams> }) {
  const params = await searchParams;
  const filters = parseShopFilters(params, KNOWN_TAGS);

  const [products, collections] = await Promise.all([
    /**
     * Only the fields a card renders, and a ceiling on the row count.
     *
     * Filtering and sorting happen in the browser, so the whole catalog does
     * have to arrive; it just does not have to arrive with the long-form copy,
     * the timestamps and the gallery that no card reads.
     */
    db.product.findMany({
      where: { active: true },
      select: {
        ...PRODUCT_CARD_SELECT,
        collections: {
          where: { active: true },
          select: { slug: true, title: true, tagline: true, keywords: true }
        }
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
      take: 12
    })
  ]);

  const [ratings, flags] = await Promise.all([
    ratingsByProduct(products.map((product) => product.id)),
    merchandisingFlagsFor(products)
  ]);

  const shopProducts = products.map((product) => {
    const productFlags = flags.get(product.id);
    return {
      ...product,
      averageRating: ratings.get(product.id)?.average ?? null,
      reviewCount: ratings.get(product.id)?.count ?? 0,
      // Assigned attributes plus the ones the shop worked out, so the filter
      // rail in the browser and the badges on the cards agree.
      tags: tagsWithFlags(product, productFlags),
      flags: productFlags,
      unitsSold: productFlags?.unitsSold ?? 0
    };
  });

  const catalogEmpty = products.length === 0;

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Plants • Teas • Botanicals</div>
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
                Houseplants, carnivorous plants, succulents, air plants, terrarium supplies and
                small-batch botanical goods — potted and packed by hand in Ebensburg, Pennsylvania,
                for local pickup or shipping.
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
            // Remount when the URL's filters change, so following an internal
            // link like /shop?tags=pet-safe actually applies them rather than
            // keeping the state the component started with.
            key={shopFilterQuery(filters)}
            products={shopProducts}
            collections={collections}
            initial={filters}
          />
        </div>
      </section>
    </>
  );
}
