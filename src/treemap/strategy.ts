import type { TreemapChartSpec, TreemapDescription, TreemapPointActivation, TreemapState } from '../public/treemap-types.js';
import type { FamilyPolicy, FamilyTableSource } from '../internal/chart/family.js';
import { ok } from '../internal/diagnostics.js';
import { emptyLayers } from '../internal/axes/scene.js';
import { createDataTableFrame } from '../internal/accessibility/table-frame.js';
import { detailText } from '../internal/tooltip/model.js';
import { validateTreemap, validateTreemapOptions, treeIdentities, type TreemapData } from './validate.js';
import { describeTreemapData, treePath, treeRow, treeColumns } from './describe.js';
import { projectTreemap, pickTree, navigateTree, reconcileTree, type TreeProjection, type TreeTarget } from './geometry.js';
import { treeColors } from './color.js';
import { treeScene } from './scene.js';
import { treeKeyLayout, treeKeyScene } from './key.js';
import type { Hierarchy, TreeRecord } from './hierarchy.js';
type Policy<T> = FamilyPolicy<TreemapChartSpec<T>, TreemapState, TreeProjection<T>, TreeTarget<T>, TreemapDescription, TreemapPointActivation<T>>;
const unit: TreemapState = Object.freeze({});
export function treemapPolicy<T>(): Policy<T> {
  const snapshots = new WeakMap<TreemapChartSpec<T>, TreemapData<T>>(), hierarchies = new WeakMap<TreeRecord<T>, Hierarchy<T>>(), dataOf = (spec: TreemapChartSpec<T>) => snapshots.get(spec)!;
  const tooltip: Policy<T>['tooltip'] = (c, target, revision) => {
    const record = target.record, node = record.node, branch = node.children !== undefined, path = treePath(c.projection.hierarchy, record);
    const header = (node.label ?? node.id) + (node.label && node.label !== node.id ? ' (' + node.id + ')' : '');
    const value = branch ? record.weight : node.value!, color = c.palette.text;
    return { revision, seriesId: record.groupId, pointId: node.id, x: node.id, header, displayHeader: header, isolateText: true,
      rows: [{ seriesId: node.id, name: branch ? 'Known subtotal' : 'Original value', value, availability: value === null ? 'null' : 'value', color, dash: 'solid' }, ...(dataOf(snapshotsSpec(c)).spec.color?.by === 'value' && !branch ? [{ seriesId: node.id + ':color', name: 'Color value', value: record.colorValue, availability: record.colorValue === null ? 'null' as const : 'value' as const, color, dash: 'solid' as const }] : [])],
      context: 'Path IDs: ' + path.join(' / ') + '. ' + (record.missing ? 'Known subtotal is incomplete.' : 'Known subtotal is complete.') + (target.reason ? ' No screen area: ' + target.reason + '. This node remains in the hierarchy and data table.' : ''),
    };
  };
  // Projection ownership associates a computed description with the accepted
  // data snapshot without adding consumer/DOM state to the public hierarchy.
  const owners = new WeakMap<TreeProjection<T>, TreemapChartSpec<T>>();
  function snapshotsSpec(c: Parameters<Policy<T>['tooltip']>[0]): TreemapChartSpec<T> { return owners.get(c.projection)!; }
  return {
    parse(input) { const parsed = validateTreemap<T>(input); if (parsed.status === 'invalid') return parsed; snapshots.set(parsed.value.spec, parsed.value); for (const record of parsed.value.hierarchy.nodes) hierarchies.set(record, parsed.value.hierarchy); return ok(parsed.value.spec); },
    options: validateTreemapOptions<T>, validateData: spec => ok(dataOf(spec)), ids: () => [], names: () => [], hidden: () => [], state: () => unit,
    selectable: spec => treeIdentities(dataOf(spec).hierarchy),
    selectionEligible: target => target.record.node.children !== undefined || target.record.node.value !== null,
    datumId: target => ({ pointId: target.record.node.id }), selectedTarget: (projection, id) => projection.byId.get(id.pointId) ?? null,
    exportRecords(spec, _state, _value, selection) {
      const data = dataOf(spec), selected = selection ? new Set(selection.map(id => id.pointId)) : null;
      return { columns: [...treeColumns, ...(selected ? ['Selected'] : [])], rows: data.hierarchy.nodes.map(record => [...treeRow(record, data.hierarchy), ...(selected ? [String(selected.has(record.node.id))] : [])]) };
    },
    compute(spec, _state, shell, palette, font, measurer) {
      const data = dataOf(spec), colors = treeColors(data, palette); if (colors.status === 'invalid') return colors;
      const key = treeKeyLayout(data, shell, font, !!colors.value.quantitative), bounds = key.plot, inset = Math.min(4, bounds.width / 4, bounds.height / 4);
      const plot = { x: bounds.x + inset, y: bounds.y + inset, width: Math.max(0, bounds.width - 2 * inset), height: Math.max(0, bounds.height - 2 * inset) };
      const result = projectTreemap(data.hierarchy, plot, font.size, spec.labels !== 'off'); if (result.status === 'invalid') return result;
      const projection = result.value, description = describeTreemapData(data), layers = emptyLayers(); owners.set(projection, spec);
      let clips: readonly import('../internal/scene/model.js').ClipDef[] = [];
      if (description.view === 'ready' && plot.width > 0 && plot.height > 0) {
        const drawn = treeScene(projection, colors.value, palette, font, layers, spec.labels !== 'off', spec.direction ?? 'ltr', measurer); if (drawn.status === 'invalid') return drawn; clips = drawn.value;
        treeKeyScene(data, key, colors.value, palette, font, layers, measurer);
      }
      return ok({ shell, palette, font, projection, description, layers, plot, clips, legend: [], status: description.view !== 'ready' ? description.status : plot.width < 24 || plot.height < 24 ? 'Chart is too small. Enlarge it or view the data table.' : description.status });
    },
    // An automatic empty tiling still has real zero/unknown hierarchy nodes.
    // Explicit consumer statuses suspend navigation; no minimum area is drawn.
    enabled: c => (c.description.view === 'ready' || c.description.view === 'empty' && (owners.get(c.projection)!.status?.kind ?? 'ready') === 'ready') && c.projection.plot.width >= 24 && c.projection.plot.height >= 24,
    identity: target => target.record.node.id, order: target => target.order, reconcile: reconcileTree, pick: pickTree, navigate: navigateTree, tooltip,
    semantic(c, target) {
      const model = tooltip(c, target, 0), parent = target.record.parent === null ? null : c.projection.hierarchy.nodes[target.record.parent]!.node.id;
      return { seriesName: 'Hierarchy', row: 1, column: target.order + 1, text: detailText(model, 'Depth ' + target.record.depth + '. ' + (parent === null ? 'Root node.' : 'Parent ' + parent + '.')), detail: detailText(model, c.description.context) };
    },
    dimensions: projection => ({ rows: 1, columns: projection.targets.length }),
    focus(_projection, target, palette, layers) {
      const rect = target.header ?? target.paint;
      if (rect) layers.interaction.push({ kind: 'rect', key: 'tree-focus', ...rect, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } });
      else { const { x, y } = target.anchor; layers.interaction.push({ kind: 'path', key: 'tree-focus', commands: [{ kind: 'M', x: x - 4, y }, { kind: 'L', x: x + 4, y }, { kind: 'M', x, y: y - 4 }, { kind: 'L', x, y: y + 4 }], clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); }
    },
    anchor: (_projection, target) => target.anchor,
    detailAnchor: (_projection, target) => target.header ?? target.paint ?? { x: target.anchor.x - 4, y: target.anchor.y - 4, width: 8, height: 8 },
    detailBounds: c => ({ plot: c.projection.plot, body: { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height } }),
    activate: (target, source, revision) => Object.freeze({ node: target.record.node, total: target.record.node.children === undefined && target.record.node.value === null ? null : target.record.weight, incomplete: target.record.missing, path: treePath(hierarchies.get(target.record)!, target.record), source, revision }),
    table: (shell, onOpen) => createDataTableFrame<FamilyTableSource<TreemapDescription>>(shell, onOpen, { columns: treeColumns, notice: 'Every supplied branch and leaf is retained. Known subtotal is derived; null is not zero. Parent IDs and depth preserve hierarchy.', minimumWidthEm: 68, rowHeaders: true, selectionKey: id => id.seriesId === undefined ? id.pointId : null, size: source => source.table.rows.length, rows: (source, first, count) => source.table.rows.slice(first, first + count) }),
    semanticProfile: 'hierarchy',
    help: 'Up and Down move between siblings in canonical size order. Right enters the first child; Left reaches the parent. Home and End reach the current level endpoints; Control+Home reaches the root and Control+End the last node. Zero, missing and unrepresented nodes remain navigable. Enter or Space activates; missing leaves cannot be selected. Escape closes detail. Tab leaves the chart.',
  };
}
