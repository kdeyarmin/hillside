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
