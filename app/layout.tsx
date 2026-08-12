import './globals.css';
import './editorial.css';
import './refinement.css';
import './classroom.css';
import './care-library.css';
import './homepage.css';
import './brand-mockups.css';
import './responsive-hardening.css';
import './commerce.css';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import Analytics from '@/components/Analytics';
import { CartProvider } from '@/components/CartProvider';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { absoluteUrl, businessEmail, siteBaseUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { websiteJsonLd } from '@/lib/seo';

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
  metadataBase: new URL(siteBaseUrl()),
  title: {
    default: 'The Hillside Gardens | Plants, Teas & Botanicals',
    template: '%s | The Hillside Gardens'
  },
  description:
    'Shop potted plants, loose-leaf teas, handmade soaps and lotions, explore practical plant-care sheets, and join us for in-person or online plant classes.',
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
  icons: { icon: '/logo.png', apple: '/logo.png' },
  formatDetection: {
    telephone: false,
    address: false,
    email: false
  }
  /**
   * No `alternates`, `openGraph` or `twitter` here on purpose.
   *
   * Next merges metadata by top-level field, so anything declared at this level
   * is inherited whole by every page that does not redefine it. A
   * `canonical: '/'` set here for the homepage's benefit was therefore inherited
   * by fourteen pages — including the care library and the classes page — each of
   * which then told search engines its canonical address was the homepage.
   *
   * Pages build all three together through `pageMetadata()` in `lib/seo.ts`.
   */
};

/**
 * LocalBusiness rather than a bare Store: this is a business that runs in-person
 * classes and local pickup, so address, telephone and opening hours are what make
 * it eligible for local search results and Google's business panel. Every field
 * is environment driven so nothing is published until it is real.
 */
function businessJsonLd() {
  const streetAddress = process.env.BUSINESS_STREET_ADDRESS?.trim();
  const locality = process.env.BUSINESS_CITY?.trim();
  const region = process.env.BUSINESS_STATE?.trim();
  const postalCode = process.env.BUSINESS_POSTAL_CODE?.trim();
  const telephone = process.env.BUSINESS_PHONE?.trim();
  const openingHours = process.env.BUSINESS_OPENING_HOURS?.trim();
  const hasAddress = Boolean(streetAddress && locality && region && postalCode);

  return {
    '@context': 'https://schema.org',
    '@type': hasAddress ? 'LocalBusiness' : 'Store',
    '@id': absoluteUrl('/#business'),
    name: 'The Hillside Gardens',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/logo.png'),
    image: absoluteUrl('/og-image.jpg'),
    description: 'Plants, teas, botanicals and plant education.',
    founder: { '@type': 'Person', name: 'Tammy Hill' },
    email: businessEmail(),
    priceRange: '$$',
    ...(telephone ? { telephone } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress,
            addressLocality: locality,
            addressRegion: region,
            postalCode,
            addressCountry: 'US'
          }
        }
      : {}),
    ...(openingHours
      ? { openingHours: openingHours.split('|').map((entry) => entry.trim()).filter(Boolean) }
      : {}),
    ...(process.env.NEXT_PUBLIC_INSTAGRAM_URL || process.env.NEXT_PUBLIC_FACEBOOK_URL
      ? {
          sameAs: [process.env.NEXT_PUBLIC_INSTAGRAM_URL, process.env.NEXT_PUBLIC_FACEBOOK_URL].filter(
            Boolean
          )
        }
      : {})
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hillsideSans.variable} ${hillsideDisplay.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(businessJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }}
        />
        <CartProvider>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter contactEmail={businessEmail()} />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
