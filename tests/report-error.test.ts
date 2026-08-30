import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { parseSentryDsn, reportError, resetErrorReporting } from '../lib/report-error.ts';

/**
 * Two things are worth holding still here.
 *
 * The DSN parse, because it is the only configuration this has: a shop owner
 * pastes one string into Railway and either the alerts arrive or they do not,
 * with nothing in between to inspect. And the promise that `reportError` never
 * throws, because every call site is inside a `catch` that is about to answer a
 * customer — a reporter that threw would turn a failure the site had handled
 * gracefully into a 500, which is the exact opposite of what it was added for.
 */

type SentryEvent = {
  event_id: string;
  timestamp: string;
  platform: string;
  level: string;
  message: string;
  environment: string;
  server_name: string;
  extra?: Record<string, unknown>;
  exception: { values: Array<{ type: string; value: string }> };
};

let sent: { url: string; init: RequestInit } | null = null;
let logged: unknown[][] = [];
let restoreFetch: (() => void) | null = null;
let restoreError: (() => void) | null = null;

function stubFetch(respond: () => Promise<Response> | Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url: String(url), init };
    return respond();
  }) as unknown as typeof globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

/** Lets the fire-and-forget send settle before its outcome is asserted on. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sentEvent(): SentryEvent {
  return JSON.parse(String(sent!.init.body)) as SentryEvent;
}

/**
 * What the reporter itself wrote. Node puts its own process warnings — the
 * typeless-package-json notice this runner raises, among others — through
 * `console.error` as well, and they land in whichever test happens to be
 * holding the stub when they fire, which is not something to assert against.
 */
function reportLines() {
  return logged.filter((entry) => !(typeof entry[0] === 'string' && entry[0].startsWith('(node:')));
}

beforeEach(() => {
  sent = null;
  logged = [];
  resetErrorReporting();
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  restoreError = () => {
    console.error = originalError;
  };
});

afterEach(() => {
  restoreFetch?.();
  restoreError?.();
  restoreFetch = null;
  restoreError = null;
  delete process.env.SENTRY_DSN;
});

describe('parseSentryDsn', () => {
  it('reads the key, the host and the project out of one string', () => {
    const target = parseSentryDsn('https://abc123@o42.ingest.sentry.io/7654321');
    assert.equal(target?.publicKey, 'abc123');
    assert.equal(target?.endpoint, 'https://o42.ingest.sentry.io/api/7654321/store/');
    assert.equal(
      target?.authHeader,
      'Sentry sentry_version=7, sentry_key=abc123, sentry_client=hillside/1.0'
    );
  });

  /** A self-hosted Sentry can sit under a path; the project id is still last. */
  it('keeps a path prefix ahead of the api segment', () => {
    const target = parseSentryDsn('https://key@sentry.example.com/relay/99');
    assert.equal(target?.endpoint, 'https://sentry.example.com/relay/api/99/store/');
  });

  it('keeps a port', () => {
    const target = parseSentryDsn('https://key@sentry.example.com:9000/5');
    assert.equal(target?.endpoint, 'https://sentry.example.com:9000/api/5/store/');
  });

  it('ignores surrounding whitespace, which a pasted value usually carries', () => {
    const target = parseSentryDsn('  https://key@sentry.example.com/5\n');
    assert.equal(target?.endpoint, 'https://sentry.example.com/api/5/store/');
  });

  /**
   * Every one of these turns reporting off rather than half on. A monitoring
   * setting that is wrong must never be the thing that takes the shop down, and
   * an unset variable is the ordinary case rather than a mistake.
   */
  it('refuses anything it cannot use, instead of guessing', () => {
    assert.equal(parseSentryDsn(undefined), null);
    assert.equal(parseSentryDsn(null), null);
    assert.equal(parseSentryDsn(''), null);
    assert.equal(parseSentryDsn('   '), null);
    assert.equal(parseSentryDsn('not a url'), null, 'unparseable');
    assert.equal(parseSentryDsn('https://o42.ingest.sentry.io/7654321'), null, 'no public key');
    assert.equal(parseSentryDsn('https://abc123@o42.ingest.sentry.io'), null, 'no project id');
    assert.equal(parseSentryDsn('https://abc123@o42.ingest.sentry.io/'), null, 'no project id');
  });

  /** The public key rides in a header on every report, so plain HTTP is refused. */
  it('refuses a DSN that is not https', () => {
    assert.equal(parseSentryDsn('http://abc123@sentry.example.com/5'), null);
    assert.equal(parseSentryDsn('ftp://abc123@sentry.example.com/5'), null);
  });
});

