import { ExternalLink, ShieldCheck } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import ResilientImage from '@/components/ResilientImage';
import { db } from '@/lib/db';
import { FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Our Amazon Picks',
  description: 'A curated collection of plant tools, planter supplies and tea favorites we recommend.'
};

export default async function AmazonPage() {
  const picks = await db.amazonPick.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }]
  });

  return (
    <>
      <section className="pagehero">
        <div className="container"><div className="eyebrow">We recommend</div><h1>Our Amazon picks.</h1><p>A curated shelf of useful tools and supplies for plants, planters and tea.</p></div>
      </section>
      <section className="content">
        <div className="container">
          <BrandMockupScene variant="picks" className="picks-brand-scene" />
          <div className="note-box" style={{ marginBottom: 32 }}><ShieldCheck size={20} /><b>Affiliate disclosure</b>As an Amazon Associate, The Hillside Gardens may earn from qualifying purchases. Using an affiliate link does not increase the customer’s price.</div>
          {picks.length ? (
            <div className="product-grid">
              {picks.map((pick) => (
                <article className="product-card" key={pick.id}>
                  <a className="product-image-wrap" href={pick.amazonUrl} target="_blank" rel="sponsored nofollow noopener noreferrer">
                    <ResilientImage
                      src={pick.imageUrl}
                      fallbackSrc={FALLBACK_PRODUCT_IMAGE}
                      alt={pick.title}
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                  <div className="product-copy">
                    <span className="pill">{pick.category || 'Amazon favorite'}</span>
                    <h2>{pick.title}</h2>
                    {pick.description && <p>{pick.description}</p>}
                    <a className="btn" href={pick.amazonUrl} target="_blank" rel="sponsored nofollow noopener noreferrer">View on Amazon <ExternalLink size={16} /></a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state"><h3>Our picks are being added.</h3><p>Recommended products will appear here as we build our influencer collection.</p></div>
          )}
        </div>
      </section>
    </>
  );
}
