import type { ChartState } from '../public/chart-types.js';
import type { MixedChartSpec, MixedSeries } from '../public/mixed-types.js';
import type { LineChartSpec, LinePoint } from '../public/line-types.js';
import type { ColumnChartSpec } from '../public/column-types.js';
import { normalizeLine, lineDomains } from '../line/normalize.js';
import { normalizeColumn } from '../column/normalize.js';
export function normalizeMixed<T>(spec: MixedChartSpec<T>) {
  const baseline = spec.series.some(series => series.type !== 'line');
  const { includeZero: _zero, ...y } = spec.axes.y;
  const lineSpec: LineChartSpec<T> = { family: 'line', title: spec.title, axes: { x: spec.axes.x, y: { ...y, ...(y.domain ? {} : { includeZero: baseline || (spec.axes.y.includeZero ?? false) }) } }, series: spec.series.map(({ type: _kind, ...series }) => series) };
  const columnSpec: ColumnChartSpec<T> = { family: 'column', title: spec.title, axes: { x: spec.axes.x, y }, series: spec.series.filter((series): series is Extract<MixedSeries<T>, { type: 'column' }> => series.type === 'column').map(({ type: _kind, ...series }) => series), ...(spec.groupGap === undefined ? {} : { groupGap: spec.groupGap }), ...(spec.barGap === undefined ? {} : { barGap: spec.barGap }), ...(spec.maxBarWidth === undefined ? {} : { maxBarWidth: spec.maxBarWidth }) };
  const normalized = normalizeLine(lineSpec), column = normalizeColumn(columnSpec);
  const line = Object.freeze({ ...normalized, series: Object.freeze(normalized.series.map(series => {
    if (series.spec.gaps === 'connect') return series;
    const runs: (readonly LinePoint<T>[])[] = [];
    for (const existing of series.runs) { let run: LinePoint<T>[] = []; for (const point of existing) { const previous = run[run.length - 1]; if (previous && normalized.ranks.get(String(point.x))! - normalized.ranks.get(String(previous.x))! > 1) { runs.push(Object.freeze(run)); run = []; } run.push(point); } if (run.length) runs.push(Object.freeze(run)); }
    return Object.freeze({ ...series, runs: Object.freeze(runs) });
  })) });
  return Object.freeze({ spec, line, column, kinds: new Map(spec.series.map(series => [series.id, series.type])) });
}
export type MixedData<T> = ReturnType<typeof normalizeMixed<T>>;
export function mixedDomains<T>(data: MixedData<T>, state: ChartState) { return lineDomains(data.line, state); }
