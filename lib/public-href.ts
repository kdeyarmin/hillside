/**
 * Links Tammy types into the gallery (and similar owner-authored hrefs) are
 * rendered as real `<a>` tags. A `javascript:` or `data:` value would run in
 * the visitor's browser; a protocol-relative `//evil.example` would leave the
 * shop. Only site-relative paths and http(s) URLs are kept.
 */
export function sanitizePublicHref(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.includes('\\')) return null;
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    return null;
  }
  return null;
}
