import type { ChartState, ChartResult } from '../public/chart-types.js';
import type { StackedAreaDescription } from '../public/stacked-area-types.js';
import { prepareViewport, type Viewport } from '../internal/interaction/viewport.js';
import { fullViewportBounds } from '../internal/interaction/viewport-bounds.js';
import { cartesianViewportContext } from '../internal/interaction/viewport-axes.js';
import { ok } from '../internal/diagnostics.js';
import { areaStack, stackAreaDomains, type StackedAreaData } from './data.js';
export function areaViewport<T>(data: StackedAreaData<T>, state: ChartState, previous: Viewport | null = null): ChartResult<Viewport | null> {
  if (!data.spec.viewport) return ok(null);
  const compute = (hiddenSeriesIds: readonly string[], includeIncomplete = false) => { const stack = areaStack(data, { hiddenSeriesIds }); return stack.status === 'invalid' ? stack : stackAreaDomains(data, stack.value, includeIncomplete); };
  const automatic = compute(state.hiddenSeriesIds); if (automatic.status === 'invalid') return automatic;
  // A currently incomplete row can become complete by hiding its missing
  // component. The allowed envelope must include those possible subtotals;
  // automatic displayed domains still use complete visible rows only.
  const bounds = fullViewportBounds(data, data.spec.series.map(series => series.id), hidden => compute(hidden, true)); if (bounds.status === 'invalid') return bounds;
  const context = cartesianViewportContext(data.spec.axes, bounds.value, automatic.value); return context.status === 'invalid' ? context : prepareViewport(data.spec.viewport, context.value, previous);
}
export function areaViewportDescription(description: StackedAreaDescription, viewport: Viewport | null): StackedAreaDescription {
  if (!viewport || !Object.keys(viewport.value).length) return description;
  const windows = (['x', 'y'] as const).flatMap(axis => {
    const value = viewport.value[axis];
    return !value ? [] : ['Applied ' + axis.toUpperCase() + ' viewport ' + (Array.isArray(value) ? value[0] + ' to ' + value[1] : 'firstId' in value ? value.firstId + ' through ' + value.lastId : '') + '.'];
  });
  return Object.freeze({ ...description, context: [description.context, ...windows, 'All original observations remain in the data table and CSV.'].join(' ') });
}
