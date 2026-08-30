import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Hillside Gardens',
    short_name: 'Hillside Gardens',
    description: 'Plants, teas, botanicals and plant education.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f4ec',
    theme_color: '#203f2b',
    /**
     * Purpose-sized, the way the favicons already are. This pointed at
     * `/logo.png` — 292 KB of full-resolution artwork — behind `sizes: 'any'`,
     * which only means anything for a vector: every install and every icon
     * request downloaded the lot to draw something no larger than 512px. The
     * two sizes below are what the install prompt actually asks for, and the
     * maskable copy keeps the mark inside the safe circle Android crops to.
     */
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
