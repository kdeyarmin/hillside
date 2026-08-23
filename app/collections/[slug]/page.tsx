import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GroupingLanding from '@/components/GroupingLanding';
import { categoryDescription } from '@/lib/category-content';
import { db } from '@/lib/db';
import { PRODUCT_CARD_SELECT, withCardFacts } from '@/lib/product-cards';
import { resolveImageUrl } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

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
    db.collection.findMany({
      where: { active: true, slug: { not: collection.slug } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
      take: 8
    })
  ]);

  /**
   * The page itself is `components/GroupingLanding.tsx`, shared with the
   * category route. A collection and a category are the same page with a
   * different parent — writing it twice is how one of them ends up carrying a
   * fix the other never gets.
   */
  return (
    <GroupingLanding
      path={`/collections/${collection.slug}`}
      title={collection.title}
      tagline={collection.tagline}
      description={collection.description}
      intro={collection.intro}
      body={collection.body}
      faq={collection.faq}
      metaDescription={categoryDescription(collection)}
      products={products}
      careSheets={collection.careSheets}
      parent={{ name: 'Collections', path: '/collections' }}
      noun="collection"
      shopFilterHref={`/shop?collection=${collection.slug}`}
      siblings={siblings.map((sibling) => ({
        slug: sibling.slug,
        title: sibling.title,
        href: `/collections/${sibling.slug}`
      }))}
      catalogHasStock={catalogCount > 0}
    />
  );
}
