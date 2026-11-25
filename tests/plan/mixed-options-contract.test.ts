import { expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import type { PlanMixedSpec } from '../../src/plan.js';
import { validateMixed, validateMixedOptions } from '../../src/mixed/validate.js';

const size = {width: 400, height: 300};
const categories = [{id: 'a', label: 'Observed'}, {id: 'b'}, {id: 'c'}];
const columns = {id: 'columns', name: 'Columns', type: 'column', data: [
  {id: 'a', x: 'a', y: 20}, {id: 'b', x: 'b', y: 40}, {id: 'c', x: 'c', y: 60},
]} as const;
const line = {id: 'line', name: 'Line', type: 'line', data: [
  {id: 'a', x: 'a', y: 5}, {id: 'b', x: 'b', y: 25}, {id: 'c', x: 'c', y: 15},
]} as const;
const source = {family: 'mixed', title: 'Actual and projection',
  axes: {x: {type: 'category', values: categories}, y: {type: 'linear', domain: [0,100], nice: false}},
  series: [columns, line],
} as const satisfies PlanMixedSpec;

it('owns exact grouped column width, explicit gaps and scoped value-axis ticks', () => {
  const spec = {...source, groupGap: .6, barGap: .8, maxBarWidth: 9,
    axes: {...source.axes, y: {...source.axes.y, reversed: true, ticks: {targetCount: 4}}}};
  const selection = planChart(spec, {...size, viewport: {axes: 'y', value: {y: [0,50]}}});
  if (selection.status !== 'ok') throw Error(JSON.stringify(selection));
  const { frame } = selection;
  expect(frame.viewport?.displayed.y).toEqual([0,50]);
  expect(frame.series.find(series => series.id === 'columns')?.bars?.every(mark => mark.width === 9)).toBe(true);
  expect(frame.labels.map(label => label.label)).toEqual(['Observed','b','c']);
  expect(frame.grid.every(label => label.value !== undefined && label.value >= 0 && label.value <= 50)).toBe(true);
  const observation = (which: string) => frame.observations.find(p => p.id.seriesId === 'line' && p.id.pointId === which)!;
  expect(observation('b').y).toBeGreaterThan(observation('a').y);
  expect(observation('b').value).toBe(25);
});

it('reports invalid layout and visibility options before aggregating mixed series', () => {
  for (const [patch, path] of [[{groupGap: .96}, 'groupGap'], [{barGap: 1.01}, 'barGap'], [{maxBarWidth: .1}, 'maxBarWidth']] as const) {
    expect(validateMixed({...source, ...patch})).toMatchObject({status: 'invalid', diagnostic: {path}});
  }
  expect(planChart(source, {...size, hiddenSeriesIds: ['unknown']})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNKNOWN_SERIES', path: 'options.hiddenSeriesIds'},
  });
  const values = [...categories, ...Array.from({length: 62}, (_, i) => ({id: 'extra-' + i}))];
  expect(planChart({...source, axes: {...source.axes, x: {...source.axes.x, values}}}, size)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'LABEL_LIMIT', path: 'axes.x.values'},
  });
  expect(planChart({...source, series: [line]}, {...size, stacking: 'sum'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'STACKING_REQUIRES_COLUMNS', path: 'options.stacking'},
  });
  expect(planChart(source, {...size, viewport: {axes: 'x', value: {x: {firstId: 'c', lastId: 'a'}}}})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_CATEGORY_WINDOW', path: 'viewport.value.x'},
  });
  const data = Array.from({length: 5_001}, (_, i) => ({id: 'p' + i, x: 'a', y: 1}));
  expect(validateMixed({...source, series: [{...columns, data}, {...line, data}]})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT', path: 'series'},
  });
});

it('reports an unreadable mixed payload and validates owner callback options', () => {
  const unreadable = new Proxy(source, {ownKeys() { throw Error('Unavailable settings'); }});
  expect(validateMixed(unreadable)).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_MIXED_SPEC', path: 'spec'}});
  const ids = new Set(['columns','line']);
  expect(validateMixedOptions({instanceId: '2invalid'}, ids)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_INSTANCE_ID', path: 'options.instanceId'},
  });
  const onViewportChange = () => {};
  expect(validateMixedOptions({instanceId: 'mixed-1', onViewportChange}, ids)).toMatchObject({
    status: 'ok', value: {instanceId: 'mixed-1', onViewportChange},
  });
});

it('maps a reversed primary Y window into the independent unreversed secondary units', () => {
  const dual = {...source, axes: {x: source.axes.x, y: {...source.axes.y, reversed: true},
    secondaryY: {type: 'linear', domain: [0,50], nice: false}},
    series: [columns, {...line, yAxis: 'secondary'}],
  } as const satisfies PlanMixedSpec;
  const result = planChart(dual, {...size, viewport: {axes: 'y', value: {y: [20,60]}}});
  if (result.status !== 'ok') throw Error(JSON.stringify(result));
  expect(result.frame.mixedAxes?.primary.displayed).toEqual([20,60]);
  expect(result.frame.mixedAxes?.secondary.displayed).toEqual([20,40]);
  expect(result.frame.observations.find(point => point.id.seriesId === 'line' && point.id.pointId === 'b'))
    .toMatchObject({valueAxis: 'secondary', value: 25});
});
