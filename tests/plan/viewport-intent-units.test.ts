import {describe, expect, it} from 'vitest';
import {planChart, transformPlanViewport, type PlanXRangeSpec, type PlanViewportState, type PlanViewportIntent} from '../../src/plan.js';
import {panNumeric,zoomNumeric} from '../../src/internal/interaction/viewport-math.js';

function state(reversed = false): PlanViewportState {
  const spec = {
    family: 'xrange', title: 'Measured window',
    axes: {x: {type: 'linear', domain: [0, 100], nice: false, reversed}, y: {type: 'category', values: [{id: 'row', label: 'Row'}]}},
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
    expect(window(viewport, {type: 'zoom', factor: 2, anchor: {x: 0}})).toEqual([20, 40]);
    expect(window(viewport, {type: 'zoom', factor: 2, anchor: {x: 1}})).toEqual([40, 60]);
    expect(window(viewport, {type: 'pan', delta: {x: 0.25}})).toEqual([30, 70]);
    expect(window(viewport, {type: 'pan', delta: {x: -0.25}})).toEqual([10, 50]);
  }
  expect(transformPlanViewport(state(), {type: 'zoom', factor: 2, anchor: {x: Date.UTC(2026, 0, 1)}}).status).toBe('invalid');
});

describe('viewport controls reject invalid intent atomically', () => {
  it('preserves finite source bounds when scale changes exceed machine precision', () => {
    expect(zoomNumeric([1, 2], [0, 3], Number.MIN_VALUE)).toEqual({status: 'ok', value: [0, 3]});
    expect(zoomNumeric([1, 1 + Number.EPSILON], [0, 3], 10)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_VIEWPORT', path: 'viewport'},
    });
    expect(panNumeric([0, 4], [1, 4], .5)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT', path: 'viewport'},
    });
  });
  const malformed = [
    [{type: 'reset', force: true}, 'BAD_VIEWPORT_INTENT', 'intent'],
    [{type: 'pan'}, 'BAD_VIEWPORT_INTENT', 'intent'],
    [{type: 'pan', delta: {z: 1}}, 'BAD_VIEWPORT_INTENT', 'intent'],
    [{type: 'pan', delta: {x: '0.25'}}, 'BAD_PAN', 'intent.delta'],
    [{type: 'zoom', factor: 0}, 'BAD_ZOOM', 'intent.factor'],
    [{type: 'zoom', factor: -1}, 'BAD_ZOOM', 'intent.factor'],
    [{type: 'zoom', factor: 2, delta: {x: .1}}, 'BAD_VIEWPORT_INTENT', 'intent'],
    [{type: 'zoom', factor: 2, anchor: {z: 0}}, 'BAD_VIEWPORT_ANCHOR', 'intent.anchor'],
    [{type: 'zoom', factor: 2, anchor: {x: -0.1}}, 'BAD_VIEWPORT_ANCHOR', 'intent.anchor'],
    [{type: 'zoom', factor: 2, anchor: {x: '0.5'}}, 'BAD_VIEWPORT_ANCHOR', 'intent.anchor'],
    [{type: 'transform', factor: 2, delta: {z: 0}}, 'BAD_VIEWPORT_INTENT', 'intent.delta'],
    [{type: 'fit'}, 'BAD_VIEWPORT_INTENT', 'intent'],
  ] as const;
  it.each(malformed)('rejects malformed controls (case %#)', (action, reason, path) => {
    const viewport = state();
    const previous = structuredClone(viewport);
    expect(transformPlanViewport(viewport, action as PlanViewportIntent)).toMatchObject({
      status: 'invalid', diagnostic: {reason, path},
    });
    expect(viewport).toEqual(previous);
  });

  it('applies zoom and translation once in the post-zoom domain order', () => {
    for (const reversed of [false, true]) {
      const viewport = state(reversed);
      expect(window(viewport, {type: 'transform', factor: 2, delta: {x: .25}})).toEqual([35, 55]);
      expect(window(viewport, {type: 'transform', factor: 2})).toEqual([30, 50]);
    }
  });

  it('clamps a pinch to the declared original-unit span and diagnoses a stale displayed domain', () => {
    const viewport = state();
    const bounds = {...viewport.bounds, x: {type: 'linear', domain: [0, 100], limits: {minSpan: 8}}} as const;
    const last = {type: 'zoom', factor: 100} as const;
    expect(window({...viewport, bounds}, last)).toEqual([36, 44]);
    const displayed = {...viewport.displayed, x: [39, 41]} as const;
    expect(transformPlanViewport({...viewport, bounds, displayed}, last)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT_LIMIT', path: 'viewport.x.limits'},
    });
  });
});

