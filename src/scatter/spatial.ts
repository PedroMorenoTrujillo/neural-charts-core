// Private exact-coordinate grouping and balanced two-dimensional search.
import { invalid, ok } from '../internal/diagnostics.js';
import type { ChartResult } from '../public/chart-types.js';

export type XY = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
type Group<T> = Readonly<{ target: T; x: number; y: number; order: number; multiplicity: number }>;
type Node<T> = Readonly<{ group: Group<T>; bounds: Bounds; minimumOrder: number; left: Node<T> | null; right: Node<T> | null }>;
export type SpatialQuery<T> = Readonly<{ target: T | null; multiplicity: number; distance: number | null; visited: number }>;
export type SpatialIndex<T> = Readonly<{ size: number; unique: number; depth: number; bounds: Bounds | null; query(x: number, y: number, radius: number): SpatialQuery<T>; intersects(bounds: Bounds, ignore?: T): boolean }>;
const compareNumber = (a: number, b: number): number => a < b ? -1 : a > b ? 1 : 0;
function distanceToBounds(x: number, y: number, bounds: Bounds): number {
  return Math.hypot(x < bounds.minX ? bounds.minX - x : x > bounds.maxX ? x - bounds.maxX : 0, y < bounds.minY ? bounds.minY - y : y > bounds.maxY ? y - bounds.maxY : 0);
}
/** Balanced, deterministic two-dimensional index. Unordered input is retained
 * in original semantic order. Coincident coordinates share one spatial node;
 * their first input target wins pointer ties, while keyboard keeps every ID.
 * Build O(n log² n), query data-dependent (worst O(n)); no log-query guarantee. */
export function buildSpatialIndex<T extends XY>(points: readonly T[]): ChartResult<SpatialIndex<T>> {
  const columns = new Map<number, Map<number, { target: T; x: number; y: number; order: number; multiplicity: number }>>();
  const groups: Group<T>[] = [];
  for (let i = 0; i < points.length; i++) {
    const target = points[i]!;
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return invalid('INVALID_NUMBER', 'NONFINITE', 'scatter.projected[' + i + ']');
    let column = columns.get(target.x); if (!column) { column = new Map(); columns.set(target.x, column); }
    const group = column.get(target.y);
    if (group) group.multiplicity++;
    else { const next = { target, x: target.x, y: target.y, order: i, multiplicity: 1 }; column.set(target.y, next); groups.push(next); }
  }
  // Freeze owned groups only after accumulation; consumer targets stay intact.
  for (const group of groups) Object.freeze(group);
  let depth = 0;
  function build(values: readonly Group<T>[], level: number): Node<T> | null {
    if (!values.length) return null; depth = Math.max(depth, level + 1);
    const sorted = [...values].sort(level % 2 ? (a, b) => compareNumber(a.y, b.y) || compareNumber(a.x, b.x) || a.order - b.order : (a, b) => compareNumber(a.x, b.x) || compareNumber(a.y, b.y) || a.order - b.order);
    const middle = sorted.length >>> 1, group = sorted[middle]!, left = build(sorted.slice(0, middle), level + 1), right = build(sorted.slice(middle + 1), level + 1);
    const bounds = Object.freeze({ minX: Math.min(group.x, left?.bounds.minX ?? group.x, right?.bounds.minX ?? group.x), maxX: Math.max(group.x, left?.bounds.maxX ?? group.x, right?.bounds.maxX ?? group.x), minY: Math.min(group.y, left?.bounds.minY ?? group.y, right?.bounds.minY ?? group.y), maxY: Math.max(group.y, left?.bounds.maxY ?? group.y, right?.bounds.maxY ?? group.y) });
    return Object.freeze({ group, left, right, bounds, minimumOrder: Math.min(group.order, left?.minimumOrder ?? group.order, right?.minimumOrder ?? group.order) });
  }
  const root = build(groups, 0);
  function query(x: number, y: number, radius: number): SpatialQuery<T> {
    if (![x, y, radius].every(Number.isFinite) || radius < 0 || !root) return Object.freeze({ target: null, multiplicity: 0, distance: null, visited: 0 });
    let best: Group<T> | null = null, bestDistance = radius, bestOrder = Infinity, visited = 0;
    function visit(node: Node<T> | null, lowerBound: number): void {
      if (!node || lowerBound > bestDistance || lowerBound === bestDistance && node.minimumOrder >= bestOrder) return;
      visited++; const group = node.group, distance = Math.hypot(group.x - x, group.y - y);
      if (distance < bestDistance || distance === bestDistance && group.order < bestOrder) { best = group; bestDistance = distance; bestOrder = group.order; }
      const leftDistance = node.left ? distanceToBounds(x, y, node.left.bounds) : Infinity, rightDistance = node.right ? distanceToBounds(x, y, node.right.bounds) : Infinity;
      if (leftDistance <= rightDistance) { visit(node.left, leftDistance); visit(node.right, rightDistance); }
      else { visit(node.right, rightDistance); visit(node.left, leftDistance); }
    }
    visit(root, distanceToBounds(x, y, root.bounds));
    // TypeScript does not model mutation inside the recursive visitor.
    const result = best as Group<T> | null;
    return Object.freeze({ target: result?.target ?? null, multiplicity: result?.multiplicity ?? 0, distance: result ? bestDistance : null, visited });
  }
  function intersects(bounds: Bounds, ignore?: T): boolean {
    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) return false;
    function visit(node: Node<T> | null): boolean {
      if (!node || node.bounds.maxX < bounds.minX || node.bounds.minX > bounds.maxX || node.bounds.maxY < bounds.minY || node.bounds.minY > bounds.maxY) return false;
      const group = node.group;
      return ((group.target !== ignore || group.multiplicity > 1) && group.x >= bounds.minX && group.x <= bounds.maxX && group.y >= bounds.minY && group.y <= bounds.maxY) || visit(node.left) || visit(node.right);
    }
    return visit(root);
  }
  return ok(Object.freeze({ size: points.length, unique: groups.length, depth, bounds: root?.bounds ?? null, query, intersects }));
}
