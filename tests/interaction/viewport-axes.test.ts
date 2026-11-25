import { describe, expect, it } from 'vitest';
import { formatAxis, planAxes } from '../../src/internal/axes/plan.js';
import { prepareViewport, type Viewport } from '../../src/internal/interaction/viewport.js';
import {
  cartesianViewportContext, extendLineViewportMap, withViewportAxes, withViewportDomains,
} from '../../src/internal/interaction/viewport-axes.js';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { PlanLineSpec, PlanViewportConfig } from '../../src/plan.js';
import { planLineViewportScales, preparePlanViewport } from '../../src/plan/viewport.js';

function accept<T>(result: ChartResult<T>): T {
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}
function active(initial: unknown, context: Viewport['context']): Viewport {
  const viewport = accept(prepareViewport({ mode: 'internal', axes: 'xy', initial }, context));
  if (!viewport) throw Error('Expected a prepared viewport');
  return viewport;
}

const values = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase() }));
const both = {
  x: { type: 'category', values, reversed: true },
  y: { type: 'category', values, reversed: false },
} as const;

describe('plan viewport scale handoff', () => {
  const x = {type: 'category', values, edgeSpacing: 1.25} as const;
  const y = {type: 'linear', reversed: true} as const;
  const axes: PlanLineSpec['axes'] = {x, y};
  const domain = [0,100] as const;
  const plot = {x: 20, y: 30, width: 280, height: 180};
  const viewport = (config: PlanViewportConfig) => {
    const result = accept(preparePlanViewport(axes, {x: null, y: domain}, config));
    if (!result) throw Error('Expected viewport state');
    return result;
  };

  it('retains the center and off-window neighbours of a single categorical slice', () => {
    const single = viewport({axes: 'x', value: {x: {firstId: 'b', lastId: 'b'}}});
    const result = accept(planLineViewportScales(axes, plot, null, domain, single))!;
    expect(result.mapX('b')).toBe(plot.x + plot.width / 2);
    expect(result.mapX('a')).toBeLessThan(plot.x);
    expect(result.mapX('c')).toBeGreaterThan(plot.x + plot.width);
    expect(result.mapX('lost')).toBeNull();
    expect(result.mapX(0)).toBeNull();
    expect(result.mapY(0)).toBe(plot.y);
    const yOnly = viewport({axes: 'y', value: {y: [10,80]}});
    const axis = accept(planLineViewportScales(axes, plot, null, [10,80], yOnly))!;
    expect(axis.mapX('a')).toBeLessThan(axis.mapX('d')!);
    expect(axis.mapX('unknown')).toBeNull();
    expect(axis.mapX(1)).toBeNull();
  });

  it('returns typed diagnostics when viewport and renderer scales express incompatible contexts', () => {
    const config = {axes: 'x', value: {x: {firstId: 'b', lastId: 'c'}}} as const;
    const current = viewport(config);
    expect(preparePlanViewport(axes, {x: null, y: domain}, {...config, padding: 1} as PlanViewportConfig)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT', path: 'options.viewport'},
    });
    expect(preparePlanViewport({x: {...x, values: [values[0]!, values[0]!]}, y}, {x: null, y: domain}, config)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'DUPLICATE_CATEGORY'},
    });
    expect(planLineViewportScales(axes, {...plot, height: NaN}, null, domain, current).status).toBe('invalid');
    expect(planLineViewportScales(axes, {...plot, width: Infinity}, null, domain, current).status).toBe('invalid');
    expect(planLineViewportScales({x: {type: 'linear'}, y}, plot, null, domain, current)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT_AXIS', path: 'viewport.x'},
    });
    const numeric = accept(preparePlanViewport({x: {type: 'linear'}, y}, {x: [0, 100], y: domain}, {
      axes: 'x', value: {x: [20,50]},
    }))!;
    expect(planLineViewportScales(axes, plot, null, domain, numeric)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_VIEWPORT_AXIS', path: 'viewport.x'},
    });
    const stale = {...current, value: {x: {firstId: 'gone', lastId: 'c'}}};
    expect(planLineViewportScales(axes, plot, null, domain, stale)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_CATEGORY_WINDOW', path: 'viewport.x'},
    });
    const reversed = {...current, value: {x: {firstId: 'c', lastId: 'b'}}};
    expect(planLineViewportScales(axes, plot, null, domain, reversed)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_CATEGORY_WINDOW', path: 'viewport.x'},
    });
  });
});
const numeric = {
  x: { type: 'time', domain: [0, 600_000], nice: false },
  y: { type: 'linear', domain: [-100, 100], includeZero: true },
} as const;
const domains = { x: numeric.x.domain, y: numeric.y.domain } as const;
const layoutOptions = {
  width: 480, height: 320, font: { family: 'sans-serif', size: 12, weight: 500 },
  direction: 'ltr', labels: new Map(values.map(value => [value.id, value.label])),
  measurer: { measure: (text: string) => ({ width: text.length * 6, height: 12, baseline: 8 }), invalidate() {}, destroy() {} },
} as const;

