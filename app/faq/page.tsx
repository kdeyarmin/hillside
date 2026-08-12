import Link from 'next/link';
import { jsonLd } from '@/lib/json-ld';
import { absoluteUrl } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/faq',
  title: 'Frequently Asked Questions',
  description:
    'Answers about Hillside Gardens plants, shipping, local pickup, planter classes, teas and handmade botanical goods.'
});

const questions = [
  ['Do the plants arrive already potted?', 'Product pages explain exactly what is included. Many Hillside plants are sold as ready-to-enjoy potted arrangements, while others may be offered in a nursery pot. Because living plants naturally vary, leaf shape, fullness and exact coloration will not be identical to the photograph.'],
  ['How do I know when to water my plant?', 'We recommend checking the soil rather than watering by a rigid calendar. The product page and care-sheet library explain how dry the soil should feel before each plant is watered.'],
  ['Can live plants be shipped year-round?', 'Weather matters. The Hillside Gardens may temporarily hold a plant order during dangerous heat or freezing temperatures and will contact the customer if a safe-weather delay is needed. Some large or especially delicate arrangements may be limited to local pickup.'],
  ['Do you offer local pickup?', 'When local pickup is available, the product description or checkout instructions will say so. Exact pickup details are shared directly with confirmed customers rather than posted publicly.'],
  ['How do planter classes work?', 'We list the class description, date, location, price, available seats and what to bring. Paid classes can be reserved securely through Stripe. A confirmation is emailed after payment.'],
  ['Can you host a private planter class?', 'Yes. Friend groups, garden clubs, workplaces and special gatherings can ask about a private class through the contact page. We will discuss the group size, location, planter style and budget before scheduling.'],
  ['Will I receive an invoice?', 'Yes. Stripe emails a receipt and, when configured for the checkout, a hosted invoice. Hillside also assigns an order number beginning with HG that can be used on the order-status page.'],
  ['How do I check my shipment?', 'Use the order-status page with the HG order number and the exact email used at checkout. Once we mark the order as shipped, the carrier and tracking number appear there.'],
  ['Are the teas, soaps and lotions handmade?', 'Items described as handmade or small-batch are prepared in limited quantities. Read each product page for ingredients, net contents, directions, allergy information and other product-specific details before purchasing or using.'],
  ['Are Amazon links affiliate links?', 'Some links on our Amazon picks page may be affiliate links. The Hillside Gardens may earn a commission from qualifying purchases without increasing the customer’s price.']
];

/**
 * A page that is nothing but questions and answers should say so in its markup.
 * FAQPage is what makes these eligible to appear as expandable answers in search
 * results, which is where most of these questions actually get asked.
 */
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': absoluteUrl('/faq#faq'),
  url: absoluteUrl('/faq'),
  mainEntity: questions.map(([question, answer]) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer }
  }))
};

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd) }} />
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Helpful answers</div>
          <h1>Frequently asked questions.</h1>
          <p>Quick answers about plants, orders, shipping, classes and Hillside products.</p>
        </div>
      </section>
      <section className="content">
        <div className="narrow">
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p className="muted">{answer}</p>
              </details>
            ))}
          </div>
          <div className="newsletter" style={{ marginTop: 45 }}>
            <div><div className="eyebrow">Still wondering?</div><h3>Ask us directly.</h3></div>
            <Link className="btn gold" href="/contact">Contact The Hillside Gardens</Link>
          </div>
        </div>
      </section>
    </>
  );
}
