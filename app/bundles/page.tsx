import Link from 'next/link';
import BundleCard from '@/components/BundleCard';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { contactHref } from '@/lib/contact';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/bundles',
  title: 'Sets & starter kits',
  description:
    'Everything you need in one box — tea and the infuser to brew it in, a plant with the planter and the care that keeps it alive, a terrarium built from the ground up.'
});

export default async function BundlesPage() {
  const [bundles, catalogHasProducts] = await Promise.all([
    sellableBundles(),
    catalogHasActiveProducts()
  ]);
  const cards = bundles.map(bundleCardData);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Sets & kits', path: '/bundles' }
            ])
          )
        }}
      />
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Everything in one box</div>
          <h1>Sets &amp; starter kits.</h1>
          <p>
            Each set is built from the same shelf everything else on this site comes off — so what
            you see here is what is genuinely ready to go home together, priced below what the
            pieces cost separately.
          </p>
        </div>
      </section>

      <section className="content">
        <div className="container">
          {cards.length === 0 ? (
            <div className="empty-state">
              <h2>No sets are made up just now.</h2>
              <p>
                A set is only listed while every piece in it is on the bench, so this page empties
                out rather than promising a box we cannot pack.{' '}
                {catalogHasProducts
                  ? 'Everything that is ready is in the shop.'
                  : 'Have a look at the care library while the next batch is potted.'}
              </p>
              <div className="actions">
                {catalogHasProducts && (
                  <Link className="btn" href="/shop">
                    Browse the shop
                  </Link>
                )}
                <Link className="btn outline" href="/care">
                  Plant care library
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="sectionhead">
                <div className="eyebrow">
                  {cards.length} {cards.length === 1 ? 'set' : 'sets'} ready
                </div>
                <h2>Put together here, packed here.</h2>
                <p>
                  Buying a set moves the same stock a single purchase does — nothing is set aside or
                  counted twice, which is why a kit disappears the moment one of its pieces runs
                  out.
                </p>
              </div>
              <div className="product-grid">
                {cards.map((bundle, index) => (
                  <BundleCard bundle={bundle} key={bundle.slug} priority={index < 2} />
                ))}
              </div>
            </>
          )}

          <div className="newsletter care-class-cta" style={{ marginTop: 44 }}>
            <div>
              <div className="eyebrow">Building your own</div>
              <h3>Want a set we have not made up?</h3>
              <p>
                Tell us what it is for and we will put one together — a housewarming box, a
                classroom terrarium, a first plant for someone who has killed a few.
              </p>
            </div>
            <Link
              className="btn gold"
              href={contactHref({
                subject: 'Custom planter arrangement',
                message: 'I am after a set that is not on the sets page — '
              })}
            >
              Ask for a custom set
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
