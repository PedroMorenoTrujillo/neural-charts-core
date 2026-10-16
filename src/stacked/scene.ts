import type { ColumnProjection } from '../column/geometry.js';
import type { Palette } from '../internal/chart/presentation.js';
import type { Layers } from '../internal/axes/scene.js';
export function stackedScene<T>(projection: ColumnProjection<T>, palette: Palette, layers: Layers): void {
  for (const rect of projection.rects) layers.marks.push({ kind: 'rect', key: rect.key, x: rect.x, y: rect.y, width: rect.width, height: rect.height, clipKey: 'plot', presentation: {
    fill: { kind: 'solid', value: rect.series.spec.color ?? palette.series[rect.series.colorIndex]! },
    ...(projection.slotWidth >= 3 ? { stroke: { kind: 'solid' as const, value: palette.surface }, strokeWidth: .75 } : {}),
  } });
}
