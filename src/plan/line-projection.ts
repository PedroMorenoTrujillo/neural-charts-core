import type {ChartResult, ChartState} from '../public/chart-types.js';
import type {Domain} from '../internal/math/domain.js';
import type {PathCommand} from '../internal/geometry/path.js';
import type {Plot} from '../internal/layout/frame.js';
import type {NormalizedLine} from '../line/normalize.js';
import {projectLine, appendLineSegment, type LineProjection, type ProjectedSeries, type ProjectedPoint} from '../line/geometry.js';
import {invalid, ok} from '../internal/diagnostics.js';

export type PlanLineProjection<T> = Pick<LineProjection<T>, 'plot' | 'mapX' | 'mapY'> & Readonly<{
  series: readonly Pick<ProjectedSeries<T>, 'series' | 'eligible' | 'commands'>[];
}>;

/** Line's plan boundary needs projected objects only for visible observations.
 * Stream every path vertex through the existing scales/segment writer, without
 * the per-series ID Map, full wrapper array and remapped run arrays. Offscreen
 * coordinates remain validated and commands remain exact, including the full
 * dash phase and neighbours across plot edges. Spline/Area retain their richer
 * legacy projection because their interpolation/closures need it. */
export function projectPlanLine<T>(data: NormalizedLine<T>, state: ChartState, plot: Plot, xDomain: Domain | null, yDomain: Domain,
  preparedScales?: Parameters<typeof projectLine<T>>[5]): ChartResult<PlanLineProjection<T>> {
  if (data.nonnullCount <= 2048) return projectLine(data, state, plot, xDomain, yDomain, preparedScales);
  const scaled = projectLine({...data, series: []}, state, plot, xDomain, yDomain, preparedScales);
  if (scaled.status === 'invalid') return scaled;
  const {mapX, mapY} = scaled.value, hidden = new Set(state.hiddenSeriesIds);
  const series: Pick<ProjectedSeries<T>, 'series' | 'eligible' | 'commands'>[] = [];
  for (let i = 0; i < data.series.length; i++) {
    const source = data.series[i]!; if (hidden.has(source.spec.id)) continue;
    const eligible: ProjectedPoint<T>[] = [], commands: PathCommand[] = [], curve = source.spec.curve ?? 'straight';
    for (const run of source.runs) {
      let previousX = 0, previousY = 0;
      for (let j = 0; j < run.length; j++) {
        const point = run[j]!, x = mapX(point.x), y = mapY(point.y!);
        if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', `series[${i}].data[${source.byId.get(point.id)}]`);
        if (x >= plot.x && x <= plot.x + plot.width && y >= plot.y && y <= plot.y + plot.height)
          eligible.push({point, x, y, index: source.byId.get(point.id)!});
        if (run.length > 1) {
          if (j === 0) commands.push(Object.freeze({type: 'M', x, y}));
          else appendLineSegment(commands, previousX, previousY, x, y, curve);
        }
        previousX = x; previousY = y;
      }
    }
    series.push({series: source, eligible, commands});
  }
  return ok({plot, series, mapX, mapY});
}
