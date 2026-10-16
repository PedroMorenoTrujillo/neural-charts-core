import type { ChartResult } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';

export type StackPoint = Readonly<{ id: string; x: string; y: number | null }>;
export type StackSeries<P extends StackPoint> = Readonly<{ id: string; data: readonly P[] }>;
export type StackSegment<P extends StackPoint> = Readonly<{ seriesId: string; point: P; base: number; end: number; percentage: number | null }>;
export type StackCategory<P extends StackPoint> = Readonly<{
  id: string; complete: boolean; positive: number | null; negative: number; total: number | null;
  percentageDefined: boolean; segments: readonly StackSegment<P>[];
}>;
export type StackData<P extends StackPoint> = Readonly<{
  mode: 'sum' | 'percent'; categories: ReadonlyMap<string, StackCategory<P>>;
  series: readonly Readonly<{ id: string; segments: readonly StackSegment<P>[] }>[];
  extent: readonly [number, number]; drawableCount: number;
}>;
type Accumulator = { sum: number; compensation: number };
function add(accumulator: Accumulator, value: number): number {
  const adjusted = value - accumulator.compensation, next = accumulator.sum + adjusted;
  accumulator.compensation = (next - accumulator.sum) - adjusted;
  accumulator.sum = next;
  return next;
}

/** Sparse, sign-separated stack arithmetic. The caller supplies visible series.
 * Categories and output rows use their explicit logical order, not label text.
 * No DOM, scales, rounding or invented observations belong to this module. */
export function computeStack<P extends StackPoint>(categoryIds: readonly string[], series: readonly StackSeries<P>[], mode: 'sum' | 'percent'): ChartResult<StackData<P>> {
  if (!Array.isArray(categoryIds) || !Array.isArray(series) || categoryIds.length > 10000 || series.length > 16) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'stack');
  if (mode !== 'sum' && mode !== 'percent') return invalid('INVALID_CONFIG', 'BAD_STACK_MODE', 'stack.mode');
  const positions = new Map<string, { samples: Map<string, P>; maximum: number; positive: Accumulator; negative: Accumulator; segments: StackSegment<P>[] }>();
  for (const id of categoryIds) {
    if (typeof id !== 'string' || !id.length || positions.has(id)) return invalid('INVALID_CONFIG', 'BAD_CATEGORY', 'stack.categories');
    positions.set(id, { samples: new Map(), maximum: 0, positive: { sum: 0, compensation: 0 }, negative: { sum: 0, compensation: 0 }, segments: [] });
  }
  const ids = new Set<string>(); let observations = 0;
  for (let si = 0; si < series.length; si++) {
    const item = series[si];
    if (!item || typeof item.id !== 'string' || !item.id.length || ids.has(item.id) || !Array.isArray(item.data)) return invalid('INVALID_CONFIG', 'BAD_SERIES', 'stack.series[' + si + ']');
    ids.add(item.id); const points = new Set<string>(), supplied = new Set<string>();
    for (let pi = 0; pi < item.data.length; pi++) {
      if (++observations > 10000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'stack.data');
      const point = item.data[pi], location = 'stack.series[' + si + '].data[' + pi + ']';
      if (!point || typeof point.id !== 'string' || !point.id.length || points.has(point.id) || typeof point.x !== 'string' || supplied.has(point.x) || !positions.has(point.x)) return invalid('INVALID_CONFIG', 'BAD_POINT_IDENTITY', location);
      points.add(point.id); supplied.add(point.x);
      if (point.y === null) continue;
      if (typeof point.y !== 'number' || !Number.isFinite(point.y)) return invalid('INVALID_NUMBER', 'NONFINITE', location + '.y');
      if (mode === 'percent' && point.y < 0) return invalid('INVALID_CONFIG', 'NEGATIVE_PERCENT_VALUE', location + '.y');
      const category = positions.get(point.x)!;
      category.samples.set(item.id, point);
      if (point.y > category.maximum) category.maximum = point.y;
    }
  }
  const categories = new Map<string, StackCategory<P>>(), rows = series.map(item => ({ id: item.id, segments: [] as StackSegment<P>[] }));
  let minimum = 0, maximum = 0, drawableCount = 0;
  for (const [id, category] of positions) {
    const complete = category.samples.size === series.length;
    let percentageDefined = false;
    if (mode === 'sum') {
      for (let si = 0; si < series.length; si++) {
        const point = category.samples.get(series[si]!.id); if (!point) continue;
        const accumulator = point.y! < 0 ? category.negative : category.positive, base = accumulator.sum, end = add(accumulator, point.y!);
        if (!Number.isFinite(end)) return invalid('INVALID_NUMBER', 'STACK_OVERFLOW', 'stack.categories.' + id);
        const segment = Object.freeze({ seriesId: series[si]!.id, point, base, end, percentage: null });
        category.segments.push(segment); rows[si]!.segments.push(segment);
      }
      minimum = Math.min(minimum, category.negative.sum); maximum = Math.max(maximum, category.positive.sum);
    } else {
      const ratios: number[] = [], total = { sum: 0, compensation: 0 }, rawTotal = { sum: 0, compensation: 0 };
      let lastPositive = -1, rawRepresentable = true;
      for (let si = 0; si < series.length; si++) {
        const point = category.samples.get(series[si]!.id), ratio = point && category.maximum ? point.y! / category.maximum : 0;
        ratios.push(ratio); add(total, ratio); if (ratio > 0) lastPositive = si;
        if (point && rawRepresentable && !Number.isFinite(add(rawTotal, point.y!))) rawRepresentable = false;
      }
      // Derive raw totals independently: multiplying max by a rounded ratio
      // sum could falsely overflow even when the original total is finite.
      category.positive.sum = rawRepresentable ? rawTotal.sum : Infinity;
      percentageDefined = complete && total.sum > 0;
      if (percentageDefined) {
        const cumulative = { sum: 0, compensation: 0 };
        for (let si = 0; si < series.length; si++) {
          const point = category.samples.get(series[si]!.id)!, percentage = ratios[si]! / total.sum * 100, base = cumulative.sum;
          let end = add(cumulative, percentage);
          if (si === lastPositive) { end = 100; cumulative.sum = 100; cumulative.compensation = 0; }
          // Subsequent raw zeros remain addressable at the cumulative endpoint.
          if (![base, end, percentage].every(Number.isFinite)) return invalid('INVALID_NUMBER', 'STACK_OVERFLOW', 'stack.categories.' + id);
          const segment = Object.freeze({ seriesId: series[si]!.id, point, base, end, percentage });
          category.segments.push(segment); rows[si]!.segments.push(segment);
        }
      }
    }
    const positive = Number.isFinite(category.positive.sum) ? category.positive.sum : null;
    const total = positive === null ? null : positive + category.negative.sum;
    categories.set(id, Object.freeze({ id, complete, positive, negative: category.negative.sum, total, percentageDefined, segments: Object.freeze(category.segments) }));
    drawableCount += category.segments.length;
  }
  const extent: readonly [number, number] = mode === 'percent' ? Object.freeze([0, 100]) : Object.freeze([minimum, maximum]);
  return ok(Object.freeze({ mode, categories, series: Object.freeze(rows.map(row => Object.freeze({ id: row.id, segments: Object.freeze(row.segments) }))), extent, drawableCount }));
}
