import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  categoryTypes,
  checkoutReturnOrigin,
  clampQuantity,
  discountPercent,
  formatMoney,
  formatMoneyCompact,
  newInvoiceNumber,
  pickForKey,
  priceValidUntil,
  resolveImageUrl,
  siteBaseUrl
} from '../lib/store.ts';

describe('money formatting', () => {
  it('renders whole and fractional amounts from integer cents', () => {
    assert.equal(formatMoney(0), '$0.00');
    assert.equal(formatMoney(1999), '$19.99');
    assert.equal(formatMoney(7500), '$75.00');
    assert.equal(formatMoney(123456), '$1,234.56');
  });

  it('drops the cents only when the amount is whole', () => {
    assert.equal(formatMoneyCompact(7500), '$75');
    assert.equal(formatMoneyCompact(7550), '$75.50');
  });

  it('rounds half-cent values the way the display does, not the ledger', () => {
    // Everything upstream is integer cents; this only guards the display boundary.
    assert.equal(formatMoney(1), '$0.01');
    assert.equal(formatMoney(999999), '$9,999.99');
  });
});

describe('discountPercent', () => {
  it('is zero unless the compare-at price is genuinely higher', () => {
    assert.equal(discountPercent(1000, null), 0);
    assert.equal(discountPercent(1000, 1000), 0);
    assert.equal(discountPercent(1000, 900), 0);
  });

  it('rounds to whole percent', () => {
    assert.equal(discountPercent(7500, 10000), 25);
    assert.equal(discountPercent(3333, 10000), 67);
  });
});

describe('clampQuantity', () => {
  it('never returns less than one, or more than stock', () => {
    assert.equal(clampQuantity(5, 3), 3);
    assert.equal(clampQuantity(0, 10), 1);
    assert.equal(clampQuantity(-4, 10), 1);
    assert.equal(clampQuantity(2.9, 10), 2);
  });

  it('still returns one for a sold-out line, which the server then rejects', () => {
    // Documented rather than desired: the cart keeps the line visible and
    // /api/checkout is what refuses it, with an adjustment the customer confirms.
    assert.equal(clampQuantity(3, 0), 1);
  });
});

describe('categoryTypes', () => {
  it('expands merchandising groups into the product types they cover', () => {
    assert.deepEqual(categoryTypes('TEA'), ['TEA', 'TEA_SUPPLY']);
    assert.deepEqual(categoryTypes('BOTANICAL'), ['SOAP', 'LOTION', 'OTHER']);
  });

  it('treats an empty value and ALL as no filter', () => {
    assert.deepEqual(categoryTypes(''), []);
    assert.deepEqual(categoryTypes('ALL'), []);
    assert.deepEqual(categoryTypes(null), []);
  });

  it('passes a bare product type straight through', () => {
    assert.deepEqual(categoryTypes('PLANT'), ['PLANT']);
  });
});

describe('siteBaseUrl and checkoutReturnOrigin', () => {
  const CANONICAL = 'https://thehillsidegardens.com';

  function withEnv(value: string | undefined, run: () => void) {
    const previousUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const previousNodeEnv = process.env.NODE_ENV;
    // A deployed build is the case that matters; under `next dev` localhost is
    // the truth and anything goes.
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
      enumerable: true
    });
    if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = value;
    try {
      run();
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previousUrl;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: previousNodeEnv,
        configurable: true,
        writable: true,
        enumerable: true
      });
    }
  }

  /**
   * The regression this exists for: both checkout routes built Stripe's
   * success_url from the raw environment variable, bypassing this guard. The
   * deployed service has it set to a loopback address, so paying customers were
   * redirected to http://localhost:3000/order/success — payment captured, then a
   * connection error.
   */
  const loopbacks = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.5.5.5:3000',
    'http://0.0.0.0:3000',
    'http://[::1]:3000',
    'http://app.localhost',
    'not-a-url-at-all'
  ];

  for (const value of loopbacks) {
    it(`refuses ${value} as a public origin`, () => {
      withEnv(value, () => {
        assert.equal(siteBaseUrl(), CANONICAL);
        assert.equal(checkoutReturnOrigin(), CANONICAL);
      });
    });
  }

  it('honours a genuine public origin', () => {
    withEnv('https://hillside.up.railway.app', () => {
      assert.equal(siteBaseUrl(), 'https://hillside.up.railway.app');
    });
  });

  it('falls back to the canonical domain when unset', () => {
    withEnv(undefined, () => assert.equal(siteBaseUrl(), CANONICAL));
  });

  it('corrects the singular misspelling of the domain', () => {
    withEnv('https://thehillsidegarden.com', () => assert.equal(siteBaseUrl(), CANONICAL));
  });

  it('never leaves a trailing slash for Stripe URLs to double up on', () => {
    withEnv('https://example.com/', () => {
      assert.equal(checkoutReturnOrigin(), 'https://example.com');
      // Stripe's placeholder has to survive into the URL literally.
      assert.equal(
        `${checkoutReturnOrigin()}/order/success?session_id={CHECKOUT_SESSION_ID}`,
        'https://example.com/order/success?session_id={CHECKOUT_SESSION_ID}'
      );
    });
  });
});

