import {array, choice, color, fail, number, record, text, ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createBandScale, createCategoryFrame} from '../internal/math/category.js';
import type {Plot} from '../internal/layout/frame.js';
import {freezePlan} from './input.js';
import {MAX_TEMPORAL_SERIES, optionalBoolean, parseTemporalAxis, temporalOptions, temporalProjection, temporalValue} from './temporal-axis.js';
import type {PlanBar, PlanCircle, PlanCommand, PlanHitRegion, PlanOptions, PlanSeries} from '../public/plan-types.js';
import type {PlanIntervalSummary, PlanXRangeFrame, PlanXRangeObservation, PlanXRangePoint, PlanXRangeResult, PlanXRangeSeries, PlanXRangeSpec} from '../public/xrange-plan-types.js';

export const MAX_XRANGE_ROWS = 256;
export const MAX_XRANGE_POINTS = 2048;

interface OwnedXRange extends Omit<PlanXRangeSpec, 'series'> {
  readonly series: readonly (PlanXRangeSeries & Readonly<{color: string}>)[];
}

function validateXRange(input: PlanXRangeSpec): OwnedXRange {
  const source = record(input, ['family', 'title', 'description', 'axes', 'series', 'grouping', 'rowPadding'], ['family', 'title', 'axes', 'series'], 'spec');
  choice(source.family, ['xrange'], 'spec.family');
  const axes = record(source.axes, ['x', 'y'], ['x', 'y'], 'spec.axes');
  const x = parseTemporalAxis(axes.x, 'spec.axes.x');
  const rawY = record(axes.y, ['kind', 'values', 'reversed'], ['kind', 'values'], 'spec.axes.y');
  choice(rawY.kind, ['category'], 'spec.axes.y.kind');
  const rowIds = new Set<string>();
  const values = array(rawY.values, MAX_XRANGE_ROWS, 'spec.axes.y.values').map((item, index) => {
    const path = `spec.axes.y.values[${index}]`, row = record(item, ['id', 'label'], ['id', 'label'], path);
    const id = text(row.id, path + '.id', 256), label = text(row.label, path + '.label', 256, true);
    if (rowIds.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    rowIds.add(id);
    return {id, label};
  });
  const reversed = optionalBoolean(rawY.reversed, 'spec.axes.y.reversed');
  const seriesIds = new Set<string>();
  const palette = defaultPalette('light', false).series;
  let pointCount = 0;
  const series = array(source.series, MAX_TEMPORAL_SERIES, 'spec.series').map((item, index) => {
    const path = `spec.series[${index}]`, raw = record(item, ['id', 'name', 'color', 'data'], ['id', 'name', 'data'], path);
    const id = text(raw.id, path + '.id', 256);
    if (seriesIds.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    seriesIds.add(id);
    const ids = new Set<string>();
    const data = array(raw.data, MAX_XRANGE_POINTS, path + '.data').map((item, pointIndex): PlanXRangePoint => {
      if (++pointCount > MAX_XRANGE_POINTS) fail('spec.series', 'RESOURCE_LIMIT');
      const pointPath = `${path}.data[${pointIndex}]`;
      const point = record(item, ['id', 'rowId', 'start', 'end', 'label', 'completed'], ['id', 'rowId', 'start', 'end'], pointPath);
      const pointId = text(point.id, pointPath + '.id', 256);
      if (ids.has(pointId)) fail(pointPath + '.id', 'DUPLICATE_ID');
      ids.add(pointId);
      const rowId = text(point.rowId, pointPath + '.rowId', 256);
      if (!rowIds.has(rowId)) fail(pointPath + '.rowId', 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
      const start = temporalValue(point.start, x, pointPath + '.start');
      const end = temporalValue(point.end, x, pointPath + '.end');
      if (start !== null && end !== null) {
        if (end < start) fail(pointPath + '.end', 'REVERSED_INTERVAL');
        if (!Number.isFinite(end - start)) fail(pointPath, 'UNREPRESENTABLE_DURATION');
      }
      const completed = point.completed === undefined ? undefined : point.completed === null ? null : number(point.completed, pointPath + '.completed', 0, 1);
      return {id: pointId, rowId, start, end,
        ...(point.label === undefined ? {} : {label: text(point.label, pointPath + '.label', 256, true)}),
        ...(completed === undefined ? {} : {completed})};
    });
    return {id, name: text(raw.name, path + '.name', 256, true), color: raw.color === undefined ? palette[index % palette.length]! : color(raw.color, path + '.color'), data};
  });
  return {family: 'xrange', title: text(source.title, 'spec.title', 512, true),
    ...(source.description === undefined ? {} : {description: text(source.description, 'spec.description', 2048, true)}),
    axes: {x, y: {kind: 'category', values, ...(reversed === undefined ? {} : {reversed})}}, series,
    ...(source.grouping === undefined ? {} : {grouping: choice(source.grouping, ['grouped', 'overlap'], 'spec.grouping')}),
    ...(source.rowPadding === undefined ? {} : {rowPadding: number(source.rowPadding, 'spec.rowPadding', 0, .9)})};
}

function rectangleCommands(left: number, top: number, right: number, bottom: number): readonly PlanCommand[] {
  return [{kind: 'M', x: left, y: top}, {kind: 'L', x: right, y: top}, {kind: 'L', x: right, y: bottom}, {kind: 'L', x: left, y: bottom}, {kind: 'Z'}];
}

function hitRectangle(left: number, top: number, right: number, bottom: number, plot: Plot): PlanHitRegion {
  const cx = left / 2 + right / 2, cy = top / 2 + bottom / 2;
  const halfWidth = Math.max(12, (right - left) / 2), halfHeight = Math.max(12, (bottom - top) / 2);
  return {kind: 'polygon', vertices: [
    {x: Math.max(plot.x, cx - halfWidth), y: Math.max(plot.y, cy - halfHeight)},
    {x: Math.min(plot.x + plot.width, cx + halfWidth), y: Math.max(plot.y, cy - halfHeight)},
    {x: Math.min(plot.x + plot.width, cx + halfWidth), y: Math.min(plot.y + plot.height, cy + halfHeight)},
    {x: Math.max(plot.x, cx - halfWidth), y: Math.min(plot.y + plot.height, cy + halfHeight)},
  ]};
}

/** Pure interval owner; source intervals are never converted to cumulative columns. */
export function planXRange(input: PlanXRangeSpec, inputOptions: PlanOptions): PlanXRangeResult {
  try {
    const spec = validateXRange(input);
    const options = temporalOptions(inputOptions, spec.axes.x, new Set(spec.series.map(series => series.id)));
    const rows = spec.axes.y.values, rowLabels = new Map(rows.map(row => [row.id, row.label]));
    const visible = spec.series.filter(series => !options.hidden.has(series.id));
    const values = visible.flatMap(series => series.data.flatMap(point => point.start === null || point.end === null ? [] : [point.start, point.end]));
    const plot: Plot = {x: Math.min(80, options.width * .23), y: 18, width: Math.max(1, options.width - Math.min(80, options.width * .23) - 12), height: Math.max(1, options.height - 62)};
    const projection = temporalProjection(spec.axes.x, values, rows, spec.axes.y.reversed ?? false, plot, options);
    const rowRange: readonly [number, number] = spec.axes.y.reversed ? [plot.y + plot.height, plot.y] : [plot.y, plot.y + plot.height];
    const frame = createCategoryFrame(rows.map(row => row.id), rowRange, .5);
    if (frame.status === 'invalid') fail(frame.diagnostic.path, frame.diagnostic.reason, frame.diagnostic.code);
    const bands = createBandScale(frame.value, spec.rowPadding ?? .16);
    if (bands.status === 'invalid') fail(bands.diagnostic.path, bands.diagnostic.reason, bands.diagnostic.code);
    const intervals: PlanIntervalSummary[] = spec.series.flatMap(series => series.data.map(point => ({
      id: {seriesId: series.id, pointId: point.id}, label: point.label ?? rowLabels.get(point.rowId)!,
      rowId: point.rowId, rowLabel: rowLabels.get(point.rowId)!, start: point.start, end: point.end,
      duration: point.start === null || point.end === null ? null : point.end - point.start,
      ...(point.completed === undefined ? {} : {completed: point.completed}),
      visible: !options.hidden.has(series.id), missing: point.start === null || point.end === null,
    })));
    const observations: PlanXRangeObservation[] = [], series: PlanSeries[] = [];
    const grouped = (spec.grouping ?? 'grouped') === 'grouped';
    for (const [index, source] of visible.entries()) {
      const bars: PlanBar[] = [], circles: PlanCircle[] = [], commands: PlanCommand[] = [];
      for (const point of source.data) {
        if (point.start === null || point.end === null || point.end < projection.domain[0] || point.start > projection.domain[1]) continue;
        const band = bands.value.band(point.rowId);
        if (!band) continue;
        const slots = grouped ? visible.length : 1, slot = grouped ? index : 0;
        const lane = band.width / slots, height = Math.min(48, lane * .8);
        const top = Math.min(band.start, band.end) + lane * slot + (lane - height) / 2;
        const bottom = top + height;
        const originalStart = point.start, originalEnd = point.end;
        const start = Math.max(originalStart, projection.domain[0]), end = Math.min(originalEnd, projection.domain[1]);
        const x0 = projection.map(start), x1 = projection.map(end);
        if (x0 === null || x1 === null) continue;
        const left = Math.min(x0, x1), right = Math.max(x0, x1), x = left / 2 + right / 2, y = top / 2 + bottom / 2;
        if (originalStart === originalEnd) {
          circles.push({pointId: point.id, cx: x, cy: y, radius: Math.min(4, height / 2)});
        } else {
          commands.push(...rectangleCommands(left, top, right, bottom));
          if (point.completed === undefined) bars.push({pointId: point.id, x: left, y: top, width: right - left, height});
          else if (point.completed !== null && point.completed > 0) {
            const progressEnd = point.completed === 1 ? originalEnd : originalStart + (originalEnd - originalStart) * point.completed;
            if (progressEnd > projection.domain[0]) {
              const p0 = projection.map(Math.max(originalStart, projection.domain[0]));
              const p1 = projection.map(Math.min(progressEnd, projection.domain[1]));
              if (p0 !== null && p1 !== null) bars.push({pointId: point.id, x: Math.min(p0, p1), y: top, width: Math.abs(p1 - p0), height});
            }
          }
        }
        const rowLabel = rowLabels.get(point.rowId)!;
        observations.push({id: {seriesId: source.id, pointId: point.id}, label: point.label ?? rowLabel,
          seriesName: source.name, value: originalEnd - originalStart, x, y, color: source.color, xValue: originalStart,
          group: {key: JSON.stringify(['interval', point.rowId, originalStart]), label: rowLabel, coordinate: projection.map(originalStart)!},
          interval: {kind: spec.axes.x.kind, rowId: point.rowId, rowLabel, start: originalStart, end: originalEnd, duration: originalEnd - originalStart,
            ...(point.completed === undefined ? {} : {completed: point.completed})},
          hit: hitRectangle(left, top, right, bottom, plot)});
      }
      series.push({id: source.id, name: source.name, color: source.color, bars, circles, commands});
    }
    const yLabels = rows.flatMap(row => {const y = bands.value.center(row.id); return y === null ? [] : [{id: row.id, y, label: row.label}];});
    const result: PlanXRangeFrame = {schema: 'nc-plan/1', family: 'xrange', title: spec.title, description: spec.description ?? '',
      unit: spec.axes.x.kind === 'time' ? 'ms' : spec.axes.x.unit ?? '', width: options.width, height: options.height,
      legend: spec.series.map(source => ({id: source.id, name: source.name, color: source.color, visible: !options.hidden.has(source.id)})),
      series, observations, intervals, labels: projection.labels, grid: yLabels.map(row => ({y: row.y, label: ''})), yLabels,
      references: projection.references, ...(projection.viewport === undefined ? {} : {viewport: projection.viewport})};
    return freezePlan({status: observations.length ? 'ok' : 'empty', frame: result});
  } catch (error) {
    return error instanceof ValidationFailure ? {status: 'invalid', diagnostic: error.diagnostic}
      : {status: 'invalid', diagnostic: {code: 'INVALID_CONFIG', reason: 'BAD_SPEC', path: 'spec', message: 'BAD_SPEC'}};
  }
}
