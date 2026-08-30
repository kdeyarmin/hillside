import type { NextConfig } from 'next';

/**
 * No `output: 'standalone'` here on purpose. Every way this app is served —
 * Railway's `startCommand` (`npm run start`) and the responsive-audit workflow
 * (`npm start`) — runs `next start` against the full workspace, which is what
 * Railpack ships. Nothing ever executed `.next/standalone/server.js`, so the
 * setting only slowed the build and made every production boot log
 * `"next start" does not work with "output: standalone"`. Re-adding it is only
 * correct together with a start command that actually runs the standalone
 * server and a build step that copies `public/` and `.next/static` into it.
 */

/** Where the Telnyx classroom SDK is fetched from, so the CSP can admit it. */
const TELNYX_SDK_ORIGIN = 'https://cdn.jsdelivr.net';

/**
 * The site's Content-Security-Policy.
 *
 * `'unsafe-inline'` is in `script-src` because the App Router bootstraps
 * hydration with inline scripts, and because the JSON-LD blocks in the layout
 * are `<script>` elements too — a non-executable `type` still has to pass
 * `script-src`. Removing it means minting a nonce per request in middleware and
 * threading it through every inline script, which is a worthwhile change and a
 * separate one; what this policy buys today is that an injected `<script src>`
 * pointing anywhere but the four origins below does not load, the page cannot be
 * framed, and a hijacked form cannot post off-site.
 *
 * Set `CSP_REPORT_ONLY=true` to have the browser report violations without
 * enforcing them. That is the way to tighten this safely: turn it on, watch the
 * console on the classroom and checkout pages, then turn it back off.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com ${TELNYX_SDK_ORIGIN}`,
  // next/font inlines the face declarations, and React inlines style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://m.media-amazon.com https://www.google-analytics.com",
  "font-src 'self' data:",
  // Telnyx video negotiates over HTTPS and then holds a websocket open.
  "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://*.telnyx.com wss://*.telnyx.com",
  // Camera and microphone streams in the classroom arrive as blob URLs.
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  // Stripe is reached by navigation, not by form post, so 'self' is enough.
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests'
].join('; ');

const securityHeaders = [
  {
    key: process.env.CSP_REPORT_ONLY === 'true'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy',
    value: contentSecurityPolicy
  },
  /**
   * Two years, with subdomains, and preload-eligible. Railway terminates TLS and
   * serves this site over HTTPS only; the header is what stops a first visit
   * typed as `http://` from being downgradeable in the first place.
   */
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  // Belt and braces with frame-ancestors above, for anything that predates CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /**
   * The classroom asks for camera and microphone from this origin, so those two
   * stay on `self`. Everything else the shop has no use for is refused outright,
   * which is what keeps a third-party script from quietly asking on its behalf.
   */
  {
    key: 'Permissions-Policy',
    value: [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=()',
      'browsing-topics=()',
      'interest-cohort=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()'
    ].join(', ')
  }
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'm.media-amazon.com' }]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      /**
       * The photographs in `public/images` are 4.4 MB of WebP that Next serves
       * with `Cache-Control: max-age=0`, so every repeat visit and every
       * navigation re-validated all of them — while owner uploads, served by
       * `app/media/[filename]`, were already `immutable`.
       *
       * Not `immutable` here, because these filenames are not content-hashed:
       * re-exporting a photograph reuses its name, and `immutable` would leave
       * the old bytes in a shopper's browser for as long as the max-age. A day
       * of freshness with a week of stale-while-revalidate gives the repeat
       * visitor an instant paint and picks the new file up in the background.
       */
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800'
          }
        ]
      },
      {
        source: '/:file(icon-192.png|icon-512.png|icon-maskable-512.png|icon.png|apple-icon.png|logo.png|logo-badge.png|og-image.jpg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
        ]
      }
    ];
  }
};

export default nextConfig;
