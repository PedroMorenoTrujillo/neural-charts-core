import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ColumnPoint } from '../public/column-types.js';
import type { ChartCategoryWindow } from '../public/viewport-types.js';
import type { Domain } from '../internal/math/domain.js';
import type { Plot } from '../internal/layout/frame.js';
import type { NormalizedColumn } from '../column/normalize.js';
import type { ColumnProjection, ColumnRect } from '../column/geometry.js';
import { columnKey } from '../column/normalize.js';
import { finiteExtent, normalizeNumericDomain } from '../internal/math/domain.js';
import { createCategoryFrame, createBandScale } from '../internal/math/category.js';
import { createLinearScale } from '../internal/math/linear.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { viewportBand } from '../internal/interaction/viewport-band.js';
import { computeStack } from './stack.js';
import type { StackData } from './stack.js';

export type StackedProjection<T> = ColumnProjection<T> & Readonly<{ stack: StackData<ColumnPoint<T>> }>;
function calculate<T>(data: NormalizedColumn<T>, state: ChartState, mode: 'sum' | 'percent') {
  const hidden = new Set(state.hiddenSeriesIds), visible = data.series.filter(series => !hidden.has(series.spec.id));
  return { visible, result: computeStack(data.spec.axes.x.values.map(category => category.id), visible.map(series => ({ id: series.spec.id, data: series.points })), mode) };
}
export function stackedDomain<T>(data: NormalizedColumn<T>, state: ChartState, mode: 'sum' | 'percent'): ChartResult<Domain | null> {
  const calculated = calculate(data, state, mode).result;
  if (calculated.status === 'invalid') return calculated;
  const domain = normalizeNumericDomain(finiteExtent(calculated.value.extent), { includeZero: true, ...(data.spec.axes.y.domain ? { explicit: data.spec.axes.y.domain } : {}) });
  return domain.status === 'invalid' ? domain : ok(domain.status === 'ok' ? domain.domain : null);
}
export function projectStacked<T>(data: NormalizedColumn<T>, state: ChartState, plot: Plot, domain: Domain, mode: 'sum' | 'percent', window?: ChartCategoryWindow): ChartResult<StackedProjection<T>> {
  if (![plot.x, plot.y, plot.width, plot.height].every(Number.isFinite) || plot.width <= 0 || plot.height <= 0) return invalid('INVALID_CONFIG', 'BAD_PLOT', 'plot');
  const { visible, result } = calculate(data, state, mode); if (result.status === 'invalid') return result;
  const horizontal = data.spec.orientation === 'horizontal', start = horizontal ? plot.y : plot.x, length = horizontal ? plot.height : plot.width;
  const scoped = viewportBand(data.spec.axes.x.values.map(category => category.id), data.ranks, window); if (scoped.status === 'invalid') return scoped;
  const categoryFrame = createCategoryFrame(scoped.value.ids, [start, start + length], .5);
  if (categoryFrame.status === 'invalid') return categoryFrame;
  const bands = createBandScale(categoryFrame.value, data.spec.groupGap ?? .2); if (bands.status === 'invalid') return bands;
  let range: readonly [number, number] = horizontal ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y];
  if (data.spec.axes.y.reversed) range = [range[1], range[0]];
  const values = createLinearScale(domain, range, true); if (values.status === 'invalid') return values;
  const slotWidth = Math.min(bands.value.width, data.spec.maxBarWidth ?? Infinity);
  const rects: ColumnRect<T>[] = [], rows: ColumnRect<T>[][] = visible.map(() => []), byId = new Map<string, ColumnRect<T>>(), byCategory: Map<number, ColumnRect<T>>[] = data.spec.axes.x.values.map(() => new Map());
  for (let si = 0; si < visible.length; si++) {
    const series = visible[si]!;
    for (const segment of result.value.series[si]!.segments) {
      const categoryIndex = data.ranks.get(segment.point.x)!;
      if (categoryIndex < scoped.value.offset || categoryIndex >= scoped.value.offset + scoped.value.ids.length) continue;
      if (Math.max(segment.base, segment.end) < domain[0] || Math.min(segment.base, segment.end) > domain[1]) continue;
      const p0 = values.value.map(segment.base), p1 = values.value.map(segment.end);
      if (p0 === null || p1 === null) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'stack.rect');
      const point = segment.point, band = bands.value.band(point.x); if (!band) return invalid('INTERNAL_INVARIANT', 'MISSING_CATEGORY_BAND', 'viewport.x');
      const category = band.start + (band.width - slotWidth) / 2, origin = Math.min(p0, p1), size = Math.abs(p1 - p0), key = columnKey(series.spec.id, point.id);
      const rect: ColumnRect<T> = Object.freeze({ key, point, series, seriesIndex: si, categoryIndex, eligibleIndex: rows[si]!.length,
        x: horizontal ? origin : category, y: horizontal ? category : origin, width: horizontal ? size : slotWidth, height: horizontal ? slotWidth : size,
        anchor: Object.freeze(horizontal ? { x: p1, y: category + slotWidth / 2 } : { x: category + slotWidth / 2, y: p1 }) });
      if (![rect.x, rect.y, rect.width, rect.height, rect.anchor.x, rect.anchor.y].every(Number.isFinite)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'stack.rect');
      rects.push(rect); rows[si]!.push(rect); byId.set(key, rect); byCategory[categoryIndex]!.set(si, rect);
    }
  }
  return ok(Object.freeze({ plot, horizontal, bands: bands.value, categoryOffset: scoped.value.offset, ranks: data.ranks, rects: Object.freeze(rects), rows: Object.freeze(rows.map(row => Object.freeze(row))), byId, byCategory: Object.freeze(byCategory), slotWidth, slotGap: 0, groupWidth: slotWidth, mapValue: values.value.map, stack: result.value }));
}
export function pickStacked<T>(projection: ColumnProjection<T>, x: number, y: number): ColumnRect<T> | null {
  const { plot, horizontal, bands, slotWidth } = projection;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < plot.x || x > plot.x + plot.width || y < plot.y || y > plot.y + plot.height || slotWidth <= 0) return null;
  const coordinate = horizontal ? y : x, band = bands.bandAt(coordinate); if (!band) return null;
  const start = band.start + (band.width - slotWidth) / 2;
  if (coordinate < start || coordinate > start + slotWidth) return null;
  let zero: ColumnRect<T> | null = null;
  for (const rect of projection.byCategory[band.index + projection.categoryOffset]!.values()) {
    const value = horizontal ? x : y, low = horizontal ? rect.x : rect.y, size = horizontal ? rect.width : rect.height;
    if (size > 0 && value >= low && value <= low + size) return rect;
    if (size === 0 && !zero && Math.abs(value - low) <= 2) zero = rect;
  }
  return zero;
}
