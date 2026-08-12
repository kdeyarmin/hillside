import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/admin';
import { MINIMUM_PASSWORD_LENGTH } from '@/lib/admin-credentials';
import { db } from '@/lib/db';
import { createAdminAccount, resetAdminPassword, setAdminAccountActive } from '../account-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin Accounts' };

const notices: Record<string, { tone: 'ok' | 'bad'; message: string }> = {
  created: { tone: 'ok', message: 'Admin account created. They can sign in with that email and password now.' },
  'password-reset': { tone: 'ok', message: 'Password changed. Any device that was already signed in to that account has been signed out.' },
  deactivated: { tone: 'ok', message: 'Account deactivated. It can no longer sign in, and any session it had has ended.' },
  reactivated: { tone: 'ok', message: 'Account reactivated.' },
  'name-required': { tone: 'bad', message: 'Enter the person’s full name.' },
  'email-invalid': { tone: 'bad', message: 'That does not look like an email address.' },
  'email-taken': { tone: 'bad', message: 'An account with that email already exists. Use “Set a new password” on their row to change it.' },
  'password-weak': { tone: 'bad', message: `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters, with no space at either end.` },
  'not-found': { tone: 'bad', message: 'That account no longer exists.' },
  'self-deactivate': { tone: 'bad', message: 'You cannot deactivate the account you are signed in with. Sign in as another admin to do that.' },
  'last-account': { tone: 'bad', message: 'This is the only account that can sign in. Create another admin first, or set ADMIN_PASSWORD, before deactivating it.' }
};

const signedInLabel = (at: Date | null) => (at ? `${at.toLocaleDateString()} ${at.toLocaleTimeString()}` : 'Never');

export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin');

  const params = await searchParams;
  const notice = params.status ? notices[params.status] : undefined;
  const accounts = await db.adminUser.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const sharedPasswordEnabled = Boolean(process.env.ADMIN_PASSWORD);

  return (
    <div className="adminshell">
      <aside className="sidebar">
        <img src="/logo.webp" alt="The Hillside Gardens" />
        <b>Admin Accounts</b>
        <Link href="/admin">← Business dashboard</Link>
        <a href="#people">Who can sign in</a>
        <a href="#add">Add an admin</a>
        <Link href="/">View public website</Link>
        <p className="muted" style={{ marginTop: 16, marginBottom: 0, fontSize: 14 }}>Signed in as {admin.name}</p>
      </aside>

      <main className="adminmain">
        <div className="eyebrow">Dashboard access</div>
        <h1>Admin accounts</h1>
        <p className="muted">
          Everyone who runs the shop signs in with their own email address and password. Adding
          someone here is all it takes — there is nothing to install and no command to run.
        </p>

        {notice && (
          <p
            role="alert"
            className="admin-card"
            style={{ color: notice.tone === 'bad' ? 'var(--danger)' : 'var(--forest)' }}
          >
            <b>{notice.message}</b>
          </p>
        )}

        <section className="admin-section" id="people">
          <h2>Who can sign in</h2>
          {accounts.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email they sign in with</th>
                    <th>Last signed in</th>
                    <th>Status</th>
                    <th>Set a new password</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        {account.name}
                        {account.id === admin.id && <><br /><small>(you)</small></>}
                      </td>
                      <td>{account.email}</td>
                      <td>{signedInLabel(account.lastLoginAt)}</td>
                      <td>{account.active ? 'Active' : 'Deactivated'}</td>
                      <td>
                        <form action={resetAdminPassword}>
                          <input type="hidden" name="id" value={account.id} />
                          <label className="sr-only" htmlFor={`password-${account.id}`}>
                            New password for {account.name}
                          </label>
                          <input
                            className="admin-input"
                            id={`password-${account.id}`}
                            name="password"
                            type="password"
                            required
                            minLength={MINIMUM_PASSWORD_LENGTH}
                            autoComplete="new-password"
                            placeholder="New password"
                          />
                          <button className="btn small" style={{ marginTop: 6 }}>Save password</button>
                        </form>
                      </td>
                      <td>
                        <form action={setAdminAccountActive}>
                          <input type="hidden" name="id" value={account.id} />
                          <input type="hidden" name="active" value={account.active ? 'false' : 'true'} />
                          <button className={`btn small ${account.active ? 'outline' : 'gold'}`}>
                            {account.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-card">
              <p>No named accounts yet. Add the first one below.</p>
            </div>
          )}
        </section>

        <section className="admin-section" id="add">
          <h2>Add an admin</h2>
          <p className="muted">
            They get the whole dashboard: orders, customer addresses, subscribers and the CSV
            exports of all three. Give them a password of at least {MINIMUM_PASSWORD_LENGTH}{' '}
            characters, tell it to them directly, and have them change it here once they are in.
          </p>
          <form action={createAdminAccount} className="admin-card">
            <div className="admin-form-grid">
              <label className="admin-label">
                Full name
                <input className="admin-input" name="name" required placeholder="Tammy Hill" />
              </label>
              <label className="admin-label">
                Email address
                <input className="admin-input" name="email" type="email" required placeholder="name@example.com" />
              </label>
              <label className="admin-label">
                Password
                <input
                  className="admin-input"
                  name="password"
                  type="password"
                  required
                  minLength={MINIMUM_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <button className="btn" style={{ marginTop: 12 }}>Create account</button>
          </form>
        </section>

        <section className="admin-section">
          <h2>The shared password</h2>
          <p className="muted">
            {sharedPasswordEnabled ? (
              <>
                <b>ADMIN_PASSWORD is still set.</b> It signs in with any email address and shows as
                “Owner” rather than by name, so it cannot tell you who did what. Once everyone above
                can sign in as themselves, clear that variable in Railway and redeploy — named
                accounts keep working, and clearing it signs everyone out once.
              </>
            ) : (
              <>
                <b>ADMIN_PASSWORD is not set,</b> so the accounts above are the only way in. Keep at
                least one of them active.
              </>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
