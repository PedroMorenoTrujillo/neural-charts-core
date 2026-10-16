import type { ChartResult } from '../public/chart-types.js';
import type { PieSlice, RadialChartSpec, RadialDescription, RadialState } from '../public/radial-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { ValidationFailure, record, fail } from '../internal/data/validation.js';
import { normalizeRadial, type RadialData } from './math.js';
import { validateRadial, validateRadialState } from './validate.js';
export function sliceShareText(value: number | null, fraction: number, hasPositive: boolean): string {
  if (value === null) return 'Missing observation';
  if (!hasPositive) return 'Undefined: zero visible total';
  if (value > 0 && fraction === 0) return '<0.000001%';
  return Number((fraction * 100).toPrecision(6)) + '%';
}
export function describeRadialData<T>(spec: RadialChartSpec<T>, state: RadialState, data: RadialData<PieSlice<T>>): RadialDescription {
  const hidden = new Set(state.hiddenSliceIds), shares = new Map(data.slices.map(slice => [slice.point.id, slice.fraction]));
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const point of spec.data) { if (seen.has(point.label)) duplicates.add(point.label); seen.add(point.label); }
  const view = spec.status && spec.status.kind !== 'ready' ? spec.status.kind : spec.data.length && data.hidden === spec.data.length ? 'no-visible-slices' : data.positive ? 'ready' : 'empty';
  const status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'ready' ? '' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : view === 'no-visible-slices' ? 'No visible slices. Use the legend to show a slice.' : spec.status?.kind === 'empty' ? 'No chart data to display. The data table preserves provided observations.' : 'No positive visible values. View the data table for original zero and missing observations.';
  let context = 'Shares use the total of provided visible nonnegative values. Hidden and missing observations are excluded; zeros are retained without an arc. Displayed shares are rounded independently.' + (data.missing ? ' The represented total is incomplete because visible observations are missing.' : '') + (!data.eligible.length ? ' No numeric observations are visible.' : data.total === null ? ' Raw total exceeds finite numeric range; shares use normalized ratios.' : ' Provided visible raw total: ' + data.total + '.');
  if (spec.family === 'donut' && spec.center) { const content = [spec.center.label, spec.center.value].filter(value => value !== undefined && value !== ''); if (content.length) context += ' Center content: ' + content.join('. ') + '.'; }
  const rows = spec.data.map(point => Object.freeze({ key: point.id, cells: Object.freeze([
    duplicates.has(point.label) && point.label !== point.id ? point.label + ' (' + point.id + ')' : point.label,
    point.value === null ? 'Missing observation' : String(point.value === 0 ? 0 : point.value),
    hidden.has(point.id) ? 'Not included: hidden' : sliceShareText(point.value, shares.get(point.id) ?? 0, data.positive > 0),
    hidden.has(point.id) ? 'Slice hidden' : 'Slice visible',
  ]) }));
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, total: data.eligible.length ? data.total : null, totalOverflow: data.total === null, totalIncomplete: data.missing > 0, table: Object.freeze({ columns: Object.freeze(['Slice', 'Value', 'Visible share', 'Visibility']), rows: Object.freeze(rows) }) });
}
/** Pure public-facade backing: validates without DOM or renderer acquisition. */
export function describeRadial<T>(input: unknown, family: 'pie' | 'donut', options?: unknown): ChartResult<RadialDescription> {
  const parsed = validateRadial<T>(input, family); if (parsed.status === 'invalid') return parsed;
  try {
    const config = record(options === undefined ? {} : options, ['initialState'], [], 'options'), spec = parsed.value;
    if (spec.state?.mode === 'controlled' && Object.hasOwn(config, 'initialState')) fail('options.initialState', 'BAD_STATE');
    const state = validateRadialState(spec.state?.mode === 'controlled' ? spec.state.value : config.initialState ?? { hiddenSliceIds: [] }, new Set(spec.data.map(point => point.id)));
    const data = normalizeRadial(spec.data, new Set(state.hiddenSliceIds)); return data.status === 'invalid' ? data : ok(describeRadialData(spec, state, data.value));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
