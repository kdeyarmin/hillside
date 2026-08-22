import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emailBodyHtml,
  markOwnerText,
  ownerSaidHtml,
  emailFailureLabel,
  emailKindLabel,
  emailLogMatches,
  emailPlainText,
  emailPreview,
  ownerMessageHtml,
  parseEmailKindFilter,
  parseEmailStatusFilter,
  parseRecipients,
  quotedMessageHtml,
  validEmailAddress
} from '../lib/email-log.ts';

const lt = '&' + 'lt;';
const gt = '&' + 'gt;';
const amp = '&' + 'amp;';

describe('emailPlainText', () => {
  it('renders a stored email body as readable text', () => {
    assert.equal(
      emailPlainText('<p>Hi Tammy,</p><p>Your order <strong>HG-1042</strong> shipped.</p>'),
      'Hi Tammy,\nYour order HG-1042 shipped.'
    );
  });

  it('turns line breaks into newlines and collapses runs of space', () => {
    assert.equal(emailPlainText('<p>One<br>Two</p>'), 'One\nTwo');
    assert.equal(emailPlainText('<p>spaced      out</p>'), 'spaced out');
  });

  it('drops script and style content rather than reading it out', () => {
    assert.equal(emailPlainText('<p>Hi</p><script>alert(1)</script>'), 'Hi');
    assert.equal(emailPlainText('<style>p{color:red}</style><p>Hi</p>'), 'Hi');
  });

  it('decodes the ampersand last so escaped entities survive as text', () => {
    // The body holds the customer having literally typed "&lt;b&gt;", which is
    // stored doubly escaped. Decoding the ampersand first would collapse it to
    // "<b>" and misreport what they wrote.
    assert.equal(emailPlainText(`<p>${amp}lt;b${amp}gt;</p>`), `${lt}b${gt}`);
    assert.equal(emailPlainText(`<p>${lt}b${gt}</p>`), '<b>');
    assert.equal(emailPlainText(`<p>Oak ${amp} Vine</p>`), 'Oak & Vine');
  });

  it('is safe on nothing at all', () => {
    assert.equal(emailPlainText(null), '');
    assert.equal(emailPlainText(undefined), '');
    assert.equal(emailPlainText(''), '');
  });
});

describe('emailPreview', () => {
  it('trims to the requested length with an ellipsis', () => {
    const preview = emailPreview(`<p>${'x'.repeat(400)}</p>`, 40);
    assert.equal(preview.length, 40);
    assert.equal(preview.endsWith('…'), true);
  });

  it('leaves a short message whole and on one line', () => {
    assert.equal(emailPreview('<p>One</p><p>Two</p>', 80), 'One Two');
  });
});

describe('emailBodyHtml', () => {
  const shell = (content: string) =>
    `<div style="padding:24px"><h1>Letterhead</h1></div><div style="padding:28px"><!--body-->${content}<!--/body--></div><div>The Hillside Gardens</div>`;

  it('returns the message without the letterhead around it', () => {
    assert.equal(emailBodyHtml(shell('<p>Yes, we ship to PA.</p>')), '<p>Yes, we ship to PA.</p>');
  });

  it('keeps a body that itself contains a quoted message', () => {
    const body = '<p>Yes.</p><blockquote><p>Do you ship?</p></blockquote>';
    assert.equal(emailBodyHtml(shell(body)), body);
  });

  it('hands back the whole thing when there are no markers', () => {
    // Anything sent by another path, or logged before the markers existed.
    assert.equal(emailBodyHtml('<p>Plain</p>'), '<p>Plain</p>');
    assert.equal(emailBodyHtml(''), '');
    assert.equal(emailBodyHtml(null), '');
  });

  it('does not return a slice when the markers are the wrong way round', () => {
    const scrambled = '<!--/body-->middle<!--body-->';
    assert.equal(emailBodyHtml(scrambled), scrambled);
  });
});