describe('reportError logging', () => {
  it('logs whether or not Sentry is configured', () => {
    const error = new Error('checkout exploded');
    reportError('Unable to create checkout session', error);
    assert.deepEqual(reportLines(), [['Unable to create checkout session', error]]);
    assert.equal(sent, null, 'nothing is sent without a DSN');
  });

  it('puts the extra context in the log line too', () => {
    const error = new Error('nope');
    reportError('Email send failed', error, { kind: 'ORDER_CONFIRMATION' });
    assert.deepEqual(reportLines(), [['Email send failed', error, { kind: 'ORDER_CONFIRMATION' }]]);
  });

  it('still logs when the report is also sent', async () => {
    process.env.SENTRY_DSN = 'https://key@sentry.example.com/5';
    stubFetch(() => new Response('', { status: 200 }));
    reportError('Contact form failed', new Error('db down'));
    await flush();
    assert.equal(reportLines().length, 1, 'the log line is an addition, not a replacement');
    assert.equal(reportLines()[0][0], 'Contact form failed');
  });
});

describe('reportError sending', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://key@sentry.example.com/5';
  });

  it('posts the event to the store endpoint with the auth header', () => {
    stubFetch(() => new Response('', { status: 200 }));
    reportError('Order confirmation email did not go out', new Error('provider-error'), {
      invoiceNumber: 'HG-1234'
    });

    assert.equal(sent!.url, 'https://sentry.example.com/api/5/store/');
    assert.equal(sent!.init.method, 'POST');
    assert.deepEqual(sent!.init.headers, {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=key, sentry_client=hillside/1.0'
    });

    const event = sentEvent();
    assert.match(event.event_id, /^[0-9a-f]{32}$/, '32 hex characters, no dashes');
    assert.equal(event.timestamp, new Date(event.timestamp).toISOString());
    assert.equal(event.platform, 'node');
    assert.equal(event.level, 'error');
    assert.equal(event.message, 'Order confirmation email did not go out');
    assert.ok(event.environment);
    assert.ok(event.server_name);
    assert.deepEqual(event.extra, { invoiceNumber: 'HG-1234' });
    assert.deepEqual(event.exception.values, [{ type: 'Error', value: 'provider-error' }]);
  });

  /** Grouping in Sentry is by type and value, so a thrown string keeps its own. */
  it('describes something that is not an Error without pretending it is one', () => {
    stubFetch(() => new Response('', { status: 200 }));
    reportError('Email send failed', 'sendgrid said no', { status: 401 });
    assert.deepEqual(sentEvent().exception.values, [
      { type: 'NonError', value: 'sendgrid said no' }
    ]);
  });

  it('sends nothing at all when the DSN is unusable', () => {
    process.env.SENTRY_DSN = 'sentry.example.com/5';
    stubFetch(() => new Response('', { status: 200 }));
    reportError('Contact form failed', new Error('db down'));
    assert.equal(sent, null);
    assert.equal(reportLines().length, 1, 'the failure is still logged');
  });

  /**
   * A revoked key fails on every report. One line explaining the silence is
   * useful; a line per failure would bury the failures themselves, which is
   * what anyone reading the log came for.
   */
  it('complains about a broken reporter once and then keeps quiet', async () => {
    stubFetch(() => new Response('forbidden', { status: 403 }));
    reportError('First failure', new Error('one'));
    await flush();
    reportError('Second failure', new Error('two'));
    await flush();

    const complaints = reportLines().filter((entry) => String(entry[0]).startsWith('[hillside]'));
    assert.equal(complaints.length, 1);
    assert.equal(reportLines().length, 3, 'both failures logged, one complaint about Sentry');
  });
});

describe('reportError never throws', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://key@sentry.example.com/5';
  });

  it('survives a fetch that throws where it stands', () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('socket hang up');
    }) as typeof globalThis.fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
    assert.doesNotThrow(() => reportError('Contact form failed', new Error('db down')));
  });

  it('survives a send that rejects later, without an unhandled rejection', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
    assert.doesNotThrow(() => reportError('Contact form failed', new Error('db down')));
    await flush();
  });

  /** A circular object reaches `JSON.stringify`, which throws on one. */
  it('survives extra context that will not serialise', () => {
    stubFetch(() => new Response('', { status: 200 }));
    const circular: Record<string, unknown> = { order: 'HG-1' };
    circular.self = circular;
    assert.doesNotThrow(() => reportError('Unable to save cart lead', new Error('x'), circular));
    assert.equal(sent, null, 'the body was never built, so nothing went out');
    assert.equal(
      reportLines()[0][0],
      'Unable to save cart lead',
      'the failure is logged regardless'
    );
  });

  it('survives being handed something that is not an error at all', () => {
    stubFetch(() => new Response('', { status: 200 }));
    for (const thrown of [undefined, null, 42, { code: 'EAI_AGAIN' }, Symbol('nope')]) {
      assert.doesNotThrow(() => reportError('Something failed', thrown));
    }
  });

  /** An object with no prototype has no `toString` for `String()` to reach. */
  it('survives a value that cannot even be turned into a string', () => {
    stubFetch(() => new Response('', { status: 200 }));
    assert.doesNotThrow(() => reportError('Something failed', Object.create(null)));
    assert.ok(sentEvent().exception.values[0].value.length);
  });
});
