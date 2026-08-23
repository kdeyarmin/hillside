import NewsletterForm from '@/components/NewsletterForm';
import type { NewsletterSourceKey } from '@/lib/newsletter-source';

/**
 * The one signup pattern the storefront uses away from the homepage and footer:
 * a quiet panel in the flow of the page, where a reader who has just finished
 * something — a care guide, a product, an order — can opt in if they want to.
 *
 * Deliberately not a popup, an interstitial or a timed overlay. Those convert
 * by interrupting, they are the first thing a returning customer learns to
 * dismiss, and getting the "don't show this again" rules right is a worse
 * problem than the one they solve. A panel that stays where it was put is
 * ignorable at no cost to the reader.
 */
export default function InlineNewsletter({
  source,
  sourceDetail,
  eyebrow = 'The Hillside Notes',
  heading = 'Seasonal tips, plant care and new arrivals.',
  blurb = 'An occasional note from the bench. No daily flood, and you can leave any time.'
}: {
  source: NewsletterSourceKey;
  sourceDetail?: string;
  eyebrow?: string;
  heading?: string;
  blurb?: string;
}) {
  return (
    <aside className="inline-newsletter">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{heading}</h2>
        <p>{blurb}</p>
      </div>
      <NewsletterForm compact source={source} sourceDetail={sourceDetail} />
    </aside>
  );
}
