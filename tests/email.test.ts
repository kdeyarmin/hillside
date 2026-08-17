import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emailShell, escapeHtml } from '../lib/email.ts';

const amp = '&' + 'amp;';
const lt = '&' + 'lt;';
const gt = '&' + 'gt;';
const quot = '&' + 'quot;';
const apos = '&' + '#039;';

describe('escapeHtml', () => {
  it('encodes markup characters so they cannot break outbound mail', () => {
    assert.equal(
      escapeHtml('A <script>alert(1)</script> Buyer'),
      `A ${lt}script${gt}alert(1)${lt}/script${gt} Buyer`
    );
    assert.equal(escapeHtml('Oak & Vine'), `Oak ${amp} Vine`);
    assert.equal(escapeHtml('"quoted"'), `${quot}quoted${quot}`);
    assert.equal(escapeHtml("Tammy's teas"), `Tammy${apos}s teas`);
  });

  it('encodes ampersands first so existing entities are not double-broken', () => {
    assert.equal(escapeHtml('a & b < c'), `a ${amp} b ${lt} c`);
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});

describe('emailShell', () => {
  it('escapes the title and an unsubscribe URL', () => {
    const html = emailShell('Hi <Guest>', '<p>body</p>', {
      unsubscribeUrl: 'https://example.com/?q="x"'
    });
    assert.equal(html.includes('<Guest>'), false);
    assert.equal(html.includes(`Hi ${lt}Guest${gt}`), true);
    assert.equal(html.includes('<p>body</p>'), true);
    assert.equal(html.includes(`q=${quot}x${quot}`), true);
  });
});
