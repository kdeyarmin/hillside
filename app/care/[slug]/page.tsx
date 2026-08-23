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
import BundleGrid from '@/components/BundleGrid';
import ProductGrid from '@/components/ProductGrid';
import PrintButton from '@/components/PrintButton';
import ResilientImage from '@/components/ResilientImage';
import { bundleCardData, sellableBundlesWithAnyProduct } from '@/lib/bundle-queries';
import { careGuideTypeHeading } from '@/lib/care-guides';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { absoluteUrl, formatMoney, resolveImageUrl } from '@/lib/store';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

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
      {lines.map((line, index) => (
        <li key={`${index}-${line.slice(0, 24)}`}>
          <Check size={17} /> <span>{line}</span>
        </li>
      ))}
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
  return pageMetadata({
    path: `/care/${sheet.slug}`,
    title,
    description: sheet.summary,
    image: resolveImageUrl(sheet.imageUrl),
    imageAlt: sheet.plantName,
    // These are editorial guides, not storefront pages.
    type: 'article'
  });
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
    relatedWhere.OR = [{ guideType: sheet.guideType }, { category: sheet.category }];
  } else {
    relatedWhere.guideType = sheet.guideType;
  }

  const [related, linkedProduct, featured, upcomingClass] = await Promise.all([
    db.careSheet.findMany({
      where: relatedWhere,
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { plantName: 'asc' }],
      take: 3
    }),
    sheet.productId
      ? db.product.findFirst({ where: { id: sheet.productId, active: true, inventory: { gt: 0 } } })
      : null,
    /**
     * What Tammy chose to feature on this guide, with her own reason for each.
     * Sold-out pieces are left out rather than shown as unavailable: on an
     * educational page a struck-through "sold out" is a dead end, and the guide
     * reads perfectly without it.
     */
    db.careGuideProduct.findMany({
      where: { careSheetId: sheet.id, product: { active: true, inventory: { gt: 0 } } },
      orderBy: { sortOrder: 'asc' },
      include: { product: true },
      take: 4
    }),
    CLASSES_PUBLICLY_VISIBLE
      ? db.classEvent.findFirst({
          where: { active: true, startsAt: { gte: new Date() } },
          orderBy: { startsAt: 'asc' }
        })
      : null
  ]);

  /**
   * A set built around what this guide teaches — the Terrarium Starter Kit under
   * the terrarium guide. Only sets that can actually be built are returned, so a
   * guide never sends a reader to a box the shop cannot pack.
   */
  const guideProductIds = [linkedProduct?.id, ...featured.map((entry) => entry.productId)].filter(
    (id): id is string => Boolean(id)
  );
  const kits = guideProductIds.length
    ? await sellableBundlesWithAnyProduct(guideProductIds, 2)
    : [];

  /**
   * The care library is the reason strangers find this site, and it used to link
   * only to other care guides. A reader here is the most qualified visitor there
   * is, so the guide offers the plant itself, whatever else Tammy has attached
   * to it, a set when one exists, and a class when classes are public.
   *
   * The blanket "here are three plants we have in stock" fallback is gone. It
   * fired on every guide with nothing attached — including troubleshooting
   * guides, where somebody arrives worried about a plant they already own and
   * was shown three more to buy. Nothing is the better answer there.
   */
  const linkedRating = linkedProduct
    ? (await ratingsByProduct([linkedProduct.id])).get(linkedProduct.id)
    : null;
  const shopProducts = linkedProduct
    ? [
        {
          ...linkedProduct,
          averageRating: linkedRating?.average ?? null,
          reviewCount: linkedRating?.count ?? 0
        }
      ]
    : [];

  const title = guideTitle(sheet.plantName, sheet.guideType);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: sheet.summary,
    image: absoluteUrl(resolveImageUrl(sheet.imageUrl)),
    url: absoluteUrl(`/care/${sheet.slug}`),
    author: { '@type': 'Person', name: 'Tammy Hill' },
    publisher: {
      '@type': 'Organization',
      name: 'The Hillside Gardens',
      logo: absoluteUrl('/logo.png')
    },
    datePublished: sheet.createdAt.toISOString(),
    dateModified: sheet.updatedAt.toISOString(),
    articleSection: careGuideTypeHeading(sheet.guideType)
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

  const HeroIcon =
    sheet.guideType === CareGuideType.PROBLEM
      ? AlertTriangle
      : sheet.guideType === CareGuideType.SEASONAL
        ? CalendarRange
        : sheet.guideType === CareGuideType.BEGINNER
          ? Sprout
          : Leaf;

  return (
    <section className="content care-guide-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Plant care', path: '/care' },
              { name: sheet.plantName, path: `/care/${sheet.slug}` }
            ])
          )
        }}
      />
      <div className="container">
        <div className="breadcrumbs no-print">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/care">Plant care</Link>
          <span>/</span>
          <span>{sheet.plantName}</span>
        </div>

        <article>
          <div className="care-guide-hero">
            <ResilientImage
              className="care-hero-image"
              sizeRole="detail"
              src={resolveImageUrl(sheet.imageUrl)}
              fallbackSrc="/images/botanical-placeholder.svg"
              alt={sheet.plantName}
              width={1200}
              height={900}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <div>
              <div className="care-guide-type">
                <HeroIcon size={16} /> {careGuideTypeHeading(sheet.guideType)}
              </div>
              <h1>{sheet.plantName}</h1>
              {sheet.botanical && <p className="care-botanical-name">{sheet.botanical}</p>}
              <div className="care-guide-tags">
                {sheet.category && <span>{sheet.category}</span>}
                {sheet.difficulty && <span>{sheet.difficulty}</span>}
              </div>
              <p className="care-guide-lead">{sheet.summary}</p>
              <div className="actions no-print">
                <PrintButton label="Print guide" />
                <Link className="btn outline" href="/care">
                  Back to care library
                </Link>
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

          {sheet.guideType === CareGuideType.PROBLEM && problemSections.length > 0 && (
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

          {(sheet.guideType === CareGuideType.GENERAL ||
            sheet.guideType === CareGuideType.SEASONAL) && (
            <section className="care-lesson-layout">
              <div className="care-lesson-main">
                <span className="eyebrow">Our practical guidance</span>
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
                  <div className="eyebrow">Our best advice</div>
                  <h2 className="display-title">The care tip that matters most.</h2>
                  <p>{sheet.tips}</p>
                </div>
                <div className="admin-card">
                  <div className="eyebrow">Pet awareness</div>
                  <h2 className="display-title">
                    <HeartPulse size={25} /> Home and pet safety.
                  </h2>
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
                <span className="eyebrow">Our reminder</span>
                <h2>Diagnose before you treat.</h2>
                <p>{sheet.tips}</p>
              </div>
              {sheet.checklist && <Lines value={sheet.checklist} />}
            </section>
          )}
        </article>

        {shopProducts.length > 0 && linkedProduct && (
          <section className="product-details-section no-print care-shop-cta">
            <div className="sectionhead">
              <div className="eyebrow">The plant this guide is about</div>
              <h2>Bring {linkedProduct.name} home.</h2>
              <p>Potted here, and it leaves with the same care notes you have just read.</p>
            </div>
            <ProductGrid products={shopProducts} />
          </section>
        )}

        {/*
          Products Tammy attached to this guide, each with her reason for it.
          Deliberately not a product grid: a row of buy buttons under an article
          turns the article into an advert, and the reason is what makes the
          difference between "here is what we sell" and "here is what we use".
        */}
        {featured.length > 0 && (
          <section className="product-details-section no-print">
            <div className="sectionhead">
              <div className="eyebrow">What we use</div>
              <h2>
                {sheet.guideType === CareGuideType.PROBLEM
                  ? 'What we reach for when this happens.'
                  : 'What we use for this ourselves.'}
              </h2>
              <p>
                Everything below is on our own bench. Nothing here is required to follow the guide.
              </p>
            </div>
            <ul className="care-product-list">
              {featured.map((entry) => (
                <li className="care-product-card" key={entry.id}>
                  <Link href={`/shop/${entry.product.slug}`}>
                    <ResilientImage
                      sizeRole="thumb"
                      src={resolveImageUrl(entry.product.imageUrl)}
                      fallbackSrc="/images/botanical-placeholder.svg"
                      alt={entry.product.name}
                      width={78}
                      height={78}
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>
                  <div>
                    <b>
                      <Link href={`/shop/${entry.product.slug}`}>{entry.product.name}</Link>
                    </b>
                    <p>
                      {entry.note || entry.product.shortDescription || entry.product.description}
                    </p>
                    <span className="care-product-price">
                      {formatMoney(entry.product.priceCents)}
                    </span>
                    <Link className="text-link" href={`/shop/${entry.product.slug}`}>
                      See it →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {kits.length > 0 && (
          <section className="product-details-section no-print">
            <div className="sectionhead">
              <div className="eyebrow">Everything at once</div>
              <h2>{kits.length === 1 ? 'There is a set for this.' : 'There are sets for this.'}</h2>
              <p>Made up here from the same pieces, priced below buying them one at a time.</p>
            </div>
            <BundleGrid bundles={kits.map(bundleCardData)} />
          </section>
        )}

        {upcomingClass && (
          <section className="newsletter care-class-cta no-print">
            <div>
              <div className="eyebrow">Learn it hands-on</div>
              <h3>{upcomingClass.title}</h3>
              <p>
                {upcomingClass.startsAt.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
                {' · '}
                {upcomingClass.priceCents > 0 ? 'Reserve a seat' : 'Free registration'}
              </p>
            </div>
            <Link className="btn gold" href={`/classes#class-${upcomingClass.id}`}>
              See the class
            </Link>
          </section>
        )}

        {related.length > 0 && (
          <section className="product-details-section no-print">
            <div className="sectionhead">
              <div className="eyebrow">Keep learning</div>
              <h2>Related plant care guides.</h2>
            </div>
            <div className="care-related-grid">
              {related.map((item) => (
                <article className="care-related-card" key={item.id}>
                  <span>{careGuideTypeHeading(item.guideType)}</span>
                  <h3>
                    <Link href={`/care/${item.slug}`}>{item.plantName}</Link>
                  </h3>
                  {item.botanical && <p className="botanical">{item.botanical}</p>}
                  <p>{item.summary}</p>
                  <Link className="text-link" href={`/care/${item.slug}`}>
                    Read guide →
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
