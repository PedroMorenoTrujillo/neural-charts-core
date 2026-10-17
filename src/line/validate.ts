import type { ChartDiagnostic, ChartResult, ChartState } from '../public/chart-types.js';
import type { LineChartSpec, LineMountOptions } from '../public/line-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { selectionBinding } from '../internal/interaction/selection.js';
import { viewportBinding } from '../internal/interaction/viewport.js';
import { ValidationFailure } from '../internal/data/validation.js';

type RecordValue = Record<string, unknown>;
class Rejected { constructor(readonly diagnostic: ChartDiagnostic) {} }
function fail(reason: string, path: string, code: ChartDiagnostic['code'] = 'INVALID_CONFIG'): never {
  throw new Rejected(invalid(code, reason, path).diagnostic);
}
function object(value: unknown, fields: readonly string[], required: readonly string[], path: string): RecordValue {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail('BAD_LINE_SPEC', path);
  const result: RecordValue = Object.create(null) as RecordValue;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) fail('BAD_LINE_SPEC', path ? `${path}.${String(key)}` : String(key));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || descriptor.value === undefined) fail('BAD_LINE_SPEC', path ? `${path}.${key}` : key);
    result[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(result, key)) fail('BAD_LINE_SPEC', path ? `${path}.${key}` : key);
  return result;
}
function array(value: unknown, cap: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail('BAD_LINE_SPEC', path);
  if (value.length > cap) fail('RESOURCE_LIMIT', path);
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) fail('BAD_LINE_SPEC', path);
    if (!Object.getOwnPropertyDescriptor(value, key)?.hasOwnProperty('value')) fail('BAD_LINE_SPEC', `${path}[${key}]`);
  }
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail('BAD_LINE_SPEC', `${path}[${i}]`);
  return value as readonly unknown[];
}
function text(value: unknown, path: string, cap = 256, reason = 'BAD_LINE_SPEC'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > cap) fail(reason, path);
  return value;
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number') fail('WRONG_TYPE', path, 'INVALID_NUMBER');
  if (!Number.isFinite(value)) fail('NONFINITE', path, 'INVALID_NUMBER');
  return value === 0 ? 0 : value;
}
function epoch(value: unknown, path: string): number {
  const n = number(value, path);
  if (!Number.isInteger(n) || Math.abs(n) > 8.64e15) fail('OUTSIDE_DATE_RANGE', path, 'INVALID_NUMBER');
  return n;
}
function choice(value: unknown, choices: readonly unknown[], path: string, reason = 'BAD_LINE_SPEC'): unknown {
  if (!choices.includes(value)) fail(reason, path);
  return value;
}
function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) fail('BAD_COLOR', path);
  return value.toLowerCase();
}
function axis(value: unknown, isX: boolean, path: string): RecordValue {
  const a = object(value, isX ? ['kind', 'values', 'domain', 'nice', 'title', 'grid', 'edgeSpacing', 'ticks', 'labels'] : ['kind', 'domain', 'nice', 'includeZero', 'reversed', 'title', 'grid', 'ticks', 'labels'], ['kind'], path);
  choice(a.kind, isX ? ['category', 'linear', 'time'] : ['linear'], `${path}.kind`);
  const categorical = a.kind === 'category';
  if (categorical) {
    if (!Object.hasOwn(a, 'values')) fail('BAD_LINE_SPEC', `${path}.values`);
    if (Object.hasOwn(a, 'domain') || Object.hasOwn(a, 'nice')) fail('BAD_LINE_SPEC', path);
    array(a.values, 100_000, `${path}.values`);
    if (Object.hasOwn(a, 'edgeSpacing')) { const n = number(a.edgeSpacing, `${path}.edgeSpacing`); if (n < 0 || n > 2) fail('BAD_EDGE_SPACING', `${path}.edgeSpacing`); }
  } else {
    if (Object.hasOwn(a, 'values') || Object.hasOwn(a, 'edgeSpacing')) fail('BAD_LINE_SPEC', path);
    if (Object.hasOwn(a, 'domain')) {
      const d = array(a.domain, 2, `${path}.domain`);
      if (d.length !== 2 || typeof d[0] !== 'number' || typeof d[1] !== 'number' || !Number.isFinite(d[0]) || !Number.isFinite(d[1]) || d[0] >= d[1]) fail('BAD_DOMAIN', `${path}.domain`, 'INVALID_DOMAIN');
      if (a.kind === 'time' && d.some(n => !Number.isInteger(n) || Math.abs(n as number) > 8.64e15)) fail('BAD_DOMAIN', `${path}.domain`, 'INVALID_DOMAIN');
      a.domain = Object.freeze([d[0] === 0 ? 0 : d[0], d[1] === 0 ? 0 : d[1]]);
      if (a.nice === true) fail('BAD_DOMAIN_OPTIONS', `${path}.nice`);
      if (a.includeZero === true) fail('BAD_DOMAIN_OPTIONS', `${path}.includeZero`);
    }
  }
  for (const key of ['nice', 'grid', 'includeZero', 'reversed']) if (Object.hasOwn(a, key)) choice(a[key], [true, false], `${path}.${key}`);
  if (Object.hasOwn(a, 'title')) text(a.title, `${path}.title`);
  if (Object.hasOwn(a, 'ticks')) {
    const t = object(a.ticks, ['targetCount'], [], `${path}.ticks`);
    if (Object.hasOwn(t, 'targetCount') && (typeof t.targetCount !== 'number' || !Number.isInteger(t.targetCount) || t.targetCount < 2 || t.targetCount > 12)) fail('BAD_TICK_TARGET', `${path}.ticks.targetCount`);
    a.ticks = Object.freeze(t);
  }
  if (Object.hasOwn(a, 'labels')) {
    const l = object(a.labels, ['maxWidth'], [], `${path}.labels`);
    if (Object.hasOwn(l, 'maxWidth')) { const n = number(l.maxWidth, `${path}.labels.maxWidth`); if (n < 8 || n > 256) fail('BAD_LINE_SPEC', `${path}.labels.maxWidth`); }
    a.labels = Object.freeze(l);
  }
  return a;
}
function hidden(value: unknown, ids: ReadonlySet<string>, path: string): ChartState {
  const s = object(value, ['hiddenSeriesIds'], ['hiddenSeriesIds'], path), values = array(s.hiddenSeriesIds, 64, `${path}.hiddenSeriesIds`), seen = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    const id = values[i];
    if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) fail('BAD_STATE', `${path}.hiddenSeriesIds[${i}]`);
    seen.add(id);
  }
  return Object.freeze({ hiddenSeriesIds: Object.freeze([...seen]) });
}
export function validateState(value: unknown, ids: ReadonlySet<string>, path = 'state.value'): ChartResult<ChartState> {
  try { return ok(hidden(value, ids, path)); } catch (e) { return e instanceof Rejected ? { status: 'invalid', diagnostic: e.diagnostic } : invalid('INVALID_CONFIG', 'BAD_STATE', path); }
}
export function validateLine<T>(value: unknown): ChartResult<LineChartSpec<T>> {
  try {
    const s = object(value, ['family', 'title', 'description', 'axes', 'series', 'references', 'theme', 'direction', 'font', 'legend', 'tooltip', 'state', 'status', 'selection', 'crosshair', 'motion', 'viewport', 'labels'], ['family', 'title', 'axes', 'series'], '');
    choice(s.family, ['line'], 'family'); text(s.title, 'title');
    const axes = object(s.axes, ['x', 'y'], ['x', 'y'], 'axes'), x = axis(axes.x, true, 'axes.x'), y = axis(axes.y, false, 'axes.y');
    const ranks = new Map<string, number>();
    if (x.kind === 'category') {
      x.values = Object.freeze((x.values as readonly unknown[]).map((v, i) => {
        const path = `axes.x.values[${i}]`, c = object(v, ['id', 'label'], ['id'], path), id = text(c.id, `${path}.id`, 64);
        if (ranks.has(id)) fail('DUPLICATE_ID', `${path}.id`);
        ranks.set(id, i); if (Object.hasOwn(c, 'label')) text(c.label, `${path}.label`);
        return Object.freeze(c);
      }));
    }
    s.axes = Object.freeze({ x: Object.freeze(x), y: Object.freeze(y) });
    const series = array(s.series, 64, 'series'), ids = new Set<string>();
    // Precheck aggregate size before copying points.
    let count = 0;
    const checked = series.map((v, i) => {
      const a = object(v, ['id', 'name', 'data', 'curve', 'gaps', 'markers', 'dash', 'color'], ['id', 'name', 'data'], `series[${i}]`);
      const data = array(a.data, 100_000, `series[${i}].data`); count += data.length;
      if (count > 100_000) fail('RESOURCE_LIMIT', 'series');
      return { a, data };
    });
    let explicitMarkers = 0;
    s.series = Object.freeze(checked.map(({ a, data }, i) => {
      const path = `series[${i}]`, id = text(a.id, `${path}.id`, 64); text(a.name, `${path}.name`);
      if (ids.has(id)) fail('DUPLICATE_SERIES_ID', `${path}.id`); ids.add(id);
      const pointIds = new Set<string>(), xs = new Set<string | number>(); let previous = -Infinity;
      a.data = Object.freeze(data.map((v, j) => {
        const pp = `${path}.data[${j}]`, point = object(v, ['id', 'x', 'y', 'datum'], ['id', 'x', 'y'], pp), pid = text(point.id, `${pp}.id`, 64);
        if (pointIds.has(pid)) fail('DUPLICATE_POINT_ID', `${pp}.id`); pointIds.add(pid);
        let rank: number;
        if (x.kind === 'category') {
          if (typeof point.x !== 'string') fail('MIXED_AXIS_TYPE', `${pp}.x`);
          const r = ranks.get(point.x); if (r === undefined) fail('UNKNOWN_CATEGORY', `${pp}.x`, 'UNKNOWN_CATEGORY'); rank = r;
        } else {
          if (typeof point.x !== 'number') fail('MIXED_AXIS_TYPE', `${pp}.x`);
          point.x = x.kind === 'time' ? epoch(point.x, `${pp}.x`) : number(point.x, `${pp}.x`); rank = point.x as number;
        }
        if (xs.has(point.x as string | number)) fail('DUPLICATE_X', `${pp}.x`); xs.add(point.x as string | number);
        if (rank < previous) fail('UNSORTED_X', `${pp}.x`); previous = rank;
        if (point.y !== null) {
          point.y = number(point.y, `${pp}.y`);
          if (a.markers === 'on' && ++explicitMarkers > 5000) fail('RESOURCE_LIMIT', `${path}.markers`);
        }
        return Object.freeze(point);
      }));
      const choices = { curve: ['straight', 'step-before', 'step-after', 'step-mid'], gaps: ['break', 'connect'], markers: ['auto', 'on', 'off'], dash: ['solid', 'dashed', 'dotted'] };
      for (const key of ['curve', 'gaps', 'markers', 'dash'] as const) if (Object.hasOwn(a, key)) choice(a[key], choices[key], `${path}.${key}`, `BAD_${key.toUpperCase()}`);
      if (Object.hasOwn(a, 'color')) a.color = color(a.color, `${path}.color`);
      return Object.freeze(a);
    }));
    if (Object.hasOwn(s, 'references')) {
      const seen = new Set<string>();
      s.references = Object.freeze(array(s.references, 16, 'references').map((v, i) => {
        const path = `references[${i}]`, r = object(v, ['id', 'axis', 'value', 'label', 'color', 'dash'], ['id', 'axis', 'value'], path), id = text(r.id, `${path}.id`, 64, 'BAD_REFERENCE');
        if (seen.has(id)) fail('BAD_REFERENCE', `${path}.id`); seen.add(id); choice(r.axis, ['x', 'y'], `${path}.axis`, 'BAD_REFERENCE');
        if (r.axis === 'x' && x.kind === 'category') {
          if (typeof r.value !== 'string') fail('BAD_REFERENCE', `${path}.value`);
          if (!ranks.has(r.value)) fail('BAD_REFERENCE', `${path}.value`, 'UNKNOWN_CATEGORY');
        } else r.value = r.axis === 'x' && x.kind === 'time' ? epoch(r.value, `${path}.value`) : number(r.value, `${path}.value`);
        if (Object.hasOwn(r, 'label')) text(r.label, `${path}.label`);
        if (Object.hasOwn(r, 'color')) r.color = color(r.color, `${path}.color`);
        if (Object.hasOwn(r, 'dash')) choice(r.dash, ['solid', 'dashed', 'dotted'], `${path}.dash`, 'BAD_REFERENCE');
        return Object.freeze(r);
      }));
    }
    if (Object.hasOwn(s, 'state')) {
      const st = object(s.state, ['mode', 'value'], ['mode'], 'state'); choice(st.mode, ['internal', 'controlled'], 'state.mode', 'BAD_STATE');
      if (st.mode === 'controlled') st.value = hidden(st.value, ids, 'state.value');
      else if (Object.hasOwn(st, 'value')) fail('BAD_STATE', 'state.value');
      s.state = Object.freeze(st);
    }
    if (Object.hasOwn(s, 'status')) {
      const st = object(s.status, ['kind', 'message'], ['kind'], 'status'); choice(st.kind, ['ready', 'loading', 'empty', 'error'], 'status.kind', 'BAD_STATUS');
      if (st.kind === 'error' || Object.hasOwn(st, 'message')) text(st.message, 'status.message', 2048, 'BAD_STATUS');
      if (st.kind === 'ready' && Object.hasOwn(st, 'message')) fail('BAD_STATUS', 'status.message'); s.status = Object.freeze(st);
    }
    if (Object.hasOwn(s, 'description')) text(s.description, 'description', 2048);
    if (Object.hasOwn(s, 'theme')) choice(s.theme, ['light', 'dark', 'auto'], 'theme');
    if (Object.hasOwn(s, 'direction')) choice(s.direction, ['ltr', 'rtl'], 'direction');
    if (Object.hasOwn(s, 'font')) {
      const f = object(s.font, ['family', 'size', 'weight'], [], 'font');
      if (Object.hasOwn(f, 'family')) choice(f.family, ['sans-serif', 'serif', 'monospace'], 'font.family');
      if (Object.hasOwn(f, 'weight')) choice(f.weight, [400, 500, 600, 700], 'font.weight');
      if (Object.hasOwn(f, 'size')) { const n = number(f.size, 'font.size'); if (n < 10 || n > 18) fail('BAD_LINE_SPEC', 'font.size'); }
      s.font = Object.freeze(f);
    }
    for (const key of ['legend', 'tooltip'] as const) if (Object.hasOwn(s, key)) {
      const o = object(s[key], key === 'legend' ? ['position'] : ['mode', 'placement'], [], key);
      if (Object.hasOwn(o, 'position')) choice(o.position, ['bottom', 'end', 'none'], 'legend.position');
      if (Object.hasOwn(o, 'mode')) choice(o.mode, ['point', 'shared', 'off'], 'tooltip.mode');
      if (Object.hasOwn(o, 'placement')) choice(o.placement, ['top', 'bottom', 'start', 'end'], 'tooltip.placement');
      s[key] = Object.freeze(o);
    }
    if (Object.hasOwn(s, 'selection')) s.selection = selectionBinding(s.selection);
    if (Object.hasOwn(s, 'crosshair')) choice(s.crosshair, [false, 'x', 'y', 'xy'], 'crosshair');
    if (Object.hasOwn(s, 'motion')) choice(s.motion, ['none', 'subtle'], 'motion');
    if (Object.hasOwn(s, 'labels')) choice(s.labels, ['auto', 'off'], 'labels');
    if (Object.hasOwn(s, 'viewport')) s.viewport = viewportBinding(s.viewport);
    return ok(Object.freeze(s) as unknown as LineChartSpec<T>);
  } catch (e) { return e instanceof Rejected || e instanceof ValidationFailure ? { status: 'invalid', diagnostic: e.diagnostic } : invalid('INVALID_CONFIG', 'BAD_LINE_SPEC', ''); }
}
export function validateOptions<T>(value: unknown): ChartResult<LineMountOptions<T>> {
  try {
    const o = object(value, ['instanceId', 'initialState', 'onPointActivate', 'onStateChange', 'onSelectionChange', 'onViewportChange', 'onDiagnostic'], ['instanceId'], 'options');
    if (typeof o.instanceId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(o.instanceId)) fail('BAD_INSTANCE_ID', 'options.instanceId');
    for (const key of ['onPointActivate', 'onStateChange', 'onSelectionChange', 'onViewportChange', 'onDiagnostic']) if (Object.hasOwn(o, key) && typeof o[key] !== 'function') fail('BAD_LINE_SPEC', `options.${key}`);
    return ok(Object.freeze(o) as unknown as LineMountOptions<T>);
  } catch (e) { return e instanceof Rejected ? { status: 'invalid', diagnostic: e.diagnostic } : invalid('INVALID_CONFIG', 'BAD_LINE_SPEC', 'options'); }
}
