import type { ChartResult } from '../public/chart-types.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, Dash } from '../internal/chart/presentation.js';
import type { MixedProjection } from './geometry.js';
import { areaScene } from '../area/scene.js';
import { columnScene } from '../column/scene.js';
import { lineScene } from '../line/scene.js';
import { ok } from '../internal/diagnostics.js';
export function mixedScene<T>(p: MixedProjection<T>, palette: Palette, layers: Layers, dashes: ReadonlyMap<string, Dash>): ChartResult<void> {
  const select = (type: 'line' | 'area') => ({ ...p.line, series: p.line.series.filter(series => p.data.kinds.get(series.series.spec.id) === type) });
  const area = select('area'); if (area.series.length) { const result = areaScene(area, palette, layers, dashes); if (result.status === 'invalid') return result; }
  if (p.column) columnScene(p.column, palette, layers);
  lineScene(select('line'), palette, layers, dashes); return ok(undefined);
}
