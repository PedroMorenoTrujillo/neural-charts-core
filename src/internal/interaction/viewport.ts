import type { ChartAxisWindow, ChartCategoryWindow, ChartNumericWindow, ChartViewportValue, ChartViewportBinding } from '../../public/viewport-types.js';
import type { ChartResult } from '../../public/chart-types.js';
import type { Domain } from '../math/domain.js';
import { record, array, text, number, choice, fail, ValidationFailure } from '../data/validation.js';
import { invalid, ok } from '../diagnostics.js';
import { zoomNumeric, panNumeric, panTime, zoomCategory, panCategory } from './viewport-math.js';

type Axis = 'x' | 'y';
export type ViewportValue = ChartViewportValue<ChartAxisWindow, ChartAxisWindow>;
export type ViewportAxis = Readonly<{ kind: 'linear' | 'time'; domain: Domain | null; automatic: Domain | null }>
  | Readonly<{ kind: 'category'; ids: readonly string[]; ranks: ReadonlyMap<string, number> }>;
export type ViewportContext = Readonly<{ x: ViewportAxis; y: ViewportAxis }>;
export type ViewportSettings = Readonly<{ mode: 'internal' | 'controlled'; axes: 'x' | 'y' | 'xy'; gesture: 'none' | 'pan' | 'zoom'; wheel: boolean; controls: boolean }>;
export type Viewport = Readonly<{ settings: ViewportSettings; value: ViewportValue; resolved: ViewportValue; context: ViewportContext }>;
const axes: readonly Axis[] = ['x', 'y'];
const enabled = (settings: ViewportSettings, axis: Axis): boolean => settings.axes === 'xy' || settings.axes === axis;
const numeric = (window: ChartAxisWindow): window is ChartNumericWindow => Array.isArray(window);
function result<T>(callback: () => T): ChartResult<T> {
  try { return ok(callback()); }
  catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_VIEWPORT', 'viewport'); }
}
function boolean(value: unknown, path: string): boolean { if (typeof value !== 'boolean') fail(path); return value; }
/** Descriptor-safe structural copy for spec validators; actual axis kind and
 * bounds are checked when the normalized dataset provides a full context. */
