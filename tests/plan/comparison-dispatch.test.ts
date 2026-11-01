import {expect, it} from 'vitest';
import {planChart, transformPlanViewport} from '../../src/plan.js';
import type {PlanBulletSpec, PlanVariwideSpec} from '../../src/plan.js';

it('plans Bullet and Variwide through the intended public API', () => {
  const axes = {x: {kind: 'category' as const, values: [{id: 'a', label: 'A'}]}, y: {kind: 'linear' as const}};
  const bullet: PlanBulletSpec = {family: 'bullet', title: 'Measured vs target', axes, series: [{id: 's', name: 'S', data: [{id: 'a', x: 'a', y: 8, target: 10}]}]};
  const variwide: PlanVariwideSpec = {family: 'variwide', title: 'Measured by capacity', axes, series: [{id: 's', name: 'S', data: [{id: 'a', x: 'a', y: 8, z: 10}]}]};
  const a = planChart(bullet, {width: 360, height: 280}), b = planChart(variwide, {width: 360, height: 280});
  expect(a).toMatchObject({status: 'ok', frame: {family: 'bullet', bulletTargets: [{value: 10}]}});
  expect(b).toMatchObject({status: 'ok', frame: {family: 'variwide', categoryBands: [{status: 'visible'}]}});
});

it('keeps every accepted series identity usable by the public legend visibility contract', () => {
  const axes = {x: {kind: 'category' as const, values: [{id: 'a', label: 'A'}]}, y: {kind: 'linear' as const}};
  const source = (family: 'bullet' | 'variwide', id: string): PlanBulletSpec | PlanVariwideSpec => family === 'bullet'
    ? {family, title: 'Measured', axes, series: [{id, name: 'Source', data: [{id: 'p', x: 'a', y: 0, target: 1}]}]}
    : {family, title: 'Measured', axes, series: [{id, name: 'Source', data: [{id: 'p', x: 'a', y: 0, z: 1}]}]};
  const size = {width: 390, height: 320}, validId = 's'.repeat(128);
  for (const family of ['bullet', 'variwide'] as const) {
    expect(planChart(source(family, validId), size)).toMatchObject({status: 'ok'});
    expect(planChart(source(family, validId), {...size, hiddenSeriesIds: [validId]})).toMatchObject({status: 'empty', frame: {observations: [], legend: [{id: validId, visible: false}]}});
    expect(planChart(source(family, 's'.repeat(129)), size)).toMatchObject({status: 'invalid'});
  }
});

it('transforms actual Y zoom/pan/reset for Variwide and rejects weighted X zoom', () => {
  const source: PlanVariwideSpec = {family: 'variwide', title: 'Weighted', axes: {x: {kind: 'category', values: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]}, y: {kind: 'linear', domain: [0, 100]}}, series: [{id: 's', name: 'S', data: [{id: 'a', x: 'a', y: 20, z: 1}, {id: 'b', x: 'b', y: 80, z: 3}]}]};
  const initial = planChart(source, {width: 360, height: 280, viewport: {axes: 'y'}});
  if (initial.status === 'invalid' || !initial.frame.viewport) throw Error('viewport missing');
  const zoom = transformPlanViewport(initial.frame.viewport, {kind: 'zoom', factor: 2});
  expect(zoom).toMatchObject({status: 'ok', value: {y: [25, 75]}});
  if (zoom.status !== 'ok') throw Error('zoom failed');
  const replanned = planChart(source, {width: 360, height: 280, viewport: {axes: 'y', value: zoom.value}});
  if (replanned.status === 'invalid' || !replanned.frame.viewport) throw Error('replan failed');
  expect(replanned.frame.categoryBands).toEqual(initial.frame.categoryBands);
  const pan = transformPlanViewport(replanned.frame.viewport, {kind: 'pan', delta: {y: .1}});
  expect(pan.status).toBe('ok');
  expect(transformPlanViewport(replanned.frame.viewport, {kind: 'reset'})).toEqual({status: 'ok', value: {}});
  expect(planChart(source, {width: 360, height: 280, viewport: {axes: 'x'}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'NUMERIC_Y_VIEWPORT_ONLY'}});
});
