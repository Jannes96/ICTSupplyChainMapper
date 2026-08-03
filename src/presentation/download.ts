/**
 * Offers a text file for download.
 *
 * A frontend-only tool has no server to write to, so an object URL is the whole
 * mechanism. The BOM is deliberate: without it Excel reads UTF-8 CSV as Latin-1
 * and turns every umlaut in a company name into mojibake.
 */
export function downloadText(fileName: string, content: string, mimeType = 'text/csv'): void {
  const blob = new Blob(['﻿', content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}