describe('retained viewport state transport', () => {
  const invalidStates = [
    [{metadata: 'new field'}, 'BAD_VIEWPORT', 'viewport'],
    [{reversed: {x: false, y: 0}}, 'BAD_VIEWPORT', 'viewport'],
    [{plot: {x: 0, y: -1, width: 10, height: 10}}, 'BAD_VIEWPORT_PLOT', 'viewport.plot'],
    [{plot: {x: 0, y: 0, width: 0, height: 10}}, 'BAD_VIEWPORT_PLOT', 'viewport.plot'],
    [{plot: {x: 0, y: 0, width: 10, height: 10, left: 3}}, 'BAD_VIEWPORT_PLOT', 'viewport.plot'],
    [{displayed: {x: [20, 60], z: null}}, 'BAD_VIEWPORT', 'viewport'],
    [{value: {x: [30, 20]}}, 'BAD_VIEWPORT_WINDOW', 'viewport.value.x'],
  ] as const;
  it.each(invalidStates)('rejects an invalid retained state (case %#)', (patch, reason, path) => {
    expect(transformPlanViewport({...state(), ...patch} as PlanViewportState, {type: 'reset'})).toMatchObject({
      status: 'invalid', diagnostic: {reason, path},
    });
  });

  it.each([
    [null, 'BAD_VIEWPORT_AXIS', 'viewport.x'],
    [{type: 'polar'}, 'BAD_VIEWPORT_AXIS', 'viewport.x'],
    [{type: 'linear', domain: [0, 100], max: 10}, 'BAD_VIEWPORT_AXIS', 'viewport.x'],
    [{type: 'category', ids: ['a', 'b'], edgeSpacing: 2.5}, 'BAD_VIEWPORT_AXIS', 'viewport.x'],
    [{type: 'category', ids: ['a', 'b'], edgeSpacing: -0.5}, 'BAD_VIEWPORT_AXIS', 'viewport.x'],
    [{type: 'linear', domain: [0, 100], limits: {minSpan: 101}}, 'BAD_VIEWPORT_LIMIT', 'viewport.x.limits'],
    [{type: 'linear', domain: [0, 100], limits: {minSpan: 0}}, 'BAD_VIEWPORT_LIMIT', 'viewport.x.limits'],
    [{type: 'linear', domain: [0, 100], limits: {minSpan: 10, maxSpan: 90}}, 'BAD_VIEWPORT_LIMIT', 'viewport.x.limits'],
  ] as const)('rejects invalid transport axis fields (case %#)', (x, reason, path) => {
    const fixture = state();
    const bounds = {...fixture.bounds, x} as PlanViewportState['bounds'];
    expect(transformPlanViewport({...fixture, bounds}, {type: 'reset'})).toMatchObject({
      status: 'invalid', diagnostic: {reason, path},
    });
  });

  it('reports exceptions from an unreadable snapshot as a typed diagnostic', () => {
    const unreadable = new Proxy(state(), {ownKeys() { throw Error('transport failure'); }});
    expect(transformPlanViewport(unreadable, {type: 'reset'})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT', path: 'viewport'},
    });
  });
});
