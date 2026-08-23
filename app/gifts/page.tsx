import Link from 'next/link';
import { Gift, MessageSquareHeart, PackageCheck, Truck } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import InlineNewsletter from '@/components/InlineNewsletter';
import ProductGrid from '@/components/ProductGrid';
import { contactHref } from '@/lib/contact';
import { giftGuideProducts, loadGiftCatalog, toGiftCard } from '@/lib/gift-catalog';
import { findGiftGuide, GIFT_GUIDES, giftGuidePath } from '@/lib/gifts';
import { jsonLd } from '@/lib/json-ld';
import { absoluteUrl, formatMoneyCompact, freeShippingThresholdCents } from '@/lib/store';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/gifts',
  title: 'Gift Guide',
  description:
    'Gifts from The Hillside Gardens — ready-to-give bundles, gifts under $25 and $50, and picks for plant lovers, tea drinkers, teachers and new homes. Add a gift message free at checkout.'
});

const HUB_ROWS = 4;
const ROW_SIZE = 4;

export default async function GiftsHub() {
  const catalog = await loadGiftCatalog();
  const bundlesGuide = findGiftGuide('bundles');
  const bundles = bundlesGuide ? giftGuideProducts(catalog, bundlesGuide) : [];
  const freeShippingThreshold = freeShippingThresholdCents();

  /** Only guides with something in them, so no tile leads to an empty shelf. */
  const stocked = GIFT_GUIDES.map((guide) => ({
    guide,
    products: giftGuideProducts(catalog, guide)
  })).filter((entry) => entry.products.length > 0);

  const priceGuides = stocked.filter((entry) => entry.guide.kind === 'price');
  const occasionGuides = stocked.filter((entry) => entry.guide.kind === 'occasion');
  const rails = occasionGuides.slice(0, HUB_ROWS);

  const listJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Gift guide',
    url: absoluteUrl('/gifts'),
    description: 'Gifts for plant lovers, tea drinkers, teachers and new homes.',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: stocked.length,
      itemListElement: stocked.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(giftGuidePath(entry.guide.slug)),
        name: entry.guide.title
      }))
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(listJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Gifts', path: '/gifts' }
            ])
          )
        }}
      />

      <section className="pagehero gift-hero">
        <div className="container">
          <div className="eyebrow">
            <Gift size={15} aria-hidden="true" /> The gift guide
          </div>
          <h1>Give something that grows.</h1>
          <p>
            {catalog.length > 0
              ? 'Bundles we put together ourselves, plus plants, teas and handmade botanicals sorted by who you are buying for and what you want to spend.'
              : 'Nothing is on the bench to send right now. Ask about a custom arrangement and we will put something together by hand.'}
          </p>
          {stocked.length > 0 && (
            <nav className="gift-jump" aria-label="Gift guides">
              {stocked.map((entry) => (
                <Link key={entry.guide.slug} href={giftGuidePath(entry.guide.slug)}>
                  {entry.guide.shortTitle}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      <section className="content gift-content">
        <div className="container">
          {/* Bundles lead. They are the easiest thing to give and the hardest
              thing to find on a shop page organised by plant type. */}
          {bundles.length > 0 && bundlesGuide && (
            <section className="gift-bundles" aria-labelledby="gift-bundles-heading">
              <div className="gift-bundles-head">
                <div>
                  <div className="eyebrow">{bundlesGuide.eyebrow}</div>
                  <h2 id="gift-bundles-heading">Gift bundles, ready to give.</h2>
                  <p>{bundlesGuide.blurb}</p>
                </div>
                <Link className="btn" href={giftGuidePath(bundlesGuide.slug)}>
                  See every bundle
                </Link>
              </div>
              <ProductGrid products={bundles.slice(0, ROW_SIZE).map(toGiftCard)} eagerCount={2} />
            </section>
          )}

          {priceGuides.length > 0 && (
            <section className="gift-bands" aria-labelledby="gift-bands-heading">
              <div className="sectionhead">
                <div className="eyebrow">Shop by budget</div>
                <h2 id="gift-bands-heading">Know what you want to spend?</h2>
              </div>
              <div className="gift-band-grid">
                {priceGuides.map((entry) => (
                  <Link
                    className="gift-band"
                    key={entry.guide.slug}
                    href={giftGuidePath(entry.guide.slug)}
                  >
                    <span className="gift-band-title">{entry.guide.shortTitle}</span>
                    <span className="gift-band-count">
                      {entry.products.length} {entry.products.length === 1 ? 'gift' : 'gifts'}
                    </span>
                    <span className="gift-band-go" aria-hidden="true">
                      Browse →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {occasionGuides.length > 0 && (
            <section className="gift-occasions" aria-labelledby="gift-occasions-heading">
              <div className="sectionhead">
                <div className="eyebrow">Shop by person</div>
                <h2 id="gift-occasions-heading">Who is it for?</h2>
              </div>
              <div className="editorial-collections gift-occasion-grid">
                {occasionGuides.map((entry) => (
                  <Link
                    className="editorial-collection"
                    key={entry.guide.slug}
                    href={giftGuidePath(entry.guide.slug)}
                  >
                    <BrandMockupScene
                      variant="gifts"
                      seed={entry.guide.slug}
                      alt={entry.guide.title}
                    />
                    <div>
                      <span>
                        {entry.products.length} {entry.products.length === 1 ? 'gift' : 'gifts'}
                      </span>
                      <h3>{entry.guide.title}</h3>
                      <b>Browse →</b>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="gift-promises" aria-label="How gifting works here">
            <div>
              <MessageSquareHeart aria-hidden="true" />
              <span>
                <b>A gift message, free</b>
                <small>
                  Write a note at checkout and we print it on the packing slip that goes in the box.
                </small>
              </span>
            </div>
            <div>
              <PackageCheck aria-hidden="true" />
              <span>
                <b>Packed to arrive well</b>
                <small>
                  Plants are secured for transit and held back when the weather would not be kind to
                  them.
                </small>
              </span>
            </div>
            <div>
              <Truck aria-hidden="true" />
              <span>
                <b>
                  {freeShippingThreshold > 0
                    ? `Free shipping over ${formatMoneyCompact(freeShippingThreshold)}`
                    : 'Ships or collect in person'}
                </b>
                <small>Or arrange local pickup in Ebensburg and hand it over yourself.</small>
              </span>
            </div>
          </section>

          {rails.map((entry) => (
            <section
              className="gift-rail"
              key={entry.guide.slug}
              aria-labelledby={`gift-rail-${entry.guide.slug}`}
            >
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">{entry.guide.eyebrow}</div>
                  <h2 id={`gift-rail-${entry.guide.slug}`}>{entry.guide.title}</h2>
                </div>
                <Link className="editorial-link" href={giftGuidePath(entry.guide.slug)}>
                  See all {entry.products.length} →
                </Link>
              </div>
              <ProductGrid
                products={entry.products.slice(0, ROW_SIZE).map(toGiftCard)}
                eagerCount={0}
              />
            </section>
          ))}

          {stocked.length === 0 && (
            <div className="empty-state wide">
              <h3>There is nothing to send home this week.</h3>
              <p>
                We only list what is ready to go. Ask Tammy about a custom arrangement — most gifts
                here started as one — or browse the care library in the meantime.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Link
                  className="btn"
                  href={contactHref({
                    subject: 'Custom planter arrangement',
                    message: 'I am looking for a gift. What could you put together?'
                  })}
                >
                  Ask about a gift arrangement
                </Link>
                <Link className="btn outline" href="/care">
                  Plant care library
                </Link>
              </div>
            </div>
          )}

          <InlineNewsletter
            source="gifts"
            eyebrow="The Hillside Notes"
            heading="Hear about gift bundles first."
            blurb="An occasional note when new bundles and seasonal pieces come off the bench."
          />
        </div>
      </section>
    </>
  );
}
