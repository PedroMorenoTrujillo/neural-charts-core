import type { ChartResult, ChartState } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import type { Domain } from '../internal/math/domain.js';
import { buildSpatialIndex } from './spatial.js';
import type { SpatialIndex } from './spatial.js';
import { targetKey } from './data.js';
import type { NormalizedScatter, NormalizedSeries, PairedPoint } from './data.js';

export type ScatterTarget<T> = Readonly<{ key: string; point: PairedPoint<T>; series: NormalizedSeries<T>; index: number; rank: number; x: number; y: number; radius: number }>;
export type ProjectedSeries<T> = Readonly<{ series: NormalizedSeries<T>; targets: readonly ScatterTarget<T>[]; index: SpatialIndex<ScatterTarget<T>> }>;
export type ScatterBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ScatterProjection<T> = Readonly<{ plot: ScatterBounds; series: readonly ProjectedSeries<T>[]; targets: readonly ScatterTarget<T>[]; byKey: ReadonlyMap<string, ScatterTarget<T>>; spatial: SpatialIndex<ScatterTarget<T>>; clipped: number }>;
type Mapper = Readonly<{ plot: ScatterBounds; tooSmall: boolean; x: Readonly<{ domain: Domain | null }>; y: Readonly<{ domain: Domain | null }>; mapX(value: number): number | null; mapY(value: number): number | null }>;
const contains = (plot: ScatterBounds, x: number, y: number): boolean => x >= plot.x && x <= plot.x + plot.width && y >= plot.y && y <= plot.y + plot.height;
export function projectScatter<T>(data: NormalizedScatter<T>, state: ChartState, axes: Mapper): ChartResult<ScatterProjection<T>> {
  const plot = axes.plot;
  if (![plot.x, plot.y, plot.width, plot.height, plot.x + plot.width, plot.y + plot.height].every(Number.isFinite) || plot.width < 0 || plot.height < 0) return invalid('INVALID_NUMBER', 'BAD_BOUNDS', 'scatter.plot');
  const right = plot.x + plot.width, bottom = plot.y + plot.height, epsilonX = Math.max(Number.MIN_VALUE, Number.EPSILON * 4 * Math.max(Math.abs(plot.x), Math.abs(right))), epsilonY = Math.max(Number.MIN_VALUE, Number.EPSILON * 4 * Math.max(Math.abs(plot.y), Math.abs(bottom)));
  const hidden = new Set(state.hiddenSeriesIds), series: ProjectedSeries<T>[] = [], targets: ScatterTarget<T>[] = [], byKey = new Map<string, ScatterTarget<T>>(); let clipped = 0;
  if (!axes.tooSmall && plot.width > 0 && plot.height > 0 && axes.x.domain && axes.y.domain) for (const source of data.series) {
    if (hidden.has(source.spec.id)) continue;
    const radius = (source.spec.marker?.size ?? 6) / 2;
    if (!Number.isFinite(radius) || radius <= 0 || radius > 12) return invalid('INVALID_CONFIG', 'BAD_MARKER_SIZE', 'series[' + source.index + '].marker.size');
    const points: ScatterTarget<T>[] = [];
    for (const pair of source.paired) {
      const point = pair.point;
      // Clip in raw domain before mapping, so an extreme offscreen value
      // cannot overflow extrapolation or become a misleading edge marker.
      if (point.x < axes.x.domain[0] || point.x > axes.x.domain[1] || point.y < axes.y.domain[0] || point.y > axes.y.domain[1]) { clipped++; continue; }
      const mappedX = axes.mapX(point.x), mappedY = axes.mapY(point.y);
      if (mappedX === null || mappedY === null || !Number.isFinite(mappedX) || !Number.isFinite(mappedY)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'scatter.projected');
      if (mappedX < plot.x - epsilonX || mappedX > right + epsilonX || mappedY < plot.y - epsilonY || mappedY > bottom + epsilonY) return invalid('INTERNAL_INVARIANT', 'OUT_OF_PLOT_MAPPING', 'scatter.projected');
      const x = Math.max(plot.x, Math.min(right, mappedX)), y = Math.max(plot.y, Math.min(bottom, mappedY));
      const target = Object.freeze({ key: targetKey(source.spec.id, point.id), point, series: source, index: pair.index, rank: points.length, x, y, radius });
      points.push(target); targets.push(target); byKey.set(target.key, target);
    }
    const index = buildSpatialIndex(points); if (index.status === 'invalid') return index;
    if (points.length) series.push(Object.freeze({ series: source, targets: Object.freeze(points), index: index.value }));
  }
  // A single visible series already owns the exact same ordered target set.
  // Reuse its index rather than sorting/building all 50k points a second time.
  const spatial = series.length === 1 ? ok(series[0]!.index) : buildSpatialIndex(targets); if (spatial.status === 'invalid') return spatial;
  return ok(Object.freeze({ plot: Object.freeze({ ...plot }), series: Object.freeze(series), targets: Object.freeze(targets), byKey, spatial: spatial.value, clipped }));
}
export function pickScatter<T>(projection: ScatterProjection<T>, x: number, y: number, tolerance = 12): ScatterTarget<T> | null {
  return contains(projection.plot, x, y) ? projection.spatial.query(x, y, tolerance).target : null;
}
export function navigateScatter<T>(projection: ScatterProjection<T>, previous: ScatterTarget<T> | null, key: string, control = false): ScatterTarget<T> | null {
  const current = previous ? projection.byKey.get(previous.key) : null;
  if (!current) return (key === 'End' ? projection.targets[projection.targets.length - 1] : projection.targets[0]) ?? null;
  const seriesIndex = projection.series.findIndex(series => series.series.spec.id === current.series.spec.id), series = projection.series[seriesIndex]; if (!series) return current;
  if (key === 'Home') return control ? projection.targets[0] ?? current : series.targets[0] ?? current;
  if (key === 'End') return control ? projection.targets[projection.targets.length - 1] ?? current : series.targets[series.targets.length - 1] ?? current;
  if (key === 'ArrowLeft' || key === 'ArrowRight') return series.targets[Math.max(0, Math.min(series.targets.length - 1, current.rank + (key === 'ArrowLeft' ? -1 : 1)))] ?? current;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const next = projection.series[seriesIndex + (key === 'ArrowUp' ? -1 : 1)]; if (!next) return current;
    return next.index.query(current.x, current.y, Math.hypot(projection.plot.width, projection.plot.height) + 1).target ?? current;
  }
  return current;
}
