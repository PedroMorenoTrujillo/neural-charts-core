import type { ChartResult } from '../public/chart-types.js';
import type { HeatmapDescription } from '../public/heatmap-types.js';
import type { Viewport } from '../internal/interaction/viewport.js';
import { ok } from '../internal/diagnostics.js';
import { sliceIdentities } from '../internal/interaction/identities.js';
import { selectionDescription } from '../internal/interaction/selection-description.js';
import { heatmapViewport } from './viewport.js';
import type { HeatmapData } from './data.js';
import { validateHeatmap } from './validate.js';

export function colorScaleContext<T>(data: HeatmapData<T>): string {
  const scale = data.parsedColor;
  if (scale?.kind === 'threshold') return 'Threshold colors use increasing boundaries ' + scale.boundaries.join(', ') + '; equality belongs to the upper class.';
  if (scale?.kind === 'diverging') return 'Diverging color domain: ' + scale.domain!.join(', ') + '. Values outside the endpoints use the endpoint colors.';
  const extent = scale?.domain ?? data.extent;
  return extent ? 'Sequential color domain: ' + extent.join(' to ') + '. ' + (extent[0] === extent[1] ? 'Constant data use the middle color.' : 'Values outside the endpoints use the endpoint colors.') : 'No numeric color domain is available.';
}
export function describeHeatmapData<T>(data: HeatmapData<T>, viewport: Viewport | null = null): HeatmapDescription {
  const spec = data.spec, view = spec.status && spec.status.kind !== 'ready' ? spec.status.kind : data.observedCount ? 'ready' : 'empty';
  const status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'ready' ? '' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : 'No numeric observations. Missing and absent cells have no value; view the data table for supplied records.';
  const windows = viewport ? (['x', 'y'] as const).flatMap(axis => { const value = viewport.value[axis]; return value && !Array.isArray(value) && 'firstId' in value ? ['Applied ' + axis.toUpperCase() + ' viewport ' + value.firstId + ' through ' + value.lastId + '.'] : []; }) : [];
  const context = ['Cells encode original values by color; zero is an observation. Hatched coordinates are missing or absent, never the minimum numeric color. Keyboard navigation includes missing coordinates. The table and CSV contain supplied records only.', colorScaleContext(data), ...windows].join(' ');
  const rows = spec.data.map(cell => Object.freeze({ key: cell.id, cells: Object.freeze([data.rowLabels.get(cell.rowId)!, data.columnLabels.get(cell.columnId)!, cell.value === null ? 'Missing observation' : String(cell.value === 0 ? 0 : cell.value)]) }));
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, table: Object.freeze({ columns: Object.freeze(['Row', 'Column', 'Value']), rows: Object.freeze(rows) }) });
}
/** Validates independently of DOM and preserves the applied SSR selection. */
export function describeHeatmap<T>(input: unknown): ChartResult<HeatmapDescription> {
  const parsed = validateHeatmap<T>(input); if (parsed.status === 'invalid') return parsed;
  const viewport = heatmapViewport(parsed.value); if (viewport.status === 'invalid') return viewport;
  const data = parsed.value, description = describeHeatmapData(data, viewport.value);
  return data.spec.selection ? selectionDescription(description, data.spec.selection, sliceIdentities(data.spec), index => ({ pointId: data.spec.data[index]!.id })) : ok(description);
}
