import type { ChartResult } from '../../public/chart-types.js';
import type { ChartCategoryWindow } from '../../public/viewport-types.js';
import { invalid, ok } from '../diagnostics.js';
/** Scope a band frame while retaining the original logical category offset. */
export function viewportBand(ids: readonly string[], ranks: ReadonlyMap<string, number>, window?: ChartCategoryWindow): ChartResult<Readonly<{ ids: readonly string[]; offset: number }>> {
  if (!window) return ok(Object.freeze({ ids, offset: 0 }));
  const first = ranks.get(window.firstId), last = ranks.get(window.lastId);
  if (first === undefined || last === undefined || first > last || ids[first] !== window.firstId || ids[last] !== window.lastId) return invalid('INVALID_CONFIG', 'BAD_CATEGORY_WINDOW', 'viewport.x');
  return ok(Object.freeze({ ids: Object.freeze(ids.slice(first, last + 1)), offset: first }));
}
