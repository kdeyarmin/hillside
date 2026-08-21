import Link from 'next/link';
import { CLASSES_EXIT_LINK } from '@/lib/class-visibility';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/classes/confirmed',
  title: 'Class confirmation',
  description: 'Confirmation for a Hillside Gardens class seat.',
  noindex: true
});

/**
 * Anyone can open this URL. The confirm route redirects here after a real
 * token is redeemed, but the page itself used to assert "Your seat is saved"
 * with no check. The wording is true for someone who just confirmed and
 * honest for a stranger who typed the address.
 */
export default function ClassConfirmed() {
  return (
    <section className="content">
      <div className="container" style={{ maxWidth: 680, textAlign: 'center', paddingTop: 45 }}>
        <div className="eyebrow">Class registration</div>
        <h1
          className="display-title"
          style={{ fontSize: 52, color: 'var(--forest)', margin: '10px 0' }}
        >
          Thank you.
        </h1>
        <p style={{ fontSize: 18 }}>
          If you just confirmed a class seat, it is saved. A confirmation is on its way to the email
          you used. Online classes include a private classroom link in that email.
        </p>
        <div className="actions" style={{ justifyContent: 'center', marginTop: 28 }}>
          <Link className="btn" href={CLASSES_EXIT_LINK.href}>
            {CLASSES_EXIT_LINK.label}
          </Link>
          <Link className="btn gold" href="/care">
            Explore plant care
          </Link>
        </div>
      </div>
    </section>
  );
}
