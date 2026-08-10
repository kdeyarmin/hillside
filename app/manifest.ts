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
    icons: [{ src: '/logo.png', sizes: 'any', type: 'image/png' }]
  };
}
