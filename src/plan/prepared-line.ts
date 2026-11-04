import type {ChartResult} from '../public/chart-types.js';
import type {LineChartSpec} from '../public/line-types.js';
import {validateLine} from '../line/validate.js';
import {normalizeLine, type NormalizedLine} from '../line/normalize.js';
import {ok} from '../internal/diagnostics.js';
import {isReusablePlanArray} from './input.js';

type Prepared = Readonly<{input: LineChartSpec<unknown>; data: NormalizedLine<unknown>}>;
const preparedLines = new WeakMap<object, Map<string, Prepared>>();

/** Called only after bounded ownPlanInput. Frozen series are fully immutable;
 * every non-series field remains in the key, including invalid/unknown fields.
 * Viewport, size and visibility are deliberately not part of normalization. */
export function prepareOwnedLine(spec: unknown): ChartResult<Prepared> {
  const record = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec as Record<string, unknown> : undefined;
  const series = record?.series;
  const reusable = isReusablePlanArray(series);
  const key = reusable ? JSON.stringify(Object.fromEntries(Object.entries(record!).filter(([name]) => name !== 'series'))) : '';
  const cache = reusable ? preparedLines.get(series) : undefined;
  const cached = cache?.get(key); if (cached) return ok(cached);
  const checked = validateLine(spec); if (checked.status === 'invalid') return checked;
  const prepared = Object.freeze({input: checked.value, data: normalizeLine(checked.value)});
  if (reusable) {
    const next = cache ?? new Map<string, Prepared>();
    if (next.size >= 4) next.delete(next.keys().next().value!);
    next.set(key, prepared); preparedLines.set(series, next);
  }
  return ok(prepared);
}
