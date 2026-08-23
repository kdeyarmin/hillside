import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_NEWSLETTER_SOURCE,
  NEWSLETTER_SOURCES,
  newsletterSourceBreakdown,
  newsletterSourceLabel,
  readNewsletterSource,
  readNewsletterSourceDetail
} from '../lib/newsletter-source.ts';

describe('readNewsletterSource', () => {
  it('accepts a known placement, whatever the casing', () => {
    assert.equal(readNewsletterSource('product'), 'product');
    assert.equal(readNewsletterSource(' Care-Guide '), 'care-guide');
  });

  it('falls back rather than storing whatever was posted', () => {
    assert.equal(readNewsletterSource('drop table'), DEFAULT_NEWSLETTER_SOURCE);
    assert.equal(readNewsletterSource(''), DEFAULT_NEWSLETTER_SOURCE);
    assert.equal(readNewsletterSource(undefined), DEFAULT_NEWSLETTER_SOURCE);
    assert.equal(readNewsletterSource({ key: 'product' }), DEFAULT_NEWSLETTER_SOURCE);
  });

  it('names every placement exactly once', () => {
    const keys = NEWSLETTER_SOURCES.map((entry) => entry.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.includes(DEFAULT_NEWSLETTER_SOURCE));
  });
});

describe('newsletterSourceLabel', () => {
  it('reads a placement back as words', () => {
    assert.equal(newsletterSourceLabel('back-in-stock'), 'Back-in-stock');
    assert.equal(newsletterSourceLabel('footer'), 'Site footer');
  });

  it('shows an unrecognised stored value as itself', () => {
    assert.equal(newsletterSourceLabel('instagram-bio'), 'instagram-bio');
    assert.equal(newsletterSourceLabel(null), 'Somewhere else');
    assert.equal(newsletterSourceLabel(''), 'Somewhere else');
  });
});

describe('readNewsletterSourceDetail', () => {
  it('keeps a plain site path', () => {
    assert.equal(
      readNewsletterSourceDetail('/care/monstera-deliciosa'),
      '/care/monstera-deliciosa'
    );
    assert.equal(readNewsletterSourceDetail('/'), '/');
  });

  it('drops the query and the fragment', () => {
    assert.equal(readNewsletterSourceDetail('/shop?sort=new#top'), '/shop');
  });

  it('refuses anything that is not a relative path', () => {
    assert.equal(readNewsletterSourceDetail('https://example.com/steal'), null);
    assert.equal(readNewsletterSourceDetail('//example.com'), null);
    assert.equal(readNewsletterSourceDetail('javascript:alert(1)'), null);
    assert.equal(readNewsletterSourceDetail('shop'), null);
    assert.equal(readNewsletterSourceDetail('/shop/<script>'), null);
    assert.equal(readNewsletterSourceDetail(''), null);
    assert.equal(readNewsletterSourceDetail(null), null);
  });

  it('caps the stored length', () => {
    const long = `/${'a'.repeat(400)}`;
    assert.equal(readNewsletterSourceDetail(long)?.length, 120);
  });
});

describe('newsletterSourceBreakdown', () => {
  it('counts signups per placement, busiest first', () => {
    const rows = [
      { source: 'footer', active: true },
      { source: 'footer', active: false },
      { source: 'product', active: true },
      { source: 'footer', active: true },
      { source: null, active: true }
    ];
    assert.deepEqual(
      newsletterSourceBreakdown(rows).map((entry) => [entry.key, entry.total, entry.active]),
      [
        ['footer', 3, 2],
        ['product', 1, 1],
        ['website', 1, 1]
      ]
    );
  });

  it('has nothing to report for an empty list', () => {
    assert.deepEqual(newsletterSourceBreakdown([]), []);
  });

  it('keeps an unrecognised stored source as its own row', () => {
    const rows = [{ source: 'instagram-bio', active: true }];
    assert.deepEqual(newsletterSourceBreakdown(rows), [
      { key: 'instagram-bio', label: 'instagram-bio', total: 1, active: 1 }
    ]);
  });
});
