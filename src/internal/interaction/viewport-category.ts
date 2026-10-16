import type { ChartCategoryWindow } from '../../public/viewport-types.js';
import type { Viewport } from './viewport.js';
type Axis = 'x' | 'y';
function range(viewport: Viewport, axis: Axis): Readonly<{ ids: readonly string[]; first: number; count: number }> | null {
  const bounds = viewport.context[axis], window = viewport.resolved[axis]; if (bounds.kind !== 'category' || !window || !('firstId' in window)) return null;
  const first = bounds.ranks.get(window.firstId), last = bounds.ranks.get(window.lastId);
  return first === undefined || last === undefined ? null : { ids: bounds.ids, first, count: last - first + 1 };
}
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
/** Inverse of the existing category-center spacing, not an invented index
 * scale. Numeric axes pass through; one-category views have one logical slot. */
export function categoryZoomAnchor(viewport: Viewport, axis: Axis, fraction: number, spacing = .5): number {
  const current = range(viewport, axis); if (!current) return fraction;
  return current.count <= 1 ? .5 : clamp((fraction * (current.count - 1 + 2 * spacing) - spacing) / (current.count - 1), 0, 1);
}
export function categoryPanFraction(viewport: Viewport, axis: Axis, fraction: number, spacing = .5): number {
  const current = range(viewport, axis); return !current ? fraction : fraction * (current.count <= 1 ? 1 : current.count - 1 + 2 * spacing) / current.count;
}
export function categoryBoxWindow(viewport: Viewport, axis: Axis, low: number, high: number, spacing = .5): ChartCategoryWindow | null {
  const current = range(viewport, axis); if (!current) return null;
  const index = (fraction: number): number => current.first + clamp(Math.round(fraction * (current.count - 1 + 2 * spacing) - spacing), 0, current.count - 1);
  return Object.freeze({ firstId: current.ids[index(low)]!, lastId: current.ids[index(high)]! });
}
