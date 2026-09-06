import Link from 'next/link';
import { MailCheck, Sprout } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/newsletter/subscribed',
  title: 'Join The Hillside Notes',
  description: 'Confirmation for The Hillside Gardens email list.',
  noindex: true
});

type Result = {
  eyebrow: string;
  heading: string;
  message: string;
  success: boolean;
};

const RESULTS: Record<string, Result> = {
  done: {
    eyebrow: 'The Hillside Notes',
    heading: 'You’re on the list.',
    message:
      'Watch your inbox for a welcome note. We’ll send occasional plant care, seasonal ideas and fresh arrivals from the Hillside.',
    success: true
  },
  'email-delayed': {
    eyebrow: 'Signup saved',
    heading: 'You’re on the list.',
    message:
      'Your address is safely saved. The welcome email may take a little longer, but you do not need to sign up again.',
    success: true
  },
  invalid: {
    eyebrow: 'One quick correction',
    heading: 'We couldn’t use that email address.',
    message: 'Please return to the site and check the address before trying again.',
    success: false
  },
  limited: {
    eyebrow: 'Please try again shortly',
    heading: 'This connection has sent several signups.',
    message:
      'We paused new entries briefly to protect the list from spam. Wait about 15 minutes, then try again.',
    success: false
  },
  unavailable: {
    eyebrow: 'Please try again',
    heading: 'We couldn’t save your signup just now.',
    message: 'Nothing was submitted. Please return to the site and try once more.',
    success: false
  }
};

export default async function NewsletterSubscribedPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status || 'unavailable';
  const result = RESULTS[status] || RESULTS.unavailable;
  const Icon = result.success ? MailCheck : Sprout;

  return (
    <section className="content">
      <div
        className="container empty-state wide"
        style={{ minHeight: 480, display: 'grid', placeContent: 'center' }}
      >
        <Icon size={40} aria-hidden="true" />
        <div className="eyebrow">{result.eyebrow}</div>
        <h1
          className="display-title"
          style={{ color: 'var(--forest)', fontSize: 42, margin: '8px 0' }}
        >
          {result.heading}
        </h1>
        <p>{result.message}</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/">
            Return home
          </Link>
          <Link className="btn outline" href="/care">
            Browse plant care
          </Link>
        </div>
      </div>
    </section>
  );
}
