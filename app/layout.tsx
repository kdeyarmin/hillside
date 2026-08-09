import './globals.css';
import './editorial.css';
import type { Metadata } from 'next';
import { CartProvider } from '@/components/CartProvider';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { absoluteUrl, normalizeHillsideDomain } from '@/lib/store';

export const metadata: Metadata = {
  metadataBase: new URL(normalizeHillsideDomain(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')),
  title: {
    default: 'The Hillside Gardens | Plants, Teas & Botanicals',
    template: '%s | The Hillside Gardens'
  },
  description:
    'Shop potted plants, loose-leaf teas, handmade soaps and lotions, explore practical plant-care sheets, and join Tammy Hill for hands-on planter classes.',
  keywords: [
    'houseplants',
    'potted plants',
    'planter classes',
    'loose leaf tea',
    'handmade soap',
    'botanical lotion',
    'plant care'
  ],
  applicationName: 'The Hillside Gardens',
  alternates: { canonical: '/' },
  icons: { icon: '/logo.svg', apple: '/logo.svg' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'The Hillside Gardens',
    title: 'The Hillside Gardens',
    description: 'Plants, teas, botanicals and practical plant education from Tammy Hill.',
    images: [{ url: '/logo.svg', width: 720, height: 658, alt: 'The Hillside Gardens logo' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Hillside Gardens',
    description: 'Plants, teas, botanicals and practical plant education from Tammy Hill.',
    images: ['/logo.svg']
  }
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'The Hillside Gardens',
  url: absoluteUrl('/'),
  logo: absoluteUrl('/logo.svg'),
  description: 'Plants, teas, botanicals and plant education from Tammy Hill.',
  founder: { '@type': 'Person', name: 'Tammy Hill' },
  email: normalizeHillsideDomain(process.env.BUSINESS_EMAIL || 'hello@thehillsidegardens.com')
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <CartProvider>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
