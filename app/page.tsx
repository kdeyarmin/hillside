import Link from 'next/link';
import { ArrowRight, BookOpen, Leaf, Package, Sparkles, Sprout, Truck } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import NewsletterForm from '@/components/NewsletterForm';
import ProductGrid from '@/components/ProductGrid';
import {
  classDateLabel,
  classFormatLabel,
  classLocationLabel,
  classTimeLabel,
  isOnlineClass,
  seatsRemainingLabel
} from '@/lib/class-access';
import { seatsRemainingFor } from '@/lib/class-seats';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { ratingsByProduct } from '@/lib/reviews';
import { pageMetadata } from '@/lib/seo';
import {
  merchandisingFlagsFor,
  productsForSection,
  type MerchandisedProduct
} from '@/lib/merchandising-data';
import { formatMoney, formatMoneyCompact, freeShippingThresholdCents } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  ...pageMetadata({
    path: '/',
    title: 'The Hillside Gardens | Plants, Teas & Botanicals',
    description:
      'Houseplants, carnivorous plants, succulents, air plants, terrarium supplies and handmade botanical goods from The Hillside Gardens in Ebensburg, PA — with free plant care guides and local pickup.',
    image: '/images/scenes/hillside-hero.webp',
    imageAlt: 'Plants growing in a sunlit greenhouse at The Hillside Gardens'
  }),
  title: { absolute: 'The Hillside Gardens | Plants, Teas & Botanicals' }
};

/**
 * Where a row's "shop all" link goes, and what it should be called.
 *
 * A best-sellers row should land on the shop sorted by what is selling, not on
 * an unsorted grid the shopper then has to re-find the row in. A collection row
 * goes to that collection's own page: sending it to `/shop` dropped the one
 * thing the row was curated by, which is the whole reason somebody clicked it.
 */
function sectionLink(section: { kind: string; collection: { slug: string } | null }) {
  switch (section.kind) {
    case 'BEST_SELLERS':
    case 'RECENT_BEST_SELLERS':
      return { href: '/shop?sort=best-selling', label: 'Shop all best sellers →' };
    case 'NEW_ARRIVALS':
      return { href: '/shop?sort=new', label: 'Shop all new arrivals →' };
    case 'ON_SALE':
      return { href: '/shop?tags=on-sale', label: 'Shop everything on sale →' };
    case 'STAFF_PICKS':
      return { href: '/shop?tags=staff-pick', label: 'Shop all of Tammy’s picks →' };
    case 'SEASONAL':
      return { href: '/shop?tags=seasonal', label: 'Shop everything in season →' };
    case 'COLLECTION':
      return section.collection
        ? { href: `/collections/${section.collection.slug}`, label: 'Shop the collection →' }
        : { href: '/shop', label: 'Shop all products →' };
    default:
      return { href: '/shop', label: 'Shop all products →' };
  }
}

