import type { ChartResult } from './chart-types.js';
/** A live Core controller. Registration is verified privately at runtime. */
export type ChartExportSource = Readonly<{ getSnapshot(): Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; committedRevision: number }> }>;
export type ExportCell = string | number | null;
export type ExportRecords = Readonly<{ columns: readonly string[]; rows: readonly (readonly ExportCell[])[] }>;
export type CsvOptions = Readonly<{ delimiter?: ',' | ';' | '\t'; spreadsheetSafe?: boolean; bom?: boolean }>;
export type SvgOptions = Readonly<{ width?: number; height?: number; background?: 'transparent' | `#${string}`; idPrefix?: string; legend?: 'all' | 'none' }>;
export type SvgImage = Readonly<{ svg: string; width: number; height: number; revision: number }>;
/** Ratio defaults to one. Caps: 16,777,216 pixels per image; four active jobs
 * and 33,554,432 active raster pixels per owner document. Busy work rejects. */
export type PngOptions = SvgOptions & Readonly<{ pixelRatio?: number; signal?: AbortSignal }>;
export type PngImage = Readonly<{ blob: Blob; width: number; height: number; revision: number }>;
export type PngResult = Promise<ChartResult<PngImage>>;
