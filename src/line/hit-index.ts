import type { LineProjection, ProjectedPoint, ProjectedSeries } from './geometry.js';
import { pointKey } from './normalize.js';

export type HitTarget<T> = Readonly<{ series: ProjectedSeries<T>; point: ProjectedPoint<T>; seriesIndex: number; eligibleIndex: number }>;
export type HitIndex<T> = Readonly<{ projection: LineProjection<T>; targets: readonly (readonly HitTarget<T>[])[]; byId: ReadonlyMap<string, HitTarget<T>>; columns: ReadonlyMap<string | number, number>; columnCount: number }>;
export function buildHitIndex<T>(projection: LineProjection<T>, rank: (x: string | number) => number): HitIndex<T> {
  const byId = new Map<string, HitTarget<T>>(), columns = new Map<string | number, number>();
  const targets = projection.series.map((series, seriesIndex) => Object.freeze(series.eligible.map((point, eligibleIndex) => {
    const target = Object.freeze({ series, point, seriesIndex, eligibleIndex }); byId.set(pointKey(series.series.spec.id, point.point.id), target); return target;
  })));
  // Merge already ordered arrays with a heap: O(N log S), no global sort.
  type Cursor = { series: number; point: number; rank: number };
  const heap: Cursor[] = [];
  const less = (a: Cursor, b: Cursor) => a.rank < b.rank || a.rank === b.rank && a.series < b.series;
  const push = (c: Cursor): void => { heap.push(c); let i = heap.length - 1; while (i > 0) { const parent = Math.floor((i - 1) / 2); if (!less(heap[i]!, heap[parent]!)) break; [heap[i], heap[parent]] = [heap[parent]!, heap[i]!]; i = parent; } };
  const pop = (): Cursor => { const c = heap[0]!, tail = heap.pop()!; if (heap.length) { heap[0] = tail; let i = 0; while (true) { const left = 2 * i + 1, right = left + 1; if (left >= heap.length) break; const child = right < heap.length && less(heap[right]!, heap[left]!) ? right : left; if (!less(heap[child]!, heap[i]!)) break; [heap[i], heap[child]] = [heap[child]!, heap[i]!]; i = child; } } return c; };
  targets.forEach((s, i) => { if (s.length) push({ series: i, point: 0, rank: rank(s[0]!.point.point.x) }); });
  while (heap.length) {
    const c = pop(), s = targets[c.series]!, value = s[c.point]!.point.point.x;
    if (!columns.has(value)) columns.set(value, columns.size + 1);
    if (c.point + 1 < s.length) push({ series: c.series, point: c.point + 1, rank: rank(s[c.point + 1]!.point.point.x) });
  }
  return Object.freeze({ projection, targets: Object.freeze(targets), byId, columns, columnCount: columns.size });
}
export function neighbors<T>(points: readonly HitTarget<T>[], x: number): readonly HitTarget<T>[] {
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (points[mid]!.point.x < x) lo = mid + 1; else hi = mid; }
  const result: HitTarget<T>[] = []; if (lo > 0) result.push(points[lo - 1]!); if (lo < points.length) result.push(points[lo]!); return result;
}
export function nearestX<T>(points: readonly HitTarget<T>[], x: number): HitTarget<T> | null {
  const candidates = neighbors(points, x); let best: HitTarget<T> | null = null, distance = Infinity;
  for (const c of candidates) { const d = Math.abs(c.point.x - x); if (d < distance) { best = c; distance = d; } }
  return best;
}
export function pickPoint<T>(index: HitIndex<T>, local: Readonly<{ x: number; y: number }>, client: Readonly<{ x: number; y: number }>, toClient: (x: number, y: number) => Readonly<{ x: number; y: number }> | null): HitTarget<T> | null {
  const plot = index.projection.plot;
  if (local.x < plot.x || local.x > plot.x + plot.width || local.y < plot.y || local.y > plot.y + plot.height) return null;
  let best: HitTarget<T> | null = null, distance = Infinity, xDistance = Infinity;
  for (const series of index.targets) for (const candidate of neighbors(series, local.x)) {
    const p = toClient(candidate.point.x, candidate.point.y); if (!p) continue;
    const dx = Math.abs(p.x - client.x), dy = p.y - client.y, d = dx * dx + dy * dy;
    if (d <= 144 && (d < distance || d === distance && (dx < xDistance || dx === xDistance && (best === null || candidate.seriesIndex < best.seriesIndex || candidate.seriesIndex === best.seriesIndex && candidate.point.index < best.point.index)))) { best = candidate; distance = d; xDistance = dx; }
  }
  return best;
}
export function firstTarget<T>(index: HitIndex<T>, last = false): HitTarget<T> | null {
  const series = last ? [...index.targets].reverse() : index.targets;
  for (const s of series) if (s.length) return s[last ? s.length - 1 : 0]!;
  return null;
}
export function navigate<T>(index: HitIndex<T>, current: HitTarget<T> | null, key: string, ctrl: boolean): HitTarget<T> | null {
  if (!current) return firstTarget(index);
  const series = index.targets[current.seriesIndex]!;
  if (key === 'Home' || key === 'End') return ctrl ? firstTarget(index, key === 'End') : series[key === 'End' ? series.length - 1 : 0] ?? current;
  if (key === 'ArrowRight' || key === 'ArrowLeft') return series[current.eligibleIndex + (key === 'ArrowRight' ? 1 : -1)] ?? current;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const direction = key === 'ArrowDown' ? 1 : -1;
    for (let i = current.seriesIndex + direction; i >= 0 && i < index.targets.length; i += direction) { const next = nearestX(index.targets[i]!, current.point.x); if (next) return next; }
  }
  return current;
}
export function reconcileTarget<T>(index: HitIndex<T>, old: HitTarget<T> | null, sameKind: boolean, previousX: number | null): HitTarget<T> | null {
  if (!old || !sameKind) return firstTarget(index);
  const exact = index.byId.get(pointKey(old.series.series.spec.id, old.point.point.id)); if (exact) return exact;
  const same = index.targets.find(s => s[0]?.series.series.spec.id === old.series.series.spec.id);
  if (same?.length) return previousX === null ? same[0]! : nearestX(same, previousX);
  for (let i = old.seriesIndex; i < index.targets.length; i++) if (index.targets[i]!.length) return previousX === null ? index.targets[i]![0]! : nearestX(index.targets[i]!, previousX);
  for (let i = Math.min(old.seriesIndex - 1, index.targets.length - 1); i >= 0; i--) if (index.targets[i]!.length) return previousX === null ? index.targets[i]![0]! : nearestX(index.targets[i]!, previousX);
  return null;
}
