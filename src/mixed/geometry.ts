import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ChartCategoryWindow } from '../public/viewport-types.js';
import type { AxesPlan } from '../internal/axes/plan.js';
import type { MixedCategoryFrame } from './frame.js';
import type { MixedData } from './data.js';
import { projectLine, type LineProjection, type ProjectedPoint } from '../line/geometry.js';
import { buildHitIndex, pickPoint, type HitIndex, type HitTarget } from '../line/hit-index.js';
import { pointKey } from '../line/normalize.js';
import { projectColumn, pickColumn, type ColumnProjection } from '../column/geometry.js';
import { invalid, ok } from '../internal/diagnostics.js';
export type MixedProjection<T> = Readonly<{ plot: AxesPlan['plot']; line: LineProjection<T>; column: ColumnProjection<T> | null; index: HitIndex<T>; pointIndex: HitIndex<T>; areaIndex: HitIndex<T>; data: MixedData<T>; frame: MixedCategoryFrame | null }>;
export function projectMixed<T>(data: MixedData<T>, state: ChartState, axes: AxesPlan, frame: MixedCategoryFrame | null, window?: ChartCategoryWindow, columnOverride?: ColumnProjection<T>, preserveZero = false): ChartResult<MixedProjection<T>> {
  if (axes.tooSmall) { const line = { plot: axes.plot, series: [], mapX: axes.mapX, mapY: axes.mapY }, index = buildHitIndex<T>(line, () => 0); return ok({ plot: axes.plot, line, column: null, index, pointIndex: index, areaIndex: index, data, frame: null }); }
  if (!frame || !axes.y.domain) return invalid('INTERNAL_INVARIANT', 'MISSING_MIXED_FRAME', 'plot');
  const projected = projectLine(data.line, state, axes.plot, null, axes.y.domain, { mapX: axes.mapX, mapY: axes.mapY }); if (projected.status === 'invalid') return projected;
  const domain = axes.y.domain, columns = columnOverride ? ok(columnOverride) : projectColumn(data.column, state, axes.plot, domain, window, { bands: frame.bands, mapValue: value => axes.mapY(Math.max(domain[0], Math.min(domain[1], value))) }); if (columns.status === 'invalid') return columns;
  // One navigable index preserves the consumer's series order. Column anchors
  // are the actual grouped rectangles, not the common category center.
  const line = projected.value;
  const hitProjection: LineProjection<T> = { ...line, series: line.series.map(series => {
    if (data.kinds.get(series.series.spec.id) !== 'column') return series;
    const eligible: ProjectedPoint<T>[] = [];
    for (const point of series.points) { const rect = columns.value.byId.get(pointKey(series.series.spec.id, point.point.id)); if (rect) eligible.push(Object.freeze({ ...point, x: rect.anchor.x, y: rect.anchor.y }));
      else if(preserveZero&&point.point.y===0&&domain[0]<=0&&domain[1]>=0){const x=frame.points.center(String(point.point.x)),y=axes.mapY(0);if(x!==null&&y!==null)eligible.push(Object.freeze({...point,x,y}));}
    }
    return Object.freeze({ ...series, eligible: Object.freeze(eligible) });
  }) };
  const rank = (value: string | number) => data.line.ranks.get(String(value)) ?? 0, index = buildHitIndex(hitProjection, rank);
  const pointIndex = buildHitIndex({ ...line, series: line.series.filter(series => data.kinds.get(series.series.spec.id) === 'line') }, rank);
  const areaIndex = buildHitIndex({ ...line, series: line.series.filter(series => data.kinds.get(series.series.spec.id) === 'area') }, rank);
  return ok(Object.freeze({ plot: axes.plot, line, column: columns.value, index, pointIndex, areaIndex, data, frame }));
}
export function pickMixed<T>(p: MixedProjection<T>, x: number, y: number): HitTarget<T> | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Line paints above Column, which paints above Area. A covered Area anchor
  // cannot steal a click from the rectangle visibly under the pointer.
  const point = pickPoint(p.pointIndex, { x, y }, { x, y }, (x, y) => ({ x, y }));
  if (point) return p.index.byId.get(pointKey(point.series.series.spec.id, point.point.point.id)) ?? null;
  const rect = p.column ? pickColumn(p.column, x, y) : null; if (rect) return p.index.byId.get(rect.key) ?? null;
  const area = pickPoint(p.areaIndex, { x, y }, { x, y }, (x, y) => ({ x, y })); return area ? p.index.byId.get(pointKey(area.series.series.spec.id, area.point.point.id)) ?? null : null;
}
