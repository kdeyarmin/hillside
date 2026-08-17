import type { MetadataRoute } from 'next';
import { absoluteUrl, siteBaseUrl } from '@/lib/store';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The two confirmation pages carry a customer's email address and order
        // total against a session id in the URL. They are also noindex, but a
        // crawler should not be fetching them at all.
        disallow: [
          '/admin',
          '/api',
          '/cart',
          '/search',
          '/newsletter/unsubscribe',
          '/order/success',
          '/order-status',
          '/classes/success',
          '/classes/studio',
          '/classes/confirm',
          '/classes/confirmed'
        ]
      }
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    // A bare hostname. This directive is a Yandex extension that expects
    // `example.com`, not a full URL — it was emitting scheme and trailing slash.
    host: new URL(siteBaseUrl()).host
  };
}
