import type { AxisInput, AxesPlan } from './plan.js';
import type { ReferenceBandAxis } from './reference-bands.js';
/** Original identities survive scoped viewports. Bar retains logical X=category
 * and Y=value while their physical dimensions are reversed. No scale is built. */
export function referenceBandAxes(plan: AxesPlan, scoped: Readonly<{ x: AxisInput; y: AxisInput }>, original = scoped, horizontal = false): Readonly<{ x: ReferenceBandAxis; y: ReferenceBandAxis }> {
  const axis = (logical: 'x' | 'y'): ReferenceBandAxis => {
    const dimension = horizontal ? logical === 'x' ? 'y' : 'x' : logical, input = scoped[logical];
    if (input.type !== 'category') return Object.freeze({ type: input.type, dimension, domain: plan[dimension].domain, map: (value: number) => dimension === 'x' ? plan.mapX(value) : plan.mapY(value) });
    const ids = (original[logical].values ?? []).map(value => value.id), ranks = new Map(ids.map((id, index) => [id, index])), visible = scoped[logical].values ?? [], local = new Map(visible.map((value, index) => [value.id, index]));
    const first = visible.length ? ranks.get(visible[0]!.id) ?? 0 : 0, last = visible.length ? ranks.get(visible[visible.length - 1]!.id) ?? -1 : -1;
    const center = (id: string): number | null => dimension === 'x' ? plan.mapX(id) : plan.mapY(local.get(id)!);
    const initial = visible.length ? center(visible[0]!.id) : null, second = visible.length > 1 ? center(visible[1]!.id) : null;
    const span = dimension === 'x' ? plan.plot.width : plan.plot.height, step = visible.length > 1 && initial !== null && second !== null ? second - initial : (input.reversed ? -1 : 1) * span;
    return Object.freeze({ type: 'category', dimension, ranks, first, last, slot(rank: number): readonly [number, number] | null {
      if (!Number.isInteger(rank) || rank < first || rank > last) return null;
      const id = ids[rank], value = id === undefined ? null : center(id); if (value === null || !Number.isFinite(value) || !Number.isFinite(step)) return null;
      return Object.freeze([value - step / 2, value + step / 2] as const);
    } });
  };
  return Object.freeze({ x: axis('x'), y: axis('y') });
}
