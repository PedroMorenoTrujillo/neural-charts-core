import type { SeriesPointId, SlicePointId } from '../../public/interaction-types.js';
import { selectionIndex } from './selection.js';
/** Raw validated identities, including hidden data; missing values cannot be
 * selected. A zero is observed data. No DOM node/index is a business key. */
export function seriesIdentities(spec: Readonly<{ series: readonly Readonly<{ id: string; data: readonly Readonly<{ id: string; x: number | string | null; y: number | null }>[] }>[] }>): ReadonlyMap<string, SeriesPointId> {
  function* ids(): Generator<SeriesPointId> { for (const series of spec.series) for (const point of series.data) if (point.x !== null && point.y !== null) yield { seriesId: series.id, pointId: point.id }; }
  return selectionIndex(ids());
}
export function sliceIdentities(spec: Readonly<{ data: readonly Readonly<{ id: string; value: number | null }>[] }>): ReadonlyMap<string, SlicePointId> {
  function* ids(): Generator<SlicePointId> { for (const point of spec.data) if (point.value !== null) yield { pointId: point.id }; }
  return selectionIndex(ids());
}
