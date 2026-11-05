import {array, choice, color, fail, number, record, text, ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createCategoryFrame, createPointScale} from '../internal/math/category.js';
import {formatAxis} from '../internal/axes/plan.js';
import type {Plot} from '../internal/layout/frame.js';
import {freezePlan} from './input.js';
import {MAX_TEMPORAL_SERIES, parseTemporalAxis, temporalOptions, temporalProjection, temporalValue} from './temporal-axis.js';
import type {PlanAnnotation, PlanCircle, PlanCommand, PlanOptions, PlanSeries} from '../public/plan-types.js';
import type {PlanTimelineFrame, PlanTimelineObservation, PlanTimelinePoint, PlanTimelineResult, PlanTimelineSeries, PlanTimelineSpec, PlanTimelineSummary} from '../public/timeline-plan-types.js';

export const MAX_TIMELINE_POINTS = 2048;
export const MAX_TIMELINE_LABELS = 128;

interface OwnedTimeline extends Omit<PlanTimelineSpec, 'series'> {
  readonly series: readonly (PlanTimelineSeries & Readonly<{color: string}>)[];
}

function validateTimeline(input: PlanTimelineSpec): OwnedTimeline {
  const source = record(input, ['family', 'title', 'description', 'axes', 'series', 'labelPosition', 'labelMaxWidth', 'markerRadius'], ['family', 'title', 'axes', 'series'], 'spec');
  choice(source.family, ['timeline'], 'spec.family');
  const axes = record(source.axes, ['x'], ['x'], 'spec.axes');
  const x = parseTemporalAxis(axes.x, 'spec.axes.x');
  const palette = defaultPalette('light', false).series, seriesIds = new Set<string>();
  let pointCount = 0;
  const series = array(source.series, MAX_TEMPORAL_SERIES, 'spec.series').map((item, index) => {
    const path = `spec.series[${index}]`, raw = record(item, ['id', 'name', 'color', 'data'], ['id', 'name', 'data'], path);
    const id = text(raw.id, path + '.id', 256);
    if (seriesIds.has(id)) fail(path + '.id', 'DUPLICATE_ID');
    seriesIds.add(id);
    const ids = new Set<string>();
    const data = array(raw.data, MAX_TIMELINE_POINTS, path + '.data').map((item, pointIndex): PlanTimelinePoint => {
      if (++pointCount > MAX_TIMELINE_POINTS) fail('spec.series', 'RESOURCE_LIMIT');
      const pointPath = `${path}.data[${pointIndex}]`, point = record(item, ['id', 'x', 'title', 'description'], ['id', 'x', 'title'], pointPath);
      const pointId = text(point.id, pointPath + '.id', 256);
      if (ids.has(pointId)) fail(pointPath + '.id', 'DUPLICATE_ID');
      ids.add(pointId);
      return {id: pointId, x: temporalValue(point.x, x, pointPath + '.x'), title: text(point.title, pointPath + '.title', 512, true),
        ...(point.description === undefined ? {} : {description: text(point.description, pointPath + '.description', 2048, true)})};
    });
    return {id, name: text(raw.name, path + '.name', 256, true), color: raw.color === undefined ? palette[index % palette.length]! : color(raw.color, path + '.color'), data};
  });
  return {family: 'timeline', title: text(source.title, 'spec.title', 512, true),
    ...(source.description === undefined ? {} : {description: text(source.description, 'spec.description', 2048, true)}),
    axes: {x}, series,
    ...(source.labelPosition === undefined ? {} : {labelPosition: choice(source.labelPosition, ['alternate', 'above', 'below'], 'spec.labelPosition')}),
    ...(source.labelMaxWidth === undefined ? {} : {labelMaxWidth: number(source.labelMaxWidth, 'spec.labelMaxWidth', 24, 240)}),
    ...(source.markerRadius === undefined ? {} : {markerRadius: number(source.markerRadius, 'spec.markerRadius', 0, 16)})};
}

