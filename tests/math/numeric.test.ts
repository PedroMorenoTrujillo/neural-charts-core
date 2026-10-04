import { describe, expect, test } from 'vitest';
import { fixture, special, value } from '../helpers.js';
import { finiteExtent, expandConstant, normalizeNumericDomain } from '../../src/internal/math/domain.js';
import { createLinearScale } from '../../src/internal/math/linear.js';
import { selectNumericTicks } from '../../src/internal/math/numeric-ticks.js';
import { approximatelyEqual, isFiniteNumber, nextDown, nextUp, normalizeZero, ulp } from '../../src/internal/math/finite.js';
import { invalid, notify, ok } from '../../src/internal/diagnostics.js';

describe('literal numeric goldens', () => {
  for (const row of fixture('numeric').cases) test(row.id, () => {
    const plan = value(selectNumericTicks(row.input.domain, row.input));
    expect(plan).toEqual({ ...row.expected, fallback: false });
  });
  for (const row of fixture('projection-edge').cases) test(row.id, () => {
    const input = special(row.input);
    if (row.subsystem === 'constant') expect(value(expandConstant(input))).toEqual(row.expected);
    else expect(finiteExtent([input])).toMatchObject({ status: 'invalid', diagnostic: { code: row.expected } });
  });
});
test('finite bits and tolerances', () => {
  for (const n of [0, -0, 1, -1, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    expect(isFiniteNumber(n)).toBe(true);
    expect(nextUp(n)).toBeGreaterThan(n);
    expect(nextDown(n)).toBeLessThan(n);
    expect(ulp(n)).toBeGreaterThan(0);
  }
  expect(nextUp(Infinity)).toBe(Infinity); expect(nextDown(-Infinity)).toBe(-Infinity); expect(nextUp(NaN)).toBeNaN(); expect(ulp(NaN)).toBeNaN();
  expect(nextUp(-Infinity)).toBe(-Number.MAX_VALUE); expect(nextDown(Infinity)).toBe(Number.MAX_VALUE);
  expect(isFiniteNumber('1')).toBe(false); expect(Object.is(normalizeZero(-0), -0)).toBe(false);
  expect(approximatelyEqual(1, 1)).toBe(true); expect(approximatelyEqual(1, 1 + Number.EPSILON)).toBe(true);
  expect(approximatelyEqual(1, 2)).toBe(false); expect(approximatelyEqual(NaN, 1)).toBe(false); expect(approximatelyEqual(-Number.MAX_VALUE, Number.MAX_VALUE)).toBe(false);
  expect(ok(1)).toEqual({ status: 'ok', value: 1 });
  expect(invalid('INVALID_CONFIG', 'x'.repeat(100), 'y'.repeat(300), 'z'.repeat(600)).diagnostic).toMatchObject({ reason: 'x'.repeat(64), path: 'y'.repeat(256), message: 'z'.repeat(512) });
  expect(() => notify(() => { throw Error('sink'); }, invalid('INVALID_CONFIG', 'BAD').diagnostic)).not.toThrow();
  notify(undefined, invalid('INVALID_CONFIG', 'BAD').diagnostic);
});
test('extent, explicit and includeZero order', () => {
  expect(finiteExtent([])).toEqual({ status: 'empty' }); expect(finiteExtent([null, null])).toEqual({ status: 'empty' });
  expect(finiteExtent([-0, null, 0])).toEqual({ status: 'constant', value: 0 });
  expect(finiteExtent([2, 1])).toEqual({ status: 'span', domain: [1, 2] });
  expect(finiteExtent(['1' as any])).toMatchObject({ diagnostic: { code: 'INVALID_NUMBER', reason: 'WRONG_TYPE', path: 'values[0]' } });
  expect(normalizeNumericDomain(finiteExtent([5]), { includeZero: true })).toMatchObject({ domain: [0, 5], expandedConstant: false });
  expect(normalizeNumericDomain(finiteExtent([100]), { includeZero: false })).toMatchObject({ domain: [95, 105], expandedConstant: true });
  expect(normalizeNumericDomain(finiteExtent([]), { includeZero: false })).toEqual({ status: 'empty' });
  expect(normalizeNumericDomain(finiteExtent([]), { includeZero: true, explicit: [1, 2] })).toMatchObject({ domain: [1, 2], source: 'explicit' });
  for (const domain of [[1, 1], [2, 1], [NaN, 1], undefined]) expect(normalizeNumericDomain(finiteExtent([1]), { includeZero: false, explicit: domain } as any).status).toBe('invalid');
  expect(normalizeNumericDomain(finiteExtent([NaN]), { includeZero: false, explicit: [1, 2] }).status).toBe('invalid');
  expect(normalizeNumericDomain(finiteExtent([1]), { includeZero: 'true' } as any).status).toBe('invalid');
  expect(expandConstant(Infinity).status).toBe('invalid');
  for (const n of [Number.MAX_VALUE, -Number.MAX_VALUE, 1e-300, -Number.MIN_VALUE]) {
    const [a,b] = value(expandConstant(n)); expect(a).toBeLessThan(b); expect(a).toBeLessThanOrEqual(n); expect(b).toBeGreaterThanOrEqual(n); expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
  }
});
test('linear direction, clamp, zero span and overflow', () => {
  const s = value(createLinearScale([0, 10], [100, 0], false));
  expect([s.map(0),s.map(5),s.map(10),s.map(15),s.invert(25)]).toEqual([100,50,0,-50,7.5]);
  const c = value(createLinearScale([0, 10], [100, 0], true));
  expect([c.map(-1),c.map(11),c.invert(110),c.invert(-1)]).toEqual([100,0,0,10]);
  const z = value(createLinearScale([0, 10], [2, 2], false)); expect(z.map(9)).toBe(2); expect(z.invert(2)).toBeNull(); expect(z.map(NaN)).toBeNull(); expect(z.invertible).toBe(false);
  const wide = value(createLinearScale([-Number.MAX_VALUE, Number.MAX_VALUE], [0, 100], false)); expect([wide.map(-Number.MAX_VALUE), wide.map(0), wide.map(Number.MAX_VALUE)]).toEqual([0,50,100]);
  const tiny = value(createLinearScale([0, Number.MIN_VALUE], [0,1], true)); expect(tiny.map(Number.MAX_VALUE)).toBe(1); expect(tiny.map(-Number.MAX_VALUE)).toBe(0);
  expect(value(createLinearScale([0, Number.MIN_VALUE], [0,1], false)).map(1)).toBeNull();
  expect(s.map(NaN)).toBeNull(); expect(s.invert(Infinity)).toBeNull();
  for (const [d,r,c] of [[[1,1],[0,1],false], [[0,1],[0,Infinity],false], [[0,1],[0,1],null], [[],[0,1],false]]) expect(createLinearScale(d as any,r as any,c as any).status).toBe('invalid');
  const extremes = value(createLinearScale([0,1],[-Number.MAX_VALUE,Number.MAX_VALUE],false)); expect(extremes.map(2)).toBeNull();
});
test('tick validation, manual authority and finite fallback', () => {
  const manual = value(selectNumericTicks([1,9], { nice:false, manual:[1,3,9] })); expect(manual.ticks).toEqual([1,3,9]); expect(manual.step).toBeNull();
  expect(value(selectNumericTicks([0,1], { nice:false, manual:[] })).ticks).toEqual([]);
  for (const opts of [{nice:true,manual:[1]}, {nice:false,targetCount:1}, {nice:false,targetCount:2.1}, {nice:false,targetCount:13}, {nice:false,targetCount:undefined}, {nice:false,manual:undefined}, {nice:false,manual:[NaN]}, {nice:false,manual:[2]}, {nice:false,manual:[0,0]}, {nice:false,manual:Array(201).fill(0)}, {nice:'yes'}]) expect(selectNumericTicks([0,1],opts as any).status).toBe('invalid');
  expect(selectNumericTicks([1,0], { nice:false }).status).toBe('invalid');
  const fallback = value(selectNumericTicks([Number.MAX_VALUE / 2, Number.MAX_VALUE], { nice:true })); expect(fallback.ticks.every(Number.isFinite)).toBe(true);
  expect(value(selectNumericTicks([1,nextUp(1)],{nice:false})).fallback).toBe(true);
});
