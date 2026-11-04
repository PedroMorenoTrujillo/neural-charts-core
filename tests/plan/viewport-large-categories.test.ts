import {expect, it} from 'vitest';
import {planChart, transformPlanViewport, type PlanColumnSpec, type PlanViewportState} from '../../src/plan.js';

it('zooms, replans, pans and resets every accepted category capacity in both orientations', () => {
  for (const count of [257, 1000, 10000]) for (const orientation of ['vertical', 'horizontal'] as const) {
    const ids = Array.from({length: count}, (_, i) => 'c' + i);
    const spec: PlanColumnSpec = {family: 'column', title: 'Large categories', orientation,
      axes: {x: {kind: 'category', values: ids.map(id => ({id, label: 'Duplicate label'}))}, y: {kind: 'linear'}},
      series: [{id: 's', name: 'Source', data: ids.map((id, i) => ({id, x: id, y: i % 19 - 9}))}]};
    const options = {width: 900, height: 380, capacity: {points: count, categories: count}, viewport: {axes: 'x' as const}};
    const planned = planChart(spec, options);
    if (planned.status === 'invalid' || !planned.frame.viewport) throw Error('Expected accepted capacity');
    const zoom = transformPlanViewport(planned.frame.viewport, {kind: 'zoom', factor: 2});
    if (zoom.status === 'invalid') throw Error(zoom.diagnostic.reason);
    expect(zoom.value.x).toBeDefined();
    const replanned = planChart(spec, {...options, viewport: {axes: 'x', value: zoom.value}});
    if (replanned.status === 'invalid' || !replanned.frame.viewport) throw Error('Expected applied zoom');
    const pan = transformPlanViewport(replanned.frame.viewport, {kind: 'pan', delta: {x: .2}});
    if (pan.status === 'invalid') throw Error(pan.diagnostic.reason);
    expect(pan.value.x).not.toEqual(zoom.value.x);
    expect(transformPlanViewport(replanned.frame.viewport, {kind: 'reset'})).toEqual({status: 'ok', value: {}});
    const invalid = {...replanned.frame.viewport, bounds: {...replanned.frame.viewport.bounds,
      x: {kind: 'category', ids: Array.from({length: 10001}, (_, i) => 'x' + i), edgeSpacing: .5}}} as PlanViewportState;
    expect(transformPlanViewport(invalid, {kind: 'zoom', factor: 2}).status).toBe('invalid');
  }
});
