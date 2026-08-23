import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GroupingLanding from '@/components/GroupingLanding';
import { categoryDescription } from '@/lib/category-content';
import { db } from '@/lib/db';
import { PRODUCT_CARD_SELECT, withCardFacts } from '@/lib/product-cards';
import { resolveImageUrl } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * A category's own page.
 *
 * Categories are the structural half of the catalog — houseplants, carnivorous
 * plants, succulents, terrarium supplies — and so they are what people search
 * for. Until this route existed they were reachable only as `/shop?category=`,
 * a filtered grid that canonicalises to `/shop`: no introduction, no care
 * guides, no questions answered, and nothing for a search engine to index
 * separately. The sitemap was submitting those filtered URLs, which declare a
 * canonical pointing somewhere else — an instruction to ignore them.
 *
 * The shop filter still works and is still the right tool for narrowing. This is
 * the page it narrows *from*.
 */
async function loadCategory(slug: string) {
  return db.category.findFirst({
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
       * links are also a route from the shop into the care library, which is the
       * part of this site strangers actually arrive at.
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
  const category = await loadCategory(slug);
  if (!category) return { title: 'Category not found' };

  return pageMetadata({
    path: `/categories/${category.slug}`,
    title: category.metaTitle?.trim() || category.title,
    description: categoryDescription(category),
    image: resolveImageUrl(category.imageUrl),
    imageAlt: category.title,
    keywords: category.keywords
  });
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();

  const products = await withCardFacts(category.products);

  const [catalogCount, siblings] = await Promise.all([
    products.length > 0
      ? Promise.resolve(products.length)
      : db.product.count({ where: { active: true } }),
    /**
     * The other categories, for the links at the foot. Every one is a real page
     * with its own copy, so this is a route between them rather than a footer of
     * keywords.
     */
    db.category.findMany({
      where: { active: true, slug: { not: category.slug } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true },
      take: 8
    })
  ]);

  return (
    <GroupingLanding
      path={`/categories/${category.slug}`}
      title={category.title}
      tagline={category.tagline}
      description={category.description}
      intro={category.intro}
      body={category.body}
      faq={category.faq}
      metaDescription={categoryDescription(category)}
      products={products}
      careSheets={category.careSheets}
      parent={{ name: 'Shop', path: '/shop' }}
      noun="category"
      shopFilterHref={`/shop?category=${category.slug}`}
      siblings={siblings.map((sibling) => ({
        slug: sibling.slug,
        title: sibling.title,
        href: `/categories/${sibling.slug}`
      }))}
      catalogHasStock={catalogCount > 0}
    />
  );
}
