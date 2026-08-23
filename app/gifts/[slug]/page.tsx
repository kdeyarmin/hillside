import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gift, MessageSquareHeart } from 'lucide-react';
import BundleGrid from '@/components/BundleGrid';
import ProductGrid from '@/components/ProductGrid';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
import { contactHref } from '@/lib/contact';
import { giftGuideProducts, loadGiftCatalog, toGiftCard } from '@/lib/gift-catalog';
import { findGiftGuide, GIFT_GUIDES, giftGuidePath } from '@/lib/gifts';
import { jsonLd } from '@/lib/json-ld';
import { absoluteUrl } from '@/lib/store';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGiftGuide(slug);
  if (!guide) return { title: 'Gift guide not found' };
  return pageMetadata({
    path: giftGuidePath(guide.slug),
    title: guide.title,
    description: guide.description
  });
}

export default async function GiftGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = findGiftGuide(slug);
  if (!guide) notFound();

  /**
   * Ready-made sets lead a guide that asks for them, as their own shelf rather
   * than mixed into the product grid: a set is a `Bundle` with its own page,
   * its own price and an availability derived from what is on the bench.
   */
  const [catalog, sets] = await Promise.all([
    loadGiftCatalog(),
    guide.includeBundles ? sellableBundles({ take: 3 }) : []
  ]);
  const products = giftGuideProducts(catalog, guide);
  /** The other guides worth offering: ones that actually hold something. */
  const siblings = GIFT_GUIDES.filter(
    (other) => other.slug !== guide.slug && giftGuideProducts(catalog, other).length > 0
  );

  const listJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: guide.title,
    url: absoluteUrl(giftGuidePath(guide.slug)),
    description: guide.description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/shop/${product.slug}`),
        name: product.name
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
              { name: 'Gifts', path: '/gifts' },
              { name: guide.shortTitle, path: giftGuidePath(guide.slug) }
            ])
          )
        }}
      />

      <section className="pagehero gift-hero">
        <div className="container">
          <div className="breadcrumbs centered">
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href="/gifts">Gifts</Link>
            <span>/</span>
            <span>{guide.shortTitle}</span>
          </div>
          <div className="eyebrow">
            <Gift size={15} aria-hidden="true" /> {guide.eyebrow}
          </div>
          <h1>{guide.title}</h1>
          <p>{guide.blurb}</p>
        </div>
      </section>

      <section className="content gift-content">
        <div className="container">
          {sets.length > 0 && (
            <section className="gift-bundles" aria-labelledby="gift-guide-sets">
              <div className="gift-bundles-head">
                <div>
                  <div className="eyebrow">Ready to give</div>
                  <h2 id="gift-guide-sets">Sets, boxed and ready.</h2>
                  <p>Put together out of things we already sell, priced below their parts.</p>
                </div>
                <Link className="btn" href="/bundles">
                  See every set
                </Link>
              </div>
              <BundleGrid bundles={sets.map(bundleCardData)} />
            </section>
          )}

          {products.length > 0 ? (
            <>
              <div className="toolbar gift-toolbar">
                <b>
                  {products.length} {products.length === 1 ? 'gift' : 'gifts'}
                </b>
                <Link className="text-link" href="/gifts">
                  All gift guides →
                </Link>
              </div>
              <ProductGrid products={products.map(toGiftCard)} />
            </>
          ) : (
            <div className="empty-state wide">
              <h3>Nothing is on the bench for this one right now.</h3>
              <p>
                We only list what is ready to send. Tell us who it is for and we will say honestly
                whether we can help this week.
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Link
                  className="btn"
                  href={contactHref({
                    subject: 'Custom planter arrangement',
                    message: `I am looking for a gift — ${guide.title.toLowerCase()}. What could you put together?`
                  })}
                >
                  Ask about a gift
                </Link>
                <Link className="btn outline" href="/gifts">
                  Other gift guides
                </Link>
              </div>
            </div>
          )}

          <div className="gift-note-panel">
            <MessageSquareHeart size={30} aria-hidden="true" />
            <div>
              <div className="eyebrow">Sending it straight to them?</div>
              <h2>Add a gift message at checkout.</h2>
              <p>
                Write a short note in the cart and we print it on the packing slip that travels with
                the order — no price on it. Local pickup is there too, if you would rather hand it
                over yourself.
              </p>
            </div>
          </div>

          {siblings.length > 0 && (
            <nav className="gift-jump gift-jump-footer" aria-label="Other gift guides">
              <span>More gift guides:</span>
              {siblings.map((other) => (
                <Link key={other.slug} href={giftGuidePath(other.slug)}>
                  {other.shortTitle}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