export function viewportBinding(input: unknown): ChartViewportBinding<ChartAxisWindow, ChartAxisWindow> {
  if (input === false) return false;
  const config = record(input, ['mode', 'axes', 'gesture', 'wheel', 'controls', 'initial', 'value'], ['mode', 'axes'], 'viewport');
  const settings: ViewportSettings = Object.freeze({ mode: choice(config.mode, ['internal', 'controlled'], 'viewport.mode'), axes: choice(config.axes, ['x', 'y', 'xy'], 'viewport.axes'), gesture: Object.hasOwn(config, 'gesture') ? choice(config.gesture, ['none', 'pan', 'zoom'], 'viewport.gesture') : 'none', wheel: Object.hasOwn(config, 'wheel') ? boolean(config.wheel, 'viewport.wheel') : false, controls: Object.hasOwn(config, 'controls') ? boolean(config.controls, 'viewport.controls') : true });
  const read = (input: unknown, path: string): ViewportValue => {
    const source = record(input, axes, [], path), copy: { x?: ChartAxisWindow; y?: ChartAxisWindow } = {};
    for (const axis of axes) if (Object.hasOwn(source, axis)) {
      if (!enabled(settings, axis)) fail(path + '.' + axis, 'DISABLED_VIEWPORT_AXIS');
      if (Array.isArray(source[axis])) {
        const tuple = array(source[axis], 2, path + '.' + axis); if (tuple.length !== 2) fail(path + '.' + axis);
        const low = number(tuple[0], path + '.' + axis + '[0]'), high = number(tuple[1], path + '.' + axis + '[1]'); if (low >= high) fail(path + '.' + axis, 'BAD_VIEWPORT_WINDOW', 'INVALID_DOMAIN');
        copy[axis] = Object.freeze([low, high] as const);
      } else {
        const window = record(source[axis], ['firstId', 'lastId'], ['firstId', 'lastId'], path + '.' + axis);
        copy[axis] = Object.freeze({ firstId: text(window.firstId, path + '.' + axis + '.firstId', 128), lastId: text(window.lastId, path + '.' + axis + '.lastId', 128) });
      }
    }
    return Object.freeze(copy);
  };
  if (settings.mode === 'controlled') { if (Object.hasOwn(config, 'initial')) fail('viewport.initial', 'DOUBLE_VIEWPORT_OWNER'); return Object.freeze({ ...settings, mode: 'controlled', value: read(config.value, 'viewport.value') }); }
  if (Object.hasOwn(config, 'value')) fail('viewport.value', 'DOUBLE_VIEWPORT_OWNER');
  return Object.freeze({ ...settings, mode: 'internal', ...(Object.hasOwn(config, 'initial') ? { initial: read(config.initial, 'viewport.initial') } : {}) });
}
export function numericViewportAxis(kind: 'linear' | 'time', domain: Domain | null, automatic: Domain | null = domain): ChartResult<ViewportAxis> {
  return result(() => {
    const clone = (input: Domain | null): Domain | null => {
      if (!input) return null;
      const values = array(input, 2, 'viewport.bounds'); if (values.length !== 2) fail('viewport.bounds');
      const low = number(values[0], 'viewport.bounds[0]'), high = number(values[1], 'viewport.bounds[1]');
      if (low >= high || kind === 'time' && (![low, high].every(Number.isSafeInteger) || low < -8640000000000000 || high > 8640000000000000)) fail('viewport.bounds', 'BAD_VIEWPORT_BOUNDS');
      return Object.freeze([low, high] as const);
    };
    const bounds = clone(domain), auto = clone(automatic);
    if (auto && (!bounds || auto[0] < bounds[0] || auto[1] > bounds[1])) fail('viewport.bounds', 'AUTOMATIC_WINDOW_OUTSIDE_BOUNDS');
    return Object.freeze({ kind, domain: bounds, automatic: auto });
  });
}
export function categoryViewportAxis(ids: readonly string[]): ChartResult<ViewportAxis> {
  return result(() => {
    const owned = array(ids, 1000000, 'viewport.categories').map((id, index) => text(id, 'viewport.categories[' + index + ']', 128)), ranks = new Map<string, number>();
    owned.forEach((id, index) => { if (ranks.has(id)) fail('viewport.categories[' + index + ']', 'DUPLICATE_CATEGORY'); ranks.set(id, index); });
    return Object.freeze({ kind: 'category', ids: Object.freeze(owned), ranks });
  });
}
function full(axis: ViewportAxis): ChartAxisWindow | undefined {
  return axis.kind === 'category' ? axis.ids.length ? Object.freeze({ firstId: axis.ids[0]!, lastId: axis.ids[axis.ids.length - 1]! }) : undefined : axis.automatic ?? undefined;
}
function readWindow(input: unknown, axis: ViewportAxis, path: string, boundsRequired = true): ChartAxisWindow {
  if (axis.kind === 'category') {
    const value = record(input, ['firstId', 'lastId'], ['firstId', 'lastId'], path), firstId = text(value.firstId, path + '.firstId', 128), lastId = text(value.lastId, path + '.lastId', 128), first = axis.ranks.get(firstId), last = axis.ranks.get(lastId);
    if (boundsRequired && (first === undefined || last === undefined || first > last)) fail(path, 'BAD_CATEGORY_WINDOW');
    return Object.freeze({ firstId, lastId });
  }
  const value = array(input, 2, path); if (value.length !== 2) fail(path, 'BAD_VIEWPORT_WINDOW');
  const low = number(value[0], path + '[0]'), high = number(value[1], path + '[1]');
  if (low >= high || boundsRequired && (!axis.domain || low < axis.domain[0] || high > axis.domain[1]) || axis.kind === 'time' && (!Number.isSafeInteger(low) || !Number.isSafeInteger(high))) fail(path, 'BAD_VIEWPORT_WINDOW', 'INVALID_DOMAIN');
  return Object.freeze([low, high] as const);
}
function readValue(input: unknown, settings: ViewportSettings, context: ViewportContext, path: string, boundsRequired = true): ViewportValue {
  const config = record(input, axes, [], path), value: { x?: ChartAxisWindow; y?: ChartAxisWindow } = {};
  for (const axis of axes) if (Object.hasOwn(config, axis)) { if (!enabled(settings, axis)) fail(path + '.' + axis, 'DISABLED_VIEWPORT_AXIS'); value[axis] = readWindow(config[axis], context[axis], path + '.' + axis, boundsRequired); }
  return Object.freeze(value);
}
function snapshot(settings: ViewportSettings, value: ViewportValue, context: ViewportContext): Viewport {
  const resolved: { x?: ChartAxisWindow; y?: ChartAxisWindow } = {};
  for (const axis of axes) if (enabled(settings, axis)) { const window = value[axis] ?? full(context[axis]); if (window) resolved[axis] = window; }
  return Object.freeze({ settings, value, resolved: Object.freeze(resolved), context: Object.freeze({ ...context }) });
}
function reconcile(value: ViewportValue, settings: ViewportSettings, context: ViewportContext): ViewportValue {
  const next: { x?: ChartAxisWindow; y?: ChartAxisWindow } = {};
  for (const key of axes) {
    const previous = value[key], bounds = context[key]; if (!previous || !enabled(settings, key)) continue;
    if (bounds.kind === 'category') {
      if (numeric(previous)) continue;
      const first = bounds.ranks.get(previous.firstId), last = bounds.ranks.get(previous.lastId);
      if (first !== undefined && last !== undefined && first <= last) next[key] = Object.freeze({ ...previous });
    } else if (numeric(previous) && bounds.domain) {
      const low = Math.max(previous[0], bounds.domain[0]), high = Math.min(previous[1], bounds.domain[1]);
      if (low < high && (bounds.kind !== 'time' || Number.isSafeInteger(low) && Number.isSafeInteger(high))) next[key] = Object.freeze([low, high] as const);
    }
  }
  return Object.freeze(next);
}
/** Prepare an immutable applied owner. Context changes clamp internal windows;
 * controlled windows reject invalid data/window combinations atomically. */
