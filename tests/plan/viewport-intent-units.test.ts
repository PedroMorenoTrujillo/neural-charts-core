import {expect, it} from 'vitest';
import {planChart, transformPlanViewport, type PlanXRangeSpec, type PlanViewportState, type PlanViewportIntent} from '../../src/plan.js';

function state(reversed = false): PlanViewportState {
  const spec = {
    family: 'xrange', title: 'Measured window',
    axes: {x: {kind: 'linear', domain: [0, 100], nice: false, reversed}, y: {kind: 'category', values: [{id: 'row', label: 'Row'}]}},
    series: [{id: 'source', name: 'Source', data: [{id: 'span', rowId: 'row', start: 0, end: 100}]}],
  } satisfies PlanXRangeSpec;
  const result = planChart(spec, {width: 390, height: 300, viewport: {axes: 'x', value: {x: [20, 60]}}});
  if (result.status === 'invalid' || !result.frame.viewport) throw new Error('Expected a planned viewport');
  return result.frame.viewport;
}

function window(viewport: PlanViewportState, intent: PlanViewportIntent) {
  const result = transformPlanViewport(viewport, intent);
  if (result.status === 'invalid') throw new Error(result.diagnostic.reason);
  return result.value.x;
}

it('uses normalized domain-order anchors and displayed-span pan fractions', () => {
  for (const reversed of [false, true]) {
    const viewport = state(reversed);
    expect(window(viewport, {kind: 'zoom', factor: 2, anchor: {x: 0}})).toEqual([20, 40]);
    expect(window(viewport, {kind: 'zoom', factor: 2, anchor: {x: 1}})).toEqual([40, 60]);
    expect(window(viewport, {kind: 'pan', delta: {x: 0.25}})).toEqual([30, 70]);
    expect(window(viewport, {kind: 'pan', delta: {x: -0.25}})).toEqual([10, 50]);
  }
  expect(transformPlanViewport(state(), {kind: 'zoom', factor: 2, anchor: {x: Date.UTC(2026, 0, 1)}}).status).toBe('invalid');
});
