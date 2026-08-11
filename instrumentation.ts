/**
 * Runs once when the server boots, before it handles a request.
 *
 * The Hillside Gardens keeps Eastern time. Class dates are typed into the
 * dashboard as a wall clock ("6:00 PM") and read back to customers the same way,
 * and both halves of that round trip use the server's timezone — so on a host
 * that defaults to UTC, a 6:00 PM class advertises itself as 6:00 PM UTC, which
 * is 2:00 PM at the shop.
 *
 * Setting TZ here rather than in the deploy config means the shop is correct out
 * of the box, on Railway, in a container, or on a laptop. Node re-reads TZ on
 * assignment, so this affects both `new Date(...)` parsing and every
 * `toLocaleString` that follows. An explicit TZ in the environment still wins.
 */
export function register() {
  process.env.TZ ??= 'America/New_York';
}
