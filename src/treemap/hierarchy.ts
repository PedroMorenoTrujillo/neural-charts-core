import type { ChartResult } from '../public/chart-types.js';
import type { TreemapNode } from '../public/treemap-types.js';
import { ok, invalid } from '../internal/diagnostics.js';
import { record, array, text, number, fail, ValidationFailure } from '../internal/data/validation.js';
export const TREE_NODE_LIMIT = 10000, TREE_DEPTH_LIMIT = 64;
export type TreeRecord<T> = Readonly<{
  node: TreemapNode<T>; parent: number | null; children: readonly number[]; sorted: readonly number[];
  index: number; depth: number; weight: number; missing: boolean; groupId: string; colorValue: number | null;
}>;
export type Hierarchy<T> = Readonly<{ root: TreemapNode<T>; nodes: readonly TreeRecord<T>[]; byId: ReadonlyMap<string, number>; order: readonly number[]; ranks: ReadonlyMap<string, number>; colorExtent: readonly [number, number] | null }>;
type Draft<T> = { node: TreemapNode<T> | null; parent: number | null; children: number[]; sorted: number[]; index: number; depth: number; weight: number; missing: boolean; groupId: string; colorValue: number | null; parsed: Record<string, unknown> };
/** Positive sums are normalized before compensated accumulation. Overflow is
 * an explicit data error, never a fabricated finite aggregate. */
function total<T>(children: readonly number[], nodes: readonly Draft<T>[], path: string): number {
  let maximum = 0; for (const index of children) maximum = Math.max(maximum, nodes[index]!.weight); if (!maximum) return 0;
  let sum = 0, correction = 0;
  for (const index of children) { const value = nodes[index]!.weight / maximum - correction, next = sum + value; correction = (next - sum) - value; sum = next; }
  const value = maximum * sum; if (!Number.isFinite(value)) fail(path, 'HIERARCHY_SUM_OVERFLOW', 'INVALID_NUMBER'); return value;
}
/** Validates a strict tree, never a DAG. All traversal/aggregation is iterative;
 * consumer arrays/objects are never sorted, modified or evaluated as accessors. */
export function validateHierarchy<T>(input: unknown): ChartResult<Hierarchy<T>> {
  try {
    const nodes: Draft<T>[] = [], byId = new Map<string, number>(), seen = new WeakSet<object>();
    const pending: { raw: unknown; parent: number | null; depth: number }[] = [{ raw: input, parent: null, depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!, index = nodes.length, location = 'root.nodes[' + index + ']';
      if (index >= TREE_NODE_LIMIT || item.depth > TREE_DEPTH_LIMIT) fail(location, 'TREE_RESOURCE_LIMIT');
      if (typeof item.raw === 'object' && item.raw !== null) { if (seen.has(item.raw)) fail(location, 'CYCLE_OR_REPEATED_NODE'); seen.add(item.raw); }
      const parsed = record(item.raw, ['id', 'label', 'datum', 'children', 'value', 'colorValue'], ['id'], location, ['datum']);
      const branch = Object.hasOwn(parsed, 'children'), leaf = Object.hasOwn(parsed, 'value'); if (branch === leaf) fail(location, 'BAD_TREE_NODE_KIND');
      const id = text(parsed.id, location + '.id', 128); if (byId.has(id)) fail(location + '.id', 'DUPLICATE_NODE_ID'); byId.set(id, index); parsed.id = id;
      if (Object.hasOwn(parsed, 'label')) parsed.label = text(parsed.label, location + '.label', 1024);
      if (branch && Object.hasOwn(parsed, 'colorValue')) fail(location + '.colorValue', 'BRANCH_COLOR_METRIC');
      if (leaf) { parsed.value = parsed.value === null ? null : number(parsed.value, location + '.value', 0); if (Object.hasOwn(parsed, 'colorValue')) parsed.colorValue = parsed.colorValue === null ? null : number(parsed.colorValue, location + '.colorValue'); }
      const groupId = item.parent === null ? id : item.parent === 0 ? id : nodes[item.parent]!.groupId;
      const colorValue = branch ? null : Object.hasOwn(parsed, 'colorValue') ? parsed.colorValue as number | null : parsed.value as number | null;
      nodes.push({ node: null, parent: item.parent, children: [], sorted: [], index, depth: item.depth, weight: leaf ? parsed.value as number | null ?? 0 : 0, missing: leaf && parsed.value === null, groupId, colorValue, parsed });
      if (item.parent !== null) nodes[item.parent]!.children.push(index);
      if (branch) { const children = array(parsed.children, TREE_NODE_LIMIT, location + '.children'); if (nodes.length + pending.length + children.length > TREE_NODE_LIMIT) fail(location, 'TREE_RESOURCE_LIMIT'); for (let i = children.length - 1; i >= 0; i--) pending.push({ raw: children[i], parent: index, depth: item.depth + 1 }); }
    }
    let minimum = Infinity, maximum = -Infinity;
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]!, branch = Object.hasOwn(node.parsed, 'children');
      if (branch) { node.weight = total(node.children, nodes, 'root.nodes[' + index + '].children'); node.missing = node.children.some(child => nodes[child]!.missing); node.parsed.children = Object.freeze(node.children.map(child => nodes[child]!.node!)); }
      else if (node.colorValue !== null) { minimum = Math.min(minimum, node.colorValue); maximum = Math.max(maximum, node.colorValue); }
      node.sorted = [...node.children].sort((a, b) => { const first = nodes[a]!, second = nodes[b]!; return second.weight - first.weight || (first.node!.id < second.node!.id ? -1 : first.node!.id > second.node!.id ? 1 : 0); });
      node.node = Object.freeze(node.parsed) as unknown as TreemapNode<T>;
    }
    const order: number[] = [], ranks = new Map<string, number>(), stack = [0];
    while (stack.length) { const index = stack.pop()!, node = nodes[index]!; ranks.set(node.node!.id, order.length); order.push(index); for (let i = node.sorted.length - 1; i >= 0; i--) stack.push(node.sorted[i]!); }
    const owned = nodes.map(({ parsed: _parsed, ...node }) => Object.freeze({ ...node, node: node.node!, children: Object.freeze(node.children), sorted: Object.freeze(node.sorted) }));
    return ok(Object.freeze({ root: nodes[0]!.node!, nodes: Object.freeze(owned), byId, order: Object.freeze(order), ranks, colorExtent: minimum === Infinity ? null : Object.freeze([minimum, maximum] as const) }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_HIERARCHY', 'root'); }
}
