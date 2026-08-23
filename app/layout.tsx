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
import './catalog.css';
import './merchandising.css';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import Analytics from '@/components/Analytics';
import { CartProvider } from '@/components/CartProvider';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { hasSellableBundles } from '@/lib/bundle-queries';
import { catalogHasActiveProducts, catalogHasSellableProducts } from '@/lib/catalog';
import { businessEmail, freeShippingThresholdCents, siteBaseUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { businessJsonLd, websiteJsonLd } from '@/lib/seo';

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
    'Houseplants, carnivorous plants, succulents, air plants, terrarium supplies and handmade botanical goods from The Hillside Gardens in Ebensburg, Pennsylvania — with free plant care guides.',
  keywords: [
    'houseplants',
    'carnivorous plants',
    'succulents',
    'air plants',
    'terrarium supplies',
    'botanical goods',
    'plant care',
    'plant shop Ebensburg PA'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [catalogHasProducts, hasStock, bundlesAvailable] = await Promise.all([
    catalogHasActiveProducts(),
    catalogHasSellableProducts(),
    hasSellableBundles()
  ]);
  const catalogEmpty = !catalogHasProducts;
  const giftsEmpty = !hasStock;
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
            giftsEmpty={giftsEmpty}
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
            giftsEmpty={giftsEmpty}
          />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
