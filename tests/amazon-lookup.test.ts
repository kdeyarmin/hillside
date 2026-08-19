import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { associateTag, lookupAmazonProduct, resolveShortAmazonLink } from '../lib/amazon-lookup.ts';

const PRODUCT_PAGE = `<html><head>
<title>Amazon.com : Copper Watering Can : Patio, Lawn &amp; Garden</title>
<meta property="og:image" content="https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SX679_.jpg" />
</head><body>
<span id="productTitle">Copper Watering Can, 1.5 Gallon</span>
<div id="wayfinding-breadcrumbs_feature_div"><ul><li><a class="a-link-normal" href="/x">Watering Cans</a></li></ul></div></div>
</body></html>`;

const CAPTCHA_PAGE = `<html><head><title>Amazon.com</title></head><body>
<h4>Enter the characters you see below</h4><form action="/errors/validateCaptcha"></form></body></html>`;

function respond(body: string, init: { status?: number; url?: string } = {}) {
  const response = new Response(body, {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'text/html' }
  });
  // `url` is a read-only getter on a constructed Response, but it is exactly
  // what the lookup reads to learn where a short link landed.
  Object.defineProperty(response, 'url', {
    value: init.url ?? 'https://www.amazon.com/dp/B01N5IB20Q'
  });
  return response;
}

/** Records what the lookup asked for, and answers with what the test wants. */
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return await handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('lookupAmazonProduct', () => {
  it('reads the page and reports a complete lookup', async () => {
    const { impl, calls } = stubFetch(() => respond(PRODUCT_PAGE));
    const result = await lookupAmazonProduct(
      'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q',
      { fetchImpl: impl }
    );

    assert.equal(result.outcome, 'ok');
    assert.equal(result.details.title, 'Copper Watering Can, 1.5 Gallon');
    assert.equal(result.details.category, 'Watering Cans');
    assert.equal(result.details.imageUrl, 'https://m.media-amazon.com/images/I/71Q1tPupKjL.jpg');
    assert.equal(calls.length, 1);
  });

  it('asks the way a browser asks, because Amazon answers a bare request with an empty shell', async () => {
    const { impl, calls } = stubFetch(() => respond(PRODUCT_PAGE));
    await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', { fetchImpl: impl });

    const headers = calls[0].init?.headers as Record<string, string>;
    assert.match(headers['User-Agent'], /Mozilla\/5\.0/);
    assert.match(headers['Accept-Language'], /en-US/);
    assert.equal(calls[0].init?.redirect, 'follow');
  });

  it('keeps the address a short link redirected to, which is the only place its ASIN lives', async () => {
    const { impl } = stubFetch(() =>
      respond(PRODUCT_PAGE, {
        url: 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q?ref=share'
      })
    );
    const result = await lookupAmazonProduct('https://a.co/d/9xKq2mB', { fetchImpl: impl });
    assert.equal(result.outcome, 'ok');
    assert.match(result.resolvedUrl, /\/dp\/B01N5IB20Q/);
  });

  it('reports a page that answered but held something back', async () => {
    const { impl } = stubFetch(() =>
      respond(
        '<html><head><title>Amazon.com: Copper Watering Can</title></head><body></body></html>'
      )
    );
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(result.outcome, 'partial');
    assert.equal(result.details.title, 'Copper Watering Can');
    assert.equal(result.details.imageUrl, '');
  });

  it('calls a captcha what it is, rather than parsing it as a product', async () => {
    const { impl } = stubFetch(() => respond(CAPTCHA_PAGE));
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.details.title, '');
  });

  it('treats a refusal as blocked and anything else as unreachable', async () => {
    for (const status of [403, 429, 503]) {
      const { impl } = stubFetch(() => respond('nope', { status }));
      const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
        fetchImpl: impl
      });
      assert.equal(result.outcome, 'blocked', `status ${status}`);
    }

    const { impl } = stubFetch(() => respond('gone', { status: 404 }));
    const missing = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(missing.outcome, 'unreachable');
  });

  it('survives a timeout or a dropped connection', async () => {
    const { impl } = stubFetch(() => {
      throw new Error('The operation was aborted due to timeout');
    });
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl,
      timeoutMs: 50
    });
    assert.equal(result.outcome, 'unreachable');
    assert.equal(result.resolvedUrl, 'https://www.amazon.com/dp/B01N5IB20Q');
  });

  it('refuses a link that is not Amazon without going near the network', async () => {
    const { impl, calls } = stubFetch(() => respond(PRODUCT_PAGE));
    const result = await lookupAmazonProduct('https://etsy.com/listing/1', { fetchImpl: impl });
    assert.equal(result.outcome, 'invalid');
    assert.equal(calls.length, 0);
  });

  it('stops reading once it has enough, instead of pulling an unbounded body', async () => {
    let pulls = 0;
    const chunk = new TextEncoder().encode(`${PRODUCT_PAGE}${'<!-- padding -->'.repeat(200)}`);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 50) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      }
    });
    const response = new Response(stream, { status: 200 });
    Object.defineProperty(response, 'url', { value: 'https://www.amazon.com/dp/B01N5IB20Q' });

    const { impl } = stubFetch(() => response);
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl,
      maxBytes: chunk.byteLength * 2
    });

    assert.equal(result.outcome, 'ok');
    assert.ok(pulls <= 4, `read ${pulls} chunks past the cap`);
  });
});

describe('resolveShortAmazonLink', () => {
  it('follows a share link to the product it stands for', async () => {
    const { impl, calls } = stubFetch(() =>
      respond('', { url: 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q' })
    );
    const resolved = await resolveShortAmazonLink('https://a.co/d/9xKq2mB', { fetchImpl: impl });
    assert.equal(resolved, 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q');
    assert.equal(calls[0].init?.method, 'HEAD');
  });

  it('leaves a full link, and a dead short link, exactly as pasted', async () => {
    const { impl, calls } = stubFetch(() => respond(''));
    assert.equal(
      await resolveShortAmazonLink('https://www.amazon.com/dp/B01N5IB20Q', { fetchImpl: impl }),
      'https://www.amazon.com/dp/B01N5IB20Q'
    );
    assert.equal(calls.length, 0);

    const dead = stubFetch(() => {
      throw new Error('ENOTFOUND');
    });
    assert.equal(
      await resolveShortAmazonLink('https://a.co/d/9xKq2mB', { fetchImpl: dead.impl }),
      'https://a.co/d/9xKq2mB'
    );
  });
});

describe('associateTag', () => {
  it('is whatever the deployment configured, trimmed, or nothing at all', () => {
    const original = process.env.AMAZON_ASSOCIATE_TAG;
    try {
      delete process.env.AMAZON_ASSOCIATE_TAG;
      assert.equal(associateTag(), '');
      process.env.AMAZON_ASSOCIATE_TAG = '  hillside-20 ';
      assert.equal(associateTag(), 'hillside-20');
    } finally {
      if (original === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
      else process.env.AMAZON_ASSOCIATE_TAG = original;
    }
  });
});
