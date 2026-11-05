import type { LineProjection } from '../line/geometry.js';
import { runCommands } from '../line/geometry.js';
import { lineScene } from '../line/scene.js';
import { seriesKey } from '../line/normalize.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, Dash } from '../internal/chart/presentation.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { MAX_PATH_COMMANDS } from '../internal/geometry/path.js';
import { invalid, ok } from '../internal/diagnostics.js';

export function areaScene<T>(projection: LineProjection<T>, palette: Palette, layers: Layers, dashes: ReadonlyMap<string, Dash>): ChartResult<void> {
  const zero = projection.mapY(0);
  if (zero === null || !Number.isFinite(zero)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'area.baseline');
  const baseline = Math.max(projection.plot.y, Math.min(projection.plot.y + projection.plot.height, zero));
  let budget = MAX_PATH_COMMANDS;
  for (const item of projection.series) {
    const byId = new Map(item.points.map(point => [point.point.id, point]));
    for (let i = 0; i < item.series.runs.length; i++) {
      const run = item.series.runs[i]!;
      if (run.length < 2) continue;
      const points = run.map(point => byId.get(point.id)!), commands: PathCommand[] = [];
      const top = runCommands([points], item.series.spec.curve ?? 'straight');
      if (top.length + 3 > budget) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'area.commands');
      for (const command of top) commands.push(command);
      commands.push({ type: 'L', x: points[points.length - 1]!.x, y: baseline }, { type: 'L', x: points[0]!.x, y: baseline }, { type: 'Z' });
      budget -= commands.length;
      layers.marks.push({ type: 'path', key: seriesKey(item.series.spec.id) + '|area:' + i, commands: Object.freeze(commands.map(command => Object.freeze(command))), clipKey: 'plot', presentation: { fill: { type: 'solid', value: item.series.spec.color ?? palette.series[item.series.colorIndex]! }, fillOpacity: .18, stroke: { type: 'none' } } });
    }
  }
  lineScene(projection, palette, layers, dashes);
  return ok(undefined);
}
