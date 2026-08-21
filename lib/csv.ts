/**
 * Quote a CSV cell and neutralize formula-leading characters so Excel/Sheets
 * cannot treat a customer name or gift note as `=cmd|...`.
 *
 * Excel trims leading space and treats fullwidth `＝＋－＠` like ASCII, so a
 * gift note of ` =HYPERLINK(...)` or `＝cmd|...` used to slip past the leading
 * ASCII-only check.
 */
const FORMULA_LEAD = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/;

export function csvCell(value: unknown) {
  let text = String(value ?? '');
  const trimmed = text.replace(/^[\s\u00a0\u200b\uFEFF]+/, '');
  if (FORMULA_LEAD.test(text) || FORMULA_LEAD.test(trimmed)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
