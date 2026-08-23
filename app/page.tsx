import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Gift,
  Leaf,
  MapPin,
  Package,
  Sparkles,
  Sprout,
  Truck
} from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import BundleGrid from '@/components/BundleGrid';
import NewsletterForm from '@/components/NewsletterForm';
import ProductGrid from '@/components/ProductGrid';
import { bundleCardData, sellableBundles } from '@/lib/bundle-queries';
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
import { withCardFacts } from '@/lib/product-cards';
import { pageMetadata } from '@/lib/seo';
import { MAX_HOMEPAGE_SECTION_ITEMS } from '@/lib/merchandising';
import { productsForSection, type MerchandisedProduct } from '@/lib/merchandising-data';
import { formatMoney, formatMoneyCompact, freeShippingThresholdCents } from '@/lib/store';

/**
 * How many categories the hero names. Enough to say what the shop is without
 * turning the first thing a visitor reads into a directory.
 */
const HERO_CATEGORY_LIMIT = 14;

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
    case 'BUNDLES':
      return { href: '/bundles', label: 'All sets & kits →' };
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
  const [
    sections,
    featuredSets,
    upcomingClasses,
    categories,
    collections,
    careGuideCount,
    catalogCount
  ] = await Promise.all([
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
    /**
     * Featured sets, but only ones that can actually be built right now — a
     * kit whose last component sold this morning drops off the homepage on its
     * own rather than sending the day's visitors to a sold-out page.
     */
    sellableBundles({ featured: true, take: MAX_HOMEPAGE_SECTION_ITEMS }),
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
     * Every category the owner is showing, in her order — read once and used
     * twice below, for the hero's list of what the shop sells and for the
     * shop-by tiles.
     *
     * Read rather than hard-coded, which is the whole point of the taxonomy
     * being rows: a static list went on advertising a category's old name
     * after Tammy renamed it, kept linking one she had hidden, and pointed at
     * a slug that no longer matched anything.
     */
    db.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
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

  const resolved = await Promise.all(
    sections.map(async (section) => ({
      section,
      products:
        section.kind === 'COLLECTION_TILES'
          ? ([] as MerchandisedProduct[])
          : await productsForSection(section)
    }))
  );

  /**
   * Every row's products enriched in one pass, then looked up by id. A product
   * that appears in two rows is decorated once, and every grid on the page
   * badges it identically because there is only one answer.
   */
  const allProducts = resolved.flatMap((entry) => entry.products);
  const decorated = new Map(
    (await withCardFacts(allProducts)).map((product) => [product.id, product])
  );
  const decorate = (product: MerchandisedProduct) => decorated.get(product.id)!;

  /**
   * A row with nothing in it is dropped rather than rendered as a heading over
   * empty space — which is what lets a "Best sellers" row stay arranged through
   * a quiet winter. Collection tiles are the same: no stocked collections, no
   * row.
   */
  const rows = resolved.filter(
    (entry) =>
      (entry.section.kind === 'COLLECTION_TILES' && collections.length > 0) ||
      (entry.section.kind === 'BUNDLES' && featuredSets.length > 0) ||
      entry.products.length > 0
  );
  const classSeats = await seatsRemainingFor(upcomingClasses);

  /**
   * The hero names what the shop sells, so it lists a category whether or not
   * the shelf is full today — "we sell moss" stays true between batches, and a
   * chip for an empty category drops its filter rather than leading nowhere.
   * The tiles below are the opposite: they are an invitation to browse, so they
   * only appear once there is something behind them.
   */
  const heroCategories = categories.slice(0, HERO_CATEGORY_LIMIT);
  const categoryTiles = categories
    .filter((category) => category.featured && category._count.products > 0)
    .slice(0, 8);

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
          {heroCategories.length > 0 && (
            <ul className="hero-catalog">
              {heroCategories.map((category) => (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`}>{category.title}</Link>
                </li>
              ))}
            </ul>
          )}
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
        {catalogCount === 0 && rows.length === 0 && categoryTiles.length === 0 && (
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

        {categoryTiles.length > 0 && (
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
                {categoryTiles.map((category) => (
                  <Link
                    className="category-tile"
                    href={`/categories/${category.slug}`}
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

        {rows.map(({ section, products }) =>
          section.kind === 'BUNDLES' ? (
            <section className="section editorial-products home-products-section" key={section.id}>
              <div className="container">
                <div className="editorial-heading-row">
                  <div>
                    {section.eyebrow && (
                      <div className="eyebrow">
                        <Package size={14} aria-hidden="true" /> {section.eyebrow}
                      </div>
                    )}
                    <h2>{section.title}</h2>
                    {section.subtitle && <p>{section.subtitle}</p>}
                  </div>
                  <Link className="editorial-link" href={sectionLink(section).href}>
                    {sectionLink(section).label}
                  </Link>
                </div>
                <BundleGrid bundles={featuredSets.slice(0, section.maxItems).map(bundleCardData)} />
              </div>
            </section>
          ) : section.kind === 'COLLECTION_TILES' ? (
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

        {catalogCount > 0 && (
          <section className="section gift-promo home-gift-section">
            <div className="container care-promo-inner">
              <Gift size={42} aria-hidden="true" />
              <div>
                <div className="eyebrow">Shopping for someone else?</div>
                <h2>Gifts, sorted by who they are for.</h2>
                <p>
                  Ready-made bundles, gifts under $25 and $50, and picks for plant lovers, tea
                  drinkers, teachers and new homes. Add a gift message free at checkout.
                </p>
              </div>
              <Link className="btn light" href="/gifts">
                Open the gift guide
              </Link>
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
          <NewsletterForm source="homepage" />
        </div>
      </section>
    </>
  );
}
