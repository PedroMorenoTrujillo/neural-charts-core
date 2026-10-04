import type { LineProjection } from './geometry.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette } from '../internal/chart/presentation.js';
import { dashPattern } from '../internal/chart/presentation.js';
import { pointKey, seriesKey } from './normalize.js';

export function lineScene<T>(projection: LineProjection<T>, palette: Palette, layers: Layers): void {
  for (const s of projection.series) if (s.commands.length) {
    const color = s.series.spec.color ?? palette.series[s.series.colorIndex]!;
    layers.marks.push({ kind: 'path', key: seriesKey(s.series.spec.id), commands: s.commands, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: color }, strokeWidth: 2, dash: dashPattern(s.series.dash), lineCap: s.series.dash === 'dotted' ? 'round' : 'butt', lineJoin: 'round' } });
  }
  for (const s of projection.series) for (const p of s.markers) layers.marks.push({ kind: 'circle', key: pointKey(s.series.spec.id, p.point.id), cx: p.x, cy: p.y, r: 3, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: s.series.spec.color ?? palette.series[s.series.colorIndex]! }, stroke: { kind: 'solid', value: palette.surface }, strokeWidth: 1 } });
}
