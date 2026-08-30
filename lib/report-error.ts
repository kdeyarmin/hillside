import crypto from 'crypto';
import os from 'os';

/**
 * The one place a failure the shop cares about is announced from.
 *
 * Every handled failure on this site used to end the same way: a `console.error`
 * into Railway's log stream, which nobody reads until a customer writes in to
 * ask where their plants are. Checkout refusing every card, the confirmation
 * email quietly not arriving, the contact form dropping messages — all of them
 * are invisible from the outside, and all of them cost money for as long as they
 * go unnoticed.
 *
 * This does not replace that log line. The console entry is still the copy with
 * the stack in it, and it is still written whether or not anything else is
 * configured; the reporter only adds a second destination that can wake someone
 * up. With `SENTRY_DSN` unset the behaviour is exactly what it was before.
 *
 * Sentry is spoken to over its plain HTTP store endpoint rather than through
 * `@sentry/node`. This app's dependency list is seven packages long on purpose,
 * and what the SDK adds beyond the one POST below — breadcrumbs, tracing,
 * automatic instrumentation, source-map upload — is machinery a shop this size
 * would carry without using. An event with a message and an exception on it is a
 * single request, and that is all this needs to be.
 */

/** Long enough for a slow ingest, short enough not to hold a socket open. */
const SEND_TIMEOUT_MS = 5_000;

/**
 * How this reporter names itself to Sentry. Worth keeping honest: it is the only
 * thing in an event that says these reports came from a hand-written POST rather
 * than from an SDK, which is the first thing anyone debugging a missing field
 * needs to know.
 */
const SENTRY_CLIENT = 'hillside/1.0';

export type SentryTarget = {
  publicKey: string;
  endpoint: string;
  authHeader: string;
};

/**
 * A Sentry DSN is a URL carrying the project's public key as its username:
 * `https://<publicKey>@<host>/<projectId>`. Everything the store endpoint needs
 * is in that one string, which is why nothing else has to be configured.
 *
 * Only `https` is accepted. The key travels in a header on every report, and a
 * DSN typed with an `http` scheme would put it on the wire in the clear for no
 * benefit — Sentry's ingest has been HTTPS-only for years, so such a value is a
 * typo rather than a deployment worth supporting. A DSN that does not parse is
 * treated the same as no DSN at all: reporting stays off and the logs stay
 * exactly as they were, because a monitoring misconfiguration must never be the
 * thing that takes the site down.
 */
export function parseSentryDsn(value: string | null | undefined): SentryTarget | null {
  const raw = value?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const publicKey = url.username;
  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!publicKey || !projectId) return null;

  // A self-hosted Sentry can live under a path prefix; hosted Sentry never does.
  const prefix = segments.length ? `/${segments.join('/')}` : '';
  return {
    publicKey,
    endpoint: `https://${url.host}${prefix}/api/${projectId}/store/`,
    authHeader: `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=${SENTRY_CLIENT}`
  };
}

/**
 * `String(value)` is not as safe as it looks — a `toString` of its own can throw,
 * and an object made with a null prototype has none at all. Whatever was thrown
 * is already the less important half of this report; it is not allowed to take
 * the report down with it.
 */
function describeUnknown(value: unknown) {
  try {
    return String(value);
  } catch {
    return 'an error that could not be described';
  }
}

/**
 * `type` and `value` are the two fields Sentry groups an issue by, so what goes
 * in them decides whether two failures read as one recurring problem or as two.
 *
 * Something that threw a string, or a Response, keeps a type of its own rather
 * than being dressed up as an Error: it is a different fault from an Error
 * carrying the same words, and folding them together would hide one behind the
 * other in the issue list.
 */
function exceptionValue(error: unknown) {
  if (error instanceof Error) return { type: error.name || 'Error', value: error.message };
  return { type: 'NonError', value: describeUnknown(error) };
}

function sentryEvent(context: string, error: unknown, extra?: Record<string, unknown>) {
  return {
    // Sentry wants a UUID with the dashes taken out.
    event_id: crypto.randomUUID().replaceAll('-', ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    server_name: os.hostname(),
    environment: process.env.NODE_ENV || 'development',
    message: context,
    ...(extra ? { extra } : {}),
    /**
     * No `stacktrace`. Sentry's is a structured list of frames, and turning
     * V8's text into one — mapped back through the build to the TypeScript that
     * was actually written — is precisely the work the SDK exists to do. The
     * stack is in the console line this reporter always writes, which is where
     * it has been read from all along.
     */
    exception: { values: [exceptionValue(error)] }
  };
}

let reportingFailureLogged = false;

/**
 * Once per process, and then never again. A revoked key, an exhausted quota or
 * a blocked egress rule fails on every single report, and a line for each one
 * would bury the errors themselves — which are the thing anyone reading the log
 * came for. One line saying reporting is down is enough to explain the silence
 * from Sentry; the failures underneath it stay legible.
 */
function noteReportingFailure(cause: unknown) {
  if (reportingFailureLogged) return;
  reportingFailureLogged = true;
  console.error(
    '[hillside] Could not send an error to Sentry; errors are going to the logs only.',
    cause
  );
}

/**
 * Reports a failure the shop would otherwise only find out about from a customer.
 *
 * Safe to call from anywhere a failure is handled — route handler, server action,
 * webhook — and safe to call in a `catch` that is about to return a friendly
 * message, which is the whole point: this is what makes a handled error visible
 * without changing what the customer sees.
 */
export function reportError(context: string, error: unknown, extra?: Record<string, unknown>) {
  /**
   * First, unconditionally, and before anything here can go wrong. Every line
   * below is an addition to the Railway log entry and never a replacement for
   * it — a reporter that swallowed the console output would leave the shop
   * quieter than it was before it had any monitoring at all.
   */
  if (extra) console.error(context, error, extra);
  else console.error(context, error);

  const target = parseSentryDsn(process.env.SENTRY_DSN);
  if (!target) return;

  try {
    const body = JSON.stringify(sentryEvent(context, error, extra));
    /**
     * Deliberately not awaited. Every call site is on a path where something has
     * already failed and a customer is waiting to be told so — a slow or
     * unreachable Sentry must not add its own five seconds to the apology. The
     * promise is caught rather than left to float, because an unhandled
     * rejection is how a reporting failure would become a dead container.
     *
     * This is sound because the shop runs as a long-lived Node process on
     * Railway, which is still alive after the response goes out. On a platform
     * that freezes the process at the end of a request the send would have to be
     * awaited, or handed to a `waitUntil`.
     */
    void fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': target.authHeader
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    })
      .then((response) => {
        if (!response.ok) noteReportingFailure(new Error(`Sentry answered ${response.status}.`));
      })
      .catch(noteReportingFailure);
  } catch (reportingError) {
    /**
     * An `extra` that will not serialise — a circular object, a BigInt — or a
     * fetch that threw before it returned anything. The handled error above is
     * what matters here; this one is not permitted to escape and turn it into an
     * unhandled one.
     */
    noteReportingFailure(reportingError);
  }
}

/** Test seam: forgets that reporting has already failed once. */
export function resetErrorReporting() {
  reportingFailureLogged = false;
}
