import { describe, expect, it } from 'vitest';
import { planCartesianChart } from '../../src/cartesian.js';
import type { PlanOptions, PlanSpec } from '../../src/plan.js';

const size = {width: 480, height: 320};
const domain = [0, 100] as const;
const numeric = {type: 'linear', domain, nice: false} as const;
const sales = {id: 'sales', name: 'Sales', data: [{id: 'a', x: 0, y: 8}, {id: 'b', x: 50, y: 25}, {id: 'c', x: 100, y: 75}]};
const line = {family: 'line', title: 'Actuals', axes: {x: numeric, y: numeric}, series: [sales]} as const satisfies PlanSpec;
const column = {family: 'column', title: 'Actuals', axes: {x: {type: 'category', values: [{id: 'first'}, {id: 'second'}]}, y: numeric},
  series: [{...sales, data: [{id: 'a', x: 'first', y: 8}, {id: 'c', x: 'second', y: 75}]}]} as const satisfies PlanSpec;
const chart = (input: unknown, options: unknown = size) => planCartesianChart(input as PlanSpec, options as PlanOptions);

describe('standalone Cartesian package boundary', () => {
  it.each([
    [null, 'UNKNOWN_OPTION', 'options'],
    [{...size, unknown: true}, 'UNKNOWN_OPTION', 'options'],
    [{...size, width: 63}, 'BAD_VIEWPORT', 'options'],
    [{...size, height: 10_001}, 'BAD_VIEWPORT', 'options'],
    [{...size, hiddenSeriesIds: ['sales', 'sales']}, 'BAD_VISIBILITY', 'options.hiddenSeriesIds'],
    [{...size, hiddenSeriesIds: false}, 'BAD_VISIBILITY', 'options.hiddenSeriesIds'],
    [{...size, stacking: 'sum'}, 'BAD_STACK_MODE', 'options.stacking'],
    [{...size, stackGroups: [{id: 'group', label: 'Group', seriesIds: ['sales']}]}, 'STACK_GROUPS_REQUIRE_STACKED_COLUMNS', 'options.stackGroups'],
  ] as const)('diagnoses malformed adapter options (case %#)', (options, reason, path) => {
    expect(chart(line, options)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
  });

  it('rejects unsupported families and validation errors before returning a renderer frame', () => {
    expect(chart({family: 'pie', title: 'Segments', data: []})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_FAMILY', path: 'family'},
    });
    expect(chart(line, {...size, references: [{id: 'target', axis: 'y', value: 'fifty'}]})).toMatchObject({
      status: 'invalid', diagnostic: {path: 'options.references[0].value'},
    });
    expect(chart(line, {...size, referenceBands: [{id: 'target', axis: 'x', from: 80, to: 20}]})).toMatchObject({
      status: 'invalid', diagnostic: {path: expect.stringContaining('referenceBands')},
    });
    expect(chart({...line, series: [{...sales, data: null}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'INPUT_LIMIT', path: 'series'},
    });
  });

  it('exposes grouped stacks through the direct Cartesian entry and retains original group metadata', () => {
    const options = {...size, stacking: 'sum', stackGroups: [{id: 'plan', label: 'Plan', seriesIds: ['sales']}]} as const;
    expect(chart(column, options)).toMatchObject({
      status: 'ok', frame: {stackGroups: {placement: 'grouped', stacking: 'sum', groups: options.stackGroups}},
    });
  });

  it('keeps original values and categories while scoping numeric windows in a column plan', () => {
    const plan = chart(column, {...size, viewport: {axes: 'y', value: {y: [0, 40]}}});
    expect(plan).toMatchObject({status: 'ok', frame: {viewport: {displayed: {y: [0, 40]}}}});
    if (plan.status !== 'ok') throw Error(JSON.stringify(plan));
    expect(plan.frame.observations.map(point => [point.id.pointId, point.value])).toEqual([['a', 8], ['c', 75]]);
    expect(plan.frame.series[0]?.bars?.every(bar => bar.y >= plan.frame.viewport!.plot!.y)).toBe(true);
    expect(chart(column, {...size, viewport: {axes: 'y', value: {y: [50, 120]}}})).toMatchObject({
      status: 'invalid', diagnostic: {path: 'viewport.value.y'},
    });
  });
});
