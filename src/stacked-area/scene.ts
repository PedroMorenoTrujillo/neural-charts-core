import type { Layers } from '../internal/axes/scene.js';
import type { Palette, Dash } from '../internal/chart/presentation.js';
import { lineScene } from '../line/scene.js';
import { seriesKey } from '../line/normalize.js';
import type { StackedAreaProjection } from './geometry.js';
export function stackedAreaScene<T>(projection: StackedAreaProjection<T>, palette: Palette, layers: Layers, dashes: ReadonlyMap<string, Dash>): void {
  for (const item of projection.series) {
    const commands = projection.fills.get(item.series.spec.id);
    if (commands?.length) layers.marks.push({ kind: 'path', key: seriesKey(item.series.spec.id) + '|stacked-area', commands, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: item.series.spec.color ?? palette.series[item.series.colorIndex]! }, fillOpacity: .55, stroke: { kind: 'none' } } });
  }
  lineScene(projection, palette, layers, dashes);
}
