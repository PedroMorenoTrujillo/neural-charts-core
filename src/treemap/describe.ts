import type { ChartResult } from '../public/chart-types.js';
import type { TreemapDescription } from '../public/treemap-types.js';
import type { TreemapData } from './validate.js';
import type { Hierarchy, TreeRecord } from './hierarchy.js';
import { ok } from '../internal/diagnostics.js';
import { selectionDescription } from '../internal/interaction/selection-description.js';
import { validateTreemap, treeIdentities } from './validate.js';
export const treeColumns = Object.freeze(['Node ID', 'Label', 'Parent ID', 'Depth', 'Kind', 'Original value', 'Known subtotal', 'Complete', 'Color value']);
export function treePath<T>(hierarchy: Hierarchy<T>, record: TreeRecord<T>): readonly string[] {
  const path: string[] = []; let current: TreeRecord<T> | undefined = record;
  while (current) { path.push(current.node.id); current = current.parent === null ? undefined : hierarchy.nodes[current.parent]; }
  return Object.freeze(path.reverse());
}
export function treeRow<T>(record: TreeRecord<T>, hierarchy: Hierarchy<T>): readonly (string | number | null)[] {
  const branch = record.node.children !== undefined;
  return [record.node.id, record.node.label ?? record.node.id, record.parent === null ? null : hierarchy.nodes[record.parent]!.node.id, record.depth, branch ? 'branch' : 'leaf', branch ? null : record.node.value!, branch ? record.weight : record.node.value!, !record.missing ? 'true' : 'false', record.colorValue];
}
export function describeTreemapData<T>(data: TreemapData<T>): TreemapDescription {
  const { spec, hierarchy } = data, root = hierarchy.nodes[0]!, forced = spec.status && spec.status.kind !== 'ready' ? spec.status.kind : null, view = forced ?? (root.weight > 0 ? 'ready' : 'empty');
  const status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : !forced && root.weight === 0 ? 'No positive area. Zero and missing nodes remain available by keyboard and in the data table.' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : view === 'empty' ? 'No chart data.' : '';
  const context = 'Treemap area encodes nonnegative leaf values; parent areas represent known subtotals. ' + (root.missing ? 'Totals are incomplete because some observations are missing. ' : 'Totals are complete. ') + 'Zero has no area and is not missing. Tiny nodes may have no representable screen rectangle; all nodes remain in the hierarchy and data table. Color encodes ' + (spec.color?.by === 'value' ? 'an independent value; missing color values are hatched.' : 'the stable top-level group.') + ' The table preserves supplied order. Parent IDs and depth describe the complete hierarchy; subtotal is derived, original leaf values are unchanged.';
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, table: Object.freeze({ columns: treeColumns, rows: Object.freeze(hierarchy.nodes.map(record => Object.freeze({ key: record.node.id, cells: Object.freeze(treeRow(record, hierarchy).map(value => value === null ? 'Not supplied' : String(value))) }))) }) });
}
export function describeTreemap<T = unknown>(input: unknown): ChartResult<TreemapDescription> {
  const parsed = validateTreemap<T>(input); if (parsed.status === 'invalid') return parsed;
  const data = parsed.value, description = describeTreemapData(data);
  return data.spec.selection ? selectionDescription(description, data.spec.selection, treeIdentities(data.hierarchy), index => ({ pointId: data.hierarchy.nodes[index]!.node.id })) : ok(description);
}
