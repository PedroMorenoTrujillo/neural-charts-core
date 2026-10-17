import type { ChartResult } from '../public/chart-types.js';
import { computeStack } from '../stacked/stack.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { MAX_PATH_COMMANDS } from '../internal/geometry/path.js';
import type { AreaStack, StackedAreaData } from './data.js';

export type AreaVertex = Readonly<{ left: number; right: number; fraction: number; base: number; end: number }>;
export type AreaBand = Readonly<{ seriesId: string; vertices: readonly AreaVertex[] }>;

function crossing(a: number, b: number): number | null {
  if (!(a < 0 && b > 0 || a > 0 && b < 0)) return null;
  const scale = Math.max(Math.abs(a), Math.abs(b)), left = a / scale, right = b / scale;
  const fraction = left / (left - right);
  return fraction > 0 && fraction < 1 ? fraction : null;
}
function interpolate(a: number, b: number, fraction: number): number {
  if (!fraction || a === b) return a;
  if (fraction === 1) return b;
  return a * (1 - fraction) + b * fraction;
}

/** Pure bands between complete adjacent rows. Shared zero crossings make each
 * signed accumulator linear on a subinterval. A zero on the negative side uses
 * the preceding negative accumulator, not the positive zero convention. */
export function stackAreaBands<T>(data: StackedAreaData<T>, stack: AreaStack<T>): ChartResult<readonly AreaBand[]> {
  const ids = stack.series.map(series => series.id), rows = data.coordinateIds.map(id => stack.categories.get(id)!);
  const bands: AreaBand[] = [];
  let vertices = 0;
  for (let ri = 0; ri + 1 < rows.length; ri++) {
    const left = rows[ri]!, right = rows[ri + 1]!;
    if (!left.complete || !right.complete || stack.mode === 'percent' && (!left.percentageDefined || !right.percentageDefined)) continue;
    const a = left.segments.map(segment => segment.point.y!), b = right.segments.map(segment => segment.point.y!);
    const fractions = [0, 1];
    if (stack.mode === 'sum') for (let si = 0; si < ids.length; si++) { const value = crossing(a[si]!, b[si]!); if (value !== null) fractions.push(value); }
    const sorted = [...new Set(fractions)].sort((x, y) => x - y);
    for (let fi = 0; fi + 1 < sorted.length; fi++) {
      const first = sorted[fi]!, last = sorted[fi + 1]!, middle = first / 2 + last / 2;
      const negative = ids.map((_, si) => {
        const av = a[si]!, bv = b[si]!, zero = crossing(av, bv);
        // Classify the interval by endpoint signs and its split, even when a
        // midpoint value would underflow to signed zero.
        return zero === null ? av < 0 || bv < 0 : av < 0 ? middle < zero : middle > zero;
      });
      const at = (fraction: number): ChartResult<readonly AreaVertex[]> => {
        if (stack.mode === 'percent') return ok(ids.map((_, si) => ({ left: ri, right: ri + 1, fraction, base: interpolate(left.segments[si]!.base, right.segments[si]!.base, fraction), end: interpolate(left.segments[si]!.end, right.segments[si]!.end, fraction) })));
        const values = ids.map((_, si) => {
          // An exact computed crossing belongs at zero; residual floating-point
          // interpolation must not give its endpoint the opposite sign.
          const zero = crossing(a[si]!, b[si]!);
          return zero === fraction ? 0 : interpolate(a[si]!, b[si]!, fraction);
        });
        const computed = computeStack(['v'], ids.map((id, si) => ({ id, data: [{ id: 'v', x: 'v', y: values[si]! }] })), 'sum');
        if (computed.status === 'invalid') return computed;
        let negativeBase = 0;
        const result = computed.value.categories.get('v')!.segments.map((segment, si) => {
          let base = segment.base, end = segment.end;
          if (values[si] === 0 && negative[si]) base = end = negativeBase;
          if (values[si]! < 0) negativeBase = segment.end;
          return Object.freeze({ left: ri, right: ri + 1, fraction, base, end });
        });
        return ok(result);
      };
      const start = at(first); if (start.status === 'invalid') return start;
      const end = at(last); if (end.status === 'invalid') return end;
      for (let si = 0; si < ids.length; si++) {
        if (++vertices > Math.floor(MAX_PATH_COMMANDS / 7)) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'stackedArea.vertices');
        bands.push(Object.freeze({ seriesId: ids[si]!, vertices: Object.freeze([start.value[si]!, end.value[si]!]) }));
      }
    }
  }
  return ok(Object.freeze(bands));
}
