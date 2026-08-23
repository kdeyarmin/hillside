import Link from 'next/link';
import { CalendarDays, Leaf, MapPin, Phone, ShoppingBag, Truck } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { contactHref } from '@/lib/contact';
import { db } from '@/lib/db';
import { jsonLd } from '@/lib/json-ld';
import { breadcrumbJsonLd, faqJsonLd, pageMetadata } from '@/lib/seo';
import { businessEmail } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/visit',
  title: 'Local Plant Shopping in Ebensburg, PA',
  description:
    'Buy houseplants, carnivorous plants, succulents, air plants and terrarium supplies locally in Ebensburg, Cambria County. Arrange a local pickup, or have plants shipped across Pennsylvania.',
  keywords: [
    'plant shop Ebensburg PA',
    'houseplants Cambria County',
    'local plant pickup',
    'terrarium supplies Pennsylvania',
    'carnivorous plants PA',
    'Western Pennsylvania plant shop'
  ]
});

/**
 * Questions somebody deciding whether to drive here would actually ask. They are
 * answered on the page and in FAQPage markup from the same array, so the two
 * cannot say different things — and nothing here promises a walk-in address or
 * opening hours, because pickups are arranged by email first and publishing a
 * door to knock on would be a promise the shop has not made.
 */
const questions = [
  {
    question: 'Where is The Hillside Gardens?',
    answer:
      'We are based in Ebensburg, Pennsylvania, in Cambria County — about half an hour from Johnstown and an hour and a half east of Pittsburgh. Pickups are arranged by email or phone first, and the exact address and time come with that confirmation rather than being posted publicly.'
  },
  {
    question: 'How does local pickup work?',
    answer:
      'Contact us to arrange a time before you order. Once we confirm, choose local pickup at checkout instead of shipping — there is no shipping charge on a pickup order. We email you when the order is packed and ready, with the pickup window. Some larger arrangements and delicate pieces are pickup only.'
  },
  {
    question: 'Which areas do you serve?',
    answer:
      'Local pickup suits Ebensburg, Johnstown, Altoona, Loretto, Carrolltown, Nanty Glo, Portage and the rest of Cambria County. We ship the rest of Pennsylvania and the continental United States, holding live plants back during dangerous heat or freezing weather.'
  },
  {
    question: 'Can I ask for a plant you do not have listed?',
    answer:
      'Yes. The shop lists only what is potted, photographed and ready to go home, so it is always shorter than what is on the bench. Tell us what you are looking for — a pet-safe plant for a low-light room, a carnivorous plant for a first terrarium, a gift under a certain price — and we will say what is coming or make something up for you.'
  },
  {
    question: 'Do you make custom planters and terrariums?',
    answer:
      'We do. Custom planter arrangements and terrariums are put together by hand for the room and the light you describe. These are usually local pickup, because a planted terrarium travels much better in a car than in a box.'
  }
];

