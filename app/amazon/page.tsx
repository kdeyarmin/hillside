import Link from 'next/link';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import ProductGrid from '@/components/ProductGrid';
import ResilientImage from '@/components/ResilientImage';
import { db } from '@/lib/db';
import { withCardFacts } from '@/lib/product-cards';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  path: '/amazon',
  title: 'Our Amazon Picks',
  description:
    'A curated collection of plant tools, planter supplies and tea favorites we recommend.'
});

export default async function AmazonPage() {
  const [picks, ourProducts] = await Promise.all([
    db.amazonPick.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }]
    }),
    db.product.findMany({
      where: { active: true, inventory: { gt: 0 } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3,
      include: { category: { select: { slug: true, title: true } } }
    })
  ]);

  const shopProducts = await withCardFacts(ourProducts);

  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">We recommend</div>
          <h1>Our Amazon picks.</h1>
          <p>A curated shelf of useful tools and supplies for plants, planters and tea.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <div className="note-box disclosure">
            <ShieldCheck size={20} aria-hidden="true" />
            <b>Affiliate disclosure</b>
            As an Amazon Associate, The Hillside Gardens may earn from qualifying purchases. Using
            an affiliate link does not increase the customer&rsquo;s price.
          </div>

          {picks.length ? (
            <div className={`product-grid${picks.length < 3 ? ' sparse' : ''}`}>
              {picks.map((pick) => (
                <article className="product-card" key={pick.id}>
                  <a
                    className="product-image-wrap"
                    href={pick.amazonUrl}
                    target="_blank"
                    rel="sponsored nofollow noopener noreferrer"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {/* Amazon artwork is remote and variably shaped, so it had no
                        intrinsic size and reserved no space — the card jumped as
                        each one arrived. The ratio matches the card slot the CSS
                        gives it. */}
                    <ResilientImage
                      src={pick.imageUrl}
                      fallbackSrc="/images/botanical-placeholder.svg"
                      alt={pick.title}
                      sizeRole="card"
                      width={1200}
                      height={1050}
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                  <div className="product-copy">
                    <span className="pill">{pick.category || 'Amazon favorite'}</span>
                    <h2>{pick.title}</h2>
                    {pick.description && <p>{pick.description}</p>}
                    <a
                      className="btn"
                      href={pick.amazonUrl}
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                    >
                      View on Amazon <ExternalLink size={16} aria-hidden="true" />
                      <span className="sr-only"> (opens in a new window)</span>
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Our picks are being added.</h3>
              <p>Recommended tools and supplies will appear here as we add them.</p>
            </div>
          )}

          {shopProducts.length > 0 && (
            <div className="product-details-section">
              <div className="sectionhead">
                <div className="eyebrow">Made and potted by us</div>
                <h2>We also sell these directly.</h2>
                <p>Plants, teas and botanicals prepared here — no affiliate link required.</p>
              </div>
              <ProductGrid products={shopProducts} />
              <div className="collections-all">
                <Link className="editorial-link" href="/shop">
                  Shop everything we make →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
