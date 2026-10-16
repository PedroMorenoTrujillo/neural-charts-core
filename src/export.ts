import type { ChartResult } from './public/chart-types.js';
import type { ChartExportSource, ExportRecords, CsvOptions, SvgOptions, SvgImage, PngOptions, PngResult } from './public/export-types.js';
import { acquireExport } from './internal/export/capture.js';
import { recordsCsv } from './internal/export/csv.js';
import { snapshotSvg } from './internal/export/svg.js';
import { rasterize } from './internal/export/png.js';
export type { ChartExportSource, ExportCell, ExportRecords, CsvOptions, SvgOptions, SvgImage, PngOptions, PngImage, PngResult } from './public/export-types.js';
export type { ChartResult, ChartDiagnostic } from './public/chart-types.js';
/** Pure, browser-independent export of explicitly supplied raw records. */
export function exportDataCsv(records: ExportRecords, options?: CsvOptions): ChartResult<string> { return recordsCsv(records, options); }
export function exportCsv(controller: ChartExportSource, options?: CsvOptions): ChartResult<string> {
  const lease = acquireExport(controller); if (lease.status === 'invalid') return lease;
  try { return recordsCsv(lease.value.snapshot.records(), options); } finally { lease.value.release(); }
}
export function exportSvg(controller: ChartExportSource, options?: SvgOptions): ChartResult<SvgImage> {
  const lease = acquireExport(controller); if (lease.status === 'invalid') return lease;
  try { return snapshotSvg(lease.value.snapshot, options); } finally { lease.value.release(); }
}
export function exportPng(controller: ChartExportSource, options?: PngOptions): PngResult {
  const lease = acquireExport(controller); return lease.status === 'invalid' ? Promise.resolve(lease) : rasterize(lease.value, options);
}
