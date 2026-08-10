import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CareGuideType, Prisma } from '@prisma/client';
import {
  AlertTriangle,
  CalendarRange,
  Check,
  Droplets,
  HeartPulse,
  Leaf,
  Lightbulb,
  SearchCheck,
  ShieldCheck,
  Sprout,
  SunMedium,
  ThermometerSun,
  Wind,
  Wrench
} from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import ResilientImage from '@/components/ResilientImage';
import { db } from '@/lib/db';
import { absoluteUrl, FALLBACK_PRODUCT_IMAGE } from '@/lib/store';

export const dynamic = 'force-dynamic';

function guideTypeLabel(type: CareGuideType) {
  if (type === CareGuideType.GENERAL) return 'Plant care basics';
  if (type === CareGuideType.PROBLEM) return 'Plant problem guide';
  if (type === CareGuideType.SEASONAL) return 'Seasonal plant care';
  return 'Plant profile';
}

function guideTitle(title: string, type: CareGuideType) {
  if (type === CareGuideType.PLANT) return `${title} Care Guide`;
  return title;
}

function Lines({ value }: { value: string }) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);

  if (lines.length <= 1) return <p>{value}</p>;
  return (
    <ul className="care-checklist">
      {lines.map((line) => <li key={line}><Check size={17} /> <span>{line}</span></li>)}
    </ul>
  );
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sheet = await db.careSheet.findFirst({ where: { slug, published: true } });
  if (!sheet) return { title: 'Care guide not found' };
  const title = guideTitle(sheet.plantName, sheet.guideType);
  return {
    title,
    description: sheet.summary,
    alternates: { canonical: `/care/${sheet.slug}` },
    openGraph: {
      title,
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

  const relatedWhere: Prisma.CareSheetWhereInput = {
    published: true,
    id: { not: sheet.id }
  };
  if (sheet.category) {
    relatedWhere.OR = [
      { guideType: sheet.guideType },
      { category: sheet.category }
    ];
  } else {
    relatedWhere.guideType = sheet.guideType;
  }

  const related = await db.careSheet.findMany({
    where: relatedWhere,
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { plantName: 'asc' }],
    take: 3
  });

  const title = guideTitle(sheet.plantName, sheet.guideType);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: sheet.summary,
    image: sheet.imageUrl || FALLBACK_PRODUCT_IMAGE,
    url: absoluteUrl(`/care/${sheet.slug}`),
    author: { '@type': 'Person', name: 'Tammy Hill' },
    publisher: {
      '@type': 'Organization',
      name: 'The Hillside Gardens',
      logo: absoluteUrl('/logo.png')
    },
    datePublished: sheet.createdAt.toISOString(),
    dateModified: sheet.updatedAt.toISOString(),
    articleSection: guideTypeLabel(sheet.guideType)
  };

  const details = [
    [SunMedium, 'Light', sheet.light],
    [Droplets, 'Water', sheet.water],
    [Wind, 'Humidity', sheet.humidity],
    [Sprout, 'Soil', sheet.soil],
    [Leaf, 'Feeding', sheet.feeding],
    [ThermometerSun, 'Temperature', sheet.temperature]
  ].filter((item): item is [typeof SunMedium, string, string] => Boolean(item[2]));

  const problemSections = [
    [SearchCheck, 'What you may notice', sheet.symptoms, 'symptoms'],
    [Lightbulb, 'Likely causes', sheet.causes, 'causes'],
    [Wrench, 'What to do now', sheet.treatment, 'treatment'],
    [ShieldCheck, 'How to prevent it', sheet.prevention, 'prevention']
  ].filter((item): item is [typeof SearchCheck, string, string, string] => Boolean(item[2]));

  const HeroIcon = sheet.guideType === CareGuideType.PROBLEM
    ? AlertTriangle
    : sheet.guideType === CareGuideType.SEASONAL
      ? CalendarRange
      : Leaf;

  return (
    <section className="content care-guide-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="container">
        <div className="breadcrumbs no-print">
          <Link href="/">Home</Link><span>/</span>
          <Link href="/care">Plant care</Link><span>/</span>
          <span>{sheet.plantName}</span>
        </div>

        <article>
          <div className="care-guide-hero">
            <ResilientImage
              className="care-hero-image"
              src={sheet.imageUrl || FALLBACK_PRODUCT_IMAGE}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={sheet.plantName}
              width={1200}
              height={900}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <div>
              <div className="care-guide-type"><HeroIcon size={16} /> {guideTypeLabel(sheet.guideType)}</div>
              <h1>{sheet.plantName}</h1>
              {sheet.botanical && <p className="care-botanical-name">{sheet.botanical}</p>}
              <div className="care-guide-tags">
                {sheet.category && <span>{sheet.category}</span>}
                {sheet.difficulty && <span>{sheet.difficulty}</span>}
              </div>
              <p className="care-guide-lead">{sheet.summary}</p>
              <div className="actions no-print">
                <PrintButton label="Print guide" />
                <Link className="btn outline" href="/care">Back to care library</Link>
              </div>
            </div>
          </div>

          {sheet.guideType === CareGuideType.PLANT && details.length > 0 && (
            <section className="care-detail-grid" aria-label="Quick plant care requirements">
              {details.map(([Icon, label, text]) => (
                <div className="detail-block" key={label}>
                  <Icon size={21} />
                  <b>{label}</b>
                  <span>{text}</span>
                </div>
              ))}
            </section>
          )}

          {sheet.guideType === CareGuideType.PROBLEM && (
            <section className="care-problem-grid">
              {problemSections.map(([Icon, heading, text, key]) => (
                <div className={`care-problem-section care-problem-${key}`} key={key}>
                  <Icon size={25} />
                  <h2>{heading}</h2>
                  <p>{text}</p>
                </div>
              ))}
            </section>
          )}

          {(sheet.guideType === CareGuideType.GENERAL || sheet.guideType === CareGuideType.SEASONAL) && (
            <section className="care-lesson-layout">
              <div className="care-lesson-main">
                <span className="eyebrow">Tammy’s practical guidance</span>
                <h2>The approach that works.</h2>
                <p>{sheet.tips}</p>
                {sheet.treatment && (
                  <div className="care-inline-section">
                    <h3>Steps to take</h3>
                    <p>{sheet.treatment}</p>
                  </div>
                )}
                {sheet.prevention && (
                  <div className="care-inline-section">
                    <h3>Keep it working</h3>
                    <p>{sheet.prevention}</p>
                  </div>
                )}
              </div>
              {sheet.checklist && (
                <aside className="care-checklist-card">
                  <span className="eyebrow">Quick checklist</span>
                  <h2>Use this as you work.</h2>
                  <Lines value={sheet.checklist} />
                </aside>
              )}
            </section>
          )}

          {sheet.guideType === CareGuideType.PLANT && (
            <>
              <section className="grid two care-advice-grid">
                <div className="admin-card">
                  <div className="eyebrow">Tammy’s best advice</div>
                  <h2 className="display-title">The care tip that matters most.</h2>
                  <p>{sheet.tips}</p>
                </div>
                <div className="admin-card">
                  <div className="eyebrow">Pet awareness</div>
                  <h2 className="display-title"><HeartPulse size={25} /> Home and pet safety.</h2>
                  <p>
                    {sheet.petSafety ||
                      'No pet-safety note has been added for this plant. Confirm the exact plant identity with your veterinarian or a trusted plant-toxicity resource before placing it within reach of pets or children.'}
                  </p>
                </div>
              </section>

              {problemSections.length > 0 && (
                <section className="care-plant-troubleshooting">
                  <div className="sectionhead">
                    <div className="eyebrow">Troubleshooting this plant</div>
                    <h2>Common signals and what they may mean.</h2>
                    <p>Check the whole plant and the soil before choosing a treatment.</p>
                  </div>
                  <div className="care-problem-grid compact">
                    {problemSections.map(([Icon, heading, text, key]) => (
                      <div className={`care-problem-section care-problem-${key}`} key={key}>
                        <Icon size={23} />
                        <h3>{heading}</h3>
                        <p>{text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {sheet.checklist && (
                <section className="care-checklist-wide">
                  <div>
                    <span className="eyebrow">At-a-glance care</span>
                    <h2>{sheet.plantName} checklist.</h2>
                  </div>
                  <Lines value={sheet.checklist} />
                </section>
              )}
            </>
          )}

          {sheet.guideType === CareGuideType.PROBLEM && (
            <section className="care-problem-closing">
              <div>
                <span className="eyebrow">Tammy’s reminder</span>
                <h2>Diagnose before you treat.</h2>
                <p>{sheet.tips}</p>
              </div>
              {sheet.checklist && <Lines value={sheet.checklist} />}
            </section>
          )}
        </article>

        {related.length > 0 && (
          <section className="product-details-section no-print">
            <div className="sectionhead">
              <div className="eyebrow">Keep learning</div>
              <h2>Related plant care guides.</h2>
            </div>
            <div className="care-related-grid">
              {related.map((item) => (
                <article className="care-related-card" key={item.id}>
                  <span>{guideTypeLabel(item.guideType)}</span>
                  <h3><Link href={`/care/${item.slug}`}>{item.plantName}</Link></h3>
                  {item.botanical && <p className="botanical">{item.botanical}</p>}
                  <p>{item.summary}</p>
                  <Link className="text-link" href={`/care/${item.slug}`}>Read guide →</Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