describe('scope chart axes to the accepted viewport', () => {
  it('scopes numeric and temporal axes by exact bounds without expanding axes or mutating the source', () => {
    const context = accept(cartesianViewportContext(numeric, domains));
    const current = active({ x: [120_000, 360_000], y: [20, 60] }, context);
    const scoped = accept(withViewportAxes(numeric, current));
    expect(scoped).toMatchObject({
      x: { type: 'time', nice: false, domain: [120_000, 360_000] },
      y: { type: 'linear', nice: false, includeZero: false, domain: [20, 60] },
    });
    expect(numeric.y.includeZero).toBe(true);
    expect(withViewportDomains(domains, current)).toEqual({ x: [120_000, 360_000], y: [20, 60] });
    expect(accept(withViewportAxes(numeric, null))).toBe(numeric);
    expect(withViewportDomains(domains, null)).toBe(domains);
    expect(withViewportAxes(both, current)).toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.x', reason: 'BAD_VIEWPORT_AXIS' } });
    expect(withViewportAxes({ x: numeric.x, y: both.y }, current))
      .toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.y', reason: 'BAD_VIEWPORT_AXIS' } });
  });

  it('scopes category windows before layout and keeps off-window edge segments addressable', () => {
    const context = accept(cartesianViewportContext(both, { x: null, y: null }));
    const current = active({ x: { firstId: 'b', lastId: 'c' }, y: { firstId: 'a', lastId: 'b' } }, context);
    const scoped = accept(withViewportAxes(both, current));
    if (scoped.x.type !== 'category' || scoped.y.type !== 'category') throw Error('Expected scoped categories');
    expect(scoped.x.values?.map(value => value.id)).toEqual(['b', 'c']);
    expect(scoped.y.values?.map(value => value.id)).toEqual(['a', 'b']);
    expect(both.x.values).toHaveLength(4);
    expect(Object.isFrozen(scoped.x.values)).toBe(true);
    expect(withViewportDomains(domains, current)).toEqual(domains);
    const plan = accept(planAxes({ ...layoutOptions, ...scoped, domains: { x: null, y: null } }));
    const extended = accept(extendLineViewportMap(plan, current));
    expect(plan.mapX('a')).toBeNull();
    expect(extended.mapX('b')).toBe(plan.mapX('b'));
    expect(extended.mapX('a')!).toBeGreaterThan(extended.mapX('b')!);
    expect(extended.mapX('d')!).toBeLessThan(extended.mapX('c')!);
    expect(extended.mapX('other')).toBeNull();
    expect(extended.mapX(2)).toBeNull();
    expect(accept(extendLineViewportMap(plan, null))).toBe(plan);
    expect(accept(extendLineViewportMap({ ...plan, tooSmall: true }, current)).tooSmall).toBe(true);

    const single = active({ x: { firstId: 'b', lastId: 'b' } }, context);
    const singleAxes = accept(withViewportAxes(both, single));
    const one = accept(planAxes({ ...layoutOptions, ...singleAxes, domains: { x: null, y: null } }));
    const halo = accept(extendLineViewportMap(one, single));
    expect(halo.mapX('c')).toBeCloseTo(one.mapX('b')! + one.plot.width);
  });

  it('rejects stale category bounds or windows applied to a different kind of axis', () => {
    const context = accept(cartesianViewportContext(both, { x: null, y: null }));
    const current = active({ x: { firstId: 'b', lastId: 'c' }, y: { firstId: 'a', lastId: 'b' } }, context);
    const missing = { ...current, value: { x: { firstId: 'lost', lastId: 'c' } } };
    const reverse = { ...current, value: { y: { firstId: 'd', lastId: 'a' } } };
    expect(withViewportAxes(both, missing))
      .toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.x', reason: 'BAD_CATEGORY_WINDOW' } });
    expect(withViewportAxes(both, reverse))
      .toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.y', reason: 'BAD_CATEGORY_WINDOW' } });
    expect(withViewportAxes(numeric, current))
      .toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.x', reason: 'BAD_VIEWPORT_AXIS' } });
    expect(withViewportAxes({ x: both.x, y: numeric.y }, current))
      .toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.y', reason: 'BAD_VIEWPORT_AXIS' } });
    const plan = accept(planAxes({ ...layoutOptions, ...both, domains: { x: null, y: null } }));
    expect(extendLineViewportMap(plan, missing)).toMatchObject({ status: 'invalid', diagnostic: { path: 'viewport.x' } });
  });
});

it.each([
  ['year', '2026'], ['month', '2026-11'], ['week', '2026-11-25'], ['day', '2026-11-25'],
  ['hour', '2026-11-25T12Z'], ['minute', '2026-11-25T12:34Z'],
  ['second', '2026-11-25T12:34:56Z'], ['millisecond', '2026-11-25T12:34:56.120Z'],
] as const)('formats a UTC axis at %s precision', (unit, expected) => {
  const value = Date.UTC(2026, 10, 25, 12, 34, 56, 120);
  expect(formatAxis(value, 'time', { unit, step: 1 }, new Map())).toBe(expected);
});
