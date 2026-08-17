import Link from 'next/link';
import { CLASSES_EXIT_LINK } from '@/lib/class-visibility';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/classes/confirmed',
  title: 'Class seat confirmed',
  description: 'Your free class seat at The Hillside Gardens is confirmed.',
  noindex: true
});

export default function ClassConfirmed() {
  return (
    <section className="content">
      <div className="container" style={{ maxWidth: 680, textAlign: 'center', paddingTop: 45 }}>
        <div className="eyebrow">Registration confirmed</div>
        <h1 className="display-title" style={{ fontSize: 52, color: 'var(--forest)', margin: '10px 0' }}>
          Your seat is saved.
        </h1>
        <p style={{ fontSize: 18 }}>
          Thank you for confirming. A class confirmation is on its way to the email you used.
          If this is an online class, that email includes your private classroom link.
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
