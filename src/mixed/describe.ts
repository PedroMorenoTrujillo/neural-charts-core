import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { MixedChartSpec, MixedDescription } from '../public/mixed-types.js';
import { validateMixed } from './validate.js';
import { normalizeMixed, mixedDomains, type MixedData } from './data.js';
import { validateState } from '../line/validate.js';
import { fullX } from '../internal/tooltip/model.js';
import { ok } from '../internal/diagnostics.js';
import { pointKey } from '../line/normalize.js';
import { seriesIdentities } from '../internal/interaction/identities.js';
import { selectionDescription } from '../internal/interaction/selection-description.js';
import { mixedViewport } from './viewport.js';
export const mixedColumns = Object.freeze(['Series', 'Kind', 'Point ID', 'Category ID', 'Category', 'Y', 'Visibility']);
export function describeMixedData<T>(data: MixedData<T>, state: ChartState): MixedDescription {
  const { spec, line } = data, hidden = new Set(state.hiddenSeriesIds), status = spec.status?.kind ?? 'ready';
  const visible = spec.series.filter(series => !hidden.has(series.id));
  const view = status !== 'ready' ? status : !line.nonnullCount ? 'empty' : !visible.length ? 'no-visible-series' : !visible.some(series => series.data.some(point => point.y !== null)) ? 'empty' : 'ready';
  const context = 'Mixed Line, Area and Column share one category frame and one value axis. Area and Column use a zero baseline, clipped by an explicit domain. Missing observations are not zero. All original observations remain in the data table and CSV.';
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status: view === 'ready' ? '' : spec.status?.kind === 'error' ? spec.status.message : spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'loading' ? 'Loading data.' : view === 'no-visible-series' ? 'All series are hidden.' : 'No data available.', context, table: Object.freeze({ columns: mixedColumns, rows: Object.freeze(spec.series.flatMap(series => series.data.map(point => Object.freeze({ key: pointKey(series.id, point.id), cells: Object.freeze([series.name, series.kind, point.id, point.x, fullX(point.x, 'category', line.labels), point.y === null ? 'No data' : String(point.y), hidden.has(series.id) ? 'Hidden' : 'Visible']) })))) }) });
}
export function describeMixed<T = unknown>(input: MixedChartSpec<T>): ChartResult<MixedDescription> {
  const parsed = validateMixed<T>(input); if (parsed.status === 'invalid') return parsed;
  const spec = parsed.value, state = spec.state?.mode === 'controlled' ? spec.state.value : { hiddenSeriesIds: [] };
  const validState = validateState(state, new Set(spec.series.map(series => series.id))); if (validState.status === 'invalid') return validState;
  const data = normalizeMixed(spec), domains = mixedDomains(data, validState.value); if (domains.status === 'invalid') return domains;
  const viewport = mixedViewport(data, validState.value); if (viewport.status === 'invalid') return viewport;
  const description = describeMixedData(data, validState.value);
  if (!spec.selection) return ok(description);
  const ids = spec.series.flatMap(series => series.data.map(point => ({ seriesId: series.id, pointId: point.id })));
  return selectionDescription(description, spec.selection, seriesIdentities(spec), index => ids[index]!);
}
