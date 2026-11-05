import type { ChartResult } from '../public/chart-types.js';
import type { HeatmapChartSpec, HeatmapCell, HeatmapAxis, HeatmapCellId, HeatmapMountOptions } from '../public/heatmap-types.js';
import type { ChartSelectionBinding } from '../public/interaction-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { parseReferenceBands } from '../internal/axes/reference-band-view.js';
import { record, array, text, number, choice, optional, fail, ValidationFailure } from '../internal/data/validation.js';
import { infoConfig } from '../internal/data/info-config.js';
import { selectionBinding, prepareSelection } from '../internal/interaction/selection.js';
import { sliceIdentities } from '../internal/interaction/identities.js';
import { viewportBinding } from '../internal/interaction/viewport.js';
import { parseColorScale } from '../internal/color/scale.js';
import { parseHeatmapReferences } from './references.js';
import { normalizeHeatmap, coordinateKey, type HeatmapData } from './data.js';
export const HEATMAP_AXIS_LIMIT = 10000, HEATMAP_CELL_LIMIT = 10000;
function categoryAxis(input: unknown, path: string): HeatmapAxis {
  const axis = record(input, ['type', 'values', 'title', 'grid', 'reversed', 'ticks', 'labels'], ['type', 'values'], path); choice(axis.type, ['category'], path + '.type');
  const ids = new Set<string>(); axis.values = Object.freeze(array(axis.values, HEATMAP_AXIS_LIMIT, path + '.values').map((raw, i) => { const at = path + '.values[' + i + ']', value = record(raw, ['id', 'label'], ['id'], at), id = text(value.id, at + '.id', 128); if (ids.has(id)) fail(at, 'DUPLICATE_CATEGORY_ID'); ids.add(id); return Object.freeze({ id, ...(Object.hasOwn(value, 'label') ? { label: text(value.label, at + '.label', 1024) } : {}) }); }));
  optional(axis, 'title', (value, path) => text(value, path), path);
  for (const key of ['grid', 'reversed']) optional(axis, key, (value, path) => { if (typeof value !== 'boolean') fail(path); return value; }, path);
  optional(axis, 'ticks', (value, path) => { const ticks = record(value, ['targetCount'], [], path); optional(ticks, 'targetCount', (value, path) => { const n = number(value, path, 2, 12); if (!Number.isInteger(n)) fail(path); return n; }, path); return Object.freeze(ticks); }, path);
  optional(axis, 'labels', (value, path) => { const labels = record(value, ['maxWidth'], [], path); optional(labels, 'maxWidth', (value, path) => number(value, path, 0, 1024), path); return Object.freeze(labels); }, path);
  return Object.freeze(axis) as unknown as HeatmapAxis;
}
export function validateHeatmap<T>(input: unknown): ChartResult<HeatmapData<T>> {
  try {
    const value = record(input, ['family', 'title', 'description', 'axes', 'data', 'colorScale', 'referenceBands', 'references', 'gapRatio', 'labels', 'theme', 'direction', 'font', 'legend', 'tooltip', 'status', 'selection', 'crosshair', 'motion', 'viewport'], ['family', 'title', 'axes', 'data'], 'spec'); choice(value.family, ['heatmap'], 'family'); infoConfig(value);
    const axes = record(value.axes, ['x', 'y'], ['x', 'y'], 'axes'), x = categoryAxis(axes.x, 'axes.x'), y = categoryAxis(axes.y, 'axes.y'); value.axes = Object.freeze({ x, y });
    if (Object.hasOwn(value, 'referenceBands')) { const ranges = parseReferenceBands(value.referenceBands, { x, y }); if (ranges.status === 'invalid') return ranges; value.referenceBands = ranges.value; }
    if (Object.hasOwn(value, 'references')) value.references = parseHeatmapReferences(value.references, { x, y });
    const columns = new Set(x.values.map(value => value.id)), rows = new Set(y.values.map(value => value.id)), ids = new Set<string>(), coordinates = new Set<string>();
    value.data = Object.freeze(array(value.data, HEATMAP_CELL_LIMIT, 'data').map((raw, i): HeatmapCell<T> => {
      const at = 'data[' + i + ']', cell = record(raw, ['id', 'rowId', 'columnId', 'value', 'datum'], ['id', 'rowId', 'columnId', 'value'], at, ['datum']), id = text(cell.id, at + '.id', 128), rowId = text(cell.rowId, at + '.rowId', 128), columnId = text(cell.columnId, at + '.columnId', 128);
      if (ids.has(id)) fail(at + '.id', 'DUPLICATE_CELL_ID'); ids.add(id);
      if (!rows.has(rowId) || !columns.has(columnId)) fail(at, 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
      const key = coordinateKey(rowId, columnId); if (coordinates.has(key)) fail(at, 'DUPLICATE_CELL_COORDINATE'); coordinates.add(key);
      return Object.freeze({ id, rowId, columnId, value: cell.value === null ? null : number(cell.value, at + '.value'), ...(Object.hasOwn(cell, 'datum') ? { datum: cell.datum as T } : {}) });
    }));
    optional(value, 'gapRatio', (value, path) => number(value, path, 0, .5), 'spec');
    const parsedColor = Object.hasOwn(value, 'colorScale') ? parseColorScale(value.colorScale) : null;
    // Keep the public mathematical spec as an immutable descriptor snapshot;
    // normalized RGB/OKLab metadata remains private in HeatmapData.
    if (parsedColor) {
      const colors = Object.freeze(parsedColor.colors.map(color => color.hex));
      value.colorScale = Object.freeze(parsedColor.type === 'threshold' ? { type: 'threshold', boundaries: parsedColor.boundaries, colors } : parsedColor.type === 'diverging' ? { type: 'diverging', domain: parsedColor.domain, colors } : { type: 'sequential', ...(parsedColor.domain ? { domain: parsedColor.domain } : {}), colors, positions: parsedColor.positions });
    }
    if (Object.hasOwn(value, 'selection')) {
      const selected = selectionBinding(value.selection), initial = !selected ? [] : selected.mode === 'controlled' ? selected.value : selected.initial ?? [];
      if (initial.some(id => id.seriesId !== undefined)) fail('selection', 'BAD_SELECTION_ID');
      value.selection = selected as ChartSelectionBinding<HeatmapCellId>;
    }
    if (Object.hasOwn(value, 'viewport')) {
      const viewport = viewportBinding(value.viewport), applied = viewport ? viewport.mode === 'controlled' ? viewport.value : viewport.initial : null;
      if (applied && (Array.isArray(applied.x) || Array.isArray(applied.y))) fail('viewport', 'BAD_CATEGORY_WINDOW');
      value.viewport = viewport;
    }
    const spec = Object.freeze(value) as unknown as HeatmapChartSpec<T>, data = normalizeHeatmap(spec, parsedColor);
    if (spec.selection) { const result = prepareSelection(spec.selection, sliceIdentities(spec)); if (result.status === 'invalid') return result; }
    return ok(data);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
export function validateHeatmapOptions<T>(input: unknown): ChartResult<HeatmapMountOptions<T>> {
  try {
    const value = record(input, ['instanceId', 'onPointActivate', 'onSelectionChange', 'onViewportChange', 'onDiagnostic'], ['instanceId'], 'options'), id = text(value.instanceId, 'options.instanceId', 64);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) fail('options.instanceId', 'BAD_INSTANCE_ID');
    for (const key of ['onPointActivate', 'onSelectionChange', 'onViewportChange', 'onDiagnostic']) if (Object.hasOwn(value, key) && typeof value[key] !== 'function') fail('options.' + key);
    return ok(Object.freeze(value) as unknown as HeatmapMountOptions<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_OPTIONS', 'options'); }
}
