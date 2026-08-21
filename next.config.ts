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
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'm.media-amazon.com' }
    ]
  }
};

export default nextConfig;
