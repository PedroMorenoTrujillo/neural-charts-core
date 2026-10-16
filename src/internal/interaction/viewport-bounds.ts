import type { ChartResult } from '../../public/chart-types.js';
import type { Domain } from '../math/domain.js';
import { ok } from '../diagnostics.js';
export type ViewportDomains = Readonly<{ x: Domain | null; y: Domain | null }>;
const cache = new WeakMap<object, ViewportDomains>();
/** Stable bounds across visibility changes include each constant-series
 * expansion. The normalized data owns its weak key; no opaque datum is cached.
 * Series count is contract-bounded; the passes run once per normalized input. */
export function fullViewportBounds(key: object, ids: readonly string[], compute: (hidden: readonly string[]) => ChartResult<ViewportDomains>): ChartResult<ViewportDomains> {
  const known = cache.get(key); if (known) return ok(known);
  const all = compute([]); if (all.status === 'invalid') return all; let bounds = all.value;
  const envelope = (a: Domain | null, b: Domain | null): Domain | null => !a ? b : !b ? a : Object.freeze([Math.min(a[0], b[0]), Math.max(a[1], b[1])] as const);
  for (const id of ids) {
    const single = compute(ids.filter(other => other !== id)); if (single.status === 'invalid') return single;
    bounds = Object.freeze({ x: envelope(bounds.x, single.value.x), y: envelope(bounds.y, single.value.y) });
  }
  cache.set(key, bounds); return ok(bounds);
}
