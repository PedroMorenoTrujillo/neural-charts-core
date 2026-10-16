import type { ColumnChartSpec, ColumnPoint, ColumnSeries } from '../public/column-types.js';
import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { Domain, Extent } from '../internal/math/domain.js';
import { finiteExtent, normalizeNumericDomain } from '../internal/math/domain.js';
import { assignment } from '../internal/chart/presentation.js';
import { duplicateCategoryLabels } from '../internal/tooltip/model.js';
import { ok } from '../internal/diagnostics.js';
export type NormalizedColumnSeries<T> = Readonly<{ spec: ColumnSeries<T>; points: readonly ColumnPoint<T>[]; valid: readonly ColumnPoint<T>[]; byX: ReadonlyMap<string, ColumnPoint<T>>; extent: Extent; colorIndex: number; dash: 'solid' | 'dashed' | 'dotted' }>;
export type NormalizedColumn<T> = Readonly<{ spec: ColumnChartSpec<T>; series: readonly NormalizedColumnSeries<T>[]; ranks: ReadonlyMap<string, number>; labels: ReadonlyMap<string, string>; duplicateLabels: ReadonlySet<string>; nonnullCount: number }>;
export function columnKey(series: string, point: string): string { return `s:${series.length}:${series}|p:${point.length}:${point}`; }
export function normalizeColumn<T>(spec: ColumnChartSpec<T>): NormalizedColumn<T> {
  const ranks = new Map(spec.axes.x.values.map((c, i) => [c.id, i])), labels = new Map(spec.axes.x.values.map(c => [c.id, c.label ?? c.id]));
  let nonnullCount = 0;
  const series = spec.series.map(s => {
    const supplied = new Map(s.data.map(p => [p.x, p])), points = Object.freeze(spec.axes.x.values.flatMap(c => { const p = supplied.get(c.id); return p ? [p] : []; })), valid = Object.freeze(points.filter(p => p.y !== null)), paint = assignment(s.id);
    nonnullCount += valid.length;
    return Object.freeze({ spec: s, points, valid, byX: new Map(points.map(p => [p.x, p])), extent: finiteExtent(valid.map(p => p.y!)), ...paint });
  });
  return Object.freeze({ spec, series: Object.freeze(series), ranks, labels, duplicateLabels: duplicateCategoryLabels(labels), nonnullCount });
}
export function columnDomain<T>(data: NormalizedColumn<T>, state: ChartState): ChartResult<Domain | null> {
  const hidden = new Set(state.hiddenSeriesIds), values: number[] = [];
  for (const s of data.series) {
    if (s.extent.status === 'invalid') return s.extent;
    if (hidden.has(s.spec.id)) continue;
    if (s.extent.status === 'constant') values.push(s.extent.value);
    else if (s.extent.status === 'span') values.push(...s.extent.domain);
  }
  const result = normalizeNumericDomain(finiteExtent(values), { includeZero: true, ...(data.spec.axes.y.domain ? { explicit: data.spec.axes.y.domain } : {}) });
  if (result.status === 'invalid') return result;
  return ok(result.status === 'ok' ? result.domain : null);
}
