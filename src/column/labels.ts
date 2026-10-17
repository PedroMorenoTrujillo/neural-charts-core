import type { ColumnProjection, ColumnRect } from './geometry.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMetrics } from '../internal/layout/text.js';
import { labelIndices, layoutDataLabels, type DataLabelCandidate, type LabelPosition } from '../internal/layout/data-labels.js';
import { labelObstacles } from '../internal/layout/label-obstacles.js';
import { labelPaint } from '../internal/layout/label-paint.js';
import { dataLabelScene } from '../internal/chart/data-labels.js';
import { insideLabelInk } from '../internal/layout/contrast.js';
import { ok } from '../internal/diagnostics.js';
export function columnDataLabels<T>(projection: ColumnProjection<T>, palette: Palette, font: ResolvedFont, layers: Layers, measure: (text: string) => TextMetrics, rtl = false, value: (target: ColumnRect<T>) => string | null = target => String(target.point.y === 0 ? 0 : target.point.y)): ChartResult<void> {
  const candidates: DataLabelCandidate[] = [];
  for (const index of labelIndices(projection.rects.length)) {
    const rect = projection.rects[index]!; if (rect.point.y === null) continue;
    const text = value(rect); if (text === null) continue;
    const color = rect.series.spec.color ?? palette.series[rect.series.colorIndex]!, ink = insideLabelInk(color, palette.surface);
    candidates.push({ key: rect.key, text, positions(m) {
      const positions: LabelPosition[] = [];
      if (ink && rect.width >= m.width + 8 && rect.height >= m.height + 8) {
        const center = { x: rect.x + (rect.width - m.width) / 2, y: rect.y + (rect.height - m.height) / 2, color: ink };
        positions.push(center);
        if (projection.horizontal) {
          const left = rect.anchor.x <= rect.x + .001;
          positions.push({ ...center, x: left ? rect.x + 4 : rect.x + rect.width - m.width - 4 }, { ...center, x: left ? rect.x + rect.width - m.width - 4 : rect.x + 4 });
        } else {
          const top = rect.anchor.y <= rect.y + .001;
          positions.push({ ...center, y: top ? rect.y + 4 : rect.y + rect.height - m.height - 4 }, { ...center, y: top ? rect.y + rect.height - m.height - 4 : rect.y + 4 });
        }
      }
      if (projection.horizontal) {
        const left = rect.anchor.x <= rect.x + .001;
        positions.push({ x: left ? rect.anchor.x - m.width - 5 : rect.anchor.x + 5, y: rect.anchor.y - m.height / 2, color: palette.text });
        if (!rect.width) positions.push({ x: rect.anchor.x + 5, y: rect.anchor.y - m.height / 2, color: palette.text });
      } else {
        const top = rect.anchor.y <= rect.y + .001;
        positions.push({ x: rect.anchor.x - m.width / 2, y: top ? rect.anchor.y - m.height - 5 : rect.anchor.y + 5, color: palette.text });
        if (!rect.height) positions.push({ x: rect.anchor.x - m.width / 2, y: rect.anchor.y + 5, color: palette.text });
      }
      return positions;
    } });
  }
  const result = layoutDataLabels(candidates, projection.plot, measure, labelObstacles(labelPaint([...layers.marks, ...layers['reference-lines'], ...layers.labels], measure, rtl), projection.horizontal));
  if (result.status === 'invalid') return result; dataLabelScene(result.value, font, layers); return ok(undefined);
}
