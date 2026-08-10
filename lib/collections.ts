/**
 * The collections the primary navigation points at. The content manager lets the
 * owner rename, hide or delete any collection, which would leave these header
 * links pointing at a 404 — so these three slugs are locked, and the admin
 * actions refuse to rename or remove them.
 */
export const NAVIGATION_COLLECTION_SLUGS = ['plants', 'teas-herbals', 'botanicals'] as const;

export function isNavigationCollection(slug: string) {
  return (NAVIGATION_COLLECTION_SLUGS as readonly string[]).includes(slug);
}
