import type { LineProjection } from './geometry.js';
import { pointKey } from './normalize.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMetrics } from '../internal/layout/text.js';
import { labelIndices, layoutDataLabels, pointLabelPositions, type DataLabelCandidate } from '../internal/layout/data-labels.js';
import { labelObstacles } from '../internal/layout/label-obstacles.js';
import { labelPaint } from '../internal/layout/label-paint.js';
import { dataLabelScene } from '../internal/chart/data-labels.js';
import { ok } from '../internal/diagnostics.js';
export function lineDataLabels<T>(projection: LineProjection<T>, palette: Palette, font: ResolvedFont, layers: Layers, measure: (text: string) => TextMetrics, rtl = false): ChartResult<void> {
  const obstacles = labelPaint([...layers.marks, ...layers['reference-lines'], ...layers.labels], measure, rtl);
  // An arbitrary number of overlapping area fills can otherwise erase text
  // contrast even when each individual fill is translucent.
  const background = layers.marks.some(item => item.kind === 'path' && item.presentation?.fill && item.presentation.fill.kind !== 'none') ? palette.surface : undefined;
  const indices = labelIndices(projection.series.reduce((n, series) => n + series.eligible.length, 0)), candidates: DataLabelCandidate[] = [];
  let offset = 0, cursor = 0;
  for (const series of projection.series) {
    while (cursor < indices.length && indices[cursor]! < offset + series.eligible.length) {
      const point = series.eligible[indices[cursor++]! - offset]!;
      if (point.point.y === null) continue;
      candidates.push({ key: pointKey(series.series.spec.id, point.point.id), text: String(point.point.y === 0 ? 0 : point.point.y), positions: m => pointLabelPositions(point.x, point.y, projection.plot, m, palette.text, 8, background) });
    }
    offset += series.eligible.length;
  }
  const result = layoutDataLabels(candidates, projection.plot, measure, labelObstacles(obstacles));
  if (result.status === 'invalid') return result; dataLabelScene(result.value, font, layers); return ok(undefined);
}
