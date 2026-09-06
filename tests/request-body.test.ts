import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasFormBody, readJsonBody, readJsonOrFormBody } from '../lib/request-body.ts';

const post = (body: string, contentType = 'application/json') =>
  new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  });

describe('readJsonBody', () => {
  it('parses a real body', async () => {
    assert.deepEqual(await readJsonBody(post('{"email":"a@b.com"}')), { email: 'a@b.com' });
  });

  /**
   * The five routes that used this pattern parsed inside the same `try` that
   * caught a database failure, so a body that was not JSON answered 500 and
   * "we could not save that right now". Handing the schema `undefined` produces
   * the 400 the route already has copy for.
   */
  it('answers undefined for a body that is not JSON, rather than throwing', async () => {
    assert.equal(await readJsonBody(post('not json')), undefined);
    assert.equal(await readJsonBody(post('')), undefined);
    assert.equal(await readJsonBody(post('{"unterminated": ')), undefined);
  });
});

describe('readJsonOrFormBody', () => {
  it('keeps the existing JSON shape', async () => {
    assert.deepEqual(await readJsonOrFormBody(post('{"email":"json@example.com"}')), {
      email: 'json@example.com'
    });
  });

  it('reads the browser-native newsletter fallback without putting an address in the URL', async () => {
    const request = post(
      'name=Kevin&email=kevin%40example.com&hp_reference=&source=homepage&sourceDetail=%2F',
      'application/x-www-form-urlencoded'
    );
    assert.equal(hasFormBody(request), true);
    assert.deepEqual(await readJsonOrFormBody(request), {
      name: 'Kevin',
      email: 'kevin@example.com',
      hp_reference: '',
      source: 'homepage',
      sourceDetail: '/'
    });
  });

  it('does not mistake an unrelated body for a form', async () => {
    const request = post('email=not-a-form', 'text/plain');
    assert.equal(hasFormBody(request), false);
    assert.equal(await readJsonOrFormBody(request), undefined);
  });
});