describe('ownerSaidHtml', () => {
  const sent = (said: string) =>
    `<div><!--body--><p>Hi Oak,</p>${markOwnerText(said)}<p>— Tammy</p><hr><blockquote><p>Do you ship?</p></blockquote><!--/body--></div>`;

  it('returns only what the owner typed, not the greeting, sign-off or quote', () => {
    assert.equal(ownerSaidHtml(sent('<p>Yes, we ship to PA.</p>')), '<p>Yes, we ship to PA.</p>');
  });

  it('falls back to the body for an email sent by another path', () => {
    // Order confirmations and the like are all message, with nothing to strip.
    assert.equal(
      ownerSaidHtml('<div><!--body--><p>Your order shipped.</p><!--/body--></div>'),
      '<p>Your order shipped.</p>'
    );
    assert.equal(ownerSaidHtml(''), '');
    assert.equal(ownerSaidHtml(null), '');
  });
});

describe('emailLogMatches', () => {
  const entry = {
    to: ['buyer@example.com'],
    subject: 'Your Hillside order HG-1042',
    html: '<p>The monstera ships Tuesday.</p>'
  };

  it('matches on recipient, subject and body alike', () => {
    assert.equal(emailLogMatches(entry, 'buyer@example.com'), true);
    assert.equal(emailLogMatches(entry, 'HG-1042'), true);
    assert.equal(emailLogMatches(entry, 'monstera'), true);
  });

  it('ignores case and surrounding space', () => {
    assert.equal(emailLogMatches(entry, '  MONSTERA '), true);
  });

  it('keeps everything when nothing was typed', () => {
    assert.equal(emailLogMatches(entry, ''), true);
    assert.equal(emailLogMatches(entry, '   '), true);
  });

  it('does not match the markup the body is stored as', () => {
    // Searching "p" should not return every email ever sent.
    assert.equal(emailLogMatches({ ...entry, html: '<p>hello</p>' }, '<p>'), false);
  });

  it('does not match the letterhead every email carries', () => {
    const sent = {
      to: ['buyer@example.com'],
      subject: 'Your order',
      html: '<div><h1>Letterhead</h1></div><div><!--body--><p>Ships Tuesday.</p><!--/body--></div><div>The Hillside Gardens • Plants • Teas</div>'
    };
    assert.equal(emailLogMatches(sent, 'Ships Tuesday'), true);
    assert.equal(emailLogMatches(sent, 'Botanicals'), false);
    assert.equal(emailLogMatches(sent, 'Letterhead'), false);
  });

  it('says no when it means no', () => {
    assert.equal(emailLogMatches(entry, 'fiddle leaf'), false);
  });
});

describe('filter parsing', () => {
  it('accepts the kinds it knows and falls back to all', () => {
    assert.equal(parseEmailKindFilter('ORDER_CONFIRMATION'), 'ORDER_CONFIRMATION');
    assert.equal(parseEmailKindFilter('REPLY'), 'REPLY');
    assert.equal(parseEmailKindFilter('DROP TABLE'), 'all');
    assert.equal(parseEmailKindFilter(undefined), 'all');
    assert.equal(parseEmailKindFilter(['ORDER_ADMIN']), 'all');
  });

  it('accepts the two delivery states and falls back to all', () => {
    assert.equal(parseEmailStatusFilter('SENT'), 'SENT');
    assert.equal(parseEmailStatusFilter('FAILED'), 'FAILED');
    assert.equal(parseEmailStatusFilter('sent'), 'all');
    assert.equal(parseEmailStatusFilter(undefined), 'all');
  });
});

describe('validEmailAddress', () => {
  it('accepts an ordinary address', () => {
    assert.equal(validEmailAddress('  buyer@example.com '), 'buyer@example.com');
    assert.equal(validEmailAddress('tammy.k@comcast.net'), 'tammy.k@comcast.net');
  });

  it('rejects what SendGrid would reject', () => {
    assert.equal(validEmailAddress(''), null);
    assert.equal(validEmailAddress('buyer'), null);
    assert.equal(validEmailAddress('buyer@example'), null);
    assert.equal(validEmailAddress('buyer @example.com'), null);
    assert.equal(validEmailAddress('a@b.com, c@d.com'), null);
    assert.equal(validEmailAddress(`${'x'.repeat(250)}@example.com`), null);
  });
});

