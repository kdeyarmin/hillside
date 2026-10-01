-- One-time merchandising fix: the Fall 2026 collection was created behind every
-- existing collection, so the homepage's collection row (which shows only the
-- first few tiles) never reached it. Move it ahead of the rest and make sure it
-- is offered on the homepage. Runs once; later reordering in the admin stands.
-- A database without the collection is left untouched.
UPDATE "Collection"
SET
  "sortOrder" = (
    SELECT COALESCE(MIN("sortOrder"), 0) - 10 FROM "Collection" WHERE "slug" <> 'fall-2026'
  ),
  "featured" = true
WHERE "slug" = 'fall-2026';
