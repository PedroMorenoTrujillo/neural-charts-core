import type {NormalizedSeries} from '../line/normalize.js';
import type {PlanObservation} from '../public/plan-types.js';

type Metadata = {type: string; ids: (PlanObservation['id'] | undefined)[]; keys: (string | undefined)[]};
const metadata = new WeakMap<object, Metadata>();
/** A normalized series is already validated and immutable. Cache only stable
 * identity/group keys, never viewport coordinates, values or formatted labels.
 * Two arrays avoid a metadata record or Map entry per raw point. */
export function lineObservationMetadata<T>(series: NormalizedSeries<T>, type: string): Metadata {
  const cached = metadata.get(series); if (cached?.type === type) return cached;
  const value: Metadata = {type, ids: Array.from({length: series.points.length}, () => undefined), keys: Array.from({length: series.points.length}, () => undefined)};
  metadata.set(series, value); return value;
}
