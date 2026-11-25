import { expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import type { PlanOptions } from '../../src/plan.js';
import { planComparison } from '../../src/plan/comparison.js';
import { planStatisticalRanges } from '../../src/plan/statistical-ranges.js';
import { planStatistics } from '../../src/plan/statistics.js';

const size = {width: 480, height: 320};
const axes = {x: {type: 'category', values: [{id: 'one'}, {id: 'two'}]}, y: {type: 'linear'}} as const;
const point = {id: 'p', x: 'one', low: -5, high: 10};
const row = {id: 'values', name: 'Values', data: [point]};
const errorbar = {family: 'errorbar', title: 'Original uncertainty', axes, series: [row]} as const;
const boxplot = {...errorbar, family: 'boxplot', series: [{...row, data: [{...point, q1: 0, median: 3, q3: 7}]}]} as const;
const dumbbell = {...errorbar, family: 'dumbbell'} as const;
const pyramid = {family: 'columnpyramid', title: 'Counts', axes,
  series: [{...row, data: [{id: 'p', x: 'one', y: 5}]}]} as const;
const hist = {family: 'histogram', title: 'Count', samples: [0,1,2,3,4], binCount: 2} as const;
const bell = {family: 'bellcurve', title: 'Sample distribution', samples: [0,1,2,3,4]} as const;

it('returns original descriptions and rejects family-specific histogram and bell options', () => {
  for (const spec of [hist, bell]) {
    const original = {...spec, description: 'Original measurements'};
    const plotted = planStatistics(original, size, planChart);
    expect(plotted).toMatchObject({status: 'ok', frame: {description: original.description}});
  }
  for (const spec of [{...hist, intervals: 64}, {...hist, standardDeviations: 2}, {...bell, binCount: 3}]) {
    expect(planStatistics(spec, size, planChart)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_DISTRIBUTION_OPTION', path: 'spec'},
    });
  }
  for (const [option, value, reason] of [
    ['stacking', 'sum', 'UNSUPPORTED_STACKING'], ['viewport', {axes: 'x'}, 'UNSUPPORTED_VIEWPORT'],
    ['references', [], 'UNSUPPORTED_REFERENCES'],
  ] as const) expect(planStatistics(hist, {...size, [option]: value}, planChart)).toMatchObject({
    status: 'invalid', diagnostic: {reason, path: 'options.' + option},
  });
});

it('rejects incompatible caps and duplicate source IDs without touching the source observations', () => {
  for (const spec of [{...boxplot, capWidth: .2}, {...errorbar, whiskerWidth: .2}]) {
    expect(planStatisticalRanges(spec as unknown as Parameters<typeof planStatisticalRanges>[0], size)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'FAMILY_SPECIFIC_CAP_OPTION', path: 'spec'},
    });
  }
  const unsupported = {...pyramid, markerRadius: 6};
  expect(planComparison(unsupported as unknown as Parameters<typeof planComparison>[0], size)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'ENDPOINT_MARKER_OPTION_ONLY', path: 'markerRadius'},
  });
  for (const result of [
    planComparison({...dumbbell, series: [row,row]}, size),
    planStatisticalRanges({...errorbar, series: [row,row]}, size),
  ]) expect(result).toMatchObject({status: 'invalid', diagnostic: {reason: 'DUPLICATE_SERIES_ID', path: 'series[1].id'}});
  expect(planComparison({...dumbbell, series: [{...row, data: [point, {...point, x: 'two'}]}]}, size)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'DUPLICATE_POINT_ID', path: 'series[0].data[1].id'},
  });
});

it('validates each glyph coordinate and the aggregate data cap before projecting any series', () => {
  const wrong = {...row, data: [{...point, x: false}]} as unknown as typeof row;
  for (const result of [
    planComparison({...dumbbell, series: [wrong]}, size),
    planStatisticalRanges({...errorbar, series: [wrong]}, size),
  ]) expect(result).toMatchObject({status: 'invalid', diagnostic: {path: 'series[0].data[0].x'}});
  const excess = Array.from({length: 5_001}, (_, x) => ({...point, id: 'p' + x, x}));
  const series = [{...row, data: excess}, {...row, id: 'remaining', data: excess}];
  const measured = {x: {type: 'linear'}, y: {type: 'linear'}} as const;
  for (const result of [
    planComparison({...dumbbell, axes: measured, series}, size),
    planStatisticalRanges({...errorbar, axes: measured, series}, size),
  ]) expect(result).toMatchObject({status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT', path: 'series.data'}});
});

it('retains raw endpoints, custom colors and descriptions across a resized independent range', () => {
  const decoration = {description: 'Original endpoints', series: [{...row, color: '#AABBCC'}]};
  const small = {...size, width: 320};
  for (const result of [
    planComparison({...dumbbell, ...decoration}, small),
    planStatisticalRanges({...errorbar, ...decoration}, small),
  ]) {
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.description).toBe(decoration.description);
    expect(result.frame.legend[0]).toMatchObject({id: row.id, color: '#aabbcc'});
    expect(result.frame.observations[0]).toMatchObject({id: {pointId: point.id}, lowValue: -5, highValue: 10});
  }
  const unsupported = {...size, stacking: 'percent'} as const satisfies PlanOptions;
  expect(planStatisticalRanges(errorbar, unsupported)).toMatchObject({status: 'invalid'});
});
