import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  HONEYPOT_FIELD,
  honeypotFields,
  honeypotTripped,
  LEGACY_HONEYPOT_FIELD
} from '../lib/honeypot.ts';

const schema = z.object({ email: z.string().email(), ...honeypotFields });

describe('honeypot', () => {
  /**
   * The whole point of the rename. A field named `website` is autofilled by
   * browsers and password managers from the saved profile, and every autofilled
   * honeypot was a real customer being shown a success message while their
   * message, signup, review or registration was discarded.
   */
  it('is not named anything a browser autofills', () => {
    assert.equal(HONEYPOT_FIELD, 'hp_reference');
    for (const autofilled of ['website', 'url', 'homepage', 'company', 'organization']) {
      assert.notEqual(HONEYPOT_FIELD, autofilled);
    }
  });

  it('lets an ordinary submission through', () => {
    assert.equal(honeypotTripped({}), false);
    assert.equal(honeypotTripped({ [HONEYPOT_FIELD]: '', [LEGACY_HONEYPOT_FIELD]: '' }), false);
    assert.equal(honeypotTripped({ [HONEYPOT_FIELD]: null }), false);
  });

  it('trips on the current field', () => {
    assert.equal(honeypotTripped({ [HONEYPOT_FIELD]: 'https://spam.example' }), true);
  });

  /**
   * A bot working from scraped markup, and a visitor holding a cached page,
   * both keep posting the old name. Dropping it from the forms must not drop
   * the protection with it.
   */
  it('still trips on the old `website` field', () => {
    assert.equal(honeypotTripped({ [LEGACY_HONEYPOT_FIELD]: 'https://spam.example' }), true);
    assert.equal(honeypotTripped({ [HONEYPOT_FIELD]: '', [LEGACY_HONEYPOT_FIELD]: 'spam' }), true);
  });

  /** Both names parse, default to empty, and are bounded against payloads. */
  it('accepts either name in a route schema', () => {
    const legacy = schema.parse({ email: 'a@b.com', [LEGACY_HONEYPOT_FIELD]: 'spam' });
    assert.equal(honeypotTripped(legacy), true);

    const current = schema.parse({ email: 'a@b.com', [HONEYPOT_FIELD]: 'spam' });
    assert.equal(honeypotTripped(current), true);

    const clean = schema.parse({ email: 'a@b.com' });
    assert.equal(clean[HONEYPOT_FIELD], '');
    assert.equal(clean[LEGACY_HONEYPOT_FIELD], '');
    assert.equal(honeypotTripped(clean), false);

    assert.equal(
      schema.safeParse({ email: 'a@b.com', [HONEYPOT_FIELD]: 'x'.repeat(201) }).success,
      false
    );
    assert.equal(
      schema.safeParse({ email: 'a@b.com', [LEGACY_HONEYPOT_FIELD]: 'x'.repeat(201) }).success,
      false
    );
  });
});
