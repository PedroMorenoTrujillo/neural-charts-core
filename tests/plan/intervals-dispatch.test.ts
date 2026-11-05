import {expect, it} from 'vitest';
import {planChart, transformPlanViewport} from '../../src/plan.js';
import type {PlanSpec} from '../../src/plan.js';

it('hides and restores every accepted temporal series identity up to256 characters', () => {
  const id = 's'.repeat(256), options = {width: 390, height: 300};
  const examples: readonly PlanSpec[] = [
    {family: 'xrange', title: 'Source intervals', axes: {x: {type: 'linear'}, y: {type: 'category', values: [{id: 'row', label: 'Row'}]}}, series: [{id, name: 'Series', data: [{id: 'p', rowId: 'row', start: 0, end: 10}]}]},
    {family: 'timeline', title: 'Source events', axes: {x: {type: 'linear'}}, series: [{id, name: 'Series', data: [{id: 'p', x: 0, title: 'Original event'}]}]},
  ];
  for (const source of examples) {
    const original = planChart(source, options);
    expect(original.status).toBe('ok');
    expect(planChart(source, {...options, hiddenSeriesIds: [id]})).toMatchObject({status: 'empty', frame: {observations: [], legend: [{id, visible: false}]}});
    expect(planChart(source, {...options, hiddenSeriesIds: []})).toEqual(original);
    expect(planChart(source, {...options, hiddenSeriesIds: ['s'.repeat(257)]})).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_VISIBILITY'}});
  }
});

it('dispatches strict X-range input through the public immutable planning entry', () => {
  const data = {family: 'xrange', title: 'Source intervals', axes: {x: {type: 'linear'}, y: {type: 'category', values: [{id: 'a', label: 'A'}]}},
    series: [{id: 's', name: 'Series', data: [{id: 'p', rowId: 'a', start: 0, end: 10, completed: .4}]}]} satisfies PlanSpec;
  const result = planChart(data, {width: 390, height: 300, viewport: {axes: 'x'}});
  expect(result.status).toBe('ok');
  if (result.status === 'invalid') throw new Error('Unexpected invalid result');
  expect(result.frame.family).toBe('xrange');
  expect(result.frame.observations[0]!.interval?.completed).toBe(.4);
  expect(Object.isFrozen(result.frame)).toBe(true);
  data.series[0]!.data[0]!.start = 5;
  expect(result.frame.observations[0]!.interval?.start).toBe(0);
});

it('dispatches Timeline with an original timestamp and a missing event', () => {
  const data = {family: 'timeline', title: 'Source events', axes: {x: {type: 'time'}}, series: [{id: 's', name: 'Series', data: [
    {id: 'epoch', x: 0, title: 'Epoch', description: 'Original source'}, {id: 'unknown', x: null, title: 'Unscheduled'},
  ]}]} satisfies PlanSpec;
  const result = planChart(data, {width: 390, height: 300});
  expect(result.status).toBe('ok');
  if (result.status === 'invalid') throw new Error('Unexpected invalid result');
  expect(result.frame.family).toBe('timeline');
  expect(result.frame.observations[0]!.event?.coordinate).toBe(0);
  expect(result.frame.events?.[1]!.missing).toBe(true);
});

it('transforms X zoom, pan and reset with 256 real categorical rows', () => {
  const rows = Array.from({length: 256}, (_, index) => ({id: 'row-' + index, label: 'Row ' + index}));
  const data = {family: 'xrange', title: 'Rows', axes: {x: {type: 'linear', domain: [0, 100]}, y: {type: 'category', values: rows}},
    series: [{id: 's', name: 'Series', data: [{id: 'p', rowId: 'row-0', start: 0, end: 100}]}]} satisfies PlanSpec;
  const result = planChart(data, {width: 390, height: 4096, viewport: {axes: 'x', value: {x: [20, 80]}}});
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic));
  const state = result.frame.viewport!;
  expect(state.bounds.y.type).toBe('category');
  const zoom = transformPlanViewport(state, {type: 'zoom', factor: 2});
  expect(zoom.status).toBe('ok');
  if (zoom.status === 'invalid') throw new Error('Expected a transformed X window');
  expect(zoom.value.x).toEqual([35, 65]);
  const pan = transformPlanViewport(state, {type: 'pan', delta: {x: .1}});
  expect(pan.status).toBe('ok');
  if (pan.status === 'invalid') throw new Error('Expected a panned X window');
  expect(pan.value.x).not.toEqual([20, 80]);
  const reset = transformPlanViewport(state, {type: 'reset'});
  expect(reset).toEqual({status: 'ok', value: {}});
  expect(planChart(data, {width: 390, height: 4096, viewport: {axes: 'x', value: zoom.value}}).status).toBe('ok');

  const categoryY = {type: 'category' as const, ids: rows.map(row => row.id), edgeSpacing: .5};
  for (const ids of [[...categoryY.ids, 'too-many'], ['row-0', ...categoryY.ids.slice(0, -1)]]) {
    expect(transformPlanViewport({...state, bounds: {...state.bounds, y: {...categoryY, ids}}}, {type: 'zoom', factor: 2}).status).toBe('invalid');
  }
  expect(transformPlanViewport({...state, plot: {...state.plot!, width: 0}}, {type: 'reset'}).status).toBe('invalid');
});
