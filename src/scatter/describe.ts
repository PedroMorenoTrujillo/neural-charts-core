import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ScatterChartSpec, ScatterDescription } from '../public/scatter-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { ValidationFailure, record, fail } from '../internal/data/validation.js';
import { validateScatter, scatterState } from './validate.js';
import { normalizeScatter, scatterDomains, targetKey, type NormalizedScatter } from './data.js';
export function describeScatterData<T>(data: NormalizedScatter<T, ScatterChartSpec<T>>, state: ChartState): ScatterDescription {
  const spec = data.spec, hidden = new Set(state.hiddenSeriesIds); let visible = 0;
  for (const series of data.series) if (!hidden.has(series.spec.id)) visible += series.paired.length;
  const view = spec.status && spec.status.kind !== 'ready' ? spec.status.kind : spec.series.length && hidden.size === spec.series.length ? 'no-visible-series' : visible ? 'ready' : 'empty';
  const status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'ready' ? '' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : view === 'no-visible-series' ? 'No visible series. Use the legend to show a series.' : 'No complete visible XY pairs. View the data table for provided observations.';
  let context = 'Scatter observations retain input order and true numeric X/Y coordinates. Missing coordinates are not plotted. Identical coordinates remain separate observations available by keyboard and data table. Points outside explicit domains are clipped; the data table retains all original records.';
  if (spec.references?.length) context += ' References: ' + spec.references.map(reference => (reference.label ?? reference.id) + ', ' + reference.axis.toUpperCase() + ' ' + reference.value).join('; ') + '.';
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, table: Object.freeze({ columns: Object.freeze(['Series', 'Observation', 'X', 'Y', 'Visibility']), rows: Object.freeze(data.series.flatMap(series => series.spec.data.map(point => Object.freeze({ key: targetKey(series.spec.id, point.id), cells: Object.freeze([series.spec.name, point.id, point.x === null ? 'Missing observation' : String(point.x), point.y === null ? 'Missing observation' : String(point.y), hidden.has(series.spec.id) ? 'Series hidden' : 'Series visible']) })))) }) });
}
export function describeScatter<T>(input: unknown, options?: unknown): ChartResult<ScatterDescription> {
  const parsed = validateScatter<T>(input); if (parsed.status === 'invalid') return parsed;
  try {
    const config = record(options === undefined ? {} : options, ['initialState'], [], 'options'), spec = parsed.value;
    if (spec.state?.mode === 'controlled' && Object.hasOwn(config, 'initialState')) fail('options.initialState', 'BAD_STATE');
    const state = scatterState(spec.state?.mode === 'controlled' ? spec.state.value : config.initialState ?? { hiddenSeriesIds: [] }, new Set(spec.series.map(series => series.id)));
    const data = normalizeScatter<T, ScatterChartSpec<T>>(spec); if (data.status === 'invalid') return data;
    const domains = scatterDomains(data.value, state); return domains.status === 'invalid' ? domains : ok(describeScatterData(data.value, state));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
