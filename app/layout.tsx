import './globals.css';
import './editorial.css';
import './refinement.css';
import './classroom.css';
import './care-library.css';
import './homepage-fixes.css';
import './brand-mockups.css';
import './brand-mockups-pages.css';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import { CartProvider } from '@/components/CartProvider';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { absoluteUrl, normalizeHillsideDomain } from '@/lib/store';

const hillsideSans = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hillside-sans'
});

const hillsideDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hillside-display',
  weight: ['400', '500', '600', '700']
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#203f2b',
  colorScheme: 'light'
};

export const metadata: Metadata = {
  metadataBase: new URL(normalizeHillsideDomain(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')),
  title: {
    default: 'The Hillside Gardens | Plants, Teas & Botanicals',
    template: '%s | The Hillside Gardens'
  },
  description:
    'Shop potted plants, loose-leaf teas, handmade soaps and lotions, explore practical plant-care sheets, and join Tammy Hill for in-person or online plant classes.',
  keywords: [
    'houseplants',
    'potted plants',
    'planter classes',
    'online plant classes',
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
    <html lang="en" className={`${hillsideSans.variable} ${hillsideDisplay.variable}`}>
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
