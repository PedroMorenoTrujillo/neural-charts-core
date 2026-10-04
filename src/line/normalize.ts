import type { LineChartSpec, LinePoint, LineSeries } from '../public/line-types.js';
import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { Domain, Extent } from '../internal/math/domain.js';
import { finiteExtent, normalizeNumericDomain } from '../internal/math/domain.js';
import { normalizeTimeDomain, timeExtent } from '../internal/math/time.js';
import { ok } from '../internal/diagnostics.js';
import { assignment } from '../internal/chart/presentation.js';
import type { Dash } from '../internal/chart/presentation.js';

export type NormalizedSeries<T> = Readonly<{
  spec: LineSeries<T>; points: readonly LinePoint<T>[]; valid: readonly LinePoint<T>[];
  runs: readonly (readonly LinePoint<T>[])[]; byId: ReadonlyMap<string, number>;
  byX: ReadonlyMap<string | number, LinePoint<T>>; yExtent: Extent;
  colorIndex: number; dash: Dash;
}>;
export type NormalizedLine<T> = Readonly<{
  spec: LineChartSpec<T>; series: readonly NormalizedSeries<T>[];
  ranks: ReadonlyMap<string, number>; labels: ReadonlyMap<string, string>;
  xExtent: Extent; nonnullCount: number;
}>;
export type Domains = Readonly<{ x: Domain | null; y: Domain | null }>;
export function normalizeLine<T>(spec: LineChartSpec<T>): NormalizedLine<T> {
  const ranks = new Map<string, number>(), labels = new Map<string, string>();
  if (spec.axes.x.kind === 'category') spec.axes.x.values.forEach((c, i) => { ranks.set(c.id, i); labels.set(c.id, c.label ?? c.id); });
  const xs: number[] = []; let nonnullCount = 0;
  const series = spec.series.map(s => {
    const byId = new Map<string, number>(), byX = new Map<string | number, LinePoint<T>>(), valid: LinePoint<T>[] = [], runs: LinePoint<T>[][] = [];
    let run: LinePoint<T>[] = []; const ys: number[] = [];
    for (let i = 0; i < s.data.length; i++) {
      const point = s.data[i]!; byId.set(point.id, i); byX.set(point.x, point);
      if (typeof point.x === 'number') xs.push(point.x);
      if (point.y === null) { if (s.gaps !== 'connect' && run.length) { runs.push(run); run = []; } }
      else { valid.push(point); run.push(point); ys.push(point.y); nonnullCount++; }
    }
    if (run.length) runs.push(run);
    const paint = assignment(s.id);
    return Object.freeze({ spec: s, points: s.data, valid: Object.freeze(valid), runs: Object.freeze(runs.map(r => Object.freeze(r))), byId, byX, yExtent: finiteExtent(ys), colorIndex: paint.colorIndex, dash: s.dash ?? paint.dash });
  });
  return Object.freeze({ spec, series: Object.freeze(series), ranks, labels, xExtent: spec.axes.x.kind === 'time' ? timeExtent(xs) : finiteExtent(xs), nonnullCount });
}
export function lineDomains<T>(data: NormalizedLine<T>, state: ChartState): ChartResult<Domains> {
  const x = data.spec.axes.x, y = data.spec.axes.y, hidden = new Set(state.hiddenSeriesIds), ys: number[] = [];
  for (const s of data.series) if (!hidden.has(s.spec.id)) {
    if (s.yExtent.status === 'constant') ys.push(s.yExtent.value);
    else if (s.yExtent.status === 'span') ys.push(...s.yExtent.domain);
  }
  const yPlan = normalizeNumericDomain(finiteExtent(ys), { includeZero: y.includeZero ?? false, ...(y.domain ? { explicit: y.domain } : {}) });
  if (yPlan.status === 'invalid') return yPlan;
  if (x.kind === 'category') return ok({ x: null, y: yPlan.status === 'ok' ? yPlan.domain : null });
  const xPlan = x.kind === 'time' ? normalizeTimeDomain(data.xExtent, x.domain ? { explicit: x.domain } : {}) : normalizeNumericDomain(data.xExtent, { includeZero: false, ...(x.domain ? { explicit: x.domain } : {}) });
  if (xPlan.status === 'invalid') return xPlan;
  return ok({ x: xPlan.status === 'ok' ? xPlan.domain : null, y: yPlan.status === 'ok' ? yPlan.domain : null });
}
export function seriesKey(id: string): string { return `s:${id.length}:${id}|line`; }
export function pointKey(seriesId: string, pointId: string): string { return `s:${seriesId.length}:${seriesId}|p:${pointId.length}:${pointId}`; }
