import type { ChartResult } from '../../public/chart-types.js';
import type { ChartAxisWindow, ChartNumericWindow } from '../../public/viewport-types.js';
import type { Domain } from '../math/domain.js';
import type { AxesPlan, AxisInput } from '../axes/plan.js';
import { invalid, ok } from '../diagnostics.js';
import { categoryViewportAxis, numericViewportAxis, type ViewportContext, type Viewport } from './viewport.js';

type CategoryAxis = Readonly<{ kind: 'category'; values: readonly Readonly<{ id: string; label?: string }>[]; edgeSpacing?: number }>;
type NumericAxis = Readonly<{ kind: 'linear' | 'time'; domain?: Domain; nice?: boolean; includeZero?: boolean }>;
type Axis = CategoryAxis | NumericAxis;
type CartesianAxes = Readonly<{ x: AxisInput; y: AxisInput }>;
const numeric = (value: ChartAxisWindow): value is ChartNumericWindow => Array.isArray(value);
export function cartesianViewportContext(axes: Readonly<{ x: Axis; y: NumericAxis }>, domains: Readonly<{ x: Domain | null; y: Domain | null }>, automatic = domains): ChartResult<ViewportContext> {
  const x = axes.x.kind === 'category' ? categoryViewportAxis(axes.x.values.map(value => value.id)) : numericViewportAxis(axes.x.kind, domains.x, automatic.x);
  if (x.status === 'invalid') return x;
  const y = numericViewportAxis(axes.y.kind, domains.y, automatic.y); if (y.status === 'invalid') return y;
  return ok(Object.freeze({ x: x.value, y: y.value }));
}
export function withViewportDomains(domains: Readonly<{ x: Domain | null; y: Domain | null }>, viewport: Viewport | null): Readonly<{ x: Domain | null; y: Domain | null }> {
  const x = viewport?.value.x, y = viewport?.value.y;
  if (!x && !y) return domains;
  return Object.freeze({ x: x && numeric(x) ? x : domains.x, y: y && numeric(y) ? y : domains.y });
}
/** Raw observations and their identity indexes are untouched. Only axis input
 * is scoped; a separate map extends category positions for Line edge segments. */
export function withViewportAxes(axes: CartesianAxes, viewport: Viewport | null): ChartResult<CartesianAxes> {
  if (!viewport) return ok(axes);
  let x = axes.x, y = axes.y;
  const xWindow = viewport.value.x, yWindow = viewport.value.y;
  if (xWindow) {
    if (numeric(xWindow)) {
      if (x.kind === 'category') return invalid('INVALID_CONFIG', 'BAD_VIEWPORT_AXIS', 'viewport.x');
      x = Object.freeze({ ...x, domain: xWindow, nice: false });
    } else {
      const bounds = viewport.context.x;
      if (x.kind !== 'category' || bounds.kind !== 'category') return invalid('INVALID_CONFIG', 'BAD_VIEWPORT_AXIS', 'viewport.x');
      const first = bounds.ranks.get(xWindow.firstId), last = bounds.ranks.get(xWindow.lastId);
      if (first === undefined || last === undefined || first > last) return invalid('INVALID_CONFIG', 'BAD_CATEGORY_WINDOW', 'viewport.x');
      if (!x.values) return invalid('INVALID_CONFIG', 'BAD_VIEWPORT_AXIS', 'viewport.x');
      x = Object.freeze({ ...x, values: Object.freeze(x.values.slice(first, last + 1)) });
    }
  }
  if (yWindow) {
    if (!numeric(yWindow)) return invalid('INVALID_CONFIG', 'BAD_VIEWPORT_AXIS', 'viewport.y');
    y = Object.freeze({ ...y, domain: yWindow, nice: false, includeZero: false });
  }
  return ok(Object.freeze({ x, y }));
}
export function extendLineViewportMap(plan: AxesPlan, viewport: Viewport | null): ChartResult<AxesPlan> {
  const window = viewport?.value.x, bounds = viewport?.context.x;
  if (!window || numeric(window) || bounds?.kind !== 'category' || plan.tooSmall) return ok(plan);
  const first = bounds.ranks.get(window.firstId), last = bounds.ranks.get(window.lastId), start = plan.mapX(window.firstId), end = plan.mapX(window.lastId);
  if (first === undefined || last === undefined || start === null || end === null) return invalid('INVALID_DOMAIN', 'BAD_VIEWPORT_AXIS', 'viewport.x');
  const step = last === first ? plan.plot.width : (end - start) / (last - first);
  return ok(Object.freeze({ ...plan, mapX(value: string | number): number | null {
    if (typeof value !== 'string') return null;
    const rank = bounds.ranks.get(value); if (rank === undefined) return null;
    const position = start + (rank - first) * step; return Number.isFinite(position) ? position : null;
  } }));
}