interface LabelPlacement {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function collides(a: LabelPlacement, b: LabelPlacement): boolean {
  return a.left < b.right + 6 && a.right + 6 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top;
}

/** Labels are bounded planning hints; full source text stays on the event/observation. */
function abbreviatedLabel(title: string, maxWidth: number): Readonly<{text: string; width: number}> | null {
  if (!title) return null;
  const characters = Array.from(title);
  // Conservative width at the renderer's default 12px font, including wide glyphs.
  const capacity = Math.max(1, Math.floor((maxWidth - 4) / 14));
  const truncated = characters.length > capacity;
  const kept = truncated ? characters.slice(0, Math.max(0, capacity - 1)).join('') + '…' : title;
  const width = Math.min(maxWidth, Math.max(20, Array.from(kept).length * 14 + 4));
  return {text: kept, width};
}

/** A timeline places events at their original coordinates; it is not a duration chart. */
export function planTimeline(input: PlanTimelineSpec, inputOptions: PlanOptions): PlanTimelineResult {
  try {
    const spec = validateTimeline(input);
    const options = temporalOptions(inputOptions, spec.axes.x, new Set(spec.series.map(series => series.id)));
    const visible = spec.series.filter(series => !options.hidden.has(series.id));
    const rows = visible.map(series => ({id: series.id, label: series.name}));
    const values = visible.flatMap(series => series.data.flatMap(point => point.x === null ? [] : [point.x]));
    const left = visible.length > 1 ? Math.min(80, options.width * .23) : 24;
    const plot: Plot = {x: left, y: 18, width: Math.max(1, options.width - left - 12), height: Math.max(1, options.height - 62)};
    const projection = temporalProjection(spec.axes.x, values, rows, false, plot, options);
    const rowFrame = createCategoryFrame(rows.map(row => row.id), [plot.y, plot.y + plot.height], .5);
    if (rowFrame.status === 'invalid') fail(rowFrame.diagnostic.path, rowFrame.diagnostic.reason, rowFrame.diagnostic.code);
    const positions = createPointScale(rowFrame.value);
    const events: PlanTimelineSummary[] = spec.series.flatMap(series => series.data.map(point => ({
      id: {seriesId: series.id, pointId: point.id}, x: point.x, title: point.title,
      ...(point.description === undefined ? {} : {description: point.description}), visible: !options.hidden.has(series.id), missing: point.x === null,
    })));
    const observations: PlanTimelineObservation[] = [], series: PlanSeries[] = [], annotations: PlanAnnotation[] = [];
    const occupied: LabelPlacement[] = [];
    for (const source of visible) {
      const y = positions.center(source.id);
      if (y === null) continue;
      const commands: PlanCommand[] = [], circles: PlanCircle[] = [];
      const projected = source.data.flatMap((point, index) => {
        if (point.x === null || point.x < projection.domain[0] || point.x > projection.domain[1]) return [];
        const x = projection.map(point.x);
        return x === null ? [] : [{point, index, x}];
      });
      if (projected.length) commands.push({type: 'M', x: plot.x, y}, {type: 'L', x: plot.x + plot.width, y});
      for (const {point, x} of projected) {
        if (point.x === null) continue;
        const radius = spec.markerRadius ?? 4;
        circles.push({pointId: point.id, cx: x, cy: y, radius});
        observations.push({id: {seriesId: source.id, pointId: point.id}, label: point.title, seriesName: source.name,
          value: point.x, xValue: point.x, x, y, color: source.color,
          group: {key: JSON.stringify([spec.axes.x.type, point.x]), label: formatAxis(point.x, spec.axes.x.type, null, new Map()), coordinate: x},
          event: {type: spec.axes.x.type, coordinate: point.x, title: point.title, ...(point.description === undefined ? {} : {description: point.description})},
          hit: {type: 'circle', cx: x, cy: y, radius: Math.max(12, radius)}});
      }
      const ordered = [...projected].sort((a, b) => a.x - b.x || a.index - b.index);
      for (const [ordinal, item] of ordered.entries()) {
        if (annotations.length >= MAX_TIMELINE_LABELS) break;
        const label = abbreviatedLabel(item.point.title, Math.min(spec.labelMaxWidth ?? 144, plot.width));
        if (!label) continue;
        const preference = spec.labelPosition ?? 'alternate';
        const first = preference === 'below' || preference === 'alternate' && ordinal % 2 === 1 ? 1 : -1;
        const directions = preference === 'alternate' ? [first, -first] : [first];
        for (const direction of directions) {
          const labelLeft = Math.max(plot.x, Math.min(plot.x + plot.width - label.width, item.x - label.width / 2));
          const labelY = y + direction * 34;
          const box: LabelPlacement = {left: labelLeft, right: labelLeft + label.width, top: labelY - 9, bottom: labelY + 9};
          if (box.top < plot.y || box.bottom > plot.y + plot.height || occupied.some(other => collides(box, other))) continue;
          occupied.push(box);
          annotations.push({x: labelLeft + label.width / 2, y: labelY, text: label.text, role: 'label', box: {width: label.width, height: 18, seriesId: source.id}});
          commands.push({type: 'M', x: item.x, y: y + direction * (spec.markerRadius ?? 4)},
            {type: 'L', x: item.x, y: direction < 0 ? box.bottom : box.top});
          break;
        }
      }
      series.push({id: source.id, name: source.name, color: source.color, commands, circles});
    }
    const yLabels = visible.length > 1 ? rows.flatMap(row => {const y = positions.center(row.id); return y === null ? [] : [{id: row.id, y, label: row.label}];}) : [];
    const result: PlanTimelineFrame = {schema: 'nc-plan/1', family: 'timeline', title: spec.title, description: spec.description ?? '',
      unit: spec.axes.x.type === 'linear' ? spec.axes.x.unit ?? '' : '', width: options.width, height: options.height,
      legend: spec.series.map(source => ({id: source.id, name: source.name, color: source.color, visible: !options.hidden.has(source.id)})),
      series, observations, events, annotations, labels: projection.labels, grid: [], yLabels, references: projection.references,
      ...(projection.viewport === undefined ? {} : {viewport: projection.viewport})};
    return freezePlan({status: observations.length ? 'ok' : 'empty', frame: result});
  } catch (error) {
    return error instanceof ValidationFailure ? {status: 'invalid', diagnostic: error.diagnostic}
      : {status: 'invalid', diagnostic: {code: 'INVALID_CONFIG', reason: 'BAD_SPEC', path: 'spec', message: 'BAD_SPEC'}};
  }
}
