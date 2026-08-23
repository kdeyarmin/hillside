import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readJsonBody } from '../lib/request-body.ts';

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
