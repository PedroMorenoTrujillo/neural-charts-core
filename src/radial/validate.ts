import type { ChartResult, ChartStatus } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { selectionBinding } from '../internal/interaction/selection.js';
import type { RadialChartSpec, RadialState, PieSlice, RadialMountOptions } from '../public/radial-types.js';
import { record, array, text, number, choice, color, optional, fail, ValidationFailure } from '../internal/data/validation.js';
const familyKeys = ['family', 'title', 'description', 'data', 'theme', 'direction', 'font', 'legend', 'tooltip', 'labels', 'state', 'status', 'selection', 'motion'];
export function validateRadialState(value: unknown, ids: ReadonlySet<string>, path = 'state'): RadialState {
  const result = record(value, ['hiddenSliceIds'], ['hiddenSliceIds'], path), seen = new Set<string>();
  const hidden = array(result.hiddenSliceIds, 1000, path + '.hiddenSliceIds').map((value, i) => {
    const id = text(value, path + '.hiddenSliceIds[' + i + ']', 128);
    if (!ids.has(id) || seen.has(id)) fail(path, 'BAD_STATE'); seen.add(id); return id;
  });
  return Object.freeze({ hiddenSliceIds: Object.freeze(hidden) });
}
export function validateRadial<T>(value: unknown, family: 'pie' | 'donut'): ChartResult<RadialChartSpec<T>> {
  try {
    const spec = record(value, family === 'donut' ? [...familyKeys, 'holeRatio', 'center'] : familyKeys, ['family', 'title', 'data'], 'spec');
    choice(spec.family, [family], 'family'); spec.title = text(spec.title, 'title');
    optional(spec, 'description', (value, path) => text(value, path, 4096, true), 'spec');
    optional(spec, 'theme', (value, path) => choice(value, ['light', 'dark', 'auto'], path), 'spec');
    optional(spec, 'direction', (value, path) => choice(value, ['ltr', 'rtl'], path), 'spec');
    optional(spec, 'labels', (value, path) => choice(value, ['outside', 'inside', 'off'], path), 'spec');
    optional(spec, 'font', (value, path) => {
      const font = record(value, ['family', 'size', 'weight'], [], path);
      optional(font, 'family', (value, path) => choice(value, ['sans-serif', 'serif', 'monospace'], path), path);
      optional(font, 'size', (value, path) => number(value, path, 8, 32), path);
      optional(font, 'weight', (value, path) => choice(value, [400, 500, 600, 700], path), path); return Object.freeze(font);
    }, 'spec');
    optional(spec, 'legend', (value, path) => {
      const legend = record(value, ['position'], [], path); optional(legend, 'position', (value, path) => choice(value, ['bottom', 'end', 'none'], path), path); return Object.freeze(legend);
    }, 'spec');
    optional(spec, 'tooltip', (value, path) => {
      const tooltip = record(value, ['mode', 'placement'], [], path); optional(tooltip, 'mode', (value, path) => choice(value, ['point', 'off'], path), path);
      optional(tooltip, 'placement', (value, path) => choice(value, ['top', 'bottom', 'start', 'end'], path), path); return Object.freeze(tooltip);
    }, 'spec');
    const ids = new Set<string>();
    spec.data = Object.freeze(array(spec.data, 1000, 'data').map((raw, i): PieSlice<T> => {
      const path = 'data[' + i + ']', point = record(raw, ['id', 'label', 'value', 'color', 'datum'], ['id', 'label', 'value'], path, ['datum']);
      const id = text(point.id, path + '.id', 128); if (ids.has(id)) fail(path + '.id', 'DUPLICATE_ID'); ids.add(id);
      const label = text(point.label, path + '.label', 1024), value = point.value === null ? null : number(point.value, path + '.value', 0);
      return Object.freeze({ id, label, value, ...(Object.hasOwn(point, 'color') ? { color: color(point.color, path + '.color') } : {}), ...(Object.hasOwn(point, 'datum') ? { datum: point.datum as T } : {}) });
    }));
    optional(spec, 'state', (value, path) => {
      const state = record(value, ['mode', 'value'], ['mode'], path), mode = choice(state.mode, ['internal', 'controlled'], path + '.mode');
      if (mode === 'internal') { if (Object.hasOwn(state, 'value')) fail(path, 'BAD_STATE'); return Object.freeze({ mode }); }
      return Object.freeze({ mode, value: validateRadialState(state.value, ids, path + '.value') });
    }, 'spec');
    optional(spec, 'status', (value, path): ChartStatus => {
      const status = record(value, ['kind', 'message'], ['kind'], path), kind = choice(status.kind, ['ready', 'loading', 'empty', 'error'], path + '.kind');
      if (kind === 'ready') { if (Object.hasOwn(status, 'message')) fail(path); return Object.freeze({ kind }); }
      const message = Object.hasOwn(status, 'message') ? text(status.message, path + '.message', 2048) : undefined;
      if (kind === 'error') { if (message === undefined) fail(path + '.message'); return Object.freeze({ kind, message }); }
      return Object.freeze({ kind, ...(message === undefined ? {} : { message }) });
    }, 'spec');
    if (family === 'donut') {
      optional(spec, 'holeRatio', (value, path) => { const ratio = number(value, path, 0, 1); if (ratio === 1) fail(path, 'BAD_HOLE_RATIO'); return ratio; }, 'spec');
      optional(spec, 'center', (value, path) => {
        if (value === false) return false; const center = record(value, ['label', 'value'], [], path);
        optional(center, 'label', (value, path) => text(value, path, 256, true), path); optional(center, 'value', (value, path) => text(value, path, 128, true), path); return Object.freeze(center);
      }, 'spec');
    }
    optional(spec, 'selection', selectionBinding, 'spec');
    optional(spec, 'motion', (value, path) => choice(value, ['none', 'subtle'], path), 'spec');
    return ok(Object.freeze(spec) as unknown as RadialChartSpec<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
export function validateRadialOptions<T>(value: unknown, ids: ReadonlySet<string>): ChartResult<RadialMountOptions<T>> {
  try {
    const options = record(value, ['instanceId', 'initialState', 'onPointActivate', 'onStateChange', 'onSelectionChange', 'onDiagnostic'], ['instanceId'], 'options');
    options.instanceId = text(options.instanceId, 'options.instanceId', 64);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(options.instanceId as string)) fail('options.instanceId', 'BAD_INSTANCE_ID');
    optional(options, 'initialState', (value, path) => validateRadialState(value, ids, path), 'options');
    for (const key of ['onPointActivate', 'onStateChange', 'onSelectionChange', 'onDiagnostic']) if (Object.hasOwn(options, key) && typeof options[key] !== 'function') fail('options.' + key);
    return ok(Object.freeze(options) as unknown as RadialMountOptions<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_OPTIONS', 'options'); }
}
