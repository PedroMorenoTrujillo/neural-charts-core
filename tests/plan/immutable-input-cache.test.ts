import {expect, it} from 'vitest';
import {isReusablePlanArray,ownPlanInput} from '../../src/plan/input.js';
import {planCapacity,planSeriesLimit} from '../../src/plan/capacity.js';
import {prepareOwnedLine} from '../../src/plan/prepared-line.js';
import type {PlanOptions} from '../../src/plan.js';

it('reuses only completely immutable validated input and charges every budget on cache hits', () => {
  const data = Object.freeze({values: Object.freeze([Object.freeze({id: 'a', value: 1}), Object.freeze({id: 'b', value: 2})])});
  const first = ownPlanInput(data);
  expect(ownPlanInput(data)).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  expect(() => ownPlanInput(data, {nodes: 3, characters: 100})).toThrow('INPUT_LIMIT');
  expect(() => ownPlanInput(data, {nodes: 100, characters: 1})).toThrow('INPUT_LIMIT');
  let nested: unknown = data; for (let i = 0; i < 32; i++) nested = {nested};
  expect(() => ownPlanInput(nested)).toThrow('INPUT_LIMIT');
});

it('never trusts shallow freezing, executes accessors or caches mutable descendants', () => {
  const child = {value: 1}, data = Object.freeze({child});
  const before = ownPlanInput(data); child.value = 2;
  expect(ownPlanInput(data)).not.toBe(before);
  expect(ownPlanInput(data)).toEqual({child: {value: 2}});
  let reads = 0; const getter = Object.freeze(Object.defineProperty({}, 'value', {enumerable: true, get() {reads++; return 1;}}));
  expect(() => ownPlanInput(getter)).toThrow('ACCESSOR'); expect(reads).toBe(0);
  const cycle: {child?: unknown} = {}; cycle.child = cycle; Object.freeze(cycle);
  expect(() => ownPlanInput(cycle)).toThrow('BAD_JSON');
});

it('reuses a coarse immutable array without retaining a cache record per datum', () => {
  const series = Object.freeze(Array.from({length: 100}, (_, i) => Object.freeze({id: String(i), value: i})));
  const first = ownPlanInput({series}) as {series: readonly unknown[]};
  const second = ownPlanInput({series}) as {series: readonly unknown[]};
  expect(second).not.toBe(first); expect(second.series).toBe(first.series);
  expect(() => ownPlanInput({series}, {nodes: 100, characters: 10000})).toThrow('INPUT_LIMIT');
  const changed = [...series]; changed[99] = Object.freeze({id: '99', value: 101}); Object.freeze(changed);
  expect((ownPlanInput({series: changed}) as {series: {value: number}[]}).series[99]!.value).toBe(101);
});

it('charges immutable point fast paths against the same node, text and depth budgets as ordinary input', () => {
  const point = Object.freeze({id: 'unit', x: 'category', y: null});
  const limits = {nodes: 4, characters: 12};
  expect(ownPlanInput(point, limits)).toBe(point);
  expect(ownPlanInput({...point}, limits)).toEqual(point);
  for (const candidate of [point, {...point}]) {
    expect(() => ownPlanInput(candidate, {nodes: 3, characters: 12})).toThrow('INPUT_LIMIT');
    expect(() => ownPlanInput(candidate, {nodes: 4, characters: 11})).toThrow('INPUT_LIMIT');
    let nested: unknown = candidate;
    for (let level = 0; level < 32; level++) nested = {nested};
    expect(() => ownPlanInput(nested)).toThrow('INPUT_LIMIT');
  }
  const series = Object.freeze(Array.from({length: 20}, (_, index) => Object.freeze({id: 'p' + index, x: index, y: 0})));
  expect(isReusablePlanArray(series)).toBe(false);
  const owned = ownPlanInput({series}) as {series: readonly unknown[]};
  expect(isReusablePlanArray(series)).toBe(true);
  expect(isReusablePlanArray(owned.series)).toBe(true);
  expect(isReusablePlanArray([...owned.series])).toBe(false);
});

it('bounds explicitly trusted inputs and keeps the separate limits for stacked and unstacked families', () => {
  expect(planCapacity({points:100_000,categories:10_000})).toEqual({
    points:100_000,categories:10_000,nodes:850_000,characters:12_800_000,
  });
  for(const bad of [null,0,{records:11},{points:1.5},{points:0},{points:100_001},{categories:0},{categories:10_001}]){
    expect(() => planCapacity(bad as PlanOptions['capacity'])).toThrow('BAD_CAPACITY');
  }
  expect(planSeriesLimit('areaspline',undefined)).toBe(64);
  expect(planSeriesLimit('areaspline','sum')).toBe(16);
  expect(planSeriesLimit('column',undefined)).toBe(16);
});

it('bounds cached line configurations while retaining the exact owned series data', () => {
  const data = Object.freeze(Array.from({length: 20}, (_, x) => Object.freeze({id: 'p' + x, x, y: x})));
  const series = Object.freeze([Object.freeze({id: 'source', name: 'Source', data})]);
  const prepare = (title: string) => {
    const input = ownPlanInput({family: 'line', title, axes: {x: {type: 'linear'}, y: {type: 'linear'}}, series});
    const result = prepareOwnedLine(input);
    if (result.status !== 'ok') throw Error(result.diagnostic.reason);
    return result.value;
  };
  const first = prepare('A');
  const second = prepare('B');
  expect(prepare('A')).toBe(first);
  for (const title of ['C', 'D', 'E']) expect(prepare(title).input.title).toBe(title);
  expect(prepare('B')).toBe(second);
  const restored = prepare('A');
  expect(restored).not.toBe(first);
  expect(restored.input.series[0]?.data.map(point => [point.id, point.x, point.y])).toEqual(
    data.map(point => [point.id, point.x, point.y]),
  );
  expect(prepareOwnedLine(null).status).toBe('invalid');
});

it('keeps hidden descriptors out of a frozen line point snapshot', () => {
  const point = Object.freeze(Object.defineProperty({id: 'reading', x: 3}, 'y', {value: 27}));
  const snapshot = ownPlanInput({point}) as {point: Record<string, unknown>};
  expect(snapshot.point).not.toBe(point);
  expect(Object.keys(snapshot.point)).toEqual(['id', 'x']);
  expect(Object.hasOwn(snapshot.point, 'y')).toBe(false);
});
