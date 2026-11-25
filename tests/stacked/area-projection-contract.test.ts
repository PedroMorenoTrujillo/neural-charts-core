import { expect, it } from 'vitest';
import { areaStack, normalizeStackedArea } from '../../src/stacked-area/data.js';
import { projectStackedArea } from '../../src/stacked-area/geometry.js';
import { validateStackedArea, validateStackedAreaOptions } from '../../src/stacked-area/validate.js';
import type { AxesPlan } from '../../src/internal/axes/plan.js';
import type { ChartResult } from '../../src/public/chart-types.js';

const state = {hiddenSeriesIds: []};
const categories = [{id: 'a', label: 'Measured A'}, {id: 'b'}, {id: 'c'}];
const values = (key: string, numbers: readonly number[]) => numbers.map((y, index) => ({
  id: key + index, x: categories[index]!.id, y,
}));
const spec = {family: 'stacked-area', title: 'Grouped throughput', stacking: 'sum',
  axes: {x: {type: 'category', values: categories}, y: {type: 'linear'}},
  tooltip: {mode: 'shared'},
  series: [
    {id: 'first', name: 'First', markers: 'on', data: values('f', [10,30,20])},
    {id: 'next', name: 'Next', markers: 'off', data: values('n', [3,5,8])},
  ],
};
const plot = {x: 10, y: 10, width: 280, height: 180};
const ranks = new Map(categories.map((category, index) => [category.id, index]));
const axes = {plot, tooSmall: false,
  x: {domain: null, ticks: [], labels: [], interval: null, target: 3},
  y: {domain: [0,50], ticks: [], labels: [], interval: null, target: 5},
  xTitle: null, yTitle: null, font: {family: 'sans-serif', size: 12, weight: 400}, direction: 'ltr',
  mapX: (x: string | number) => typeof x === 'string' && ranks.has(x) ? plot.x + 30 + ranks.get(x)! * 70 : null,
  mapY: (value: number) => 180 - value * 3,
} as const satisfies AxesPlan;
function accept<T>(result: ChartResult<T>): T {
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}
const model = normalizeStackedArea(accept(validateStackedArea(spec)));
const stack = accept(areaStack(model, state));

it('suppresses a compact projected stack while retaining shared tooltip and full data identity', () => {
  const fit = accept(projectStackedArea(model, state, stack, axes));
  expect(fit.tooltipMode).toBe('shared');
  expect(fit.series.map(series => series.markers.length)).toEqual([3, 0]);
  expect(fit.labels.get('a')).toBe('Measured A');
  expect(fit.fills.get('first')?.some(command => command.type === 'Z')).toBe(true);
  expect(fit.index.targets[0]?.map(target => target.point.point.y)).toEqual([10,30,20]);
  const compact = accept(projectStackedArea(model, state, stack, {...axes, tooSmall: true}));
  expect(compact.tooltipMode).toBe('shared');
  expect(compact.stack).toBe(stack);
  expect(compact.fills.size).toBe(0);
  expect(compact.index.targets).toEqual([]);
});

it('fails incompatible projected coordinates before a partial stack can be delivered', () => {
  for (const mapper of [
    {...axes, mapX: () => null},
    {...axes, mapX: () => Infinity},
    {...axes, mapY: (y: number) => y === 0 ? null : axes.mapY(y)},
    {...axes, mapY: () => Infinity},
  ]) expect(projectStackedArea(model, state, stack, mapper)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_GEOMETRY', path: 'stackedArea'},
  });
  const one = {...spec, axes: {...spec.axes, x: {...spec.axes.x, values: categories.slice(0,1)}},
    series: spec.series.map(series => ({...series, data: series.data.slice(0,1)}))};
  const single = normalizeStackedArea(accept(validateStackedArea(one)));
  expect(projectStackedArea(single, state, accept(areaStack(single, state)), {...axes, mapX: () => null})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_GEOMETRY', path: 'stackedArea'},
  });
});

it('rejects unreadable modes and validates supplied owner state before queuing a chart', () => {
  for (const config of [null, [], false]) expect(validateStackedArea(config)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_OBJECT', path: 'spec'},
  });
  expect(validateStackedArea({...spec, family: 'area'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_FAMILY', path: 'family'},
  });
  expect(validateStackedArea({...spec, stacking: 'average'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_STACK_MODE', path: 'stacking'},
  });
  const ids = new Set(['first','next']);
  expect(validateStackedAreaOptions({instanceId: 'valid', initialState: {hiddenSeriesIds: ['next']}}, ids)).toMatchObject({
    status: 'ok', value: {initialState: {hiddenSeriesIds: ['next']}},
  });
  expect(validateStackedAreaOptions({instanceId: 'valid', initialState: {hiddenSeriesIds: ['other']}}, ids)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_STATE', path: 'options.initialState.hiddenSeriesIds[0]'},
  });
});
