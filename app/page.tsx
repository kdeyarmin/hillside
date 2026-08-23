import Link from 'next/link';
import { ArrowRight, BookOpen, Leaf, MapPin, Package, Sparkles, Sprout, Truck } from 'lucide-react';
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
import { withCategory } from '@/lib/product-categories';
import { ratingsByProduct } from '@/lib/reviews';
import { pageMetadata } from '@/lib/seo';
import { formatMoney, formatMoneyCompact, freeShippingThresholdCents } from '@/lib/store';

/**
 * What the shop sells, said plainly, in the first thing a visitor reads.
 *
 * The homepage used to open on "Rooted in Nature. Grown with Care." and a
 * sentence about making spaces feel warmer, which is a mood rather than a
 * catalog: a first-time visitor could not tell from the top of the page whether
 * this shop sold plants, prints or candles. The branding is still here — it is
 * good, and it is hers — but it now sits above a headline that answers the
 * question, and a row of what is actually on the bench.
 *
 * Each chip is a real shop filter. A category with nothing in it drops its
 * filter and shows the whole shop rather than an empty shelf, so a chip is
 * never a dead end even between batches.
 */
const HERO_CATEGORIES: ReadonlyArray<readonly [label: string, slug: string]> = [
  ['Houseplants', 'houseplants'],
  ['Carnivorous plants', 'carnivorous-plants'],
  ['Succulents', 'succulents'],
  ['Air plants', 'air-plants'],
  ['Living arrangements', 'live-plant-arrangements'],
  ['Terrariums', 'terrariums'],
  ['Terrarium supplies', 'terrarium-supplies'],
  ['Moss', 'moss'],
  ['Driftwood', 'driftwood-natural-materials'],
  ['Handmade soap', 'handmade-soap'],
  ['Botanical lotion', 'botanical-lotion'],
  ['Apothecary', 'apothecary'],
  ['Tea', 'tea'],
  ['Tea accessories', 'tea-accessories']
];

export const dynamic = 'force-dynamic';
export const metadata = {
  ...pageMetadata({
    path: '/',
    title: 'The Hillside Gardens | Plants, Botanical Goods & Creative Planting',
    description:
      'Houseplants, carnivorous plants, succulents and air plants, living arrangements, terrarium supplies, moss and driftwood, plus handmade soap, botanical lotion, tea and apothecary goods. Shipped across the US or collected in Ebensburg, PA.',
    image: '/images/scenes/hillside-hero.webp',
    imageAlt: 'Plants growing in a sunlit greenhouse at The Hillside Gardens'
  }),
  title: { absolute: 'The Hillside Gardens | Plants, Botanical Goods & Creative Planting' }
};

export default async function Home() {
  const freeShippingThreshold = freeShippingThresholdCents();
  const [featuredProducts, upcomingClasses, categories, collections, careGuideCount, catalogCount] =
    await Promise.all([
      db.product.findMany({
        where: { active: true, featured: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 4,
        include: { category: { select: { slug: true, title: true } } }
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
      /**
       * Shop-by-category tiles. Same rule as the collections below: only a
       * category that actually holds something is advertised, so a tile on the
       * homepage always leads to real stock rather than to an empty shelf.
       */
      db.category.findMany({
        where: { active: true, featured: true, products: { some: { active: true } } },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        take: 8,
        include: { _count: { select: { products: { where: { active: true } } } } }
      }),
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

  const ratings = await ratingsByProduct(featuredProducts.map((product) => product.id));
  const featured = featuredProducts.map((product) => ({
    ...withCategory(product),
    averageRating: ratings.get(product.id)?.average ?? null,
    reviewCount: ratings.get(product.id)?.count ?? 0
  }));
  const classSeats = await seatsRemainingFor(upcomingClasses);

  return (
    <>
      <section className="editorial-hero">
        <div className="editorial-hero-copy">
          <span className="eyebrow">Rooted in Nature. Grown with Care.</span>
          <h1>Plants, Botanical Goods &amp; Creative Planting</h1>
          <p className="hero-lede">From Our Hillside to Your Home</p>
          <div className="botanical-rule" aria-hidden="true">
            <span />
            <Leaf size={22} />
            <span />
          </div>
          <p>
            Houseplants, carnivorous plants, succulents and air plants — with living arrangements,
            terrariums, and the moss, driftwood and supplies to build your own. Off the same bench:
            handmade soap, botanical lotion, apothecary goods, tea and the small tools for brewing
            it.
          </p>
          <ul className="hero-catalog">
            {HERO_CATEGORIES.map(([label, slug]) => (
              <li key={slug}>
                <Link href={`/shop?category=${slug}`}>{label}</Link>
              </li>
            ))}
          </ul>
          <div className="actions">
            {catalogCount > 0 ? (
              <Link className="btn editorial-btn" href="/shop">
                Shop all {catalogCount} pieces <ArrowRight size={17} />
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
          <p className="hero-fulfillment">
            <MapPin size={15} aria-hidden="true" />
            Shipped across the US, or collected locally in Ebensburg, PA.
          </p>
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
        {catalogCount === 0 &&
          categories.length === 0 &&
          collections.length === 0 &&
          featured.length === 0 && (
            <section className="section editorial-section home-restock-section">
              <div className="container">
                <div className="home-restock">
                  <div className="eyebrow">On the bench</div>
                  <h2>New pieces are being potted.</h2>
                  <p>
                    The shop lists only what is ready to go home. Ask Tammy about a custom
                    arrangement or a local pickup, or browse the care library in the meantime.
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

        {categories.length > 0 && (
          <section className="section editorial-section home-categories-section">
            <div className="container">
              <div className="sectionhead">
                <div className="eyebrow">Shop by category</div>
                <h2>What&rsquo;s on the bench.</h2>
                <p>
                  Every plant and piece is filed under one of these, so you can go straight to the
                  shelf you came for.
                </p>
              </div>
              <div className="category-tiles">
                {categories.map((category) => (
                  <Link
                    className="category-tile"
                    href={`/shop?category=${category.slug}`}
                    key={category.id}
                  >
                    <BrandMockupScene
                      variant="plants"
                      imageSrc={category.imageUrl}
                      seed={category.slug}
                      alt={category.title}
                      badge={false}
                    />
                    <span className="category-tile-copy">
                      <b>{category.title}</b>
                      <small>{category.tagline || `${category._count.products} to browse`}</small>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="collections-all">
                <Link className="editorial-link" href="/shop">
                  Browse the whole shop →
                </Link>
              </div>
            </div>
          </section>
        )}

        {collections.length > 0 && (
          <section className="section editorial-section home-collections-section">
            <div className="container">
              <div className="sectionhead">
                <div className="eyebrow">Chosen by Tammy</div>
                <h2>Ways to shop, rather than shelves.</h2>
                <p>
                  Beginner friendly, happy in low light, safe around a cat, under thirty dollars —
                  the groupings that answer a question rather than name a plant.
                </p>
              </div>
              <div className="editorial-collections">
                {collections.map((collection) => (
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
                      <span>{collection.tagline || `${collection._count.products} to browse`}</span>
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
        )}

        {featured.length > 0 && (
          <section className="section editorial-products home-products-section">
            <div className="container">
              <div className="editorial-heading-row">
                <div>
                  <div className="eyebrow">New &amp; noteworthy</div>
                  <h2>Our current favorites.</h2>
                </div>
                <Link className="editorial-link" href="/shop">
                  Shop all products →
                </Link>
              </div>
              <ProductGrid products={featured} />
            </div>
          </section>
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
