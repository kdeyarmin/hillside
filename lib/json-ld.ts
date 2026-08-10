/**
 * Serializes structured data for a `<script type="application/ld+json">` block.
 *
 * `JSON.stringify` leaves `</script>` intact, and an HTML parser ends the script
 * at that sequence wherever it appears — so any customer-supplied string that
 * reaches JSON-LD (a review body, say) could close the block and inject markup.
 * Escaping the three HTML-significant characters as JSON unicode escapes keeps
 * the payload byte-identical once parsed while making that impossible. U+2028
 * and U+2029 are escaped too: both are valid in JSON but terminate a line in
 * JavaScript.
 */
export function jsonLd(data: unknown) {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}
