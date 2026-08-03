/**
 * A small RFC 4180 CSV reader/writer.
 *
 * Written by hand rather than pulled in as a dependency: the format is small, and
 * the two things that actually break register imports in practice — the UTF-8 BOM
 * that Excel writes and the semicolon delimiter of German locales — are handled
 * here explicitly instead of being hidden in a library's option object.
 */

const BOM = '﻿';

export type Delimiter = ',' | ';' | '\t';

/**
 * Guesses the delimiter from the header line: whichever candidate occurs most
 * often outside quotes wins, with the comma as tie-breaker.
 */
export function detectDelimiter(input: string): Delimiter {
  const header = stripBom(input).split(/\r?\n/, 1)[0] ?? '';
  const candidates: Delimiter[] = [',', ';', '\t'];

  let best: Delimiter = ',';
  let bestCount = 0;

  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const character of header) {
      if (character === '"') inQuotes = !inQuotes;
      else if (character === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Parses CSV into rows of raw cells. Quoted fields may contain the delimiter,
 * line breaks and doubled quotes (`""` → `"`). Trailing blank lines are dropped.
 */
export function parseCsv(input: string, delimiter: Delimiter = detectDelimiter(input)): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = (): void => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };

  const endRow = (): void => {
    endField();
    // A line that holds nothing but an empty field is a blank line, not a record.
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index] as string;

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    switch (character) {
      case '"':
        inQuotes = true;
        fieldWasQuoted = true;
        break;
      case delimiter:
        endField();
        break;
      case '\r':
        // Swallow CR of a CRLF pair; a lone CR also ends the record.
        if (text[index + 1] === '\n') index++;
        endRow();
        break;
      case '\n':
        endRow();
        break;
      default:
        field += character;
    }
  }

  if (field !== '' || row.length > 0 || fieldWasQuoted) endRow();

  return rows;
}

/** Serialises rows, quoting only where the format requires it. */
export function serializeCsv(
  rows: readonly (readonly string[])[],
  delimiter: Delimiter = ',',
  lineBreak: '\n' | '\r\n' = '\r\n',
): string {
  return rows.map((row) => row.map((cell) => quoteIfNeeded(cell, delimiter)).join(delimiter)).join(lineBreak);
}

function quoteIfNeeded(cell: string, delimiter: Delimiter): string {
  const needsQuotes =
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes('\n') ||
    cell.includes('\r') ||
    cell.trim() !== cell;

  return needsQuotes ? `"${cell.replaceAll('"', '""')}"` : cell;
}

function stripBom(input: string): string {
  return input.startsWith(BOM) ? input.slice(BOM.length) : input;
}

/**
 * Turns the parsed rows into records keyed by the header names, so callers work
 * against column names instead of positions. Column order in the file is free.
 */
export function toRecords(rows: readonly (readonly string[])[]): Array<Record<string, string>> {
  const [header, ...body] = rows;
  if (!header) return [];

  const columns = header.map((name) => name.trim().toLowerCase());

  return body.map((row) => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = row[index] ?? '';
    });
    return record;
  });
}
