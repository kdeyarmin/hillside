import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizePublicHref } from '../lib/public-href.ts';

describe('sanitizePublicHref', () => {
  it('keeps site-relative paths and http(s) URLs', () => {
    assert.equal(sanitizePublicHref('/shop/monstera'), '/shop/monstera');
    assert.equal(
      sanitizePublicHref('https://thehillsidegardens.com/shop'),
      'https://thehillsidegardens.com/shop'
    );
    assert.equal(sanitizePublicHref('http://example.com/a'), 'http://example.com/a');
  });

  it('drops javascript, data, and protocol-relative values', () => {
    assert.equal(sanitizePublicHref('javascript:alert(1)'), null);
    assert.equal(sanitizePublicHref('data:text/html,hi'), null);
    assert.equal(sanitizePublicHref('//evil.example/phish'), null);
    assert.equal(sanitizePublicHref('ftp://files.example/a'), null);
    assert.equal(sanitizePublicHref(''), null);
    assert.equal(sanitizePublicHref('   '), null);
  });
});
