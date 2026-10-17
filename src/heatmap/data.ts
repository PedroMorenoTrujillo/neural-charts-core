import type { HeatmapCell, HeatmapChartSpec } from '../public/heatmap-types.js';
import type { ParsedColorScale } from '../internal/color/scale.js';
export type HeatmapData<T> = Readonly<{
  spec: HeatmapChartSpec<T>; cells: ReadonlyMap<string, HeatmapCell<T>>; byId: ReadonlyMap<string, HeatmapCell<T>>;
  rows: ReadonlyMap<string, number>; columns: ReadonlyMap<string, number>; rowLabels: ReadonlyMap<string, string>; columnLabels: ReadonlyMap<string, string>;
  extent: readonly [number, number] | null; observedCount: number; parsedColor: ParsedColorScale | null;
}>;
/** Tuple encoding is injective for arbitrary allowed IDs, including colons,
 * quotes and Unicode; no string-delimiter ambiguity or object-key lookup. */
export function coordinateKey(rowId: string, columnId: string): string { return JSON.stringify([rowId, columnId]); }
function labels(values: readonly Readonly<{ id: string; label?: string }>[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>(); for (const value of values) { const name = value.label ?? value.id; counts.set(name, (counts.get(name) ?? 0) + 1); }
  return new Map(values.map(value => { const name = value.label ?? value.id; return [value.id, counts.get(name)! > 1 ? name + ' · ' + value.id : name]; }));
}
/** Requires a validated immutable snapshot. Storage is O(rows+columns+K),
 * never O(rows*columns); absent coordinates are resolved lazily by geometry. */
export function normalizeHeatmap<T>(spec: HeatmapChartSpec<T>, parsedColor: ParsedColorScale | null): HeatmapData<T> {
  const cells = new Map<string, HeatmapCell<T>>(), byId = new Map<string, HeatmapCell<T>>(); let minimum = Infinity, maximum = -Infinity, observedCount = 0;
  for (const cell of spec.data) {
    cells.set(coordinateKey(cell.rowId, cell.columnId), cell); byId.set(cell.id, cell);
    if (cell.value !== null) { minimum = Math.min(minimum, cell.value); maximum = Math.max(maximum, cell.value); observedCount++; }
  }
  return Object.freeze({ spec, cells, byId, rows: new Map(spec.axes.y.values.map((value, i) => [value.id, i])), columns: new Map(spec.axes.x.values.map((value, i) => [value.id, i])), rowLabels: labels(spec.axes.y.values), columnLabels: labels(spec.axes.x.values), extent: observedCount ? Object.freeze([minimum, maximum] as const) : null, observedCount, parsedColor });
}
