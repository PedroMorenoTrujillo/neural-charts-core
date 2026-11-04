import {array, choice, fail, number, record, text} from '../internal/data/validation.js';
import {finiteExtent, normalizeNumericDomain, validDomain} from '../internal/math/domain.js';
import type {Domain} from '../internal/math/domain.js';
import {createLinearScale} from '../internal/math/linear.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport, planViewportState} from './viewport.js';
import {optionalBoolean, parseTemporalAxis} from './temporal-axis.js';
import type {Plot} from '../internal/layout/frame.js';
import type {PlanOptions, PlanReference, PlanViewportConfig, PlanViewportState} from '../public/plan-types.js';
import type {PlanTemporalAxis} from '../public/temporal-plan-types.js';

export type ComparisonValueAxis = Extract<PlanTemporalAxis, {kind: 'linear'}>;
export interface ComparisonCategory {readonly id: string; readonly label: string;}
export interface ComparisonCategoryAxis {readonly kind: 'category'; readonly values: readonly ComparisonCategory[]; readonly reversed?: boolean;}

export function comparisonAxes(input: unknown): Readonly<{x: ComparisonCategoryAxis; y: ComparisonValueAxis}> {
  const source = record(input, ['x', 'y'], ['x', 'y'], 'spec.axes');
  const raw = record(source.x, ['kind', 'values', 'reversed'], ['kind', 'values'], 'spec.axes.x');
  choice(raw.kind, ['category'], 'spec.axes.x.kind');
  const seen = new Set<string>();
  const values = array(raw.values, 64, 'spec.axes.x.values').map((item, index) => {
    const path = `spec.axes.x.values[${index}]`, category = record(item, ['id', 'label'], ['id', 'label'], path);
    const id = text(category.id, path + '.id', 256), label = text(category.label, path + '.label', 256, true);
    if (seen.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    seen.add(id);
    return {id, label};
  });
  const reversed = optionalBoolean(raw.reversed, 'spec.axes.x.reversed');
  const value = parseTemporalAxis(source.y, 'spec.axes.y');
  if (value.kind !== 'linear') fail('spec.axes.y.kind', 'NUMERIC_VALUE_AXIS_ONLY');
  return {x: {kind: 'category', values, ...(reversed === undefined ? {} : {reversed})}, y: value};
}

export interface ComparisonOptions {
  readonly width: number;
  readonly height: number;
  readonly hidden: ReadonlySet<string>;
  readonly references: readonly PlanReference[];
  readonly viewport?: PlanViewportConfig;
}

export function comparisonOptions(input: PlanOptions, seriesIds: ReadonlySet<string>, categoryIds: ReadonlySet<string>, allowYViewport: boolean): ComparisonOptions {
  const source = record(input, ['width', 'height', 'hiddenSeriesIds', 'viewport', 'stacking', 'references'], ['width', 'height'], 'options');
  const width = number(source.width, 'options.width', 64, 10000), height = number(source.height, 'options.height', 64, 10000);
  if (source.stacking !== undefined) fail('options.stacking', 'INCOMPATIBLE_STACKING');
  const hidden = new Set<string>();
  for (const [index, value] of array(source.hiddenSeriesIds ?? [], 16, 'options.hiddenSeriesIds').entries()) {
    const id = text(value, `options.hiddenSeriesIds[${index}]`, 128);
    if (!seriesIds.has(id)) fail(`options.hiddenSeriesIds[${index}]`, 'UNKNOWN_SERIES');
    if (hidden.has(id)) fail(`options.hiddenSeriesIds[${index}]`, 'DUPLICATE_ID');
    hidden.add(id);
  }
  let viewport: PlanViewportConfig | undefined;
  if (source.viewport !== undefined) {
    if (!allowYViewport) fail('options.viewport', 'UNSUPPORTED_VIEWPORT');
    const raw = record(source.viewport, ['axes', 'value'], ['axes'], 'options.viewport');
    if (raw.axes !== 'y') fail('options.viewport.axes', 'NUMERIC_Y_VIEWPORT_ONLY');
    let value: Readonly<{y?: Domain}> | undefined;
    if (raw.value !== undefined) {
      const window = record(raw.value, ['y'], [], 'options.viewport.value');
      if (window.y !== undefined) {
        if (!validDomain(window.y)) fail('options.viewport.value.y', 'BAD_VIEWPORT');
        value = {y: [window.y[0], window.y[1]]};
      } else value = {};
    }
    viewport = {axes: 'y', ...(value === undefined ? {} : {value})};
  }
  const ids = new Set<string>();
  const references = array(source.references ?? [], 64, 'options.references').map((item, index): PlanReference => {
    const path = `options.references[${index}]`, raw = record(item, ['id', 'axis', 'value'], ['id', 'axis', 'value'], path);
    const id = text(raw.id, path + '.id', 256);
    if (ids.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    ids.add(id);
    const axis = choice(raw.axis, ['x', 'y'], path + '.axis');
    if (axis === 'x') {
      const value = text(raw.value, path + '.value', 256);
      if (!categoryIds.has(value)) fail(path + '.value', 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
      return {id, axis, value};
    }
    return {id, axis, value: number(raw.value, path + '.value')};
  });
  return {width, height, hidden, references, ...(viewport === undefined ? {} : {viewport})};
}

export interface ComparisonProjection {
  readonly domain: Domain;
  readonly map: (value: number) => number | null;
  readonly ticks: readonly Readonly<{position: number; label: string; value: number}>[];
  readonly viewport?: PlanViewportState;
}

export function comparisonProjection(axes: Readonly<{x: ComparisonCategoryAxis; y: ComparisonValueAxis}>, values: readonly number[], plot: Plot, options: ComparisonOptions, horizontal = false): ComparisonProjection {
  const normalized = normalizeNumericDomain(finiteExtent(values), {includeZero: axes.y.includeZero ?? true, ...(axes.y.domain ? {explicit: axes.y.domain} : {})});
  if (normalized.status === 'invalid') fail(normalized.diagnostic.path, normalized.diagnostic.reason, normalized.diagnostic.code);
  const initial: Domain = normalized.status === 'empty' ? [0, 1] : normalized.domain;
  const prepared = preparePlanViewport(axes, {x: null, y: initial}, options.viewport);
  if (prepared.status === 'invalid') fail(prepared.diagnostic.path, prepared.diagnostic.reason, prepared.diagnostic.code);
  const domains = withViewportDomains({x: null, y: initial}, prepared.value);
  const domain = domains.y ?? initial;
  const ticks = selectNumericTicks(domain, {targetCount: Math.max(2, Math.min(8, Math.floor((horizontal ? plot.width : plot.height) / 64))), nice: options.viewport || axes.y.domain ? false : axes.y.nice ?? false});
  if (ticks.status === 'invalid') fail(ticks.diagnostic.path, ticks.diagnostic.reason, ticks.diagnostic.code);
  const ordinary: readonly [number, number] = horizontal ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y];
  const range: readonly [number, number] = axes.y.reversed ? [ordinary[1], ordinary[0]] : ordinary;
  const scale = createLinearScale(ticks.value.domain, range, true);
  if (scale.status === 'invalid') fail(scale.diagnostic.path, scale.diagnostic.reason, scale.diagnostic.code);
  const viewport = planViewportState(prepared.value, {x: null, y: ticks.value.domain}, axes, plot);
  return {domain: ticks.value.domain, map: scale.value.map, ticks: ticks.value.ticks.map(value => ({position: scale.value.map(value)!, label: String(value), value})),
    ...(viewport === undefined ? {} : {viewport})};
}