describe('parseRecipients', () => {
  it('splits on commas, semicolons and newlines', () => {
    const { addresses, invalid } = parseRecipients('a@example.com, b@example.com\nc@example.com');
    assert.deepEqual(addresses, ['a@example.com', 'b@example.com', 'c@example.com']);
    assert.deepEqual(invalid, []);
  });

  it('deduplicates the same inbox written two ways', () => {
    const { addresses } = parseRecipients('Buyer@Example.com, buyer@example.com');
    assert.deepEqual(addresses, ['Buyer@Example.com']);
  });

  it('reports a typo rather than dropping it quietly', () => {
    // The action rejects the whole list on this, so Tammy is never left
    // believing she wrote to someone she did not.
    const { addresses, invalid } = parseRecipients('good@example.com, oops');
    assert.deepEqual(addresses, ['good@example.com']);
    assert.deepEqual(invalid, ['oops']);
  });

  it('caps the list at five', () => {
    const { addresses } = parseRecipients(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((letter) => `${letter}@example.com`).join(',')
    );
    assert.equal(addresses.length, 5);
  });

  it('finds nothing in nothing', () => {
    assert.deepEqual(parseRecipients('   ').addresses, []);
    assert.deepEqual(parseRecipients(',,;\n').addresses, []);
  });
});

describe('ownerMessageHtml', () => {
  it('makes a paragraph of each block and a break of each single newline', () => {
    assert.equal(ownerMessageHtml('One\n\nTwo'), '<p>One</p><p>Two</p>');
    assert.equal(ownerMessageHtml('One\nTwo'), '<p>One<br>Two</p>');
  });

  it('escapes before it adds markup, so typed markup cannot become markup', () => {
    const html = ownerMessageHtml('<script>alert(1)</script>');
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes(`${lt}script${gt}`), true);
  });

  it('keeps an ampersand in a customer name intact', () => {
    assert.equal(ownerMessageHtml('Oak & Vine'), `<p>Oak ${amp} Vine</p>`);
  });

  it('drops empty blocks rather than emitting hollow paragraphs', () => {
    assert.equal(ownerMessageHtml('One\n\n\n\nTwo'), '<p>One</p><p>Two</p>');
    assert.equal(ownerMessageHtml('   '), '');
  });

  it('normalises Windows line endings the same as Unix ones', () => {
    assert.equal(ownerMessageHtml('One\r\n\r\nTwo'), '<p>One</p><p>Two</p>');
  });
});

describe('quotedMessageHtml', () => {
  it('attributes the quote and escapes the name in it', () => {
    const html = quotedMessageHtml('Oak & Vine', new Date('2026-03-04T12:00:00Z'), 'Do you ship?');
    assert.equal(html.includes(`Oak ${amp} Vine`), true);
    assert.equal(html.includes('<blockquote'), true);
    assert.equal(html.includes('<p>Do you ship?</p>'), true);
  });
});

describe('labels', () => {
  it('names each kind in words rather than in enum case', () => {
    assert.equal(emailKindLabel('ORDER_CONFIRMATION'), 'Order confirmation');
    assert.equal(emailKindLabel('REPLY'), 'Reply to a customer');
    assert.equal(emailKindLabel('SOMETHING_NEW'), 'something new');
  });

  it('explains a failure in terms of what happened to the email', () => {
    assert.equal(
      emailFailureLabel('not-configured'),
      'SendGrid is not connected, so nothing was sent.'
    );
    assert.equal(
      emailFailureLabel('provider-error'),
      'SendGrid refused the message. It was not delivered.'
    );
    assert.equal(emailFailureLabel('teapot'), 'It was not delivered (teapot).');
    assert.equal(emailFailureLabel(null), 'It was not delivered.');
  });
});
