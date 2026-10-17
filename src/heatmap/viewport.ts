import type { ChartResult } from '../public/chart-types.js';
import type { HeatmapData } from './data.js';
import { cartesianViewportContext } from '../internal/interaction/viewport-axes.js';
import { prepareViewport, type Viewport } from '../internal/interaction/viewport.js';
import { ok } from '../internal/diagnostics.js';
export function heatmapViewport<T>(data: HeatmapData<T>, previous: Viewport | null = null): ChartResult<Viewport | null> {
  if (!data.spec.viewport) return ok(null);
  const context = cartesianViewportContext(data.spec.axes, { x: null, y: null });
  return context.status === 'invalid' ? context : prepareViewport(data.spec.viewport, context.value, previous);
}
