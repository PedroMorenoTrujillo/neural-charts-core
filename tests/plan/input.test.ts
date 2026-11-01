import {describe, expect, it} from 'vitest';
import fc from 'fast-check';
import {freezePlan, ownPlanInput} from '../../src/plan/input.js';
import {planChart, type PlanLineSpec} from '../../src/plan.js';

describe('bounded planning snapshots', () => {
  it('owns arbitrary JSON without changing values or freezing caller objects', () => {
    fc.assert(fc.property(fc.jsonValue(), input => {
      const snapshot = ownPlanInput(input);
      expect(JSON.stringify(snapshot)).toBe(JSON.stringify(input));
      if (input !== null && typeof input === 'object') {
        expect(snapshot).not.toBe(input);
        expect(Object.isFrozen(input)).toBe(false);
      }
      freezePlan(snapshot);
      if (snapshot !== null && typeof snapshot === 'object') expect(Object.isFrozen(snapshot)).toBe(true);
      if (input !== null && typeof input === 'object') expect(Object.isFrozen(input)).toBe(false);
    }), {seed: 20261101, numRuns: 250});
  });

  it('separates repeated references and preserves null, zero and dangerous property names', () => {
    const shared = {value: 0};
    const input = JSON.parse('{"__proto__":{"polluted":true},"constructor":null,"prototype":0}') as Record<string, unknown>;
    input['a'] = shared; input['b'] = shared;
    const snapshot = ownPlanInput(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(snapshot)).toBeNull();
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true);
    expect(snapshot['constructor']).toBeNull();
    expect(snapshot['prototype']).toBe(0);
    expect(snapshot['a']).not.toBe(shared);
    expect(snapshot['a']).not.toBe(snapshot['b']);
    shared.value = 4;
    expect(snapshot['a']).toEqual({value: 0});
    expect(Object.getOwnPropertyDescriptor(snapshot, '__proto__')).toMatchObject({enumerable: true, writable: true, configurable: true});
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('never invokes an enumerable accessor on objects or indexed arrays', () => {
    let reads = 0;
    const object = Object.defineProperty({}, 'value', {enumerable: true, get() {reads++; return 1;}});
    const array = Object.defineProperty([1], '0', {enumerable: true, get() {reads++; return 1;}});
    expect(() => ownPlanInput(object)).toThrow('ACCESSOR');
    expect(() => ownPlanInput(array)).toThrow('ACCESSOR');
    expect(reads).toBe(0);
  });

  it('does not invoke inherited setters when producing the snapshot', () => {
    const field = '__neural_plan_input_test__';
    let objectWrites = 0, arrayWrites = 0;
    const input = Object.defineProperty({}, field, {value: 2, enumerable: true});
    const priorObject = Object.getOwnPropertyDescriptor(Object.prototype, field);
    const priorArray = Object.getOwnPropertyDescriptor(Array.prototype, '0');
    let objectSnapshot: unknown, arraySnapshot: unknown;
    try {
      Object.defineProperty(Object.prototype, field, {configurable: true, set() {objectWrites++;}});
      Object.defineProperty(Array.prototype, '0', {configurable: true, set() {arrayWrites++;}});
      objectSnapshot = ownPlanInput(input);
      arraySnapshot = ownPlanInput([0, null, 4]);
    } finally {
      if (priorObject) Object.defineProperty(Object.prototype, field, priorObject); else Reflect.deleteProperty(Object.prototype, field);
      if (priorArray) Object.defineProperty(Array.prototype, '0', priorArray); else Reflect.deleteProperty(Array.prototype, '0');
    }
    expect(objectWrites).toBe(0); expect(arrayWrites).toBe(0);
    expect(Object.getOwnPropertyDescriptor(objectSnapshot, field)?.value).toBe(2);
    expect(arraySnapshot).toEqual([0, null, 4]);
  });

  it('rejects sparse arrays, custom array fields, cycles and non-JSON values', () => {
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle;
    const decorated = Object.assign([1], {extra: 2});
    for (const value of [Array(2), [1, , 3], decorated]) expect(() => ownPlanInput(value)).toThrow('BAD_ARRAY');
    for (const value of [cycle, undefined, Infinity, NaN, new Date(0), new Number(0), () => 1]) expect(() => ownPlanInput(value)).toThrow('BAD_JSON');
  });

  it('retains the total node, string and depth budgets', () => {
    expect(ownPlanInput('x'.repeat(1_000_000))).toHaveLength(1_000_000);
    expect(() => ownPlanInput(['x'.repeat(500_001), 'x'.repeat(500_000)])).toThrow('INPUT_LIMIT');
    expect(() => ownPlanInput(Array(200_000).fill(null))).toThrow('INPUT_LIMIT');
    expect(() => ownPlanInput(Array(200_001).fill(null))).toThrow('BAD_ARRAY');
    let nested: unknown = null;
    for (let i = 0; i < 32; i++) nested = [nested];
    expect(() => ownPlanInput(nested)).not.toThrow();
    expect(() => ownPlanInput([nested])).toThrow('INPUT_LIMIT');
  });

  it('keeps the public frame detached from caller updates and reports invalid accessors', () => {
    const input: PlanLineSpec = {family: 'line', title: 'Measured', axes: {x: {kind: 'linear'}, y: {kind: 'linear'}}, series: [{id: 's', name: 'Source', data: [{id: 'p', x: 0, y: 0}, {id: 'q', x: 1, y: 4}]}]};
    const result = planChart(input, {width: 390, height: 300});
    expect(result.status).toBe('ok');
    if (result.status === 'invalid') throw Error(result.diagnostic.reason);
    expect(result.frame.observations.map(p => p.value)).toEqual([0, 4]);
    expect(Object.isFrozen(result.frame.observations[0]?.id)).toBe(true);
    Object.assign(input.series[0]!.data[0]!, {y: 99});
    expect(result.frame.observations[0]?.value).toBe(0);
    expect(Object.isFrozen(input.series[0]!.data[0])).toBe(false);
    let reads = 0;
    const unsafe = Object.defineProperty({...input}, 'series', {enumerable: true, get() {reads++; return input.series;}});
    expect(planChart(unsafe, {width: 390, height: 300}).status).toBe('invalid');
    expect(reads).toBe(0);
  });
});
