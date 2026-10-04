import type { LinePoint } from '../public/line-types.js';
import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { Domain } from '../internal/math/domain.js';
import type { PathCommand } from '../internal/geometry/path.js';
import type { NormalizedLine, NormalizedSeries } from './normalize.js';
import { createCategoryFrame, createPointScale } from '../internal/math/category.js';
import { createLinearScale } from '../internal/math/linear.js';
import { createTimeScale } from '../internal/math/time.js';
import { invalid, ok } from '../internal/diagnostics.js';
import type { Plot } from '../internal/layout/frame.js';

export type { Plot } from '../internal/layout/frame.js';
export type ProjectedPoint<T> = Readonly<{ point: LinePoint<T>; x: number; y: number; index: number }>;
export type ProjectedSeries<T> = Readonly<{ series: NormalizedSeries<T>; points: readonly ProjectedPoint<T>[]; eligible: readonly ProjectedPoint<T>[]; markers: readonly ProjectedPoint<T>[]; commands: readonly PathCommand[] }>;
export type LineProjection<T> = Readonly<{ plot: Plot; series: readonly ProjectedSeries<T>[]; mapX(value: string | number): number | null; mapY(value: number): number | null }>;
export function runCommands<T>(runs: readonly (readonly ProjectedPoint<T>[])[], curve: 'straight' | 'step-before' | 'step-after' | 'step-mid'): readonly PathCommand[] {
  const commands: PathCommand[] = [];
  const line = (x: number, y: number): void => { commands.push(Object.freeze({ kind: 'L', x, y })); };
  for (const run of runs) {
    if (run.length < 2) continue;
    const first = run[0]!; commands.push(Object.freeze({ kind: 'M', x: first.x, y: first.y }));
    for (let i = 1; i < run.length; i++) {
      const p0 = run[i - 1]!, p1 = run[i]!;
      if (curve === 'step-before') line(p0.x, p1.y);
      else if (curve === 'step-after') line(p1.x, p0.y);
      else if (curve === 'step-mid') { const mid = p0.x / 2 + p1.x / 2; line(mid, p0.y); line(mid, p1.y); }
      line(p1.x, p1.y);
    }
  }
  return Object.freeze(commands);
}
export function projectLine<T>(data: NormalizedLine<T>, state: ChartState, plot: Plot, xDomain: Domain | null, yDomain: Domain, preparedScales?: Readonly<{ mapX(value: string | number): number | null; mapY(value: number): number | null }>): ChartResult<LineProjection<T>> {
  const xAxis = data.spec.axes.x, yAxis = data.spec.axes.y;
  const yScale = createLinearScale(yDomain, yAxis.reversed ? [plot.y, plot.y + plot.height] : [plot.y + plot.height, plot.y], false);
  if (yScale.status === 'invalid') return yScale;
  let mapX: (value: string | number) => number | null;
  if (xAxis.kind === 'category') {
    const frame = createCategoryFrame(xAxis.values.map(v => v.id), [plot.x, plot.x + plot.width], xAxis.edgeSpacing ?? .5);
    if (frame.status === 'invalid') return frame;
    const scale = createPointScale(frame.value);
    mapX = v => typeof v === 'string' ? scale.center(v) : null;
  } else {
    if (!xDomain) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'axes.x.domain');
    const scale = (xAxis.kind === 'time' ? createTimeScale : createLinearScale)(xDomain, [plot.x, plot.x + plot.width], false);
    if (scale.status === 'invalid') return scale;
    mapX = v => typeof v === 'number' ? scale.value.map(v) : null;
  }
  if (preparedScales) mapX = preparedScales.mapX;
  const mapY = preparedScales?.mapY ?? yScale.value.map;
  const hidden = new Set(state.hiddenSeriesIds), series: ProjectedSeries<T>[] = [];
  for (const s of data.series) if (!hidden.has(s.spec.id)) {
    const points: ProjectedPoint<T>[] = [], byId = new Map<string, ProjectedPoint<T>>();
    for (const point of s.valid) {
      const x = mapX(point.x), y = mapY(point.y!);
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', `series[${data.series.indexOf(s)}].data[${s.byId.get(point.id)}]`);
      const p = Object.freeze({ point, x, y, index: s.byId.get(point.id)! }); points.push(p); byId.set(point.id, p);
    }
    const eligible = Object.freeze(points.filter(p => p.x >= plot.x && p.x <= plot.x + plot.width && p.y >= plot.y && p.y <= plot.y + plot.height));
    const auto = eligible.length <= 200 && eligible.every((p, i) => i === 0 || p.x - eligible[i - 1]!.x >= 8);
    const markers = s.spec.markers === 'off' || s.spec.markers !== 'on' && !auto ? Object.freeze([]) : eligible;
    const runs = s.runs.map(run => run.map(p => byId.get(p.id)!));
    series.push(Object.freeze({ series: s, points: Object.freeze(points), eligible, markers, commands: runCommands(runs, s.spec.curve ?? 'straight') }));
  }
  return ok(Object.freeze({ plot, series: Object.freeze(series), mapX, mapY }));
}
