/**
 * Import order is load-bearing. `globals.css` sets `body { font-family: Arial }`
 * and `refinement.css` is what replaces it with the brand face — reorder these and
 * the whole site silently falls back to Arial.
 *
 * `classroom.css` and `care-library.css` are deliberately absent: they are imported
 * by the route segments that use them, so a shopper who never opens the video
 * classroom or the care library does not download either.
 */
import './globals.css';
import './editorial.css';
import './refinement.css';
import './homepage.css';
import './brand-mockups.css';
import './responsive-hardening.css';
import './commerce.css';
import './merchandising.css';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import Analytics from '@/components/Analytics';
import { CartProvider } from '@/components/CartProvider';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { hasSellableBundles } from '@/lib/bundle-queries';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { absoluteUrl, businessEmail, freeShippingThresholdCents, siteBaseUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { websiteJsonLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const hillsideSans = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hillside-sans'
});

/**
 * No `weight` list. Cormorant Garamond ships as a variable font, and enumerating
 * four discrete weights made next/font download and preload four separate static
 * WOFF2 files instead of one variable file covering the whole axis.
 */
const hillsideDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hillside-display'
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
    'Shop potted plants, loose-leaf teas, handmade soaps and lotions, and explore practical plant-care sheets from The Hillside Gardens.',
  keywords: [
    'houseplants',
    'potted plants',
    'loose leaf tea',
    'handmade soap',
    'botanical lotion',
    'plant care'
  ],
  applicationName: 'The Hillside Gardens',
  // Purpose-sized icons. This pointed at the 296 KB full-resolution logo, which
  // every page then downloaded a second time to draw a 16px tab icon.
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
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
 * LocalBusiness rather than a bare Store: this is a business people visit and
 * collect from, so address, telephone and opening hours are what make it
 * eligible for local search results and Google's business panel. Every field is
 * environment driven so nothing is published until it is real.
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
      ? {
          openingHours: openingHours
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean)
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_INSTAGRAM_URL || process.env.NEXT_PUBLIC_FACEBOOK_URL
      ? {
          sameAs: [
            process.env.NEXT_PUBLIC_INSTAGRAM_URL,
            process.env.NEXT_PUBLIC_FACEBOOK_URL
          ].filter(Boolean)
        }
      : {})
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [catalogHasProducts, bundlesAvailable] = await Promise.all([
    catalogHasActiveProducts(),
    hasSellableBundles()
  ]);
  const catalogEmpty = !catalogHasProducts;
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
          <SiteHeader
            catalogEmpty={catalogEmpty}
            bundlesAvailable={bundlesAvailable}
            freeShippingThreshold={freeShippingThresholdCents()}
          />
          {/* tabIndex={-1} so the skip link actually moves focus. Without it Safari
            scrolls to the target and leaves focus where it was. */}
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter
            contactEmail={businessEmail()}
            catalogEmpty={catalogEmpty}
            bundlesAvailable={bundlesAvailable}
          />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
