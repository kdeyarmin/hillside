import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.ADMIN_SESSION_SECRET ||= 'test-admin-session-secret-long-enough';

const { cartRestoreDropped, createCartRestoreToken, readCartRestoreToken } =
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

  it('carries the size, so a saved basket comes back as the pot that was chosen', () => {
    const token = createCartRestoreToken('a@b.com', [
      { slug: 'monstera', quantity: 1, size: '6" pot' },
      { slug: 'tea', quantity: 1 }
    ]);
    assert.ok(token);
    assert.deepEqual(readCartRestoreToken(token)?.items, [
      { slug: 'monstera', quantity: 1, size: '6" pot' },
      { slug: 'tea', quantity: 1 }
    ]);
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
  });
});

describe('cartRestoreDropped', () => {
  it('counts pieces, not rows, including a clamped line', () => {
    assert.equal(cartRestoreDropped([{ quantity: 5 }], [{ quantity: 2 }]), 3);
    assert.equal(cartRestoreDropped([{ quantity: 1 }, { quantity: 2 }], [{ quantity: 1 }]), 2);
    assert.equal(cartRestoreDropped([{ quantity: 1 }], [{ quantity: 1 }]), 0);
  });
});
