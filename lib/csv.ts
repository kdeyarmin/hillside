/**
 * Quote a CSV cell and neutralize formula-leading characters so Excel/Sheets
 * cannot treat a customer name or gift note as `=cmd|...`.
 */
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