export default async function Home() {
  const freeShippingThreshold = freeShippingThresholdCents();
  const [sections, upcomingClasses, collections, careGuideCount, catalogCount] = await Promise.all([
    /**
     * The rows Tammy arranged, in her order. The homepage used to hardcode one
     * collection strip and one featured grid, so changing what the front page
     * led with meant changing the code.
     */
    db.homepageSection.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      // The slug is what lets a collection row link back to its own page.
      include: { collection: { select: { slug: true } } },
      take: 8
    }),
    // Hidden classes are not fetched at all, so the homepage costs one query
    // less rather than rendering nothing from a result it paid for.
    CLASSES_PUBLICLY_VISIBLE
      ? db.classEvent.findMany({
          where: { active: true, startsAt: { gte: new Date() } },
          orderBy: { startsAt: 'asc' },
          take: 2
        })
      : [],
    // Only collections that actually hold something are advertised, so a tile on
    // the homepage always leads to real stock.
    db.collection.findMany({
      where: { active: true, featured: true, products: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } }
    }),
    db.careSheet.count({ where: { published: true } }),
    db.product.count({ where: { active: true } })
  ]);

  const resolved = await Promise.all(
    sections.map(async (section) => ({
      section,
      products:
        section.kind === 'COLLECTION_TILES'
          ? ([] as MerchandisedProduct[])
          : await productsForSection(section)
    }))
  );

  const allProducts = resolved.flatMap((entry) => entry.products);
  const [ratings, flags] = await Promise.all([
    ratingsByProduct(allProducts.map((product) => product.id)),
    merchandisingFlagsFor(allProducts)
  ]);
  const decorate = (product: MerchandisedProduct) => ({
    ...product,
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0,
    flags: flags.get(product.id)
  });

  /**
   * A row with nothing in it is dropped rather than rendered as a heading over
   * empty space — which is what lets a "Best sellers" row stay arranged through
   * a quiet winter. Collection tiles are the same: no stocked collections, no
   * row.
   */
  const rows = resolved.filter(
    (entry) =>
      (entry.section.kind === 'COLLECTION_TILES' && collections.length > 0) ||
      entry.products.length > 0
  );
  const classSeats = await seatsRemainingFor(upcomingClasses);

  return (
    <>
      <section className="editorial-hero">
        <div className="editorial-hero-copy">
          <span className="eyebrow">Welcome to The Hillside Gardens</span>
          <h1>
            Rooted in Nature.
            <br />
            Grown with Care.
          </h1>
          <div className="botanical-rule" aria-hidden="true">
            <span />
            <Leaf size={22} />
            <span />
          </div>
          <p>
            Explore hand-selected plants, living arrangements, terrarium supplies, handmade soaps
            and botanical goods chosen to make everyday spaces feel warmer and more personal.
          </p>
          <div className="actions">
            {catalogCount > 0 ? (
              <Link className="btn editorial-btn" href="/shop">
                Shop now <ArrowRight size={17} />
              </Link>
            ) : (
              <Link
                className="btn editorial-btn"
                href={contactHref({ subject: 'Custom planter arrangement' })}
              >
                Ask about a custom arrangement <ArrowRight size={17} />
              </Link>
            )}
            {CLASSES_PUBLICLY_VISIBLE ? (
              <Link className="editorial-link" href="/classes">
                Explore our classes →
              </Link>
            ) : (
              <Link className="editorial-link" href="/care">
                Explore plant care →
              </Link>
            )}
          </div>
        </div>
        <BrandMockupScene variant="hero" className="editorial-hero-image" badge />
      </section>

      {/* Four promises a shopper can actually check, rather than four ways of
          saying "we care" — the free-shipping figure tracks the configured
          threshold so the homepage cannot contradict the cart. */}
      <section className="trust-strip" aria-label="Why shop The Hillside Gardens">
        <div>
          <Truck />
          <span>
            <b>
              {freeShippingThreshold > 0
                ? `Free shipping over ${formatMoneyCompact(freeShippingThreshold)}`
                : 'Packed by hand'}
            </b>
            <small>Flat-rate standard shipping on items that ship.</small>
          </span>
        </div>
        <div>
          <Package />
          <span>
            <b>Packed to arrive well</b>
            <small>Plants secured for transit and held back in unsafe weather.</small>
          </span>
        </div>
        <div>
          <BookOpen />
          <span>
            <b>Free care guides</b>
            <small>
              {careGuideCount > 0
                ? `${careGuideCount} plant and problem guides`
                : 'Watering, light and troubleshooting'}
              , written for real homes.
            </small>
          </span>
        </div>
        <div>
          <Sparkles />
          <span>
            <b>Potted and made here</b>
            <small>Small batches, arranged by Tammy on the Hillside bench.</small>
          </span>
        </div>
      </section>

      <div className="home-merch">
        {catalogCount === 0 && rows.length === 0 && (
          <section className="section editorial-section home-restock-section">
            <div className="container">
              <div className="home-restock">
                <div className="eyebrow">On the bench</div>
                <h2>New pieces are being potted.</h2>
                <p>
                  The shop lists only what is ready to go home. Ask Tammy about a custom arrangement
                  or a local pickup, or browse the care library in the meantime.
                </p>
                <div className="actions" style={{ justifyContent: 'center' }}>
                  <Link
                    className="btn editorial-btn"
                    href={contactHref({ subject: 'Local pickup inquiry' })}
                  >
                    Ask about local pickup
                  </Link>
                  <Link className="editorial-link" href="/care">
                    Plant care library →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {rows.map(({ section, products }) =>
          section.kind === 'COLLECTION_TILES' ? (
            <section
              className="section editorial-section home-collections-section"
              key={section.id}
            >
              <div className="container">
                <div className="sectionhead">
                  {section.eyebrow && <div className="eyebrow">{section.eyebrow}</div>}
                  <h2>{section.title}</h2>
                  {section.subtitle && <p>{section.subtitle}</p>}
                </div>
                <div className="editorial-collections">
                  {collections.slice(0, section.maxItems).map((collection) => (
                    <Link
                      className="editorial-collection"
                      href={`/collections/${collection.slug}`}
                      key={collection.id}
                    >
                      <BrandMockupScene
                        variant="plants"
                        imageSrc={collection.imageUrl}
                        alt={collection.title}
                      />
                      <div>
                        <span>
                          {collection.tagline || `${collection._count.products} to browse`}
                        </span>
                        <h3>{collection.title}</h3>
                        <b>Shop collection →</b>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="collections-all">
                  <Link className="editorial-link" href="/collections">
                    See every collection →
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="section editorial-products home-products-section" key={section.id}>
              <div className="container">
                <div className="editorial-heading-row">
                  <div>
                    {section.eyebrow && <div className="eyebrow">{section.eyebrow}</div>}
                    <h2>{section.title}</h2>
                    {section.subtitle && <p>{section.subtitle}</p>}
                  </div>
                  <Link className="editorial-link" href={sectionLink(section).href}>
                    {sectionLink(section).label}
                  </Link>
                </div>
                <ProductGrid products={products.map(decorate)} />
              </div>
            </section>
          )
        )}
      </div>

      <section className="section tammy-story home-story-section">
        <div className="container split">
          <div className="story-photo">
            <BrandMockupScene
              variant="about"
              alt="Terracotta pots, twine and seedlings on the Hillside potting bench"
            />
          </div>
          <div>
            <div className="eyebrow">Grow with confidence</div>
            <h2>Beautiful plants are better when you know how to care for them.</h2>
            <p className="quote">
              “You don’t need a green thumb. You just need to understand what your plant is asking
              for.”
            </p>
            <p>
              Tammy Hill created The Hillside Gardens around a love of plants and a love of
              teaching. Our care guides make choosing, arranging and caring for plants approachable
              — even if you’re just getting started.
            </p>
            <div className="actions">
              <Link className="btn editorial-btn" href="/about">
                Meet Tammy
              </Link>
              <Link className="editorial-link" href="/care">
                Plant care library →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {upcomingClasses.length > 0 && (
        <section className="section editorial-classes home-classes-section">
          <div className="container">
            <div className="sectionhead">
              <div className="eyebrow">Learn with us</div>
              <h2>Make something beautiful, in person or online.</h2>
              <p>
                Relaxed, practical plant classes at The Hillside Gardens, or live online in a
                private classroom you join straight from your browser.
              </p>
            </div>
            <div className={`grid auto${upcomingClasses.length === 1 ? ' single' : ''}`}>
              {upcomingClasses.map((event) => {
                const seatsLeft = classSeats.get(event.id) ?? event.capacity;
                const online = isOnlineClass(event.format);

                return (
                  <article className="class-editorial" key={event.id}>
                    <BrandMockupScene
                      variant="class"
                      backgroundSrc={event.imageUrl || undefined}
                      seed={event.id}
                      alt={`${event.title} at The Hillside Gardens`}
                      badge={false}
                    />
                    <div>
                      <span className="product-kicker">{classFormatLabel(event.format)}</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <p>
                        <b>{classDateLabel(event.startsAt, { year: false })}</b> ·{' '}
                        {classTimeLabel(event.startsAt)}
                      </p>
                      <p>{classLocationLabel(event)}</p>
                      {online && (
                        <p>
                          <b>Private classroom link emailed after registration.</b>
                        </p>
                      )}
                      <p>
                        {seatsRemainingLabel(seatsLeft)} ·{' '}
                        {event.priceCents > 0
                          ? `${formatMoney(event.priceCents)} per person`
                          : 'Free'}
                      </p>
                      <Link className="btn editorial-btn" href="/classes">
                        View class
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="section care-promo home-care-section">
        <div className="container care-promo-inner">
          <Sprout size={42} />
          <div>
            <div className="eyebrow">Plant help, without the guesswork</div>
            <h2>Keep your plants happy.</h2>
            <p>
              Use our practical care sheets for light, watering, soil, feeding, pet safety and the
              little details that make a difference.
            </p>
          </div>
          <Link className="btn light" href="/care">
            Browse plant care
          </Link>
        </div>
      </section>

      <section className="section home-newsletter-section">
        <div className="container newsletter editorial-newsletter">
          <div>
            <div className="eyebrow">The Hillside Notes</div>
            <h3>Seasonal tips, plant care & fresh arrivals.</h3>
            <p>A thoughtful note from us, sent occasionally.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
