import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Droplets, HeartPulse, Leaf, Sprout, SunMedium, ThermometerSun, Wind } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import { db } from '@/lib/db';
import { absoluteUrl, FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sheet = await db.careSheet.findFirst({ where: { slug, published: true } });
  if (!sheet) return { title: 'Care sheet not found' };
  return {
    title: `${sheet.plantName} Care Guide`,
    description: sheet.summary,
    alternates: { canonical: `/care/${sheet.slug}` },
    openGraph: {
      title: `${sheet.plantName} Care Guide`,
      description: sheet.summary,
      url: `/care/${sheet.slug}`,
      images: [{ url: sheet.imageUrl || FALLBACK_PRODUCT_IMAGE, alt: sheet.plantName }]
    }
  };
}

export default async function CareSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sheet = await db.careSheet.findFirst({ where: { slug, published: true } });
  if (!sheet) notFound();

  const related = await db.careSheet.findMany({
    where: { published: true, id: { not: sheet.id } },
    orderBy: { plantName: 'asc' },
    take: 3
  });

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${sheet.plantName} Care Guide`,
    description: sheet.summary,
    image: sheet.imageUrl || FALLBACK_PRODUCT_IMAGE,
    url: absoluteUrl(`/care/${sheet.slug}`),
    author: { '@type': 'Person', name: 'Tammy Hill' },
    publisher: { '@type': 'Organization', name: 'The Hillside Gardens', logo: absoluteUrl('/logo.svg') },
    datePublished: sheet.createdAt.toISOString(),
    dateModified: sheet.updatedAt.toISOString()
  };

  const details = [
    [SunMedium, 'Light', sheet.light],
    [Droplets, 'Water', sheet.water],
    [Wind, 'Humidity', sheet.humidity],
    [Sprout, 'Soil', sheet.soil],
    [Leaf, 'Feeding', sheet.feeding],
    [ThermometerSun, 'Temperature', sheet.temperature]
  ] as const;

  return (
    <section className="content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="container">
        <div className="breadcrumbs no-print">
          <Link href="/">Home</Link><span>/</span><Link href="/care">Plant care</Link><span>/</span><span>{sheet.plantName}</span>
        </div>
        <article>
          <div className="split">
            <img className="care-hero-image" src={sheet.imageUrl || FALLBACK_PRODUCT_IMAGE} alt={sheet.plantName} />
            <div>
              <div className="eyebrow">Tammy’s care sheet</div>
              <h1 className="display-title" style={{ color: 'var(--forest)', fontSize: 'clamp(44px,6vw,66px)', margin: '8px 0' }}>
                {sheet.plantName}
              </h1>
              {sheet.botanical && <p style={{ color: 'var(--sage)', fontStyle: 'italic', fontSize: 18 }}>{sheet.botanical}</p>}
              <p style={{ fontSize: 19 }}>{sheet.summary}</p>
              <div className="actions no-print">
                <PrintButton label="Print care sheet" />
                <Link className="btn outline" href="/care">Back to all care sheets</Link>
              </div>
            </div>
          </div>

          <div className="care-detail-grid">
            {details.map(([Icon, label, text]) => (
              <div className="detail-block" key={label}>
                <Icon size={21} />
                <b>{label}</b>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="grid two">
            <div className="admin-card">
              <div className="eyebrow">Tammy’s best advice</div>
              <h2 className="display-title" style={{ color: 'var(--forest)', fontSize: 34 }}>The care tip that matters most.</h2>
              <p>{sheet.tips}</p>
            </div>
            <div className="admin-card">
              <div className="eyebrow">Pet awareness</div>
              <h2 className="display-title" style={{ color: 'var(--forest)', fontSize: 34 }}><HeartPulse size={25} /> Home and pet safety.</h2>
              <p>{sheet.petSafety || 'No pet-safety note has been added for this plant. Confirm with your veterinarian or a trusted plant-toxicity resource before placing it within reach of pets or children.'}</p>
            </div>
          </div>
        </article>

        {related.length > 0 && (
          <section className="product-details-section no-print">
            <div className="sectionhead">
              <div className="eyebrow">Keep learning</div>
              <h2>More practical plant guides.</h2>
            </div>
            <div className="care-grid">
              {related.map((item) => (
                <article className="care-card" key={item.id}>
                  <h2><Link href={`/care/${item.slug}`}>{item.plantName}</Link></h2>
                  {item.botanical && <div className="botanical">{item.botanical}</div>}
                  <p>{item.summary}</p>
                  <Link className="text-link" href={`/care/${item.slug}`}>Read care sheet →</Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
