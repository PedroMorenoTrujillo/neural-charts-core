import {array, choice, fail, number, record, text} from '../internal/data/validation.js';
import {finiteExtent, normalizeNumericDomain, validDomain} from '../internal/math/domain.js';
import type {Domain} from '../internal/math/domain.js';
import {createLinearScale} from '../internal/math/linear.js';
import {createTimeScale, normalizeTimeDomain, selectTimeTicks} from '../internal/math/time.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {isTimestamp} from '../internal/math/utc.js';
import {formatAxis} from '../internal/axes/plan.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport, planViewportState} from './viewport.js';
import type {PlanOptions, PlanProjectedReference, PlanReference, PlanViewportConfig, PlanViewportState} from '../public/plan-types.js';
import type {PlanTemporalAxis} from '../public/temporal-plan-types.js';
import type {Plot} from '../internal/layout/frame.js';

export const MAX_TEMPORAL_SERIES = 16;

export function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') fail(path);
  return value;
}

export function parseTemporalAxis(input: unknown, path: string): PlanTemporalAxis {
  const source = record(input, ['kind', 'domain', 'reversed', 'nice', 'includeZero', 'unit'], ['kind'], path);
  const kind = choice(source.kind, ['linear', 'time'], path + '.kind');
  let domain: Domain | undefined;
  if (source.domain !== undefined) {
    if (!validDomain(source.domain)) fail(path + '.domain', 'BAD_DOMAIN');
    domain = [source.domain[0], source.domain[1]];
    if (kind === 'time' && (!isTimestamp(domain[0]) || !isTimestamp(domain[1]))) fail(path + '.domain', 'BAD_TIMESTAMP');
  }
  const reversed = optionalBoolean(source.reversed, path + '.reversed');
  const nice = optionalBoolean(source.nice, path + '.nice');
  const shared = {...(domain ? {domain} : {}), ...(reversed === undefined ? {} : {reversed}), ...(nice === undefined ? {} : {nice})};
  if (kind === 'time') {
    if (source.includeZero !== undefined || source.unit !== undefined) fail(path, 'INCOMPATIBLE_TIME_AXIS');
    return {kind, ...shared};
  }
  const includeZero = optionalBoolean(source.includeZero, path + '.includeZero');
  return {kind, ...shared, ...(includeZero === undefined ? {} : {includeZero}), ...(source.unit === undefined ? {} : {unit: text(source.unit, path + '.unit', 64, true)})};
}

export function temporalValue(value: unknown, axis: PlanTemporalAxis, path: string): number | null {
  if (value === null) return null;
  const result = number(value, path);
  if (axis.kind === 'time' && !isTimestamp(result)) fail(path, 'BAD_TIMESTAMP');
  return result;
}

export interface TemporalOptions {
  readonly width: number;
  readonly height: number;
  readonly hidden: ReadonlySet<string>;
  readonly viewport?: PlanViewportConfig;
  readonly references: readonly PlanReference[];
}

