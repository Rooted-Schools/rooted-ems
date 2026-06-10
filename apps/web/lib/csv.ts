/**
 * Minimal CSV builder with proper escaping and spreadsheet
 * formula-injection protection. No dependencies — safe for client use.
 */

/**
 * Encode a single CSV cell:
 *   1. Formula-injection guard — values starting with = + - @ are prefixed
 *      with a single quote so Excel/Sheets treat them as text, never code.
 *   2. RFC 4180 escaping — cells containing quotes, commas, or newlines are
 *      wrapped in double quotes with inner quotes doubled.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@]/.test(v)) {
    v = `'${v}`;
  }
  if (/[",\r\n]/.test(v)) {
    v = `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Build a full CSV document (CRLF line endings) from a header + rows. */
export function buildCsv(
  header: string[],
  rows: (string | null | undefined)[][]
): string {
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

/** Trigger a browser download of `content` as a CSV file. Client-side only. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
