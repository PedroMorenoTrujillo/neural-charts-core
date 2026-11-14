import { planningFailure } from './diagnostics.js';
import {array, choice, color, fail, number, record, text} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createBandScale, createCategoryFrame} from '../internal/math/category.js';
import type {Plot} from '../internal/layout/frame.js';
import {freezePlan} from './input.js';
import {comparisonAxes, comparisonOptions, comparisonProjection} from './comparison-axis.js';
import {comparisonHit} from './comparison-geometry.js';
import type {PlanBar, PlanCircle, PlanOptions, PlanProjectedReference, PlanSeries} from '../public/plan-types.js';
import type {PlanBulletBand, PlanBulletBandGeometry, PlanBulletFrame, PlanBulletObservation, PlanBulletPoint, PlanBulletResult, PlanBulletSpec, PlanBulletTargetGeometry} from '../public/bullet-plan-types.js';

interface OwnedBullet extends Omit<PlanBulletSpec, 'series' | 'bands'> {
  readonly series: readonly Readonly<{id: string; name: string; color: string; data: readonly PlanBulletPoint[]}>[];
  readonly bands: readonly (PlanBulletBand & Readonly<{color: string}>)[];
}

function validateBullet(input: PlanBulletSpec): OwnedBullet {
  const source = record(input, ['family', 'title', 'description', 'axes', 'series', 'bands', 'orientation', 'pointPadding'], ['family', 'title', 'axes', 'series'], 'spec');
  choice(source.family, ['bullet'], 'spec.family');
  const axes = comparisonAxes(source.axes), categories = new Set(axes.x.values.map(category => category.id));
  const seriesIds = new Set<string>();
  const series = array(source.series, 16, 'spec.series').map((item, index) => {
    const path = `spec.series[${index}]`, row = record(item, ['id', 'name', 'color', 'data'], ['id', 'name', 'data'], path);
    const id = text(row.id, path + '.id', 128), name = text(row.name, path + '.name');
    if (seriesIds.has(id)) fail(path + '.id', 'DUPLICATE_ID'); seriesIds.add(id);
    const ids = new Set<string>(), usedCategories = new Set<string>();
    const data = array(row.data, 64, path + '.data').map((datum, pointIndex): PlanBulletPoint => {
      const at = `${path}.data[${pointIndex}]`, point = record(datum, ['id', 'x', 'y', 'target'], ['id', 'x', 'y'], at);
      const pointId = text(point.id, at + '.id'), x = text(point.x, at + '.x');
      if (ids.has(pointId)) fail(at + '.id', 'DUPLICATE_ID');
      if (usedCategories.has(x)) fail(at + '.x', 'DUPLICATE_CATEGORY');
      if (!categories.has(x)) fail(at + '.x', 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
      ids.add(pointId); usedCategories.add(x);
      return {id: pointId, x, y: point.y === null ? null : number(point.y, at + '.y'),
        ...(point.target === undefined ? {} : {target: point.target === null ? null : number(point.target, at + '.target')})};
    });
    return {id, name, color: row.color === undefined ? defaultPalette('light', false).series[index % 8]! : color(row.color, path + '.color'), data};
  });
  const bandIds = new Set<string>();
  const bands = array(source.bands ?? [], 32, 'spec.bands').map((item, index) => {
    const path = `spec.bands[${index}]`, band = record(item, ['id', 'from', 'to', 'label', 'color'], ['id', 'from', 'to'], path);
    const id = text(band.id, path + '.id'), from = number(band.from, path + '.from'), to = number(band.to, path + '.to');
    if (bandIds.has(id)) fail(path + '.id', 'DUPLICATE_ID'); bandIds.add(id);
    if (from >= to) fail(path, 'EMPTY_OR_REVERSED_BAND');
    return {id, from, to, ...(band.label === undefined ? {} : {label: text(band.label, path + '.label', 256, true)}), color: band.color === undefined ? ['#edf0f3', '#dce3eb', '#c5d0de'][index % 3]! : color(band.color, path + '.color')};
  });
  return {family: 'bullet', title: text(source.title, 'spec.title', 512, true), axes, series, bands,
    ...(source.description === undefined ? {} : {description: text(source.description, 'spec.description', 4096, true)}),
    ...(source.orientation === undefined ? {} : {orientation: choice(source.orientation, ['horizontal', 'vertical'], 'spec.orientation')}),
    ...(source.pointPadding === undefined ? {} : {pointPadding: number(source.pointPadding, 'spec.pointPadding', 0, .9)})};
}

/** Measures and independent targets share an axis. Qualitative bands never change it. */
export function planBullet(input: PlanBulletSpec, inputOptions: PlanOptions): PlanBulletResult {
  try {
    const spec = validateBullet(input), options = comparisonOptions(inputOptions, new Set(spec.series.map(series => series.id)), new Set(spec.axes.x.values.map(category => category.id)), false);
    const orientation = spec.orientation ?? 'horizontal', horizontal = orientation === 'horizontal';
    const visible = spec.series.filter(series => !options.hidden.has(series.id));
    const plot: Plot = {x: Math.min(horizontal ? 90 : 66, options.width * (horizontal ? .26 : .2)), y: 18,
      width: Math.max(1, options.width - Math.min(horizontal ? 90 : 66, options.width * (horizontal ? .26 : .2)) - 12), height: Math.max(1, options.height - 62)};
    const sourceValues = visible.flatMap(series => series.data.flatMap(point => [...(point.y === null ? [] : [point.y]), ...(typeof point.target === 'number' ? [point.target] : [])]));
    const projection = comparisonProjection(spec.axes, sourceValues, plot, options, horizontal);
    const ordinaryRange: readonly [number, number] = horizontal ? [plot.y, plot.y + plot.height] : [plot.x, plot.x + plot.width];
    const range: readonly [number, number] = spec.axes.x.reversed ? [ordinaryRange[1], ordinaryRange[0]] : ordinaryRange;
    const categoryFrame = createCategoryFrame(spec.axes.x.values.map(category => category.id), range, .5);
    if (categoryFrame.status === 'invalid') fail(categoryFrame.diagnostic.path, categoryFrame.diagnostic.reason, categoryFrame.diagnostic.code);
    const categoryScale = createBandScale(categoryFrame.value, spec.pointPadding ?? .25);
    if (categoryScale.status === 'invalid') fail(categoryScale.diagnostic.path, categoryScale.diagnostic.reason, categoryScale.diagnostic.code);
    const labels = new Map(spec.axes.x.values.map(category => [category.id, category.label]));
    const bulletBands: PlanBulletBandGeometry[] = spec.bands.map(band => {
      const base = {id: band.id, from: band.from, to: band.to, label: band.label ?? '', color: band.color};
      if (band.to <= projection.domain[0] || band.from >= projection.domain[1]) return {...base, status: 'outside'};
      const a = projection.map(band.from)!, b = projection.map(band.to)!;
      return {...base, status: 'visible', rect: horizontal
        ? {x: Math.min(a, b), y: plot.y, width: Math.abs(b - a), height: plot.height}
        : {x: plot.x, y: Math.min(a, b), width: plot.width, height: Math.abs(b - a)}};
    });
    const bulletTargets: PlanBulletTargetGeometry[] = [], observations: PlanBulletObservation[] = [], series: PlanSeries[] = [];
    for (const [seriesIndex, row] of visible.entries()) {
      const bars: PlanBar[] = [], circles: PlanCircle[] = [];
      for (const point of row.data) {
        const band = categoryScale.value.band(point.x); if (!band) continue;
        const lane = band.width / Math.max(1, visible.length), center = Math.min(band.start, band.end) + lane * (seriesIndex + .5);
        const thickness = Math.min(34, lane * .6), halfTarget = Math.min(lane / 2, Math.max(thickness * .8, 3));
        const id = {seriesId: row.id, pointId: point.id}, target = point.target;
        const knownTarget = typeof target === 'number', targetVisible = knownTarget && target >= projection.domain[0] && target <= projection.domain[1];
        const targetPosition = knownTarget ? projection.map(target) : null;
        if (knownTarget) bulletTargets.push({id, value: target, status: targetVisible ? 'visible' : 'outside', ...(targetVisible ? {line: horizontal
          ? {x1: targetPosition!, y1: center - halfTarget, x2: targetPosition!, y2: center + halfTarget}
          : {x1: center - halfTarget, y1: targetPosition!, x2: center + halfTarget, y2: targetPosition!}} : {})});
        const measureVisible = point.y !== null && Math.min(0, point.y) <= projection.domain[1] && Math.max(0, point.y) >= projection.domain[0];
        if (!measureVisible && !targetVisible) continue;
        const measurePosition = point.y === null ? null : projection.map(point.y), baseline = projection.map(0)!;
        const measure = measureVisible && measurePosition !== null;
        const valuePosition = measure ? measurePosition : targetPosition!;
        const a = measure ? Math.min(baseline, measurePosition) : valuePosition, b = measure ? Math.max(baseline, measurePosition) : valuePosition;
        const rect = horizontal ? {x: a, y: center - thickness / 2, width: b - a, height: thickness}
          : {x: center - thickness / 2, y: a, width: thickness, height: b - a};
        if (measure && point.y !== 0) bars.push({pointId: point.id, ...rect});
        else if (measure) circles.push({pointId: point.id, cx: horizontal ? valuePosition : center, cy: horizontal ? center : valuePosition, radius: Math.min(2, thickness / 2)});
        const left = Math.min(rect.x, horizontal && targetVisible ? targetPosition! : rect.x), top = Math.min(rect.y, !horizontal && targetVisible ? targetPosition! : rect.y);
        const right = Math.max(rect.x + rect.width, horizontal && targetVisible ? targetPosition! : rect.x + rect.width), bottom = Math.max(rect.y + rect.height, !horizontal && targetVisible ? targetPosition! : rect.y + rect.height);
        observations.push({id, label: labels.get(point.x)!, seriesName: row.name, color: row.color,
          value: measure ? point.y! : target!, x: horizontal ? valuePosition : center, y: horizontal ? center : valuePosition,
          group: {key: point.x, label: labels.get(point.x)!, coordinate: categoryScale.value.center(point.x)!},
          bullet: {type: measure ? 'measure' : 'target', measure: point.y, ...(target === undefined ? {} : {target})},
          hit: comparisonHit(left, top, right, bottom, plot)});
      }
      series.push({id: row.id, name: row.name, color: row.color, bars, circles});
    }
    const references: PlanProjectedReference[] = options.references.map(reference => {
      const position = reference.axis === 'x' ? categoryScale.value.center(String(reference.value)) : typeof reference.value === 'number' ? projection.map(reference.value) : null;
      if (position === null) return {id: reference.id, axis: reference.axis, status: 'unavailable'};
      if (reference.axis === 'y' && typeof reference.value === 'number' && (reference.value < projection.domain[0] || reference.value > projection.domain[1])) return {id: reference.id, axis: reference.axis, status: 'outside'};
      const across = reference.axis === 'x' ? horizontal : !horizontal;
      return {id: reference.id, axis: reference.axis, status: 'visible', line: across
        ? {x1: plot.x, y1: position, x2: plot.x + plot.width, y2: position}
        : {x1: position, y1: plot.y, x2: position, y2: plot.y + plot.height}};
    });
    const categoryLabels = spec.axes.x.values.flatMap(category => {const coordinate = categoryScale.value.center(category.id); return coordinate === null ? [] : [{id: category.id, label: category.label, coordinate}];});
    const frame: PlanBulletFrame = {schema: 'nc-plan/1', family: 'bullet', title: spec.title, description: spec.description ?? '', unit: spec.axes.y.unit ?? '', width: options.width, height: options.height,
      legend: spec.series.map(row => ({id: row.id, name: row.name, color: row.color, visible: !options.hidden.has(row.id)})), series, observations,
      labels: horizontal ? projection.ticks.map(tick => ({x: tick.position, label: tick.label, value: tick.value, type: 'number' as const})) : categoryLabels.map(category => ({x: category.coordinate, label: category.label})),
      grid: horizontal ? [] : projection.ticks.map(tick => ({y: tick.position, label: tick.label, value: tick.value, type: 'number' as const})),
      ...(horizontal ? {yLabels: categoryLabels.map(category => ({id: category.id, label: category.label, y: category.coordinate}))} : {}), references,
      bulletData: spec.series.flatMap(row => row.data.map(point => ({id: {seriesId: row.id, pointId: point.id}, categoryId: point.x, measure: point.y, ...(point.target === undefined ? {} : {target: point.target}), visible: !options.hidden.has(row.id)}))),
      bulletBands, bulletTargets, bulletOrientation: orientation,
      bulletGrid: projection.ticks.map(tick => horizontal ? {x1: tick.position, y1: plot.y, x2: tick.position, y2: plot.y + plot.height} : {x1: plot.x, y1: tick.position, x2: plot.x + plot.width, y2: tick.position})};
    return freezePlan({status: observations.length ? 'ok' : 'empty', frame});
  } catch (error) {
    return planningFailure(error);
  }
}
