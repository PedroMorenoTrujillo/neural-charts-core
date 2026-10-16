import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ScatterChartSpec, ScatterDescription } from '../public/scatter-types.js';
import type { NormalizedScatter } from './data.js';
import { scatterDomains } from './data.js';
import { ok } from '../internal/diagnostics.js';
import { fullViewportBounds } from '../internal/interaction/viewport-bounds.js';
import { cartesianViewportContext } from '../internal/interaction/viewport-axes.js';
import { prepareViewport, type Viewport } from '../internal/interaction/viewport.js';

export function scatterViewport<T>(data: NormalizedScatter<T, ScatterChartSpec<T>>, state: ChartState, previous: Viewport | null = null): ChartResult<Viewport | null> {
  if (!data.spec.viewport) return ok(null);
  const automatic = scatterDomains(data, state); if (automatic.status === 'invalid') return automatic;
  const bounds = fullViewportBounds(data, data.series.map(series => series.spec.id), hiddenSeriesIds => scatterDomains(data, { hiddenSeriesIds })); if (bounds.status === 'invalid') return bounds;
  const context = cartesianViewportContext(data.spec.axes, bounds.value, automatic.value); if (context.status === 'invalid') return context;
  return prepareViewport(data.spec.viewport, context.value, previous);
}
export function scatterViewportDescription(description: ScatterDescription, viewport: Viewport | null): ScatterDescription {
  if (!viewport || !Object.keys(viewport.value).length) return description;
  const windows = (['x', 'y'] as const).flatMap(axis => {
    const window = viewport.value[axis]; return window && Array.isArray(window) ? ['Applied ' + axis.toUpperCase() + ' viewport ' + window[0] + ' to ' + window[1] + '.'] : [];
  });
  return Object.freeze({ ...description, context: [description.context, ...windows, 'All original observations remain in the data table and CSV.'].join(' ') });
}
