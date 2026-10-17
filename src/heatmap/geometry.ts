import type { ChartResult } from '../public/chart-types.js';
import type { HeatmapCell } from '../public/heatmap-types.js';
import type { AxesPlan, AxisInput } from '../internal/axes/plan.js';
import { createCategoryFrame, createBandScale, type BandScale } from '../internal/math/category.js';
import { ok } from '../internal/diagnostics.js';
import { coordinateKey, type HeatmapData } from './data.js';
export type HeatmapTarget<T> = Readonly<{ row: number; column: number; rowRank: number; columnRank: number; rowId: string; columnId: string; cell: HeatmapCell<T> | null; x: number; y: number; width: number; height: number; cx: number; cy: number }>;
export type HeatmapProjection<T> = Readonly<{
  data: HeatmapData<T>; axes: AxesPlan; rows: readonly string[]; columns: readonly string[]; rowRanks: ReadonlyMap<string, number>; columnRanks: ReadonlyMap<string, number>;
  cells: readonly HeatmapTarget<T>[]; byId: ReadonlyMap<string, HeatmapTarget<T>>; xScale: BandScale | null; yScale: BandScale | null;
  targetAt(row: number, column: number): HeatmapTarget<T> | null;
}>;
export function projectHeatmap<T>(data: HeatmapData<T>, axes: AxesPlan, scoped: Readonly<{ x: AxisInput; y: AxisInput }> = data.spec.axes): ChartResult<HeatmapProjection<T>> {
  const rows = Object.freeze((scoped.y.values ?? []).map(value => value.id)), columns = Object.freeze((scoped.x.values ?? []).map(value => value.id));
  const rowRanks = new Map(rows.map((id, i) => [id, i])), columnRanks = new Map(columns.map((id, i) => [id, i])), byId = new Map<string, HeatmapTarget<T>>(), cells: HeatmapTarget<T>[] = [];
  let xScale: BandScale | null = null, yScale: BandScale | null = null;
  if (!axes.tooSmall) {
    const plot = axes.plot, xf = createCategoryFrame(columns, scoped.x.reversed ? [plot.x + plot.width, plot.x] : [plot.x, plot.x + plot.width], .5), yf = createCategoryFrame(rows, scoped.y.reversed ? [plot.y + plot.height, plot.y] : [plot.y, plot.y + plot.height], .5);
    if (xf.status === 'invalid') return xf; if (yf.status === 'invalid') return yf;
    const x = createBandScale(xf.value, data.spec.gapRatio ?? .04), y = createBandScale(yf.value, data.spec.gapRatio ?? .04); if (x.status === 'invalid') return x; if (y.status === 'invalid') return y; xScale = x.value; yScale = y.value;
  }
  const targetAt = (row: number, column: number): HeatmapTarget<T> | null => {
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= rows.length || column < 0 || column >= columns.length || !xScale || !yScale) return null;
    const rowId = rows[row]!, columnId = columns[column]!, cell = data.cells.get(coordinateKey(rowId, columnId)) ?? null, known = cell ? byId.get(cell.id) : null; if (known) return known;
    const x = xScale.band(columnId)!, y = yScale.band(rowId)!;
    return Object.freeze({ row, column, rowRank: data.rows.get(rowId)!, columnRank: data.columns.get(columnId)!, rowId, columnId, cell, x: Math.min(x.start, x.end), y: Math.min(y.start, y.end), width: x.width, height: y.width, cx: x.center, cy: y.center });
  };
  // Only supplied visible cells get cached targets; arbitrary missing keyboard
  // coordinates never accumulate in a grid-sized cache.
  if (!axes.tooSmall) for (const cell of data.spec.data) {
    const row = rowRanks.get(cell.rowId), column = columnRanks.get(cell.columnId); if (row === undefined || column === undefined) continue;
    const target = targetAt(row, column)!; byId.set(cell.id, target); if (cell.value !== null) cells.push(target);
  }
  return ok(Object.freeze({ data, axes, rows, columns, rowRanks, columnRanks, cells: Object.freeze(cells), byId, xScale, yScale, targetAt }));
}
export function heatmapIdentity<T>(target: HeatmapTarget<T>): string { return target.cell ? 'd:' + target.cell.id.length + ':' + target.cell.id : 'm:' + coordinateKey(target.rowId, target.columnId); }
export function heatmapOrder<T>(projection: HeatmapProjection<T>, target: HeatmapTarget<T>): number { return target.rowRank * projection.data.columns.size + target.columnRank; }
export function firstHeatmapTarget<T>(projection: HeatmapProjection<T>): HeatmapTarget<T> | null { return projection.targetAt(projection.data.spec.axes.y.reversed ? projection.rows.length - 1 : 0, projection.data.spec.axes.x.reversed ? projection.columns.length - 1 : 0); }
export function reconcileHeatmap<T>(projection: HeatmapProjection<T>, identity: string | null, order: number): HeatmapTarget<T> | null {
  if (!identity) return firstHeatmapTarget(projection);
  if (identity.startsWith('d:')) { const separator = identity.indexOf(':', 2), id = identity.slice(separator + 1); if (separator > 2 && Number(identity.slice(2, separator)) === id.length) { const target = projection.byId.get(id); if (target) return target; } }
  if (identity.startsWith('m:')) try { const ids: unknown = JSON.parse(identity.slice(2)); if (Array.isArray(ids) && ids.length === 2) { const [rowId, columnId] = ids; if (typeof rowId === 'string' && typeof columnId === 'string') { const row = projection.rowRanks.get(rowId), column = projection.columnRanks.get(columnId); if (row !== undefined && column !== undefined) return projection.targetAt(row, column); } } } catch { /* Former coordinate no longer exists; use the retained logical order. */ }
  const width = projection.data.columns.size; if (!width || !projection.rows.length || !projection.columns.length) return null;
  const startRow = projection.data.rows.get(projection.rows[0]!)!, startColumn = projection.data.columns.get(projection.columns[0]!)!;
  return projection.targetAt(Math.max(0, Math.min(projection.rows.length - 1, Math.floor(order / width) - startRow)), Math.max(0, Math.min(projection.columns.length - 1, order % width - startColumn)));
}
export function pickHeatmap<T>(projection: HeatmapProjection<T>, x: number, y: number): HeatmapTarget<T> | null {
  const column = projection.xScale?.bandAt(x), row = projection.yScale?.bandAt(y); return !column || !row ? null : projection.targetAt(row.index, column.index);
}
export function navigateHeatmap<T>(projection: HeatmapProjection<T>, current: HeatmapTarget<T>, key: string, control: boolean): HeatmapTarget<T> | null {
  const rx = !!projection.data.spec.axes.x.reversed, ry = !!projection.data.spec.axes.y.reversed; let row = current.row, column = current.column;
  if (key === 'ArrowLeft') column += rx ? 1 : -1; else if (key === 'ArrowRight') column += rx ? -1 : 1;
  else if (key === 'ArrowUp') row += ry ? 1 : -1; else if (key === 'ArrowDown') row += ry ? -1 : 1;
  else if (key === 'Home' || key === 'End') { const first = key === 'Home'; column = first !== rx ? 0 : projection.columns.length - 1; if (control) row = first !== ry ? 0 : projection.rows.length - 1; }
  else return null;
  row = Math.max(0, Math.min(projection.rows.length - 1, row)); column = Math.max(0, Math.min(projection.columns.length - 1, column));
  return row === current.row && column === current.column ? current : projection.targetAt(row, column);
}
