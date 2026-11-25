import { expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import { planStackedArea } from '../../src/plan/stacked-area.js';
import { planStreamgraph } from '../../src/plan/streamgraph.js';
import type { PlanSpec } from '../../src/plan.js';

const first = Date.UTC(2026, 10, 2), day = 86_400_000;
const values = (prefix: string, amounts: readonly (number | null)[]) => amounts.map((y, index) => ({
  id: prefix + index, x: first + day * index, y,
}));
const source = [
  {id: 'actual', name: 'Actual', data: values('a', [2,4,6,8])},
  {id: 'planned', name: 'Planned', data: values('b', [1,2,3,4])},
];
const axes = {x: {type: 'time', domain: [first, first + 3*day], nice: false}, y: {type: 'linear'}} as const;
const size = {width: 600, height: 360};
const area = {family: 'area', title: 'Day by day', axes, series: source} as const satisfies PlanSpec;
const stream = {...area, family: 'streamgraph'} as const satisfies PlanSpec;
const window = [first + day, first + 2*day] as const;

it.each(['area', 'areaspline', 'streamgraph'] as const)('scopes UTC windows and source observations for %s', family => {
  const low = family === 'streamgraph' ? -20 : 0;
  const scoped = {x: window, y: [low, 20]} as const;
  const input = {...area, family, axes: {...axes, y: {type: 'linear', domain: [low,50], nice: false, reversed: true}}} as const;
  const result = planChart(input as PlanSpec, {
    ...size, ...(family === 'streamgraph' ? {} : {stacking: 'sum' as const}),
    viewport: {axes: 'xy', value: scoped},
  });
  if (result.status !== 'ok') throw Error(JSON.stringify(result));
  const {frame} = result;
  expect(frame.viewport?.displayed).toEqual(scoped);
  const key = (x: number) => JSON.stringify(['time', x]);
  expect(frame.observations.map(point => [point.id.pointId, point.group?.key, point.value])).toEqual([
    ['a1', key(first + day), 4], ['a2', key(first + 2*day), 6], ['b1', key(first + day), 2], ['b2', key(first + 2*day), 3],
  ]);
  expect(frame.labels.every(tick => tick.label.includes('2026'))).toBe(true);
  expect(frame.series.every(series => series.areaCommands?.some(command => command.type === 'Z'))).toBe(true);
});

it('keeps a linear stream graph viewport in elapsed units independently of numeric Y', () => {
  const linear = {
    ...stream, axes: {...axes, x: {type: 'linear', domain: [0, 3], nice: false}, y: {type: 'linear', domain: [-20,20]}},
    series: source.map(series => ({...series, data: series.data.map((point, x) => ({...point, x}))})),
  } as const satisfies PlanSpec;
  const result = planChart(linear, {...size, viewport: {axes: 'xy', value: {x: [1,2], y: [-12,12]}}});
  if (result.status !== 'ok') throw Error(JSON.stringify(result));
  expect(result.frame.labels.every(label => label.value !== undefined && label.value >= 1 && label.value <= 2)).toBe(true);
  expect(result.frame.observations.map(point => point.xValue)).toEqual([1,2,1,2]);
  expect(result.frame.viewport?.displayed).toEqual({x: [1,2], y: [-12,12]});
});

it('reverses the physical Y scale of a stacked area while preserving both source rows and UTC labels', () => {
  const baseline = planChart({...area, axes: {...axes, y: {type:'linear',domain:[0,20],nice:false}}},
    {...size, stacking:'sum', references:[{id:'first',axis:'x',value:first}]});
  const reverse = planChart({...area, axes: {...axes, y: {type:'linear',domain:[0,20],nice:false,reversed:true}}},
    {...size, stacking:'sum', references:[{id:'first',axis:'x',value:first}]});
  if (baseline.status !== 'ok' || reverse.status !== 'ok') throw Error('Expected measured area');
  expect(reverse.frame.observations.map(o => o.id)).toEqual(baseline.frame.observations.map(o => o.id));
  expect(reverse.frame.observations.map(o => o.value)).toEqual(baseline.frame.observations.map(o => o.value));
  reverse.frame.observations.forEach((o,i) => expect(o.y + baseline.frame.observations[i]!.y).toBeCloseTo(size.height,10));
  expect(reverse.frame.labels.map(label=>label.label)).toEqual(baseline.frame.labels.map(label=>label.label));
  expect(reverse.frame.references).toEqual(baseline.frame.references);
});

it('preserves an empty scoped area with a numeric Y envelope and only unmatched source samples', () => {
  const result=planChart({...area,axes:{...axes,y:{type:'linear',domain:[0,30],nice:false}}},
    {...size,stacking:'sum',viewport:{axes:'xy',value:{x:[first+day/4,first+day/2],y:[14,22]}}});
  if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
  expect(result.status).toBe('empty');
  expect(result.frame.observations).toEqual([]);
  expect(result.frame.viewport?.displayed).toEqual({x:[first+day/4,first+day/2],y:[14,22]});
});

it('reports incompatible source and window options before returning partial stack geometry', () => {
  const malformed = {...stream, family: 'area'} as const;
  expect(planStreamgraph(malformed as unknown as typeof stream, size)).toMatchObject({
    status: 'invalid', diagnostic: {path: 'family'},
  });
  const cardinality = {
    ...area, axes: {x: {type: 'category', values: Array.from({length: 65}, (_, i) => ({id: 'c' + i}))}, y: axes.y},
    series: [{id: 'source', name: 'Source', data: []}],
  } as const;
  expect(planStackedArea(cardinality, {...size, stacking: 'sum'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'LABEL_LIMIT', path: 'axes.x.values'},
  });
  expect(planChart(area, {...size, stacking: 'sum', viewport: {axes: 'x', value: {x: [first + 4*day, first + 5*day]}}})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT_WINDOW', path: 'viewport.value.x'},
  });
  const overflow = {...area, series: source.map(series => ({...series, data: values(series.id, [Number.MAX_VALUE, Number.MAX_VALUE])}))};
  expect(planChart(overflow, {...size, stacking: 'sum'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'STACK_OVERFLOW'},
  });
});
