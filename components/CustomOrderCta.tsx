import Link from 'next/link';
import { customOrderHref } from '@/lib/contact';

/**
 * The one invitation to ask for something the shop does not list.
 *
 * A planter made for a particular windowsill, twenty favours for a wedding, a
 * classroom's worth of terrarium kits: none of those is a product, and every
 * page that shows made-to-order work used to end with a different button
 * saying a different thing. This is the one block, and it always leads to the
 * contact form with the subject already chosen and the message half written,
 * so the visitor is not asked to work out how to phrase the request and Tammy
 * is not asked to guess what it is.
 */
export default function CustomOrderCta({
  heading = 'Have something in mind, or need a lot of it?',
  blurb = 'Custom arrangements, made-to-order gifts and bulk orders for weddings, events, offices and classrooms all start with a conversation. Tell us what it is for, how many and when, and we will put a quote together.',
  prefill = 'I would like to ask about a custom or bulk order — '
}: {
  heading?: string;
  blurb?: string;
  /** Opening words for the message box, so the note starts half written. */
  prefill?: string;
}) {
  return (
    <div className="newsletter care-class-cta custom-order-cta">
      <div>
        <div className="eyebrow">Custom &amp; bulk orders</div>
        <h3>{heading}</h3>
        <p>{blurb}</p>
      </div>
      <Link className="btn gold" href={customOrderHref(prefill)}>
        Contact the shop
      </Link>
    </div>
  );
}
