import type { LineProjection } from '../line/geometry.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, Dash } from '../internal/chart/presentation.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { MAX_PATH_COMMANDS } from '../internal/geometry/path.js';
import { ok } from '../internal/diagnostics.js';
import { lineScene } from '../line/scene.js';
import { visibleSplineCommands } from './interpolate.js';

export function splineScene<T>(projection: LineProjection<T>, palette: Palette, layers: Layers, dashes: ReadonlyMap<string, Dash>): ChartResult<void> {
  const series = []; let budget = MAX_PATH_COMMANDS;
  for (const item of projection.series) {
    const byId = new Map(item.points.map(point => [point.point.id, point]));
    const commands: PathCommand[] = [];
    for (const run of item.series.runs) {
      if (run.length < 2) continue;
      const parameters = typeof run[0]!.x === 'number' ? run.map(point => point.x as number) : undefined;
      const flattened = visibleSplineCommands(run.map(point => byId.get(point.id)!), projection.plot.x, projection.plot.x + projection.plot.width, budget, parameters);
      if (flattened.status === 'invalid') return flattened;
      budget -= flattened.value.length;
      for (const command of flattened.value) commands.push(command);
    }
    series.push(Object.freeze({ ...item, commands: Object.freeze(commands) }));
  }
  lineScene(Object.freeze({ ...projection, series: Object.freeze(series) }), palette, layers, dashes);
  return ok(undefined);
}
