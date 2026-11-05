import {array, choice, color, fail, number, record, text, ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {Plot} from '../internal/layout/frame.js';
import {freezePlan} from './input.js';
import {comparisonAxes, comparisonOptions, comparisonProjection} from './comparison-axis.js';
import {comparisonHit} from './comparison-geometry.js';
import type {PlanBar, PlanCircle, PlanOptions, PlanProjectedReference, PlanSeries} from '../public/plan-types.js';
import type {PlanVariwideCategoryBand, PlanVariwideFrame, PlanVariwideObservation, PlanVariwidePoint, PlanVariwideResult, PlanVariwideSpec} from '../public/variwide-plan-types.js';

interface OwnedVariwide extends Omit<PlanVariwideSpec, 'series'> {
  readonly series: readonly Readonly<{id: string; name: string; color: string; data: readonly PlanVariwidePoint[]}>[];
}

function validateVariwide(input: PlanVariwideSpec): OwnedVariwide {
  const source = record(input, ['family', 'title', 'description', 'axes', 'series', 'pointPadding'], ['family', 'title', 'axes', 'series'], 'spec');
  choice(source.family, ['variwide'], 'spec.family');
  const axes = comparisonAxes(source.axes), categoryIds = new Set(axes.x.values.map(category => category.id));
  const series = array(source.series, 1, 'spec.series').map((item, index) => {
    const path = `spec.series[${index}]`, row = record(item, ['id', 'name', 'color', 'data'], ['id', 'name', 'data'], path);
    const ids = new Set<string>(), categories = new Set<string>();
    const data = array(row.data, 64, path + '.data').map((datum, pointIndex): PlanVariwidePoint => {
      const at = `${path}.data[${pointIndex}]`, point = record(datum, ['id', 'x', 'y', 'z'], ['id', 'x', 'y', 'z'], at);
      const id = text(point.id, at + '.id'), x = text(point.x, at + '.x');
      if (ids.has(id)) fail(at + '.id', 'DUPLICATE_ID');
      if (categories.has(x)) fail(at + '.x', 'DUPLICATE_CATEGORY');
      if (!categoryIds.has(x)) fail(at + '.x', 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
      ids.add(id); categories.add(x);
      return {id, x, y: point.y === null ? null : number(point.y, at + '.y'), z: point.z === null ? null : number(point.z, at + '.z', 0)};
    });
    return {id: text(row.id, path + '.id', 128), name: text(row.name, path + '.name'), color: row.color === undefined ? defaultPalette('light', false).series[0]! : color(row.color, path + '.color'), data};
  });
  return {family: 'variwide', title: text(source.title, 'spec.title', 512, true), axes, series,
    ...(source.description === undefined ? {} : {description: text(source.description, 'spec.description', 4096, true)}),
    ...(source.pointPadding === undefined ? {} : {pointPadding: number(source.pointPadding, 'spec.pointPadding', 0, .9)})};
}

/** Ratios are scaled before summation, so finite widths cannot overflow their total. */
function widthLayout(spec: OwnedVariwide, visible: boolean, plot: Plot): Readonly<{bands: readonly PlanVariwideCategoryBand[]; shares: ReadonlyMap<string, number>; ready: boolean; incomplete: boolean}> {
  const points = new Map(spec.series[0]?.data.map(point => [point.x, point]) ?? []);
  const largest = Math.max(0, ...[...points.values()].map(point => point.z ?? 0));
  const normalized = spec.axes.x.values.map(category => {
    const z = points.get(category.id)?.z;
    return z === null || z === undefined || largest === 0 ? 0 : z / largest;
  });
  let total = 0, error = 0;
  for (const value of normalized) {const adjusted = value - error, next = total + adjusted; error = (next - total) - adjusted; total = next;}
  let finalPositive = -1;
  normalized.forEach((value, index) => {if (value > 0) finalPositive = index;});
  const shares = new Map<string, number>();
  let cumulative = 0, accumulationError = 0;
  const bands = spec.axes.x.values.map((category, index): PlanVariwideCategoryBand => {
    const point = points.get(category.id), z = point?.z ?? null;
    const base = {categoryId: category.id, label: category.label, ...(point ? {pointId: point.id} : {}), z};
    if (!visible) return {...base, left: null, right: null, status: 'hidden'};
    if (z === null) return {...base, left: null, right: null, status: 'unknown'};
    if (total === 0) return {...base, left: null, right: null, status: 'no-positive-width'};
    const start = cumulative / total, value = normalized[index]!;
    const adjusted = value - accumulationError, next = cumulative + adjusted;
    accumulationError = (next - cumulative) - adjusted; cumulative = next;
    const end = index === finalPositive ? 1 : cumulative / total;
    const x0 = plot.x + (spec.axes.x.reversed ? 1 - start : start) * plot.width;
    const x1 = plot.x + (spec.axes.x.reversed ? 1 - end : end) * plot.width;
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    shares.set(category.id, value / total);
    return {...base, left, right, status: z === 0 ? 'zero' : left === right ? 'below-precision' : 'visible'};
  });
  return {bands, shares, ready: visible && total > 0, incomplete: spec.series.length > 0 && spec.axes.x.values.some(category => points.get(category.id)?.z == null)};
}

/** A single source series with genuine, proportional category widths. */
export function planVariwide(input: PlanVariwideSpec, inputOptions: PlanOptions): PlanVariwideResult {
  try {
    const spec = validateVariwide(input), source = spec.series[0];
    const options = comparisonOptions(inputOptions, new Set(spec.series.map(series => series.id)), new Set(spec.axes.x.values.map(category => category.id)), true);
    const visible = source !== undefined && !options.hidden.has(source.id);
    const plot: Plot = {x: Math.min(66, options.width * .2), y: 18, width: Math.max(1, options.width - Math.min(66, options.width * .2) - 12), height: Math.max(1, options.height - 62)};
    const layout = widthLayout(spec, visible, plot);
    const projection = comparisonProjection(spec.axes, visible ? source.data.flatMap(point => point.y === null || point.z === null ? [] : [point.y]) : [], plot, options);
    const observations: PlanVariwideObservation[] = [], bars: PlanBar[] = [], circles: PlanCircle[] = [];
    const byCategory = new Map(source?.data.map(point => [point.x, point]) ?? []);
    if (source && visible && layout.ready) for (const band of layout.bands) {
      const point = byCategory.get(band.categoryId);
      if (!point || point.y === null || point.z === null || band.left === null || band.right === null) continue;
      if (Math.min(0, point.y) > projection.domain[1] || Math.max(0, point.y) < projection.domain[0]) continue;
      const y0 = projection.map(0), y1 = projection.map(point.y);
      if (y0 === null || y1 === null) continue;
      const padding = (band.right - band.left) * (spec.pointPadding ?? 0) / 2;
      const left = band.left + padding, right = band.right - padding, top = Math.min(y0, y1), bottom = Math.max(y0, y1);
      const geometryOmitted = right === left, x = left / 2 + right / 2;
      if (!geometryOmitted && point.y !== 0) bars.push({pointId: point.id, x: left, y: top, width: right - left, height: bottom - top});
      // A zero value/width remains discoverable; this is a marker, never invented bar area.
      else circles.push({pointId: point.id, cx: x, cy: y1, radius: 2});
      observations.push({id: {seriesId: source.id, pointId: point.id}, label: band.label, seriesName: source.name, value: point.y,
        x, y: y1, color: source.color, group: {key: point.x, label: band.label, coordinate: x},
        variwide: {z: point.z, share: layout.shares.get(point.x) ?? 0, zeroWidth: point.z === 0, geometryOmitted},
        hit: comparisonHit(left, top, right, bottom, plot)});
    }
    const series: PlanSeries[] = source && visible ? [{id: source.id, name: source.name, color: source.color, bars, circles}] : [];
    const references: PlanProjectedReference[] = options.references.map(reference => {
      if (reference.axis === 'y') {
        if (typeof reference.value !== 'number' || reference.value < projection.domain[0] || reference.value > projection.domain[1]) return {id: reference.id, axis: 'y', status: 'outside'};
        const y = projection.map(reference.value)!;
        return {id: reference.id, axis: 'y', status: 'visible', line: {x1: plot.x, y1: y, x2: plot.x + plot.width, y2: y}};
      }
      const band = layout.bands.find(category => category.categoryId === reference.value);
      if (!band || band.left === null || band.right === null) return {id: reference.id, axis: 'x', status: 'unavailable'};
      const x = band.left / 2 + band.right / 2;
      return {id: reference.id, axis: 'x', status: 'visible', line: {x1: x, y1: plot.y, x2: x, y2: plot.y + plot.height}};
    });
    const frame: PlanVariwideFrame = {schema: 'nc-plan/1', family: 'variwide', title: spec.title, description: spec.description ?? '', unit: spec.axes.y.unit ?? '', width: options.width, height: options.height,
      legend: spec.series.map(series => ({id: series.id, name: series.name, color: series.color, visible: !options.hidden.has(series.id)})), series, observations,
      labels: layout.bands.flatMap(band => band.left === null || band.right === null ? [] : [{x: band.left / 2 + band.right / 2, label: band.label}]),
      grid: projection.ticks.map(tick => ({y: tick.position, label: tick.label, value: tick.value, type: 'number' as const})), references,
      categoryBands: layout.bands, variwideData: spec.series.flatMap(series => series.data.map(point => ({id: {seriesId: series.id, pointId: point.id}, categoryId: point.x, y: point.y, z: point.z, visible: !options.hidden.has(series.id), missingValue: point.y === null, missingWidth: point.z === null}))),
      variwideLayout: {status: layout.ready ? 'ready' : 'no-positive-width', incomplete: layout.incomplete},
      ...(projection.viewport === undefined ? {} : {viewport: projection.viewport})};
    return freezePlan({status: observations.length ? 'ok' : 'empty', frame});
  } catch (error) {
    return error instanceof ValidationFailure ? {status: 'invalid', diagnostic: error.diagnostic}
      : {status: 'invalid', diagnostic: {code: 'INVALID_CONFIG', reason: 'BAD_SPEC', path: 'spec', message: 'BAD_SPEC'}};
  }
}
