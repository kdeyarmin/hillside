import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allowedContactSubjects, contactHref, parseContactPrefill } from '../lib/contact.ts';

describe('contact prefills', () => {
  it('accepts only subjects the form actually offers', () => {
    assert.equal(
      parseContactPrefill({ subject: 'Custom planter arrangement' }, false).subject,
      'Custom planter arrangement'
    );
    assert.equal(
      parseContactPrefill({ subject: 'Local pickup inquiry' }, false).subject,
      'Local pickup inquiry'
    );
    assert.equal(
      parseContactPrefill({ subject: 'Invented topic' }, false).subject,
      'General question'
    );
  });

  it('hides class subjects while classes are not public', () => {
    assert.ok(!allowedContactSubjects(false).includes('Planter class'));
    assert.ok(allowedContactSubjects(true).includes('Planter class'));
    assert.equal(
      parseContactPrefill({ subject: 'Planter class' }, false).subject,
      'General question'
    );
    assert.equal(parseContactPrefill({ subject: 'Planter class' }, true).subject, 'Planter class');
  });

  it('builds a deep link that the form can read back', () => {
    const href = contactHref({
      subject: 'Availability or restock',
      message: 'Is the teas collection coming back?'
    });
    assert.equal(
      href,
      '/contact?subject=Availability+or+restock&message=Is+the+teas+collection+coming+back%3F'
    );
    const parsed = parseContactPrefill({
      subject: 'Availability or restock',
      message: 'Is the teas collection coming back?'
    });
    assert.equal(parsed.subject, 'Availability or restock');
    assert.equal(parsed.message, 'Is the teas collection coming back?');
  });
});
