import type { ChartResult, ChartState } from '../public/chart-types.js';
import { referenceBandContext } from '../internal/axes/reference-band-view.js';
import type { StackedAreaDescription } from '../public/stacked-area-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { ValidationFailure, record, fail } from '../internal/data/validation.js';
import { fullX } from '../internal/tooltip/model.js';
import { pointKey } from '../line/normalize.js';
import { validateStackedArea, validateState } from './validate.js';
import { areaStack, normalizeStackedArea, stackAreaDomains, type AreaStack, type StackedAreaData } from './data.js';
import { areaViewport, areaViewportDescription } from './viewport.js';
import { stackAreaBands } from './bands.js';
import { seriesIdentities } from '../internal/interaction/identities.js';
import { selectionDescription } from '../internal/interaction/selection-description.js';
export function describeStackedAreaData<T>(data: StackedAreaData<T>, state: ChartState, stack: AreaStack<T>): StackedAreaDescription {
  const spec = data.spec, hidden = new Set(state.hiddenSeriesIds);
  const drawable = [...stack.categories.values()].some(row => row.complete && row.segments.length && (stack.mode === 'sum' || row.percentageDefined));
  const view = spec.status && spec.status.kind !== 'ready' ? spec.status.kind : spec.series.length && hidden.size === spec.series.length ? 'no-visible-series' : drawable ? 'ready' : 'empty';
  const status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'ready' ? '' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : view === 'no-visible-series' ? 'No visible series. Use the legend to show a series.' : 'No complete visible stack. View the data table for original observations.';
  const context = (stack.mode === 'sum' ? 'Stacked Area uses separate positive and negative accumulators in visible series order. ' : 'Percentage Stacked Area shows shares of the complete visible total; a zero total has no defined share. ') + 'A missing component breaks the whole stack at that X coordinate. Tooltip, table and CSV retain original observations; synthetic sign-crossing vertices are not data. Explicit domains clip geometry.' + (spec.references?.length ? ' References: ' + spec.references.map(reference => (reference.label ?? reference.id) + ', ' + reference.axis.toUpperCase() + ' ' + reference.value).join('; ') + '.' : '') + (spec.referenceBands?.length ? ' ' + referenceBandContext(spec.referenceBands, spec.axes) : '');
  const bySeries = new Map(stack.series.map(series => [series.id, new Map(series.segments.map(segment => [segment.point.id, segment]))]));
  const rows = spec.series.flatMap(series => series.data.map(point => {
    const row = stack.categories.get(data.coordinateIds[data.coordinateIndex.get(point.x)!]!)!, segment = bySeries.get(series.id)?.get(point.id);
    const available = !hidden.has(series.id) && row.complete && (stack.mode === 'sum' || row.percentageDefined) && segment;
    const unavailable = hidden.has(series.id) ? 'Series hidden' : !row.complete ? 'Incomplete stack' : stack.mode === 'percent' && !row.percentageDefined ? 'Undefined total' : 'Missing observation';
    const range = available ? stack.mode === 'percent' ? Number(segment.base.toPrecision(6)) + '% to ' + Number(segment.end.toPrecision(6)) + '%' : segment.base + ' to ' + segment.end : unavailable;
    const share = available && segment.percentage !== null ? Number(segment.percentage.toPrecision(6)) + '%' : stack.mode === 'sum' ? 'Not applicable' : unavailable;
    return Object.freeze({ key: pointKey(series.id, point.id), cells: Object.freeze([series.name, fullX(point.x, spec.axes.x.kind, data.line.labels), point.y === null ? 'Missing observation' : String(point.y), range, share, hidden.has(series.id) ? 'Series hidden' : 'Series visible']) });
  }));
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, table: Object.freeze({ columns: Object.freeze(['Series', 'X', 'Y', 'Accumulated range', 'Visible share', 'Visibility']), rows: Object.freeze(rows) }) });
}
export function describeStackedArea<T>(input: unknown, options?: unknown): ChartResult<StackedAreaDescription> {
  const parsed = validateStackedArea<T>(input); if (parsed.status === 'invalid') return parsed;
  try {
    const config = record(options === undefined ? {} : options, ['initialState'], [], 'options'), spec = parsed.value;
    if (spec.state?.mode === 'controlled' && Object.hasOwn(config, 'initialState')) fail('options.initialState', 'BAD_STATE');
    const result = validateState(spec.state?.mode === 'controlled' ? spec.state.value : config.initialState ?? { hiddenSeriesIds: [] }, new Set(spec.series.map(series => series.id))); if (result.status === 'invalid') return result;
    const state = result.value, data = normalizeStackedArea(spec), stack = areaStack(data, state); if (stack.status === 'invalid') return stack;
    const bands = stackAreaBands(data, stack.value); if (bands.status === 'invalid') return bands;
    const domains = stackAreaDomains(data, stack.value); if (domains.status === 'invalid') return domains;
    const viewport = areaViewport(data, state); if (viewport.status === 'invalid') return viewport;
    const description = areaViewportDescription(describeStackedAreaData(data, state, stack.value), viewport.value);
    if (!spec.selection) return ok(description);
    const rows = spec.series.flatMap(series => series.data.map(point => ({ seriesId: series.id, pointId: point.id })));
    return selectionDescription(description, spec.selection, seriesIdentities(spec), index => rows[index]!);
  } catch (e) { return e instanceof ValidationFailure ? { status: 'invalid', diagnostic: e.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
