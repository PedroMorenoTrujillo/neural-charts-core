import {expect, it} from 'vitest';
import {ownPlanInput} from '../../src/plan/input.js';

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
