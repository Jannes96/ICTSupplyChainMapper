import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, serializeCsv, toRecords } from './csv.ts';

describe('parseCsv', () => {
  it('parses a simple table', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps quoted delimiters, quotes and line breaks inside the field', () => {
    const input = 'name,note\n"Muster GmbH, Berlin","sagt ""hallo""\nzweite Zeile"';

    expect(parseCsv(input)).toEqual([
      ['name', 'note'],
      ['Muster GmbH, Berlin', 'sagt "hallo"\nzweite Zeile'],
    ]);
  });

  it('accepts CRLF, a trailing newline and a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields, including trailing ones', () => {
    expect(parseCsv('a,b,c\n1,,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });

  it('trims unquoted fields but preserves whitespace inside quotes', () => {
    expect(parseCsv('a,b\n  1  ,"  2  "')).toEqual([
      ['a', 'b'],
      ['1', '  2  '],
    ]);
  });

  it('detects the semicolon that German Excel exports use', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not mistake a delimiter inside a quoted header for the separator', () => {
    expect(detectDelimiter('"a;b;c",d')).toBe(',');
  });
});

describe('serializeCsv', () => {
  it('quotes only where the format requires it', () => {
    const output = serializeCsv([
      ['a', 'b'],
      ['plain', 'has,comma'],
      ['has"quote', 'has\nbreak'],
    ]);

    expect(output).toBe('a,b\r\nplain,"has,comma"\r\n"has""quote","has\nbreak"');
  });

  it('round-trips through the parser', () => {
    const rows = [
      ['provider_id', 'legal_name'],
      ['TEST0001', 'Muster GmbH, Berlin'],
      ['TEST0002', 'Sagt "hallo"'],
    ];

    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });
});

describe('toRecords', () => {
  it('keys the rows by lower-cased header names', () => {
    expect(toRecords(parseCsv('Provider_ID,Country\nTEST0001,DE'))).toEqual([
      { provider_id: 'TEST0001', country: 'DE' },
    ]);
  });

  it('fills missing trailing cells with empty strings', () => {
    expect(toRecords([['a', 'b'], ['1']])).toEqual([{ a: '1', b: '' }]);
  });

  it('returns nothing for an empty file', () => {
    expect(toRecords(parseCsv(''))).toEqual([]);
  });
});
