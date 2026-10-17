import type { ChartResult } from '../public/chart-types.js';
import type { PathCommand } from '../internal/geometry/path.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMetrics } from '../internal/layout/text.js';
import type { QuantitativeColorScale } from '../internal/color/scale.js';
import { labelIndices, layoutDataLabels } from '../internal/layout/data-labels.js';
import { insideLabelInk } from '../internal/layout/contrast.js';
import { dataLabelScene } from '../internal/chart/data-labels.js';
import { ok } from '../internal/diagnostics.js';
import type { HeatmapProjection } from './geometry.js';

export function heatmapScene<T>(projection: HeatmapProjection<T>, colors: QuantitativeColorScale, palette: Palette, font: ResolvedFont, layers: Layers, measure: (text: string) => TextMetrics): ChartResult<void> {
  const plot = projection.axes.plot;
  // One bounded hatch path covers the sparse background. Opaque observed
  // cells cover it, so absence never becomes a numeric zero/minimum color.
  const spacing = Math.max(8, (plot.width + plot.height) / 512), commands: PathCommand[] = [];
  for (let offset = -plot.height; offset <= plot.width; offset += spacing) commands.push({ kind: 'M', x: plot.x + offset, y: plot.y + plot.height }, { kind: 'L', x: plot.x + offset + plot.height, y: plot.y });
  layers.marks.push({ kind: 'path', key: 'heatmap-missing', commands, clipKey: 'plot', presentation: { stroke: { kind: 'solid', value: palette.axis }, strokeWidth: 1, strokeOpacity: .35, fill: { kind: 'none' } } });
  for (const target of projection.cells) layers.marks.push({ kind: 'rect', key: 'heatmap-cell:' + target.cell!.id, x: target.x, y: target.y, width: target.width, height: target.height, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: colors.color(target.cell!.value!) } } });
  if (projection.data.spec.labels !== 'auto') return ok(undefined);
  const candidates = labelIndices(projection.cells.length).map(index => {
    const target = projection.cells[index]!, color = insideLabelInk(colors.color(target.cell!.value!), palette.surface)!;
    return { key: target.cell!.id, text: String(target.cell!.value === 0 ? 0 : target.cell!.value), positions: (m: TextMetrics) => m.width + 6 <= target.width && m.height + 4 <= target.height ? [{ x: target.cx - m.width / 2, y: target.cy - m.height / 2, color }] : [] };
  });
  const labels = layoutDataLabels(candidates, plot, measure, () => false); if (labels.status === 'invalid') return labels;
  dataLabelScene(labels.value, font, layers); return ok(undefined);
}