export function prepareViewport(input: unknown, context: ViewportContext, previous: Viewport | null = null): ChartResult<Viewport | null> {
  return result(() => {
    if (input === undefined || input === false) return null;
    const binding = viewportBinding(input); if (!binding) return null;
    const settings: ViewportSettings = Object.freeze({ mode: binding.mode, axes: binding.axes, gesture: binding.gesture ?? 'none', wheel: binding.wheel ?? false, controls: binding.controls ?? true });
    let value: ViewportValue;
    if (binding.mode === 'controlled') value = readValue(binding.value, settings, context, 'viewport.value');
    else { const internal = previous?.settings.mode === 'internal'; const initial = binding.initial ? readValue(binding.initial, settings, context, 'viewport.initial', !internal) : Object.freeze({}); value = internal ? reconcile(previous.value, settings, context) : initial; }
    return snapshot(settings, value, context);
  });
}
export function sameViewport(a: ViewportValue, b: ViewportValue): boolean {
  return axes.every(axis => { const x = a[axis], y = b[axis]; return x === undefined || y === undefined ? x === y : numeric(x) && numeric(y) ? x[0] === y[0] && x[1] === y[1] : !numeric(x) && !numeric(y) && x.firstId === y.firstId && x.lastId === y.lastId; });
}
/** A proposal does not mutate its applied snapshot. The controller alone
 * decides whether an internal request applies or a controlled request emits. */
export function requestViewport(current: Viewport, input: unknown): ChartResult<Viewport> {
  return result(() => snapshot(current.settings, readValue(input, current.settings, current.context, 'viewport.value'), current.context));
}
function transformed(current: Viewport, operation: 'zoom' | 'pan', values: Readonly<{ x?: number; y?: number }>, anchors: Readonly<{ x?: number; y?: number }> = {}): ChartResult<Viewport> {
  const value: { x?: ChartAxisWindow; y?: ChartAxisWindow } = { ...current.value };
  for (const axis of axes) {
    if (!enabled(current.settings, axis) || values[axis] === undefined || operation === 'pan' && values[axis] === 0 || operation === 'zoom' && values[axis] === 1) continue;
    const window = current.resolved[axis], bounds = current.context[axis]; if (!window) return invalid('INVALID_DOMAIN', 'NO_VIEWPORT_DOMAIN', 'viewport.' + axis);
    const amount = values[axis]!, anchor = anchors[axis] ?? .5;
    const changed = bounds.kind === 'category' && !numeric(window)
      ? operation === 'zoom' ? zoomCategory(window, bounds.ids, bounds.ranks, amount, anchor) : panCategory(window, bounds.ids, bounds.ranks, amount)
      : bounds.kind !== 'category' && bounds.domain && numeric(window)
        ? operation === 'zoom' ? zoomNumeric(window, bounds.domain, amount, anchor) : (bounds.kind === 'time' ? panTime : panNumeric)(window, bounds.domain, amount)
        : invalid('INVALID_DOMAIN', 'BAD_VIEWPORT_WINDOW', 'viewport.' + axis);
    if (changed.status === 'invalid') return changed;
    let next = changed.value;
    if (bounds.kind === 'time' && bounds.domain && numeric(next)) next = Object.freeze([Math.max(bounds.domain[0], Math.floor(next[0])), Math.min(bounds.domain[1], Math.ceil(next[1]))] as const);
    value[axis] = next;
  }
  return requestViewport(current, value);
}
export function zoomViewport(current: Viewport, factor: number, anchors: Readonly<{ x?: number; y?: number }> = {}): ChartResult<Viewport> { return transformed(current, 'zoom', { x: factor, y: factor }, anchors); }
export function panViewport(current: Viewport, delta: Readonly<{ x?: number; y?: number }>): ChartResult<Viewport> { return transformed(current, 'pan', delta); }
export function viewportCategoryWindow(value: ChartAxisWindow): ChartCategoryWindow | null { return numeric(value) ? null : value; }
