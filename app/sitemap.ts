import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/store';

export default function sitemap(): MetadataRoute.Sitemap {
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
  return pages.map((path, index) => ({
    url: absoluteUrl(path || '/'),
    lastModified: new Date(),
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : path === '/shop' ? 0.9 : 0.7
  }));
}
