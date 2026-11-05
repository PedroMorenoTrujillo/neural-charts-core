import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { LinePoint, LineChartSpec } from '../public/line-types.js';
import type { Domain } from '../internal/math/domain.js';
import { finiteExtent, normalizeNumericDomain } from '../internal/math/domain.js';
import { normalizeTimeDomain, timeExtent } from '../internal/math/time.js';
import { normalizeLine, type NormalizedLine } from '../line/normalize.js';
import { computeStack, type StackData } from '../stacked/stack.js';
import { ok } from '../internal/diagnostics.js';
import type { StackedAreaChartSpec } from '../public/stacked-area-types.js';

export type AreaComponent<T> = Readonly<{ id: string; x: string; y: number | null; original: LinePoint<T> }>;
export type StackedAreaData<T> = Readonly<{
  spec: StackedAreaChartSpec<T>; line: NormalizedLine<T>;
  coordinates: readonly (string | number)[];
  coordinateIds: readonly string[];
  coordinateIndex: ReadonlyMap<string | number, number>;
}>;
export type AreaStack<T> = StackData<AreaComponent<T>>;

/** A position surrogate adapts numeric/time X to the existing category-neutral
 * stack arithmetic. Original observations and public IDs are never rewritten. */
export function normalizeStackedArea<T>(spec: StackedAreaChartSpec<T>): StackedAreaData<T> {
  // The validated axes/series tuple is unchanged; only the internal family
  // discriminant is adapted for existing pure Line normalization.
  const line = normalizeLine<T>({ ...spec, family: 'line' } as LineChartSpec<T>), x = spec.axes.x;
  const coordinates: readonly (string | number)[] = Object.freeze(x.type === 'category'
    ? x.values.map(value => value.id)
    : [...new Set(spec.series.flatMap(series => series.data.map(point => point.x as number)))].sort((a, b) => a - b));
  return Object.freeze({ spec, line, coordinates, coordinateIds: Object.freeze(coordinates.map((_, i) => 'x' + i)), coordinateIndex: new Map(coordinates.map((value, i) => [value, i])) });
}

export function areaStack<T>(data: StackedAreaData<T>, state: ChartState): ChartResult<AreaStack<T>> {
  const hidden = new Set(state.hiddenSeriesIds);
  return computeStack(data.coordinateIds, data.spec.series.filter(series => !hidden.has(series.id)).map(series => ({ id: series.id, data: series.data.map(original => ({ id: original.id, x: data.coordinateIds[data.coordinateIndex.get(original.x)!]!, y: original.y, original })) })), data.spec.stacking);
}

export function stackAreaDomains<T>(data: StackedAreaData<T>, stack: AreaStack<T>, includeIncomplete = false): ChartResult<Readonly<{ x: Domain | null; y: Domain | null }>> {
  const ys: number[] = [];
  for (const row of stack.categories.values()) if ((includeIncomplete || row.complete) && (stack.mode === 'sum' || row.percentageDefined)) {
    for (const segment of row.segments) ys.push(segment.base, segment.end);
  }
  const y = data.spec.axes.y, x = data.spec.axes.x;
  const yPlan = normalizeNumericDomain(stack.mode === 'percent' && ys.length ? finiteExtent([0, 100]) : finiteExtent(ys), { includeZero: !y.domain, ...(y.domain ? { explicit: y.domain } : {}) });
  if (yPlan.status === 'invalid') return yPlan;
  if (x.type === 'category') return ok({ x: null, y: yPlan.status === 'ok' ? yPlan.domain : null });
  const xs = data.coordinates as readonly number[], extent = x.type === 'time' ? timeExtent(xs) : finiteExtent(xs);
  const xPlan = x.type === 'time' ? normalizeTimeDomain(extent, x.domain ? { explicit: x.domain } : {}) : normalizeNumericDomain(extent, { includeZero: false, ...(x.domain ? { explicit: x.domain } : {}) });
  return xPlan.status === 'invalid' ? xPlan : ok({ x: xPlan.status === 'ok' ? xPlan.domain : null, y: yPlan.status === 'ok' ? yPlan.domain : null });
}
