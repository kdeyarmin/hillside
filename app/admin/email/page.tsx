import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageStatus, type EmailLog } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import { isAdmin } from '@/lib/admin';
import {
  ADMIN_ERRORS,
  ADMIN_NOTICES,
  adminEmailPath,
  firstSearchParam
} from '@/lib/admin-dashboard';
import { db } from '@/lib/db';
import {
  EMAIL_BODY_MAX,
  EMAIL_KIND_LABELS,
  EMAIL_LOG_PAGE_SIZE,
  EMAIL_LOG_SCAN_LIMIT,
  emailBodyHtml,
  emailFailureLabel,
  emailKindLabel,
  emailLogMatches,
  emailPlainText,
  emailPreview,
  ownerSaidHtml,
  parseEmailKindFilter,
  parseEmailStatusFilter
} from '@/lib/email-log';
import { businessEmail, ownerNotificationEmails } from '@/lib/store';
import { replyToCustomerMessage, sendOwnerEmail } from '../email-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email' };

function When({ value }: { value: Date }) {
  return <>{value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</>;
}

/**
 * The message body in a sandboxed frame rather than inline. It is our own
 * generated HTML, but it carries text a stranger typed into the contact form,
 * and an empty `sandbox` is what guarantees that text can never run as script
 * or navigate the dashboard away.
 */
function EmailBody({ html, subject }: { html: string; subject: string }) {
  return (
    <iframe
      sandbox=""
      srcDoc={html}
      title={`Message: ${subject}`}
      style={{
        width: '100%',
        height: 320,
        border: '1px solid var(--line)',
        borderRadius: 12,
        background: '#fff'
      }}
    />
  );
}

function SentRow({ entry }: { entry: EmailLog }) {
  const failed = entry.status === 'FAILED';
  return (
    <details id={`email-${entry.id}`}>
      <summary>
        <span>
          {entry.subject}
          <br />
          <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
            {entry.to.length ? entry.to.join(', ') : 'no recipient'} •{' '}
            <When value={entry.createdAt} />
          </span>
        </span>
        <span className="admin-badges">
          <span className="status-badge">{emailKindLabel(entry.kind)}</span>
          <span className={`status-badge ${entry.status}`}>{failed ? 'Not sent' : 'Sent'}</span>
        </span>
      </summary>
      <div>
        {failed && (
          <p className="admin-alert" style={{ padding: 12, borderRadius: 12 }}>
            <b>{emailFailureLabel(entry.reason)}</b>
          </p>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          {emailPreview(emailBodyHtml(entry.html), 240)}
        </p>
        <EmailBody html={entry.html} subject={entry.subject} />
      </div>
    </details>
  );
}

export default async function AdminEmailPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdmin())) redirect('/admin');

  const params = await searchParams;
  const query = firstSearchParam(params.q).trim();
  const kind = parseEmailKindFilter(firstSearchParam(params.kind));
  const status = parseEmailStatusFilter(firstSearchParam(params.status));
  const focusMessage = firstSearchParam(params.message);
  const notice = ADMIN_NOTICES[firstSearchParam(params.notice)];
  const errorMessage = ADMIN_ERRORS[firstSearchParam(params.error)];

  const [messages, scanned, totals] = await Promise.all([
    db.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { replies: { orderBy: { createdAt: 'asc' } } }
    }),
    db.emailLog.findMany({
      where: {
        ...(kind === 'all' ? {} : { kind }),
        ...(status === 'all' ? {} : { status })
      },
      orderBy: { createdAt: 'desc' },
      take: EMAIL_LOG_SCAN_LIMIT
    }),
    db.emailLog.groupBy({ by: ['status'], _count: { _all: true } })
  ]);

  /**
   * The text query is matched here rather than in SQL because it reads the
   * message body, and the body is stored as the HTML that was sent. The kind
   * and status filters above already narrowed the rows; this is the same shape
   * the product list on the main dashboard uses.
   */
  const matched = scanned.filter((entry) => emailLogMatches(entry, query));
  const visible = matched.slice(0, EMAIL_LOG_PAGE_SIZE);
  const sentCount = totals.find((row) => row.status === 'SENT')?._count._all || 0;
  const failedCount = totals.find((row) => row.status === 'FAILED')?._count._all || 0;
  const unanswered = messages.filter((message) => message.status === MessageStatus.NEW).length;
  const ownerEmails = ownerNotificationEmails();

  return (
    <div className="adminshell">
      <AdminDeepLink
        section={firstSearchParam(params.section) || (focusMessage ? 'messages' : undefined)}
        focusId={focusMessage ? `message-${focusMessage}` : undefined}
      />
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Email</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#compose">Write an email</a>
        <a href="#messages">Customer messages</a>
        <a href="#sent">Sent mail</a>
        <Link href="/admin/content">Website content</Link>
        <Link href="/">View public website</Link>
      </aside>

      <div className="adminmain">
        <div className="eyebrow">Correspondence</div>
        <h1>Email</h1>
        <p className="muted">
          Write to a customer, answer a website message, and look back at everything the shop has
          sent. Mail goes out as <strong>{businessEmail()}</strong>, and replies come back there.
          Anything the shop needs to tell you about — an order, a message, a registration, a review
          — is announced to {ownerEmails.join(' and ')}.
        </p>

        {notice && (
          <div className="admin-card admin-notice" role="status">
            <b>{notice}</b>
          </div>
        )}
        {errorMessage && (
          <div className="admin-card admin-alert" role="alert">
            <b>{errorMessage}</b>
          </div>
        )}

        <div className="statgrid">
          <div className="stat">
            <span>Delivered</span>
            <strong>{sentCount}</strong>
          </div>
          <div className="stat">
            <span>Not sent</span>
            <strong>{failedCount}</strong>
          </div>
          <div className="stat">
            <span>Unanswered messages</span>
            <strong>{unanswered}</strong>
          </div>
          <div className="stat">
            <span>Owner alerts reach</span>
            <strong>
              {ownerEmails.length} {ownerEmails.length === 1 ? 'inbox' : 'inboxes'}
            </strong>
          </div>
        </div>

        <section className="admin-section" id="compose">
          <h2>Write an email</h2>
          <p className="muted">
            Type it the way you would a note. It is sent as The Hillside Gardens, and anything the
            customer writes back arrives at {businessEmail()}.
          </p>
          <form className="admin-card" action={sendOwnerEmail} style={{ marginTop: 14 }}>
            <div className="admin-form-grid">
              <label className="admin-label">
                To
                <input
                  className="admin-input"
                  name="to"
                  type="text"
                  placeholder="customer@example.com"
                  required
                />
                <span className="admin-hint">Separate up to five addresses with a comma.</span>
              </label>
              <label className="admin-label">
                Subject
                <input
                  className="admin-input"
                  name="subject"
                  type="text"
                  placeholder="About your order"
                  required
                />
              </label>
              <label className="admin-label full">
                Message
                <textarea
                  className="admin-input"
                  name="body"
                  rows={9}
                  maxLength={EMAIL_BODY_MAX}
                  placeholder={'Hi there,\n\nThank you for...'}
                  required
                />
                <span className="admin-hint">
                  A blank line starts a new paragraph. Your name and the shop address are added at
                  the end.
                </span>
              </label>
            </div>
            <div className="admin-actions">
              <button className="btn gold">Send email</button>
            </div>
          </form>
        </section>

        <section className="admin-section" id="messages">
          <div className="toolbar">
            <div>
              <h2>Customer messages</h2>
              <p className="muted">
                Everything sent through the website contact form. Answer here and the reply is kept
                with the message.
              </p>
            </div>
          </div>
          {messages.length ? (
            <div className="admin-list">
              {messages.map((message) => (
                <details
                  open={message.status === MessageStatus.NEW || message.id === focusMessage}
                  id={`message-${message.id}`}
                  key={message.id}
                >
                  <summary>
                    <span>
                      {message.subject} • {message.name}
                    </span>
                    <span className="admin-badges">
                      {message.replies.length > 0 && (
                        <span className="status-badge SENT">
                          {message.replies.length === 1
                            ? 'Answered'
                            : `${message.replies.length} replies`}
                        </span>
                      )}
                      <span className={`status-badge ${message.status}`}>{message.status}</span>
                    </span>
                  </summary>
                  <div>
                    <p>
                      <b>From:</b> {message.name} • {message.email}
                      {message.phone && <> • {message.phone}</>} •{' '}
                      <When value={message.createdAt} />
                    </p>
                    <p style={{ whiteSpace: 'pre-line' }}>{message.message}</p>

                    {message.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="admin-card"
                        style={{ marginBottom: 12, background: '#f5f7f4' }}
                      >
                        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                          <b>{reply.status === 'FAILED' ? 'Reply not sent' : 'You replied'}</b> •{' '}
                          <When value={reply.createdAt} />
                        </p>
                        <p style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>
                          {emailPlainText(ownerSaidHtml(reply.html))}
                        </p>
                        {reply.status === 'FAILED' && (
                          <p className="admin-hint" style={{ marginBottom: 0 }}>
                            {emailFailureLabel(reply.reason)}
                          </p>
                        )}
                      </div>
                    ))}

                    <form action={replyToCustomerMessage}>
                      <input type="hidden" name="id" value={message.id} />
                      <label className="admin-label">
                        Reply to {message.name}
                        <input
                          className="admin-input"
                          name="subject"
                          type="text"
                          defaultValue={`Re: ${message.subject}`}
                        />
                      </label>
                      <label className="admin-label" style={{ marginTop: 10 }}>
                        Message
                        <textarea
                          className="admin-input"
                          name="body"
                          rows={6}
                          maxLength={EMAIL_BODY_MAX}
                          placeholder="Thank you for writing..."
                          required
                        />
                        <span className="admin-hint">
                          Their message is quoted underneath, and this is marked read once it sends.
                        </span>
                      </label>
                      <div className="admin-actions">
                        <button className="btn gold small">Send reply</button>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="admin-card">
              <p className="muted" style={{ margin: 0 }}>
                No website messages yet.
              </p>
            </div>
          )}
        </section>

        <section className="admin-section" id="sent">
          <div className="toolbar">
            <div>
              <h2>Sent mail</h2>
              <p className="muted">
                Every email the shop has tried to send, including the ones that did not go out.
              </p>
            </div>
          </div>

          <form className="admin-card" method="get" style={{ marginTop: 14 }}>
            <div className="admin-form-grid">
              <label className="admin-label">
                Search
                <input
                  className="admin-input"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="An address, a subject, a few words"
                />
              </label>
              <label className="admin-label">
                Kind
                <select className="admin-input" name="kind" defaultValue={kind}>
                  <option value="all">Everything</option>
                  {Object.entries(EMAIL_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label">
                Delivery
                <select className="admin-input" name="status" defaultValue={status}>
                  <option value="all">Sent and not sent</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Not sent</option>
                </select>
              </label>
            </div>
            <div className="admin-actions">
              <button className="btn">Search</button>
              <Link className="btn outline" href={adminEmailPath({ section: 'sent' })}>
                Clear
              </Link>
            </div>
          </form>

          <p className="muted" style={{ marginTop: 14 }}>
            {matched.length === 0
              ? 'Nothing matches that yet.'
              : `Showing ${visible.length} of ${matched.length}${
                  scanned.length === EMAIL_LOG_SCAN_LIMIT
                    ? ` from the last ${EMAIL_LOG_SCAN_LIMIT} emails`
                    : ''
                }.`}
          </p>

          {visible.length > 0 && (
            <div className="admin-list">
              {visible.map((entry) => (
                <SentRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
