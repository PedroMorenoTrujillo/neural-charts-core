import type { ChartResult } from '../public/chart-types.js';
import type { TreemapChartSpec, TreemapMountOptions, TreemapNodeId } from '../public/treemap-types.js';
import type { ParsedColorScale } from '../internal/color/scale.js';
import type { Hierarchy } from './hierarchy.js';
import { validateHierarchy } from './hierarchy.js';
import { ok, invalid } from '../internal/diagnostics.js';
import { record, choice, text, fail, ValidationFailure } from '../internal/data/validation.js';
import { infoConfig } from '../internal/data/info-config.js';
import { parseColorScale } from '../internal/color/scale.js';
import { selectionBinding, prepareSelection, selectionIndex } from '../internal/interaction/selection.js';
export type TreemapData<T> = Readonly<{ spec: TreemapChartSpec<T>; hierarchy: Hierarchy<T>; colorScale: ParsedColorScale | null }>;
export function treeIdentities<T>(hierarchy: Hierarchy<T>): ReadonlyMap<string, TreemapNodeId> {
  function* ids(): Generator<TreemapNodeId> { for (const item of hierarchy.nodes) if (item.node.children !== undefined || item.node.value !== null) yield { pointId: item.node.id }; }
  return selectionIndex(ids());
}
export function validateTreemap<T>(input: unknown): ChartResult<TreemapData<T>> {
  try {
    const value = record(input, ['family', 'title', 'description', 'root', 'color', 'labels', 'theme', 'direction', 'font', 'legend', 'tooltip', 'status', 'motion', 'selection'], ['family', 'title', 'root'], 'spec'); choice(value.family, ['treemap'], 'family'); infoConfig(value);
    const hierarchy = validateHierarchy<T>(value.root); if (hierarchy.status === 'invalid') return hierarchy; value.root = hierarchy.value.root;
    let colorScale: ParsedColorScale | null = null;
    if (Object.hasOwn(value, 'color')) {
      const color = record(value.color, ['by', 'scale'], ['by'], 'color'), by = choice(color.by, ['group', 'value'], 'color.by');
      if (by === 'group' && Object.hasOwn(color, 'scale')) fail('color.scale', 'GROUP_COLOR_HAS_NO_SCALE');
      if (Object.hasOwn(color, 'scale')) {
        colorScale = parseColorScale(color.scale, 'color.scale'); const parsed = colorScale, colors = Object.freeze(parsed.colors.map(color => color.hex));
        color.scale = Object.freeze(parsed.type === 'threshold' ? { type: 'threshold', boundaries: parsed.boundaries, colors } : parsed.type === 'diverging' ? { type: 'diverging', domain: parsed.domain, colors } : { type: 'sequential', ...(parsed.domain ? { domain: parsed.domain } : {}), colors, positions: parsed.positions });
      }
      value.color = Object.freeze(color);
    }
    if (Object.hasOwn(value, 'selection')) {
      const binding = selectionBinding(value.selection), initial = !binding ? [] : binding.mode === 'controlled' ? binding.value : binding.initial ?? [];
      if (initial.some(id => id.seriesId !== undefined)) fail('selection', 'BAD_SELECTION_ID'); value.selection = binding;
    }
    const spec = Object.freeze(value) as unknown as TreemapChartSpec<T>, selected = prepareSelection(spec.selection, treeIdentities(hierarchy.value)); if (selected.status === 'invalid') return selected;
    return ok(Object.freeze({ spec, hierarchy: hierarchy.value, colorScale }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
export function validateTreemapOptions<T>(input: unknown): ChartResult<TreemapMountOptions<T>> {
  try {
    const value = record(input, ['instanceId', 'onPointActivate', 'onSelectionChange', 'onDiagnostic'], ['instanceId'], 'options'), id = text(value.instanceId, 'options.instanceId', 64);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) fail('options.instanceId', 'BAD_INSTANCE_ID');
    for (const key of ['onPointActivate', 'onSelectionChange', 'onDiagnostic']) if (Object.hasOwn(value, key) && typeof value[key] !== 'function') fail('options.' + key);
    return ok(Object.freeze(value) as unknown as TreemapMountOptions<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_OPTIONS', 'options'); }
}
