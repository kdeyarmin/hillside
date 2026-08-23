/**
 * Reading values out of a `FormData`.
 *
 * Kept free of Next and Prisma so `npm test` can cover the one case the obvious
 * implementation gets wrong: a field the form did not send, or sent empty.
 * `Number(null)` and `Number('')` are both `0`, and `0` is finite — so a
 * `Number.isFinite` guard hands back zero rather than the caller's fallback, and
 * every default written beside one of these calls was unreachable.
 *
 * The class form is where that showed. Its duration, join-open and join-close
 * boxes are optional, and clearing one stored a zero: a class saved with an
 * empty duration became a fifteen-minute class rather than the ninety-minute
 * default the field promised, and an empty join window opened the online
 * classroom exactly at the start time and closed it the moment class ended.
 */
export function formInteger(value: FormDataEntryValue | null | undefined, fallback = 0) {
  if (value == null) return fallback;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return fallback;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}
