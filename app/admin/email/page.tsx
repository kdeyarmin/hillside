import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageStatus, type EmailLog } from '@prisma/client';
import AdminDeepLink from '@/components/AdminDeepLink';
import PendingButton from '@/components/PendingButton';
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
  MESSAGE_PAGE_SIZE,
  emailBodyHtml,
  emailFailureLabel,
  emailKindLabel,
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

/** A page index from the query string: never negative, never a surprise. */
function pageNumber(value: string) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Older and newer links that carry the current filters, so paging through a
 * search does not silently drop it and show unfiltered rows.
 */
function Pager({
  page,
  pageSize,
  total,
  param,
  filters
}: {
  page: number;
  pageSize: number;
  total: number;
  param: 'page' | 'mp';
  filters: Record<string, string | undefined>;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const href = (target: number) =>
    adminEmailPath({ ...filters, [param]: target > 0 ? String(target) : undefined });
  return (
    <div className="admin-actions">
      {page > 0 && (
        <Link className="btn outline small" href={href(page - 1)}>
          ← Newer
        </Link>
      )}
      <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>
        Page {page + 1} of {pages}
      </span>
      {page + 1 < pages && (
        <Link className="btn outline small" href={href(page + 1)}>
          Older →
        </Link>
      )}
    </div>
  );
}

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
  const sentPage = pageNumber(firstSearchParam(params.page));
  const messagePage = pageNumber(firstSearchParam(params.mp));

  /**
   * Searched in SQL against the text built when the row was written, so the
   * whole history is reachable. Reading a window of recent rows and filtering
   * them in memory made anything past that window unfindable, which is the one
   * thing an audit log must not do.
   */
  const logWhere = {
    ...(kind === 'all' ? {} : { kind }),
    ...(status === 'all' ? {} : { status }),
    ...(query
      ? {
          OR: [
            { subject: { contains: query, mode: 'insensitive' as const } },
            { searchText: { contains: query, mode: 'insensitive' as const } }
          ]
        }
      : {})
  };

  const [messages, messageCount, unanswered, entries, matchCount, totals] = await Promise.all([
    db.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      skip: messagePage * MESSAGE_PAGE_SIZE,
      take: MESSAGE_PAGE_SIZE,
      include: { replies: { orderBy: { createdAt: 'asc' } } }
    }),
    db.contactMessage.count(),
    db.contactMessage.count({ where: { status: MessageStatus.NEW } }),
    db.emailLog.findMany({
      where: logWhere,
      orderBy: { createdAt: 'desc' },
      skip: sentPage * EMAIL_LOG_PAGE_SIZE,
      take: EMAIL_LOG_PAGE_SIZE
    }),
    db.emailLog.count({ where: logWhere }),
    db.emailLog.groupBy({ by: ['status'], _count: { _all: true } })
  ]);

  const sentCount = totals.find((row) => row.status === 'SENT')?._count._all || 0;
  const failedCount = totals.find((row) => row.status === 'FAILED')?._count._all || 0;
  const ownerEmails = ownerNotificationEmails();

  const sentFilters = { q: query, kind, status, section: 'sent' };
  const firstSent = sentPage * EMAIL_LOG_PAGE_SIZE;
  const firstMessage = messagePage * MESSAGE_PAGE_SIZE;

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
            <span>Sent</span>
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
              <PendingButton className="btn gold" pendingLabel="Sending…">
                Send email
              </PendingButton>
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
                      {/* Only replies that actually went. A failed attempt is
                          still shown in the thread with its error, but calling
                          the message "Answered" because of one would be a lie
                          told to the person who has to answer it. */}
                      {message.replies.some((reply) => reply.status === 'SENT') && (
                        <span className="status-badge SENT">
                          {message.replies.filter((reply) => reply.status === 'SENT').length === 1
                            ? 'Answered'
                            : `${message.replies.filter((reply) => reply.status === 'SENT').length} replies`}
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
                        <PendingButton className="btn gold small" pendingLabel="Sending…">
                          Send reply
                        </PendingButton>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="admin-card">
              <p className="muted" style={{ margin: 0 }}>
                {messagePage > 0 ? 'No more messages back here.' : 'No website messages yet.'}
              </p>
            </div>
          )}
          {messageCount > MESSAGE_PAGE_SIZE && (
            <>
              <p className="muted" style={{ marginTop: 14 }}>
                Showing {firstMessage + 1}–{firstMessage + messages.length} of {messageCount}.
              </p>
              <Pager
                page={messagePage}
                pageSize={MESSAGE_PAGE_SIZE}
                total={messageCount}
                param="mp"
                filters={{ section: 'messages' }}
              />
            </>
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
            {/* Without this the GET wipes the only parameter AdminDeepLink
                scrolls by, landing the owner back at the compose box. */}
            <input type="hidden" name="section" value="sent" />
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
            {matchCount === 0
              ? 'Nothing matches that yet.'
              : `Showing ${firstSent + 1}–${firstSent + entries.length} of ${matchCount}.`}
          </p>

          {entries.length > 0 && (
            <>
              <div className="admin-list">
                {entries.map((entry) => (
                  <SentRow key={entry.id} entry={entry} />
                ))}
              </div>
              <Pager
                page={sentPage}
                pageSize={EMAIL_LOG_PAGE_SIZE}
                total={matchCount}
                param="page"
                filters={sentFilters}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