export default async function VisitPage() {
  const [collections, careGuideCount, catalogCount] = await Promise.all([
    db.collection.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true, tagline: true },
      take: 8
    }),
    db.careSheet.count({ where: { published: true } }),
    db.product.count({ where: { active: true } })
  ]);

  const locality = process.env.BUSINESS_CITY?.trim();
  const region = process.env.BUSINESS_STATE?.trim();
  const telephone = process.env.BUSINESS_PHONE?.trim();
  const openingHours = (process.env.BUSINESS_OPENING_HOURS?.trim() || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const faqSchema = faqJsonLd('/visit', questions);

  return (
    <>
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Visit & local pickup', path: '/visit' }
            ])
          )
        }}
      />

      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Ebensburg · Cambria County · Pennsylvania</div>
          <h1>Local plant shopping on the Hillside.</h1>
          <p>
            The Hillside Gardens is a small plant shop and garden studio in Ebensburg, Pennsylvania.
            Houseplants, carnivorous plants, succulents, air plants, terrarium supplies and
            small-batch botanical goods, potted by hand and collected in person or shipped.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Link className="btn" href={contactHref({ subject: 'Local pickup inquiry' })}>
              Arrange a local pickup
            </Link>
            {catalogCount > 0 && (
              <Link className="btn outline" href="/shop?tags=local-pickup">
                See what is ready now
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="content">
        <div className="container">
          <div className="trust-strip" aria-label="Shopping with us locally">
            <div>
              <MapPin />
              <span>
                <b>{locality && region ? `${locality}, ${region}` : 'Ebensburg, Pennsylvania'}</b>
                <small>Cambria County, between Johnstown and Altoona.</small>
              </span>
            </div>
            <div>
              <ShoppingBag />
              <span>
                <b>Pickup arranged first</b>
                <small>
                  Message us, then choose local pickup at checkout — no shipping charge.
                </small>
              </span>
            </div>
            <div>
              <Truck />
              <span>
                <b>Shipping across PA and the US</b>
                <small>Live plants held back in dangerous heat or freezing weather.</small>
              </span>
            </div>
            <div>
              <Leaf />
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
          </div>

          <div className="collection-crosslinks">
            <BrandMockupScene
              variant="about"
              className="collection-care-scene"
              alt="Terracotta pots and seedlings on the Hillside potting bench in Ebensburg"
              badge={false}
            />
            <div className="prose">
              <span className="eyebrow">Why buy a plant locally</span>
              <h2>A plant that has not been in a box travels better.</h2>
              <p>
                A houseplant collected in Cambria County has not spent three days in the dark at the
                mercy of a Pennsylvania cold snap. It is potted, watered and handed over the same
                week — which matters most for the plants that dislike the trip: large foliage
                plants, planted terrariums, carnivorous plants and anything already in a heavy
                ceramic pot.
              </p>
              <p>
                It also means you can ask questions in person. Most of what we are asked is not
                which plant is prettiest but which one will survive a north-facing apartment, a
                curious cat or a household that travels — and that is a conversation, not a product
                page.
              </p>
              {telephone && (
                <p>
                  <Phone size={16} aria-hidden="true" /> Call us on{' '}
                  <a className="text-link" href={`tel:${telephone.replace(/[^+\d]/g, '')}`}>
                    {telephone}
                  </a>
                  , or write to{' '}
                  <a className="text-link" href={`mailto:${businessEmail()}`}>
                    {businessEmail()}
                  </a>
                  .
                </p>
              )}
              {openingHours.length > 0 && (
                <>
                  <h3>When we are here</h3>
                  <ul>
                    {openingHours.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          {collections.length > 0 && (
            <div className="category-links">
              <b>What we keep</b>
              <ul>
                {collections.map((collection) => (
                  <li key={collection.slug}>
                    <Link href={`/collections/${collection.slug}`}>{collection.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="category-faq narrow">
            <div className="sectionhead">
              <div className="eyebrow">Before you drive over</div>
              <h2>Visiting and local pickup.</h2>
            </div>
            <div className="faq-list">
              {questions.map((entry) => (
                <details key={entry.question}>
                  <summary>{entry.question}</summary>
                  <p className="muted">{entry.answer}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="category-links">
            <b>Keep looking</b>
            <ul>
              <li>
                <Link href="/shop">Shop everything</Link>
              </li>
              <li>
                <Link href="/care">Plant care library</Link>
              </li>
              {CLASSES_PUBLICLY_VISIBLE && (
                <li>
                  <Link href="/classes">
                    <CalendarDays size={14} aria-hidden="true" /> Plant classes
                  </Link>
                </li>
              )}
              <li>
                <Link href="/shipping-returns">Shipping &amp; returns</Link>
              </li>
              <li>
                <Link href={contactHref({ subject: 'Custom planter arrangement' })}>
                  Ask about a custom arrangement
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
