import type { ChartResult } from '../public/chart-types.js';
import type { ScatterChartSpec, ScatterMarkerShape, ScatterSeries } from '../public/scatter-types.js';
import type { ScatterProjection, ScatterTarget, ScatterBounds } from './geometry.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMetrics } from '../internal/layout/text.js';
import { assignment } from '../internal/chart/presentation.js';
import { invalid, ok } from '../internal/diagnostics.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { markerContour } from './glyph.js';
const shapes: readonly ScatterMarkerShape[] = ['circle', 'square', 'diamond'];
export function scatterMarkerShape(series: ScatterSeries): ScatterMarkerShape { return series.marker?.shape ?? shapes[(['solid', 'dashed', 'dotted'] as const).indexOf(assignment(series.id).dash)]!; }
const overlaps = (a: ScatterBounds, b: ScatterBounds): boolean => a.x - 4 < b.x + b.width && a.x + a.width + 4 > b.x && a.y - 3 < b.y + b.height && a.y + a.height + 3 > b.y;
function marker<T>(target: ScatterTarget<T>, palette: Palette, layers: Layers, focus: boolean): void {
  const paint = assignment(target.series.spec.id), color = target.series.spec.color ?? palette.series[paint.colorIndex]!, shape = scatterMarkerShape(target.series.spec), radius = target.radius + (focus ? 3 : 0), presentation = { fill: focus ? { kind: 'none' as const } : { kind: 'solid' as const, value: color }, stroke: { kind: 'solid' as const, value: focus ? palette.focus : palette.surface }, strokeWidth: focus ? 2 : 1 }, common = { key: focus ? 'scatter-focus' : 'scatter-mark-' + target.series.index + '-' + target.index, clipKey: 'plot', presentation }, output = focus ? layers.interaction : layers.marks;
  if (shape === 'circle') output.push({ ...common, kind: 'circle', cx: target.x, cy: target.y, r: radius });
  else if (shape === 'square') output.push({ ...common, kind: 'rect', x: target.x - radius, y: target.y - radius, width: radius * 2, height: radius * 2 });
  else output.push({ ...common, kind: 'path', commands: markerContour(shape, target.x, target.y, radius) });
}
export function scatterScene<T>(projection: ScatterProjection<T>, spec: ScatterChartSpec<T>, palette: Palette, font: ResolvedFont, measure: (text: string) => TextMetrics, layers: Layers): ChartResult<void> {
  if (projection.targets.length <= 2000) for (const target of projection.targets) marker(target, palette, layers, false);
  else for (const series of projection.series) {
    const shape = scatterMarkerShape(series.series.spec), color = series.series.spec.color ?? palette.series[assignment(series.series.spec.id).colorIndex]!;
    // Exact glyph contours, at most 256 observations per path. Every paired
    // datum is drawn, including coincident ones; no sampling or Line geometry.
    // This bounds DOM size and WebKit teardown without changing the A writer.
    for (let start = 0; start < series.targets.length; start += 256) {
      const commands: PathCommand[] = [];
      for (let i = start; i < Math.min(series.targets.length, start + 256); i++) { const target = series.targets[i]!; commands.push(...markerContour(shape, target.x, target.y, target.radius)); }
      layers.marks.push({ kind: 'path', key: 'scatter-batch-' + series.series.index + '-' + start, commands, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: color }, stroke: { kind: 'solid', value: palette.surface }, strokeWidth: 1 } });
    }
  }
  if (spec.labels !== 'auto' || !projection.targets.length) return ok(undefined);
  // Labels are optional alternate presentation. Keep every raw observation and
  // marker; bounded candidates plus a spatial query avoid O(n²) point scans.
  const boxes: ScatterBounds[] = [], plot = projection.plot, limit = Math.min(200, projection.targets.length), step = Math.max(1, Math.ceil(projection.targets.length / limit));
  for (let index = 0; index < projection.targets.length; index += step) {
    const target = projection.targets[index]!, text = String(target.point.y), m = measure(text);
    if (![m.width, m.height, m.baseline].every(Number.isFinite) || m.width < 0 || m.height < 0) return invalid('INVALID_NUMBER', 'BAD_TEXT_MEASUREMENT', 'scatter.labels');
    const box = { x: target.x - m.width / 2, y: target.y - target.radius - m.height - 5, width: m.width, height: m.height };
    if (box.x < plot.x || box.y < plot.y || box.x + box.width > plot.x + plot.width || box.y + box.height > plot.y + plot.height || boxes.some(other => overlaps(box, other))) continue;
    // Expand by the maximum permitted marker radius and reject any competing
    // point, even when the label's own point is its closest neighbour.
    if (projection.spatial.intersects({ minX: box.x - 12, minY: box.y - 12, maxX: box.x + box.width + 12, maxY: box.y + box.height + 12 }, target)) continue;
    boxes.push(box); layers.labels.push({ kind: 'text', key: 'scatter-label-' + target.series.index + '-' + target.index, clipKey: 'plot', x: target.x, y: box.y + m.baseline, text, anchor: 'middle', baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight, presentation: { fill: { kind: 'solid', value: palette.text } } });
  }
  return ok(undefined);
}
export function scatterFocusScene<T>(_projection: ScatterProjection<T>, target: ScatterTarget<T>, palette: Palette, layers: Layers): void { marker(target, palette, layers, true); }
