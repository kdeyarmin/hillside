/**
 * The parsed JSON body of a request, or `undefined` when there is not one.
 *
 * Five public endpoints called `await request.json()` inside the same `try` that
 * catches a database failure, so a body that is not JSON at all — a bot, a
 * truncated upload, a client that forgot the header — was answered with a 500
 * and "we could not save that right now". It is the caller's mistake, not the
 * shop's, and the copy for it already exists: handing `undefined` to the route's
 * own schema fails validation and produces exactly the 400 a malformed field
 * would have.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Whether this request carries a browser's ordinary native form submission. */
export function hasFormBody(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  return (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  );
}

/**
 * A body posted by JavaScript as JSON or by the browser as a plain form.
 *
 * Most public forms on the site require JavaScript for their richer client
 * state. Newsletter signup is different: it is printed on nearly every page
 * and promoted away from the site, so a failed or delayed hydration must not
 * turn its submit button into a GET that puts the subscriber's address in the
 * URL without adding them to the list. Its native fallback posts the same
 * fields, and this gives the route one safe parser for both shapes.
 */
export async function readJsonOrFormBody(request: Request): Promise<unknown> {
  if (!hasFormBody(request)) return readJsonBody(request);

  try {
    return Object.fromEntries((await request.formData()).entries());
  } catch {
    return undefined;
  }
}
