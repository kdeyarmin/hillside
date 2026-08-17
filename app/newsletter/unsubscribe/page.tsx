import Link from 'next/link';
import { Mail } from 'lucide-react';
import { readUnsubscribeToken } from '@/lib/newsletter';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/newsletter/unsubscribe',
  title: 'Unsubscribe from The Hillside Notes',
  description: 'Stop marketing email from The Hillside Gardens.',
  noindex: true
});

export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: Promise<{ token?: string; done?: string; invalid?: string }>;
}) {
  const { token, done, invalid } = await searchParams;
  const email = token ? readUnsubscribeToken(token) : null;
  const finished = done === '1';
  const broken = invalid === '1' || (!finished && !email);

  return (
    <section className="content">
      <div
        className="container empty-state wide"
        style={{ minHeight: 480, display: 'grid', placeContent: 'center' }}
      >
        <Mail size={38} />
        {finished ? (
          <>
            <div className="eyebrow">The Hillside Notes</div>
            <h1
              className="display-title"
              style={{ color: 'var(--forest)', fontSize: 42, margin: '8px 0' }}
            >
              You are unsubscribed.
            </h1>
            <p>
              We will not send The Hillside Notes to this address again unless you rejoin the list.
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn" href="/">
                Return home
              </Link>
              <Link className="btn outline" href="/care">
                Plant care library
              </Link>
            </div>
          </>
        ) : broken ? (
          <>
            <div className="eyebrow">The Hillside Notes</div>
            <h1
              className="display-title"
              style={{ color: 'var(--forest)', fontSize: 42, margin: '8px 0' }}
            >
              This unsubscribe link is not valid.
            </h1>
            <p>
              It may have been copied incompletely. Reply to any Hillside Notes email, or write to
              us and we will take you off the list.
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn" href="/contact">
                Contact us
              </Link>
              <Link className="btn outline" href="/">
                Return home
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">The Hillside Notes</div>
            <h1
              className="display-title"
              style={{ color: 'var(--forest)', fontSize: 42, margin: '8px 0' }}
            >
              Stop these emails?
            </h1>
            <p>
              Unsubscribe <b>{email}</b> from seasonal notes, plant care and new-arrival messages.
              Order and class email is separate and will still arrive when you shop or book.
            </p>
            <form action="/api/newsletter/unsubscribe" method="post">
              <input type="hidden" name="token" value={token} />
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="btn" type="submit">
                  Unsubscribe
                </button>
                <Link className="btn outline" href="/">
                  Keep me on the list
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
