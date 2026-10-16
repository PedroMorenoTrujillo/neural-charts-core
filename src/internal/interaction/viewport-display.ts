import type { ChartResult } from '../../public/chart-types.js';
import type { ChartAxisWindow, ChartNumericWindow } from '../../public/viewport-types.js';
import type { Domain } from '../math/domain.js';
import { createLinearScale } from '../math/linear.js';
import { invalid } from '../diagnostics.js';
import { zoomViewport, panViewport, requestViewport, type Viewport } from './viewport.js';

export type ViewportDomains = Readonly<{ x: Domain | null; y: Domain | null }>;
const keys = ['x', 'y'] as const;
/** Gesture coordinates come from the displayed (possibly nice-expanded) axes.
 * This temporary model is never applied and never changes the allowed bounds. */
function displayed(current: Viewport, domains: ViewportDomains): Viewport {
  const context = { ...current.context }, resolved = { ...current.resolved };
  for (const key of keys) {
    const axis = context[key], domain = domains[key]; if (axis.kind === 'category' || !axis.domain || !domain) continue;
    context[key] = { ...axis, domain: [Math.min(axis.domain[0], domain[0]), Math.max(axis.domain[1], domain[1])], automatic: domain }; resolved[key] = domain;
  }
  return { ...current, context, resolved };
}
function fit(current: Viewport, proposal: ChartResult<Viewport>, preserveSpan: boolean): ChartResult<Viewport> {
  if (proposal.status === 'invalid') return proposal;
  const value: { x?: ChartAxisWindow; y?: ChartAxisWindow } = { ...proposal.value.value };
  for (const key of keys) {
    const axis = current.context[key], window = value[key]; if (axis.kind === 'category' || !axis.domain || !Array.isArray(window)) continue;
    let [low, high] = window as ChartNumericWindow; const bounds = axis.domain;
    if (preserveSpan && (low < bounds[0] || high > bounds[1])) {
      const scale = createLinearScale([low, high], [0, 1], false); if (scale.status === 'invalid') return scale;
      if (low < bounds[0]) { const start = scale.value.map(bounds[0]); low = bounds[0]; high = start === null ? bounds[1] : scale.value.invert(start + 1) ?? bounds[1]; }
      if (high > bounds[1]) { const end = scale.value.map(bounds[1]); high = bounds[1]; low = end === null ? bounds[0] : scale.value.invert(end - 1) ?? bounds[0]; }
    }
    low = Math.max(bounds[0], low); high = Math.min(bounds[1], high);
    if (axis.kind === 'time') { low = Math.max(bounds[0], Math.floor(low)); high = Math.min(bounds[1], Math.ceil(high)); }
    if (!(low < high)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_VIEWPORT', 'viewport.' + key);
    value[key] = [low, high];
  }
  return requestViewport(current, value);
}
export function zoomDisplayedViewport(current: Viewport, domains: ViewportDomains, factor: number, anchors: Readonly<{ x?: number; y?: number }> = {}): ChartResult<Viewport> { return fit(current, zoomViewport(displayed(current, domains), factor, anchors), false); }
export function panDisplayedViewport(current: Viewport, domains: ViewportDomains, delta: Readonly<{ x?: number; y?: number }>): ChartResult<Viewport> { return fit(current, panViewport(displayed(current, domains), delta), true); }
