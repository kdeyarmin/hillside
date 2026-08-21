import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderConfirmationHtml } from '../lib/order-email.ts';

describe('orderConfirmationHtml', () => {
  it('includes the invoice, the lines and the ship-to address', () => {
    const html = orderConfirmationHtml({
      invoiceNumber: 'HG-ABC123',
      customerName: 'Jane Grove',
      address1: '12 Hillside Lane',
      address2: 'Apt 2',
      city: 'Spring Hill',
      state: 'PA',
      postalCode: '15129',
      totalCents: 4590,
      items: [{ name: 'Monstera Deliciosa', quantity: 1, unitCents: 3695 }]
    });

    assert.match(html, /HG-ABC123/);
    assert.match(html, /Jane Grove/);
    assert.match(html, /Monstera Deliciosa × 1/);
    assert.match(html, /12 Hillside Lane/);
    assert.match(html, /Apt 2/);
    assert.match(html, /Spring Hill, PA 15129/);
    assert.match(html, /\$45\.90/);
    assert.match(html, /\/order-status/);
    assert.match(html, /when the order ships/);
  });

  it('names the size on a line so the packer reaches for the right one', () => {
    const html = orderConfirmationHtml({
      invoiceNumber: 'HG-SIZED1',
      customerName: 'Jane Grove',
      address1: '12 Hillside Lane',
      address2: null,
      city: 'Spring Hill',
      state: 'PA',
      postalCode: '15129',
      totalCents: 9400,
      items: [
        { name: 'Monstera Deliciosa', size: '6" pot', quantity: 2, unitCents: 4700 },
        { name: 'Hillside tea', quantity: 1, unitCents: 1800 }
      ]
    });

    assert.match(html, /Monstera Deliciosa — 6&quot; pot × 2/);
    // A product sold one way still reads as its plain name.
    assert.match(html, /Hillside tea × 1/);
  });

  it('uses pickup language and the gift note when the order will be collected', () => {
    const html = orderConfirmationHtml({
      invoiceNumber: 'HG-PICKUP',
      customerName: 'Jane Grove',
      address1: 'Local pickup',
      address2: null,
      city: 'Ebensburg',
      state: 'PA',
      postalCode: '',
      totalCents: 2000,
      giftMessage: 'Happy birthday',
      fulfillmentMethod: 'PICKUP',
      items: [{ name: 'Fern', quantity: 1, unitCents: 2000 }]
    });

    assert.match(html, /local pickup, as arranged/);
    assert.match(html, /Happy birthday/);
    assert.equal(html.includes('when the order ships'), false);
  });

  it('escapes a name that would otherwise break the markup', () => {
    const html = orderConfirmationHtml({
      invoiceNumber: 'HG-1',
      customerName: 'A <script>alert(1)</script> Buyer',
      address1: '1 Oak & Vine',
      address2: null,
      city: 'X',
      state: 'PA',
      postalCode: '1',
      totalCents: 100,
      items: [{ name: 'Tea & Mint', quantity: 2, unitCents: 50 }]
    });

    const escapedScript = '&' + 'lt;script&' + 'gt;';
    const escapedAmp = '&' + 'amp;';
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes(escapedScript), true);
    assert.equal(html.includes('Oak ' + escapedAmp + ' Vine'), true);
    assert.equal(html.includes('Tea ' + escapedAmp + ' Mint'), true);
  });
});
