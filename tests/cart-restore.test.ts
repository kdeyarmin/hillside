import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.ADMIN_SESSION_SECRET ||= 'test-admin-session-secret-long-enough';

const { cartRestoreDropped, CART_RESTORE_TTL_MS, createCartRestoreToken, readCartRestoreToken } =
  await import('../lib/cart-restore.ts');

describe('cart restore tokens', () => {
  it('round-trips email and items', () => {
    const token = createCartRestoreToken('Guest@Hillside.example', [
      { slug: 'monstera', quantity: 2 },
      { slug: 'tea', quantity: 1 }
    ]);
    assert.ok(token);
    const payload = readCartRestoreToken(token);
    assert.ok(payload);
    assert.equal(payload.email, 'guest@hillside.example');
    assert.deepEqual(payload.items, [
      { slug: 'monstera', quantity: 2 },
      { slug: 'tea', quantity: 1 }
    ]);
    assert.ok(payload.exp > Date.now());
  });

  it('rejects a tampered signature', () => {
    const token = createCartRestoreToken('a@b.com', [{ slug: 'tea', quantity: 1 }]);
    assert.ok(token);
    const [encoded] = token.split('.');
    assert.equal(readCartRestoreToken(`${encoded}.aaaaaaaa`), null);
    assert.equal(readCartRestoreToken('not-a-token'), null);
    assert.equal(readCartRestoreToken(''), null);
  });

  it('caps quantity and drops an expired payload', () => {
    const token = createCartRestoreToken('a@b.com', [{ slug: 'tea', quantity: 99 }]);
    assert.ok(token);
    const payload = readCartRestoreToken(token);
    assert.equal(payload?.items[0].quantity, 20);

    const expired = createCartRestoreToken(
      'a@b.com',
      [{ slug: 'tea', quantity: 1 }],
      Date.now() - CART_RESTORE_TTL_MS - 1_000
    );
    assert.ok(expired);
    assert.equal(readCartRestoreToken(expired), null);
  });
});

describe('cartRestoreDropped', () => {
  it('counts pieces, not rows, including a clamped line', () => {
    assert.equal(cartRestoreDropped([{ quantity: 5 }], [{ quantity: 2 }]), 3);
    assert.equal(cartRestoreDropped([{ quantity: 1 }, { quantity: 2 }], [{ quantity: 1 }]), 2);
    assert.equal(cartRestoreDropped([{ quantity: 1 }], [{ quantity: 1 }]), 0);
  });
});
