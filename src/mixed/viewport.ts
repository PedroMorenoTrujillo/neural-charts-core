import type { ChartState } from '../public/chart-types.js';
import { prepareViewport, type Viewport } from '../internal/interaction/viewport.js';
import { fullViewportBounds } from '../internal/interaction/viewport-bounds.js';
import { cartesianViewportContext } from '../internal/interaction/viewport-axes.js';
import { ok } from '../internal/diagnostics.js';
import { mixedDomains, type MixedData } from './data.js';
export function mixedViewport<T>(data: MixedData<T>, state: ChartState, previous: Viewport | null = null) {
  if (!data.spec.viewport) return ok(null);
  const automatic = mixedDomains(data, state); if (automatic.status === 'invalid') return automatic;
  const bounds = fullViewportBounds(data, data.spec.series.map(series => series.id), hiddenSeriesIds => mixedDomains(data, { hiddenSeriesIds })); if (bounds.status === 'invalid') return bounds;
  const context = cartesianViewportContext(data.spec.axes, bounds.value, automatic.value); return context.status === 'invalid' ? context : prepareViewport(data.spec.viewport, context.value, previous);
}
