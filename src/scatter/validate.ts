import type { ChartResult, ChartState, ChartStatus } from '../public/chart-types.js';
import type { ScatterChartSpec, ScatterMountOptions, ScatterPoint, ScatterSeries, NumericAxis } from '../public/scatter-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { selectionBinding } from '../internal/interaction/selection.js';
import { record, array, text, number, choice, color, optional, fail, ValidationFailure } from '../internal/data/validation.js';
export function scatterState(value: unknown, ids: ReadonlySet<string>, path = 'state'): ChartState {
  const state = record(value, ['hiddenSeriesIds'], ['hiddenSeriesIds'], path), seen = new Set<string>();
  const hidden = array(state.hiddenSeriesIds, 16, path + '.hiddenSeriesIds').map((value, index) => {
    const id = text(value, path + '.hiddenSeriesIds[' + index + ']', 128); if (!ids.has(id) || seen.has(id)) fail(path, 'BAD_STATE'); seen.add(id); return id;
  });
  return Object.freeze({ hiddenSeriesIds: Object.freeze(hidden) });
}
function axis(value: unknown, path: string): NumericAxis {
  const axis = record(value, ['kind', 'domain', 'includeZero', 'reversed', 'nice', 'title', 'grid', 'ticks', 'labels'], ['kind'], path);
  choice(axis.kind, ['linear'], path + '.kind');
  for (const key of ['includeZero', 'reversed', 'nice', 'grid']) optional(axis, key, (value, path) => { if (typeof value !== 'boolean') fail(path); return value; }, path);
  optional(axis, 'title', (value, path) => text(value, path, 256), path);
  optional(axis, 'domain', (value, path) => { const values = array(value, 2, path); if (values.length !== 2) fail(path, 'BAD_DOMAIN', 'INVALID_DOMAIN'); const low = number(values[0], path + '[0]'), high = number(values[1], path + '[1]'); if (low >= high) fail(path, 'BAD_DOMAIN', 'INVALID_DOMAIN'); return Object.freeze([low, high]); }, path);
  if (axis.domain && axis.nice === true) fail(path + '.nice', 'EXPLICIT_DOMAIN_MUST_NOT_EXPAND');
  optional(axis, 'ticks', (value, path) => { const ticks = record(value, ['targetCount'], [], path); optional(ticks, 'targetCount', (value, path) => { const n = number(value, path, 2, 12); if (!Number.isInteger(n)) fail(path); return n; }, path); return Object.freeze(ticks); }, path);
  optional(axis, 'labels', (value, path) => { const labels = record(value, ['maxWidth'], [], path); optional(labels, 'maxWidth', (value, path) => number(value, path, 0, 1024), path); return Object.freeze(labels); }, path);
  return Object.freeze(axis) as NumericAxis;
}
export function validateScatter<T>(value: unknown): ChartResult<ScatterChartSpec<T>> {
  try {
    const spec = record(value, ['family', 'title', 'description', 'axes', 'series', 'theme', 'direction', 'font', 'legend', 'tooltip', 'labels', 'references', 'state', 'status', 'selection', 'crosshair'], ['family', 'title', 'axes', 'series'], 'spec');
    choice(spec.family, ['scatter'], 'family'); spec.title = text(spec.title, 'title');
    optional(spec, 'description', (value, path) => text(value, path, 4096, true), 'spec');
    optional(spec, 'theme', (value, path) => choice(value, ['light', 'dark', 'auto'], path), 'spec'); optional(spec, 'direction', (value, path) => choice(value, ['ltr', 'rtl'], path), 'spec');
    optional(spec, 'labels', (value, path) => choice(value, ['auto', 'off'], path), 'spec');
    optional(spec, 'font', (value, path) => { const font = record(value, ['family', 'size', 'weight'], [], path); optional(font, 'family', (value, path) => choice(value, ['sans-serif', 'serif', 'monospace'], path), path); optional(font, 'size', (value, path) => number(value, path, 8, 32), path); optional(font, 'weight', (value, path) => choice(value, [400, 500, 600, 700], path), path); return Object.freeze(font); }, 'spec');
    optional(spec, 'legend', (value, path) => { const legend = record(value, ['position'], [], path); optional(legend, 'position', (value, path) => choice(value, ['bottom', 'end', 'none'], path), path); return Object.freeze(legend); }, 'spec');
    optional(spec, 'tooltip', (value, path) => { const tooltip = record(value, ['mode', 'placement'], [], path); optional(tooltip, 'mode', (value, path) => choice(value, ['point', 'off'], path), path); optional(tooltip, 'placement', (value, path) => choice(value, ['top', 'bottom', 'start', 'end'], path), path); return Object.freeze(tooltip); }, 'spec');
    const axes = record(spec.axes, ['x', 'y'], ['x', 'y'], 'axes'); spec.axes = Object.freeze({ x: axis(axes.x, 'axes.x'), y: axis(axes.y, 'axes.y') });
    const ids = new Set<string>(); let total = 0;
    spec.series = Object.freeze(array(spec.series, 16, 'series').map((raw, si): ScatterSeries<T> => {
      const path = 'series[' + si + ']', series = record(raw, ['id', 'name', 'data', 'color', 'marker'], ['id', 'name', 'data'], path), id = text(series.id, path + '.id', 128), name = text(series.name, path + '.name', 1024);
      if (ids.has(id)) fail(path + '.id', 'DUPLICATE_SERIES_ID'); ids.add(id);
      const points = array(series.data, 50000, path + '.data'), pointIds = new Set<string>(); total += points.length; if (total > 50000) fail('series', 'RESOURCE_LIMIT');
      const data = Object.freeze(points.map((raw, pi): ScatterPoint<T> => {
        const at = path + '.data[' + pi + ']', point = record(raw, ['id', 'x', 'y', 'datum'], ['id', 'x', 'y'], at, ['datum']), id = text(point.id, at + '.id', 128);
        if (pointIds.has(id)) fail(at + '.id', 'DUPLICATE_POINT_ID'); pointIds.add(id);
        return Object.freeze({ id, x: point.x === null ? null : number(point.x, at + '.x'), y: point.y === null ? null : number(point.y, at + '.y'), ...(Object.hasOwn(point, 'datum') ? { datum: point.datum as T } : {}) });
      }));
      optional(series, 'color', color, path);
      optional(series, 'marker', (value, path) => { const marker = record(value, ['shape', 'size'], [], path); optional(marker, 'shape', (value, path) => choice(value, ['circle', 'square', 'diamond'], path), path); optional(marker, 'size', (value, path) => number(value, path, 2, 24), path); return Object.freeze(marker); }, path);
      return Object.freeze({ id, name, data, ...(series.color === undefined ? {} : { color: series.color as string }), ...(series.marker === undefined ? {} : { marker: series.marker as NonNullable<ScatterSeries<T>['marker']> }) });
    }));
    optional(spec, 'state', (value, path) => { const state = record(value, ['mode', 'value'], ['mode'], path), mode = choice(state.mode, ['internal', 'controlled'], path + '.mode'); if (mode === 'internal') { if (Object.hasOwn(state, 'value')) fail(path, 'BAD_STATE'); return Object.freeze({ mode }); } return Object.freeze({ mode, value: scatterState(state.value, ids, path + '.value') }); }, 'spec');
    optional(spec, 'status', (value, path): ChartStatus => { const status = record(value, ['kind', 'message'], ['kind'], path), kind = choice(status.kind, ['ready', 'loading', 'empty', 'error'], path + '.kind'); if (kind === 'ready') { if (Object.hasOwn(status, 'message')) fail(path); return Object.freeze({ kind }); } const message = Object.hasOwn(status, 'message') ? text(status.message, path + '.message', 2048) : undefined; if (kind === 'error' && message === undefined) fail(path + '.message'); return Object.freeze({ kind, ...(message === undefined ? {} : { message }) }) as ChartStatus; }, 'spec');
    optional(spec, 'references', (value, path) => { const seen = new Set<string>(); return Object.freeze(array(value, 32, path).map((value, i) => { const at = path + '[' + i + ']', reference = record(value, ['id', 'axis', 'value', 'label', 'color', 'dash'], ['id', 'axis', 'value'], at); reference.id = text(reference.id, at + '.id', 128); if (seen.has(reference.id as string)) fail(at + '.id', 'DUPLICATE_REFERENCE_ID'); seen.add(reference.id as string); reference.axis = choice(reference.axis, ['x', 'y'], at + '.axis'); reference.value = number(reference.value, at + '.value'); optional(reference, 'label', (value, path) => text(value, path, 1024), at); optional(reference, 'color', color, at); optional(reference, 'dash', (value, path) => choice(value, ['solid', 'dashed', 'dotted'], path), at); return Object.freeze(reference); })); }, 'spec');
    optional(spec, 'selection', selectionBinding, 'spec'); optional(spec, 'crosshair', (value, path) => value === false ? false : choice(value, ['x', 'y', 'xy'], path), 'spec');
    return ok(Object.freeze(spec) as unknown as ScatterChartSpec<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
export function validateScatterOptions<T>(value: unknown, ids: ReadonlySet<string>): ChartResult<ScatterMountOptions<T>> {
  try {
    const options = record(value, ['instanceId', 'initialState', 'onPointActivate', 'onStateChange', 'onSelectionChange', 'onDiagnostic'], ['instanceId'], 'options'); options.instanceId = text(options.instanceId, 'options.instanceId', 64); if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(options.instanceId as string)) fail('options.instanceId', 'BAD_INSTANCE_ID');
    optional(options, 'initialState', (value, path) => scatterState(value, ids, path), 'options'); for (const key of ['onPointActivate', 'onStateChange', 'onSelectionChange', 'onDiagnostic']) if (Object.hasOwn(options, key) && typeof options[key] !== 'function') fail('options.' + key);
    return ok(Object.freeze(options) as unknown as ScatterMountOptions<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_OPTIONS', 'options'); }
}
