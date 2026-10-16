import type { ChartResult, ChartState } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { finiteExtent, normalizeNumericDomain } from '../internal/math/domain.js';
import type { Domain, Extent } from '../internal/math/domain.js';

import type { ScatterPoint, ScatterSeries, NumericAxis } from '../public/scatter-types.js';
export type { ScatterPoint, ScatterSeries, NumericAxis } from '../public/scatter-types.js';
export type PairedPoint<T = unknown> = ScatterPoint<T> & Readonly<{ x: number; y: number }>;
export type ScatterDataSpec<T = unknown> = Readonly<{ axes: Readonly<{ x: NumericAxis; y: NumericAxis }>; series: readonly ScatterSeries<T>[] }>;
export type NormalizedSeries<T> = Readonly<{ spec: ScatterSeries<T>; index: number; paired: readonly Readonly<{ point: PairedPoint<T>; index: number }>[]; byId: ReadonlyMap<string, number>; xExtent: Extent; yExtent: Extent }>;
export type NormalizedScatter<T, S extends ScatterDataSpec<T> = ScatterDataSpec<T>> = Readonly<{ spec: S; series: readonly NormalizedSeries<T>[]; byId: ReadonlyMap<string, number>; rawCount: number; pairedCount: number }>;
export type ScatterDomains = Readonly<{ x: Domain | null; y: Domain | null }>;
export const targetKey = (seriesId: string, pointId: string): string => 's:' + seriesId.length + ':' + seriesId + '|p:' + pointId.length + ':' + pointId;
/** Input records are owned/validated structural copies in the eventual public
 * controller. Defensive numeric/identity bounds still protect pure callers. */
export function normalizeScatter<T, S extends ScatterDataSpec<T> = ScatterDataSpec<T>>(spec: S & ScatterDataSpec<T>): ChartResult<NormalizedScatter<T, S>> {
  if (spec.series.length > 16) return invalid('INVALID_CONFIG', 'TOO_MANY_SERIES', 'series');
  const total = spec.series.reduce((count, series) => count + series.data.length, 0);
  if (total > 50000) return invalid('INVALID_CONFIG', 'TOO_MANY_POINTS', 'series');
  const byId = new Map<string, number>(), series: NormalizedSeries<T>[] = []; let pairedCount = 0;
  for (let si = 0; si < spec.series.length; si++) {
    const source = spec.series[si]!, ids = new Map<string, number>(), paired: { point: PairedPoint<T>; index: number }[] = [], xs: number[] = [], ys: number[] = [];
    if (byId.has(source.id)) return invalid('INVALID_CONFIG', 'DUPLICATE_SERIES_ID', 'series[' + si + '].id'); byId.set(source.id, si);
    for (let pi = 0; pi < source.data.length; pi++) {
      const point = source.data[pi]!;
      if (ids.has(point.id)) return invalid('INVALID_CONFIG', 'DUPLICATE_POINT_ID', 'series[' + si + '].data[' + pi + '].id'); ids.set(point.id, pi);
      if (point.x !== null && !Number.isFinite(point.x) || point.y !== null && !Number.isFinite(point.y)) return invalid('INVALID_NUMBER', 'NONFINITE', 'series[' + si + '].data[' + pi + ']');
      if (point.x === null || point.y === null) continue;
      paired.push(Object.freeze({ point: point as PairedPoint<T>, index: pi })); xs.push(point.x); ys.push(point.y); pairedCount++;
    }
    series.push(Object.freeze({ spec: source, index: si, paired: Object.freeze(paired), byId: ids, xExtent: finiteExtent(xs), yExtent: finiteExtent(ys) }));
  }
  return ok(Object.freeze({ spec, series: Object.freeze(series), byId, rawCount: total, pairedCount }));
}
export function scatterDomains<T>(data: NormalizedScatter<T>, state: ChartState): ChartResult<ScatterDomains> {
  const hidden = new Set(state.hiddenSeriesIds), xs: number[] = [], ys: number[] = [];
  for (const series of data.series) {
    if (hidden.has(series.spec.id)) continue;
    if (series.xExtent.status === 'invalid') return series.xExtent; if (series.yExtent.status === 'invalid') return series.yExtent;
    if (series.xExtent.status === 'constant') xs.push(series.xExtent.value); else if (series.xExtent.status === 'span') xs.push(...series.xExtent.domain);
    if (series.yExtent.status === 'constant') ys.push(series.yExtent.value); else if (series.yExtent.status === 'span') ys.push(...series.yExtent.domain);
  }
  const x = normalizeNumericDomain(finiteExtent(xs), { includeZero: data.spec.axes.x.includeZero ?? false, ...(data.spec.axes.x.domain ? { explicit: data.spec.axes.x.domain } : {}) }); if (x.status === 'invalid') return x;
  const y = normalizeNumericDomain(finiteExtent(ys), { includeZero: data.spec.axes.y.includeZero ?? false, ...(data.spec.axes.y.domain ? { explicit: data.spec.axes.y.domain } : {}) }); if (y.status === 'invalid') return y;
  return ok(Object.freeze({ x: x.status === 'ok' ? x.domain : null, y: y.status === 'ok' ? y.domain : null }));
}
