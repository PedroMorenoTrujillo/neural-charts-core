import { expect, test } from 'vitest';
import fc from 'fast-check';
import { recordsCsv } from '../../src/internal/export/csv.js';
/** Independent streaming CSV reader for the round-trip oracle. */
function readCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i]!;
    if (quoted) { if (character === '"' && text[i + 1] === '"') { value += '"'; i++; } else if (character === '"') quoted = false; else value += character; }
    else if (character === '"') quoted = true;
    else if (character === delimiter) { row.push(value); value = ''; }
    else if (character === '\r' && text[i + 1] === '\n') { row.push(value); rows.push(row); row = []; value = ''; i++; }
    else value += character;
  }
  if (quoted || row.length || value) throw Error('Incomplete CSV'); return rows;
}
test('CSV preserves raw numeric negatives, zero, missing values, quotes, delimiters and newlines', () => {
  const source = Object.freeze({ columns: Object.freeze(['ID', 'Value', 'Note']), rows: Object.freeze([Object.freeze(['a', -2, 'Comma, quote " and\r\nnewline']), Object.freeze(['b', 0, 'á漢字🙂']), Object.freeze(['c', null, ''])]) }), before = JSON.stringify(source), result = recordsCsv(source);
  expect(result.status).toBe('ok'); if (result.status === 'ok') expect(readCsv(result.value)).toEqual([['ID', 'Value', 'Note'], ['a', '-2', 'Comma, quote " and\r\nnewline'], ['b', '0', 'á漢字🙂'], ['c', '', '']]); expect(JSON.stringify(source)).toBe(before);
});
test('spreadsheet safety is explicit for string formulas without changing genuine numbers', () => {
  const source = { columns: ['Text', 'Number'], rows: [['=SUM(A1:A2)', -2], ['\t+1', 0], [' @command', 3], ['-2+3', -0]] }, safe = recordsCsv(source), raw = recordsCsv(source, { spreadsheetSafe: false, delimiter: ';', bom: true });
  expect(safe.status).toBe('ok'); if (safe.status === 'ok') expect(readCsv(safe.value).slice(1)).toEqual([["'=SUM(A1:A2)", '-2'], ["'\t+1", '0'], ["' @command", '3'], ["'-2+3", '0']]);
  expect(raw.status).toBe('ok'); if (raw.status === 'ok') { expect(raw.value[0]).toBe('\ufeff'); expect(readCsv(raw.value.slice(1), ';').slice(1)).toEqual(source.rows.map(row => row.map(String))); }
});
test('malformed rows and nonfinite numbers fail instead of silently dropping cells', () => {
  for (const source of [{ columns: [], rows: [] }, { columns: ['X'], rows: [[1, 2]] }, { columns: ['X'], rows: [[NaN]] }, { columns: ['X'], rows: [[Infinity]] }, { columns: ['X'], rows: [[undefined]] }]) expect(recordsCsv(source as Parameters<typeof recordsCsv>[0]).status).toBe('invalid');
});
test('seeded strings round-trip through an independent CSV reader for each delimiter', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.string({ maxLength: 80 }), fc.string({ maxLength: 80 })), { maxLength: 80 }), rows => {
    for (const delimiter of [',', ';', '\t'] as const) { const result = recordsCsv({ columns: ['First', 'Second'], rows }, { delimiter, spreadsheetSafe: false }); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(readCsv(result.value, delimiter)).toEqual([['First', 'Second'], ...rows]); }
  }), { seed: 198241, numRuns: 400 });
});
test('unpaired UTF-16 rejects instead of silently changing original text during UTF-8 encoding', () => {
  for (const value of ['\ud800', '\udfff', 'before\ud800after']) {
    const result = recordsCsv({ columns: ['Value'], rows: [[value]] });
    expect(result.status).toBe('invalid'); if (result.status === 'invalid') expect(result.diagnostic.reason).toBe('UNREPRESENTABLE_TEXT');
  }
});
test('accessors, sparse rows and surplus options reject without invoking consumer code', () => {
  let calls = 0; const accessor = Object.defineProperty({}, 'columns', { enumerable: true, get() { calls++; return ['x']; } });
  const sparse: string[] = []; sparse.length = 1;
  for (const value of [accessor, { columns: ['x'], rows: [sparse] }, { columns: ['x'], rows: [[1]], extra: true }]) expect(recordsCsv(value as Parameters<typeof recordsCsv>[0]).status).toBe('invalid');
  expect(calls).toBe(0); expect(recordsCsv({ columns: ['x'], rows: [[1]] }, { url: 'outside' } as Parameters<typeof recordsCsv>[1]).status).toBe('invalid');
});
test('the output cap counts UTF-8 bytes rather than accepting oversized multibyte text', () => {
  const result = recordsCsv({ columns: ['Text'], rows: Array.from({ length: 200 }, () => ['漢'.repeat(65536)]) });
  expect(result.status).toBe('invalid'); if (result.status === 'invalid') expect(result.diagnostic.reason).toBe('RESOURCE_LIMIT');
});
