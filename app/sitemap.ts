import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { absoluteUrl } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    '',
    '/shop',
    '/classes',
    '/care',
    '/gallery',
    '/amazon',
    '/about',
    '/contact',
    '/faq',
    '/shipping-returns',
    '/order-status',
    '/privacy',
    '/terms'
  ];

  const [products, careGuides] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true }
    }),
    db.careSheet.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true, featured: true }
    })
  ]);

  const staticPages: MetadataRoute.Sitemap = pages.map((path, index) => ({
    url: absoluteUrl(path || '/'),
    lastModified: new Date(),
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : path === '/shop' || path === '/care' ? 0.9 : 0.7
  }));

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/shop/${product.slug}`),
    lastModified: product.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8
  }));

  const guidePages: MetadataRoute.Sitemap = careGuides.map((guide) => ({
    url: absoluteUrl(`/care/${guide.slug}`),
    lastModified: guide.updatedAt,
    changeFrequency: 'monthly',
    priority: guide.featured ? 0.85 : 0.75
  }));

  return [...staticPages, ...productPages, ...guidePages];
}
