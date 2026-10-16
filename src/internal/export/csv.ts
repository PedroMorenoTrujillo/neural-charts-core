import type { ChartResult } from '../../public/chart-types.js';
import { ok, invalid } from '../diagnostics.js';
import { record, array, text, choice, fail, ValidationFailure } from '../data/validation.js';
import type { ExportRecords, CsvOptions } from '../../public/export-types.js';
import { utf8Size } from './utf8.js';
export function recordsCsv(input: ExportRecords, options: CsvOptions = {}): ChartResult<string> {
  try {
    const config = record(options, ['delimiter', 'spreadsheetSafe', 'bom'], [], 'options'), delimiter = Object.hasOwn(config, 'delimiter') ? choice(config.delimiter, [',', ';', '\t'], 'options.delimiter') : ',';
    for (const key of ['spreadsheetSafe', 'bom']) if (Object.hasOwn(config, key) && typeof config[key] !== 'boolean') fail('options.' + key);
    const safe = config.spreadsheetSafe !== false, source = record(input, ['columns', 'rows'], ['columns', 'rows'], 'records'), columns = array(source.columns, 64, 'records.columns').map((value, index) => text(value, 'records.columns[' + index + ']', 1024)), rows = array(source.rows, 1000000, 'records.rows');
    if (!columns.length) fail('records.columns', 'EMPTY_COLUMNS');
    const parts: string[] = []; let size = config.bom === true ? 3 : 0;
    function line(values: readonly unknown[], path: string): void {
      if (values.length !== columns.length) fail(path, 'ROW_WIDTH');
      const cells = values.map((value, index) => {
        let content: string;
        if (value === null) content = '';
        else if (typeof value === 'number') { if (!Number.isFinite(value)) fail(path + '[' + index + ']', 'NONFINITE', 'INVALID_NUMBER'); content = String(value === 0 ? 0 : value); }
        else { content = text(value, path + '[' + index + ']', 65536, true); if (safe && /^[\s\u0000-\u001f]*[=+@-]/.test(content)) content = "'" + content; }
        return content.includes(delimiter) || /["\r\n]/.test(content) ? '"' + content.replaceAll('"', '""') + '"' : content;
      });
      const encoded = cells.join(delimiter) + '\r\n'; size += utf8Size(encoded, path); if (size > 32 * 1024 * 1024) fail('records', 'RESOURCE_LIMIT'); parts.push(encoded);
    }
    line(columns, 'records.columns'); rows.forEach((row, index) => line(array(row, 64, 'records.rows[' + index + ']'), 'records.rows[' + index + ']'));
    return ok((config.bom === true ? '\ufeff' : '') + parts.join(''));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_EXPORT_RECORDS', 'records'); }
}