describe('newInvoiceNumber', () => {
  it('is prefixed and does not collide within a millisecond', () => {
    // The previous implementation was the last 8 digits of Date.now(), so two
    // orders in the same millisecond collided on a unique column and one was lost
    // to Stripe's retry-then-give-up path.
    const generated = new Set(Array.from({ length: 2000 }, () => newInvoiceNumber()));
    assert.equal(generated.size, 2000, `expected all unique, got ${generated.size}/2000`);
    for (const value of generated) assert.match(value, /^HG-[0-9A-Z]+$/);
  });
});

describe('pickForKey', () => {
  it('is stable for the same key', () => {
    const options = ['a', 'b', 'c', 'd'];
    assert.equal(pickForKey(options, 'monstera'), pickForKey(options, 'monstera'));
  });

  /**
   * The property that matters: a shop row of unphotographed plants must not show
   * the same picture three times. A small sample is not evidence either way —
   * about 2% of random 12-slug subsets happen to cover only two of four options
   * even under a perfectly uniform hash — so this asserts against a realistic set
   * large enough to mean something.
   */
  it('spreads realistic plant slugs across every option', () => {
    const options = ['a', 'b', 'c', 'd'];
    const slugs = [
      'monstera-deliciosa', 'snake-plant', 'pothos-golden', 'zz-plant', 'fiddle-leaf-fig',
      'peace-lily', 'spider-plant', 'rubber-tree', 'calathea-orbifolia', 'philodendron-brasil',
      'aloe-vera', 'jade-plant', 'string-of-pearls', 'boston-fern', 'bird-of-paradise',
      'chinese-money-plant', 'parlor-palm', 'english-ivy', 'swiss-cheese-plant',
      'dracaena-marginata', 'anthurium-red', 'hoya-carnosa', 'maidenhair-fern',
      'air-plant-trio', 'venus-flytrap', 'pitcher-plant', 'echeveria-blue',
      'string-of-hearts', 'burros-tail', 'lucky-bamboo'
    ];
    const used = new Set(slugs.map((slug) => pickForKey(options, slug)));
    assert.equal(used.size, options.length, `only ${used.size} of 4 options were used`);
  });

  it('distributes evenly over a large key space', () => {
    // The predecessor to this hash left the low bits correlated, which is what
    // decides the bucket for a short option list.
    const options = ['a', 'b', 'c', 'd'];
    const counts = new Map<string, number>();
    for (let index = 0; index < 4000; index += 1) {
      const picked = pickForKey(options, `product-slug-${index}`);
      counts.set(picked, (counts.get(picked) || 0) + 1);
    }
    for (const option of options) {
      const share = (counts.get(option) || 0) / 4000;
      assert.ok(share > 0.2 && share < 0.3, `${option} took ${(share * 100).toFixed(1)}% of keys`);
    }
  });

  it('refuses an empty list rather than returning undefined', () => {
    assert.throws(() => pickForKey([], 'anything'));
  });
});

describe('resolveImageUrl', () => {
  it('replaces photo ids that were deleted upstream', () => {
    assert.equal(
      resolveImageUrl('https://images.unsplash.com/photo-1614594575810-51b862c2d7b6?w=800'),
      '/images/catalog/house-plants.webp'
    );
  });

  it('passes a real path through and falls back on empty input', () => {
    assert.equal(resolveImageUrl('/images/catalog/moss.webp'), '/images/catalog/moss.webp');
    assert.equal(resolveImageUrl(''), '/images/catalog/house-plants.webp');
    assert.equal(resolveImageUrl(null), '/images/catalog/house-plants.webp');
  });
});

describe('priceValidUntil', () => {
  it('is a year out, as an ISO date', () => {
    assert.equal(priceValidUntil(new Date('2026-08-12T00:00:00Z')), '2027-08-12');
  });
});
