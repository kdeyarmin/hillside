import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  associateTag,
  lookupAmazonProduct,
  readCapped,
  resolveShortAmazonLink
} from '../lib/amazon-lookup.ts';

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

function streamOf(chunks: Uint8Array[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) controller.close();
      else controller.enqueue(chunks[index++]);
    }
  });
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  const response = new Response(stream, { status: 200 });
  Object.defineProperty(response, 'url', { value: 'https://www.amazon.com/dp/B01N5IB20Q' });
  return response;
}

function redirectTo(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
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
    // Redirects are walked a hop at a time rather than handed to fetch, so
    // every destination can be checked before it is requested.
    assert.equal(calls[0].init?.redirect, 'manual');
  });

  it('keeps the address a short link redirected to, which is the only place its ASIN lives', async () => {
    const { impl, calls } = stubFetch((url) =>
      url.includes('a.co')
        ? redirectTo('https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q?ref=share')
        : respond(PRODUCT_PAGE)
    );
    const result = await lookupAmazonProduct('https://a.co/d/9xKq2mB', { fetchImpl: impl });
    assert.equal(result.outcome, 'ok');
    assert.match(result.resolvedUrl, /\/dp\/B01N5IB20Q/);
    assert.equal(calls.length, 2);
  });

  it('reads a relative redirect against the address it came from', async () => {
    const { impl } = stubFetch((url) =>
      url.endsWith('.com/dp/B01N5IB20Q')
        ? redirectTo('/Copper-Watering-Can/dp/B01N5IB20Q')
        : respond(PRODUCT_PAGE)
    );
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(result.outcome, 'ok');
    assert.equal(result.resolvedUrl, 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q');
  });

  it('will not follow a redirect off Amazon, and does not request it', async () => {
    // Whoever wrote the link decides where the chain goes. Following it blind
    // would point this server at whatever they picked — the cloud metadata
    // service, an internal host — and publish what came back onto the page.
    for (const destination of [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://localhost:5432/',
      'https://evil.example/amazon.com/dp/B01N5IB20Q'
    ]) {
      const { impl, calls } = stubFetch(() => redirectTo(destination));
      const result = await lookupAmazonProduct('https://a.co/d/9xKq2mB', { fetchImpl: impl });
      assert.equal(result.outcome, 'blocked', destination);
      assert.equal(result.details.title, '');
      // Every request made stayed on the link the owner actually pasted.
      for (const call of calls) assert.equal(call.url, 'https://a.co/d/9xKq2mB', destination);
    }
  });

  it('gives up on a redirect that never settles', async () => {
    const { impl, calls } = stubFetch(() => redirectTo('https://www.amazon.com/dp/B01N5IB20Q'));
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(result.outcome, 'unreachable');
    assert.ok(calls.length <= 7, `made ${calls.length} requests`);
  });

  it('refuses a sign-in wall or a different product, rather than publishing it', async () => {
    const signIn = `<html><head><title>Amazon Sign-In</title>
      <meta property="og:image" content="https://m.media-amazon.com/images/G/01/logo.png" /></head>
      <body><span id="productTitle">Amazon Sign-In</span></body></html>`;

    const wall = stubFetch((url) =>
      url.includes('/dp/')
        ? redirectTo('https://www.amazon.com/ap/signin?openid=x')
        : respond(signIn)
    );
    const walled = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: wall.impl
    });
    assert.equal(walled.outcome, 'blocked');
    assert.equal(walled.details.title, '');
    // And the wall's address is not what the pick gets stored as, or the pick
    // would be called "Signin" and point at the sign-in page for good.
    assert.equal(walled.resolvedUrl, 'https://www.amazon.com/dp/B01N5IB20Q');

    // Landing on some other item is the same problem wearing a product page.
    const elsewhere = stubFetch((url) =>
      url.endsWith('/dp/B01N5IB20Q')
        ? redirectTo('https://www.amazon.com/dp/B0999OTHER')
        : respond(PRODUCT_PAGE)
    );
    const wrong = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: elsewhere.impl
    });
    assert.equal(wrong.outcome, 'blocked');
    assert.equal(wrong.details.title, '');
    assert.equal(wrong.resolvedUrl, 'https://www.amazon.com/dp/B01N5IB20Q');
  });

  it('still gets a short link its real address when the page itself is refused', async () => {
    // Amazon refuses the page read but the share link still redirects, which is
    // the difference between a pick called "Copper Watering Can" and one called
    // "Amazon pick" — and the only thing that can match it to a duplicate.
    const { impl, calls } = stubFetch((url, init) => {
      if (init?.method !== 'HEAD') return respond(CAPTCHA_PAGE, { status: 503 });
      return url.includes('a.co')
        ? redirectTo('https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q')
        : respond('');
    });
    const result = await lookupAmazonProduct('https://a.co/d/9xKq2mB', { fetchImpl: impl });
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.resolvedUrl, 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q');
    assert.equal(calls.filter((call) => call.init?.method === 'HEAD').length, 2);
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

  it('decodes a character that a chunk boundary splits in half', async () => {
    // Amazon writes ™, — and accented names into its titles, and a socket hands
    // the body over in chunks that land wherever they land.
    const page =
      '<html><body><span id="productTitle">Grosche Milano Café Press ™</span>' +
      '<div><img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/71a.jpg" /></div></body></html>';
    const bytes = new TextEncoder().encode(page);
    const trademarkAt = new TextEncoder().encode(page.slice(0, page.indexOf('™'))).length;
    const stream = streamOf([bytes.slice(0, trademarkAt + 1), bytes.slice(trademarkAt + 1)]);

    const { impl } = stubFetch(() => streamResponse(stream));
    const result = await lookupAmazonProduct('https://www.amazon.com/dp/B01N5IB20Q', {
      fetchImpl: impl
    });
    assert.equal(result.details.title, 'Grosche Milano Café Press ™');
  });

  it('does not swallow the bytes a chunk boundary cut a character in half', async () => {
    // The streaming decoder holds an incomplete character back until it is told
    // the text has ended. Stopping at the cap without saying so drops it, and
    // the page quietly loses whatever the cut landed on.
    const text = 'Copper Watering Can — 1.5 Gallon';
    const bytes = new TextEncoder().encode(text);
    const dashAt = new TextEncoder().encode(text.slice(0, text.indexOf('—'))).length;
    const stream = streamOf([bytes.slice(0, dashAt + 1), bytes.slice(dashAt + 1)]);

    const read = await readCapped(streamResponse(stream), dashAt + 1);
    assert.equal(read, 'Copper Watering Can \uFFFD');
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
    const { impl, calls } = stubFetch((url) =>
      url.includes('a.co')
        ? redirectTo('https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q')
        : respond('')
    );
    const resolved = await resolveShortAmazonLink('https://a.co/d/9xKq2mB', { fetchImpl: impl });
    assert.equal(resolved, 'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q');
    assert.equal(calls[0].init?.method, 'HEAD');
  });

  it('does not hand back the sign-in wall as the product address', async () => {
    const { impl } = stubFetch((url) =>
      url.includes('a.co') ? redirectTo('https://www.amazon.com/ap/signin?openid=x') : respond('')
    );
    assert.equal(
      await resolveShortAmazonLink('https://a.co/d/9xKq2mB', { fetchImpl: impl }),
      'https://a.co/d/9xKq2mB'
    );
  });

  it('will not be walked off Amazon either', async () => {
    const { impl, calls } = stubFetch(() => redirectTo('http://169.254.169.254/latest/meta-data/'));
    assert.equal(
      await resolveShortAmazonLink('https://a.co/d/9xKq2mB', { fetchImpl: impl }),
      'https://a.co/d/9xKq2mB'
    );
    assert.equal(calls.length, 1);
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
