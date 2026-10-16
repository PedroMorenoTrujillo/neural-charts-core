import type { ChartResult } from '../../public/chart-types.js';
import type { SceneFrame } from '../scene/model.js';
import type { ShellFrame } from '../layout/frame.js';
import type { Palette, ResolvedFont } from '../chart/presentation.js';
import type { LegendItem } from '../legend/view.js';
import type { ExportRecords } from '../../public/export-types.js';
import { invalid, ok } from '../diagnostics.js';
export type ExportSnapshot = Readonly<{ document: Document; instanceId: string; revision: number; frame: SceneFrame; layout: ShellFrame; palette: Palette; font: ResolvedFont; direction: 'ltr' | 'rtl'; title: string; description: string; context: string; status: string; legend: readonly LegendItem[]; hiddenLegendIds: readonly string[]; records(): ExportRecords }>;
type Entry = { source: (() => ChartResult<ExportSnapshot>) | null; jobs: Set<AbortController> };
const entries = new WeakMap<object, Entry>();
export type ExportLease = Readonly<{ snapshot: ExportSnapshot; signal: AbortSignal; release(): void }>;
/** Private capability table: no chart family import, registration by factory
 * name, strong controller key or hidden eager renderer loading. */
export function provideExport(target: object, source: () => ChartResult<ExportSnapshot>): () => void {
  if (entries.has(target)) throw Error('Duplicate private export owner');
  const entry: Entry = { source, jobs: new Set() }; entries.set(target, entry); let owned: object | null = target;
  return () => {
    if (!owned) return; entries.delete(owned); owned = null; entry.source = null;
    for (const job of entry.jobs) { try { job.abort(); } catch { /* Release every independent job. */ } } entry.jobs.clear();
  };
}
export function acquireExport(target: object): ChartResult<ExportLease> {
  try {
    const entry = entries.get(target); if (!entry?.source) return invalid('LIFECYCLE_ERROR', 'EXPORT_UNAVAILABLE', 'controller');
    const result = entry.source(); if (result.status === 'invalid') return result;
    const WindowAbort = result.value.document.defaultView?.AbortController; if (!WindowAbort) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'export.document');
    const job = new WindowAbort(); entry.jobs.add(job); let active = true;
    return ok(Object.freeze({ snapshot: result.value, signal: job.signal, release() { if (!active) return; active = false; entry.jobs.delete(job); } }));
  } catch { return invalid('LIFECYCLE_ERROR', 'EXPORT_UNAVAILABLE', 'controller'); }
}
