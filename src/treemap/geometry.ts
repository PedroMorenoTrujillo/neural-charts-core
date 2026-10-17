import type { ChartResult } from '../public/chart-types.js';
import type { Plot } from '../internal/layout/frame.js';
import type { Hierarchy, TreeRecord } from './hierarchy.js';
import { ok, invalid } from '../internal/diagnostics.js';
import { squarify, findTile, type Tiling } from './squarify.js';
export type TreeTarget<T> = Readonly<{ record: TreeRecord<T>; rect: Plot | null; paint: Plot | null; header: Plot | null; anchor: Readonly<{ x: number; y: number }>; sibling: number; order: number; reason: 'missing' | 'zero' | 'underflow' | 'coordinate-resolution' | 'insufficient-space' | null }>;
export type TreeProjection<T> = Readonly<{ hierarchy: Hierarchy<T>; plot: Plot; targets: readonly TreeTarget<T>[]; byId: ReadonlyMap<string, TreeTarget<T>>; layouts: ReadonlyMap<number, Tiling>; unrepresented: number; candidateChecks: number }>;
/** Whole hierarchy remains semantic. Physical descendants are tiled only when
 * their parent's bounded interior is representable, with no recursive stack. */
export function projectTreemap<T>(hierarchy: Hierarchy<T>, plot: Plot, fontSize: number, labels: boolean): ChartResult<TreeProjection<T>> {
  if (![plot.x, plot.y, plot.width, plot.height, plot.x + plot.width, plot.y + plot.height, fontSize].every(Number.isFinite) || plot.width < 0 || plot.height < 0 || fontSize <= 0) return invalid('INVALID_CONFIG', 'BAD_TREEMAP_BOUNDS', 'layout');
  const missing = (node: TreeRecord<T>) => node.node.children === undefined && node.node.value === null;
  const rectangles: (Plot | null)[] = hierarchy.nodes.map(() => null), headers: (Plot | null)[] = hierarchy.nodes.map(() => null), reasons: TreeTarget<T>['reason'][] = hierarchy.nodes.map(node => missing(node) ? 'missing' : node.weight === 0 ? 'zero' : 'insufficient-space'), siblingPositions = new Int32Array(hierarchy.nodes.length), layouts = new Map<number, Tiling>();
  for (const node of hierarchy.nodes) for (let i = 0; i < node.sorted.length; i++) siblingPositions[node.sorted[i]!] = i;
  const queue = plot.width > 0 && plot.height > 0 && hierarchy.nodes[0]!.weight > 0 ? [0] : []; if (queue.length) { rectangles[0] = Object.freeze({ ...plot }); reasons[0] = null; }
  let checks = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]!, node = hierarchy.nodes[index]!, outer = rectangles[index]!;
    if (!node.children.length) continue;
    const padding = Math.min(3, outer.width / 4, outer.height / 4), header = labels && outer.width >= fontSize * 3 && outer.height >= (fontSize + 8) * 2 + padding * 2 ? fontSize + 8 : 0;
    if (header) headers[index] = Object.freeze({ x: outer.x + padding, y: outer.y + padding, width: Math.max(0, outer.width - 2 * padding), height: header });
    const inner = { x: outer.x + padding, y: outer.y + padding + header, width: Math.max(0, outer.width - 2 * padding), height: Math.max(0, outer.height - 2 * padding - header) };
    if (!inner.width || !inner.height) continue;
    const tiling = squarify(node.sorted.map(child => ({ id: hierarchy.nodes[child]!.node.id, index: child, weight: hierarchy.nodes[child]!.weight })), inner); if (tiling.status === 'invalid') return tiling; layouts.set(index, tiling.value); checks += tiling.value.candidateChecks;
    for (const tile of tiling.value.tiles) { rectangles[tile.index] = tile.rect; reasons[tile.index] = null; queue.push(tile.index); }
    for (const item of tiling.value.unrepresented) reasons[item.index] = missing(hierarchy.nodes[item.index]!) ? 'missing' : item.reason;
  }
  let unrepresented = 0;
  const targets: TreeTarget<T>[] = [], byId = new Map<string, TreeTarget<T>>();
  for (const record of hierarchy.nodes) {
    const rect = rectangles[record.index]!, parent = record.parent === null ? null : targets[record.parent]!, header = headers[record.index]!;
    const gap = rect ? Math.min(1, rect.width / 8, rect.height / 8) : 0, leaf = record.node.children === undefined;
    const paint = rect ? leaf ? Object.freeze({ x: rect.x + gap, y: rect.y + gap, width: Math.max(0, rect.width - 2 * gap), height: Math.max(0, rect.height - 2 * gap) }) : rect : null;
    const anchor = header ? { x: header.x + header.width / 2, y: header.y + header.height / 2 } : paint ? { x: paint.x + paint.width / 2, y: paint.y + paint.height / 2 } : parent?.anchor ?? { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 };
    if (!rect) unrepresented++;
    const target = Object.freeze({ record, rect, paint, header, anchor: Object.freeze(anchor), sibling: siblingPositions[record.index]!, order: hierarchy.ranks.get(record.node.id)!, reason: reasons[record.index]! }); targets.push(target); byId.set(record.node.id, target);
  }
  return ok(Object.freeze({ hierarchy, plot: Object.freeze({ ...plot }), targets: Object.freeze(targets), byId, layouts, unrepresented, candidateChecks: checks }));
}
function contains(rect: Plot, outer: Plot, x: number, y: number): boolean { return x >= rect.x && y >= rect.y && (x < rect.x + rect.width || x === outer.x + outer.width && x === rect.x + rect.width) && (y < rect.y + rect.height || y === outer.y + outer.height && y === rect.y + rect.height); }
export function pickTree<T>(projection: TreeProjection<T>, x: number, y: number): TreeTarget<T> | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !contains(projection.plot, projection.plot, x, y)) return null;
  let current = projection.targets[0]!;
  for (let depth = 0; depth <= 64; depth++) {
    const layout = projection.layouts.get(current.record.index), tile = layout ? findTile(layout, x, y) : null; if (!tile) return current.paint && contains(current.paint, projection.plot, x, y) ? current : null;
    const child = projection.targets[tile.index]!; if (!child.paint || !contains(child.paint, projection.plot, x, y)) return current;
    current = child;
  }
  return null;
}
export function navigateTree<T>(projection: TreeProjection<T>, target: TreeTarget<T>, key: string, control: boolean): TreeTarget<T> | null {
  const node = target.record, hierarchy = projection.hierarchy, siblings = node.parent === null ? [0] : hierarchy.nodes[node.parent]!.sorted;
  let next: number | null = null;
  if (key === 'ArrowRight') next = node.sorted[0] ?? node.index;
  else if (key === 'ArrowLeft') next = node.parent ?? node.index;
  else if (key === 'ArrowUp' || key === 'ArrowDown') next = siblings[Math.max(0, Math.min(siblings.length - 1, target.sibling + (key === 'ArrowUp' ? -1 : 1)))] ?? node.index;
  else if (key === 'Home' || key === 'End') next = control ? key === 'Home' ? 0 : hierarchy.order[hierarchy.order.length - 1]! : siblings[key === 'Home' ? 0 : siblings.length - 1]!;
  return next === null ? null : projection.targets[next]!;
}
export function reconcileTree<T>(projection: TreeProjection<T>, identity: string | null, order: number): TreeTarget<T> | null { return identity && projection.byId.has(identity) ? projection.byId.get(identity)! : projection.targets[projection.hierarchy.order[Math.max(0, Math.min(projection.hierarchy.order.length - 1, order))]!] ?? null; }
