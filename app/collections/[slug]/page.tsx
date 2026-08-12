import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BrandMockupScene from '@/components/BrandMockupScene';
import ProductGrid from '@/components/ProductGrid';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { absoluteUrl, resolveImageUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

async function loadCollection(slug: string) {
  return db.collection.findFirst({
    where: { slug, active: true },
    include: {
      // Card fields only — the long-form product copy is never rendered here.
      products: {
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
          badge: true
        },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        take: 200
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

  const description =
    collection.description || collection.tagline || `Shop the ${collection.title} collection at The Hillside Gardens.`;

  return pageMetadata({
    path: `/collections/${collection.slug}`,
    title: collection.title,
    description,
    image: resolveImageUrl(collection.imageUrl),
    imageAlt: collection.title
  });
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await loadCollection(slug);
  if (!collection) notFound();

  const ratings = await ratingsByProduct(collection.products.map((product) => product.id));
  const products = collection.products.map((product) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));

  const listJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.title,
    url: absoluteUrl(`/collections/${collection.slug}`),
    description: collection.description || collection.tagline || undefined,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/shop/${product.slug}`),
        name: product.name
      }))
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(listJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Collections', path: '/collections' },
              { name: collection.title, path: `/collections/${collection.slug}` }
            ])
          )
        }}
      />
      <section className="pagehero collection-hero">
        <div className="container">
          <div className="breadcrumbs centered">
            <Link href="/">Home</Link><span>/</span>
            <Link href="/collections">Collections</Link><span>/</span>
            <span>{collection.title}</span>
          </div>
          <div className="eyebrow">{collection.tagline || 'Shop the garden'}</div>
          <h1>{collection.title}</h1>
          {collection.description && <p>{collection.description}</p>}
        </div>
      </section>

      <section className="content">
        <div className="container">
          {products.length ? (
            <>
              <div className="toolbar">
                <b>{products.length} {products.length === 1 ? 'item' : 'items'}</b>
                <Link className="text-link" href="/shop">Browse everything →</Link>
              </div>
              <ProductGrid products={products} />
            </>
          ) : (
            <div className="empty-state">
              <h3>This collection is being restocked.</h3>
              <p>New pieces are potted and photographed as they are ready.</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Link className="btn" href="/shop">Browse the shop</Link>
                <Link className="btn outline" href="/contact">Ask what&rsquo;s coming</Link>
              </div>
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
                <Link className="btn" href="/care">Open the care library</Link>
                <Link className="btn outline" href="/classes">Join a class</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