export function temporalOptions(input: PlanOptions, axis: PlanTemporalAxis, seriesIds: ReadonlySet<string>): TemporalOptions {
  const options = record(input, ['width', 'height', 'hiddenSeriesIds', 'viewport', 'stacking', 'references'], ['width', 'height'], 'options');
  const width = number(options.width, 'options.width', 64, 10000);
  const height = number(options.height, 'options.height', 64, 10000);
  if (options.stacking !== undefined) fail('options.stacking', 'INCOMPATIBLE_STACKING');
  const hidden = new Set<string>();
  for (const [index, value] of array(options.hiddenSeriesIds ?? [], MAX_TEMPORAL_SERIES, 'options.hiddenSeriesIds').entries()) {
    const id = text(value, `options.hiddenSeriesIds[${index}]`, 256);
    if (!seriesIds.has(id)) fail(`options.hiddenSeriesIds[${index}]`, 'UNKNOWN_SERIES');
    if (hidden.has(id)) fail(`options.hiddenSeriesIds[${index}]`, 'DUPLICATE_ID');
    hidden.add(id);
  }
  let viewport: PlanViewportConfig | undefined;
  if (options.viewport !== undefined) {
    const raw = record(options.viewport, ['axes', 'value'], ['axes'], 'options.viewport');
    if (raw.axes !== 'x') fail('options.viewport.axes', 'X_VIEWPORT_ONLY');
    let value: Readonly<{x?: readonly [number, number]}> | undefined;
    if (raw.value !== undefined) {
      const window = record(raw.value, ['x'], [], 'options.viewport.value');
      if (window.x !== undefined) {
        if (!validDomain(window.x)) fail('options.viewport.value.x', 'BAD_VIEWPORT');
        if (axis.kind === 'time' && (!isTimestamp(window.x[0]) || !isTimestamp(window.x[1]))) fail('options.viewport.value.x', 'BAD_TIMESTAMP');
        value = {x: [window.x[0], window.x[1]]};
      } else value = {};
    }
    viewport = {axes: 'x', ...(value === undefined ? {} : {value})};
  }
  const referenceIds = new Set<string>();
  const references = array(options.references ?? [], 64, 'options.references').map((item, index): PlanReference => {
    const path = `options.references[${index}]`, raw = record(item, ['id', 'axis', 'value'], ['id', 'axis', 'value'], path);
    const id = text(raw.id, path + '.id', 256);
    if (referenceIds.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    referenceIds.add(id);
    if (raw.axis !== 'x') fail(path + '.axis', 'X_REFERENCE_ONLY');
    const value = temporalValue(raw.value, axis, path + '.value');
    if (value === null) fail(path + '.value', 'BAD_REFERENCE');
    return {id, axis: 'x', value};
  });
  return {width, height, hidden, references, ...(viewport === undefined ? {} : {viewport})};
}

export interface TemporalProjection {
  readonly domain: Domain;
  readonly map: (value: number) => number | null;
  readonly labels: readonly Readonly<{x: number; label: string}>[];
  readonly viewport?: PlanViewportState;
  readonly references: readonly PlanProjectedReference[];
}

export function temporalProjection(axis: PlanTemporalAxis, values: readonly number[], rows: readonly Readonly<{id: string; label: string}>[], rowReversed: boolean, plot: Plot, options: TemporalOptions): TemporalProjection {
  const extent = finiteExtent(values);
  const normalized = axis.kind === 'time'
    ? normalizeTimeDomain(extent, {...(axis.domain ? {explicit: axis.domain} : {})})
    : normalizeNumericDomain(extent, {includeZero: axis.includeZero ?? false, ...(axis.domain ? {explicit: axis.domain} : {})});
  if (normalized.status === 'invalid') fail(normalized.diagnostic.path, normalized.diagnostic.reason, normalized.diagnostic.code);
  const initial: Domain = normalized.status === 'empty' ? [0, 1] : normalized.domain;
  const axes = {x: axis, y: {kind: 'category' as const, values: rows, reversed: rowReversed}};
  const view = preparePlanViewport(axes, {x: initial, y: null}, options.viewport);
  if (view.status === 'invalid') fail(view.diagnostic.path, view.diagnostic.reason, view.diagnostic.code);
  const scoped = withViewportDomains({x: initial, y: null}, view.value);
  const window = scoped.x ?? initial;
  const tickOptions = {targetCount: Math.max(2, Math.min(8, Math.floor(plot.width / 72))), nice: options.viewport || axis.domain ? false : axis.nice ?? false};
  const ticks = axis.kind === 'time' ? selectTimeTicks(window, tickOptions) : selectNumericTicks(window, tickOptions);
  if (ticks.status === 'invalid') fail(ticks.diagnostic.path, ticks.diagnostic.reason, ticks.diagnostic.code);
  const domain = ticks.value.domain;
  const range: readonly [number, number] = axis.reversed ? [plot.x + plot.width, plot.x] : [plot.x, plot.x + plot.width];
  const scale = axis.kind === 'time' ? createTimeScale(domain, range, true) : createLinearScale(domain, range, true);
  if (scale.status === 'invalid') fail(scale.diagnostic.path, scale.diagnostic.reason, scale.diagnostic.code);
  const labels = ticks.value.ticks.map(value => ({x: scale.value.map(value)!, label: formatAxis(value, axis.kind, 'interval' in ticks.value ? ticks.value.interval : null, new Map())}));
  const references: PlanProjectedReference[] = options.references.map(reference => {
    if (reference.axis !== 'x' || typeof reference.value !== 'number') fail('options.references', 'X_REFERENCE_ONLY');
    const value = reference.value;
    const x = scale.value.map(value);
    return value < domain[0] || value > domain[1] || x === null
      ? {id: reference.id, axis: 'x', status: 'outside'}
      : {id: reference.id, axis: 'x', status: 'visible', line: {x1: x, x2: x, y1: plot.y, y2: plot.y + plot.height}};
  });
  const viewport = planViewportState(view.value, {x: domain, y: null}, axes, plot);
  return {domain, map: scale.value.map, labels, references, ...(viewport === undefined ? {} : {viewport})};
}
