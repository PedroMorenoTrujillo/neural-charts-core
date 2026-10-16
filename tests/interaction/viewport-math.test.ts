import { expect, test } from 'vitest';
import fc from 'fast-check';
import { zoomNumeric, panNumeric, panTime, zoomCategory, panCategory } from '../../src/internal/interaction/viewport-math.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
test('integer-time pan rejects nonfinite intent, fractional epochs and invalid date bounds', () => {
  for (const delta of [NaN, Infinity, -Infinity]) expect(panTime([1, 2], [0, 10], delta).status).toBe('invalid');
  expect(panTime([1.5, 2.5], [0, 10], 1).status).toBe('invalid'); expect(panTime([1, 2], [0, 9000000000000000], 1).status).toBe('invalid');
  expect(panTime([2, 1], [0, 10], 1).status).toBe('invalid'); expect(value(panTime([1, 2], [0, 10], 0))).toEqual([1, 2]);
});
test('pan preserves tiny local windows within huge full bounds without full-domain cancellation', () => {
  const maximum = Number.MAX_VALUE;
  expect(value(panNumeric([1, 2], [-maximum, maximum], 0))).toEqual([1, 2]);
  expect(value(panNumeric([1, 2], [-maximum, maximum], 1))).toEqual([2, 3]);
  expect(value(panNumeric([1, 2], [-maximum, maximum], -1))).toEqual([0, 1]);
  expect(value(panNumeric([-maximum, maximum], [-maximum, maximum], 1))).toEqual([-maximum, maximum]);
  expect(value(panNumeric([25, 75], [0, 100], Number.MAX_VALUE))).toEqual([50, 100]);
  expect(value(panNumeric([25, 75], [0, 100], -Number.MAX_VALUE))).toEqual([0, 50]);
});
test('numeric zoom uses the applied domain and an explicit semantic anchor', () => {
  expect(value(zoomNumeric([0, 100], [0, 100], 2))).toEqual([25, 75]); expect(value(zoomNumeric([0, 100], [0, 100], 2, 0))).toEqual([0, 50]); expect(value(zoomNumeric([0, 100], [0, 100], 2, 1))).toEqual([50, 100]);
  expect(value(zoomNumeric([25, 75], [0, 100], .5))).toEqual([0, 100]); expect(value(panNumeric([25, 75], [0, 100], .25))).toEqual([37.5, 87.5]); expect(value(panNumeric([25, 75], [0, 100], 100))).toEqual([50, 100]);
});
test('extreme/tiny domains stay finite or return an explicit unrepresentable diagnostic', () => {
  for (const full of [[-Number.MAX_VALUE, Number.MAX_VALUE], [0, Number.MIN_VALUE], [-1e-300, 1e-300]] as const) for (const factor of [.1, 1, 2, 1e100]) {
    const result = zoomNumeric(full, full, factor); if (result.status === 'ok') { expect(result.value.every(Number.isFinite)).toBe(true); expect(result.value[0]).toBeGreaterThanOrEqual(full[0]); expect(result.value[1]).toBeLessThanOrEqual(full[1]); expect(result.value[0]).toBeLessThan(result.value[1]); }
    else expect(result.diagnostic.reason).toBe('UNREPRESENTABLE_VIEWPORT');
  }
});
test('invalid bounds and nonfinite gestures never create an applied viewport', () => {
  for (const full of [[1, 1], [2, 1], [NaN, 2], [0, Infinity]] as const) expect(zoomNumeric([0, 1], full, 2).status).toBe('invalid');
  for (const factor of [0, -1, NaN, Infinity]) expect(zoomNumeric([0, 1], [0, 1], factor).status).toBe('invalid'); expect(panNumeric([0, 1], [0, 1], NaN).status).toBe('invalid');
});
test('seeded numeric pan keeps window width and bounds using an independent ordinary-range oracle', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 90 }), fc.integer({ min: 1, max: 10 }), fc.integer({ min: -50, max: 50 }), (start, width, delta) => {
    const result = value(panNumeric([start, start + width], [0, 100], delta / 10)), expected = Math.max(0, Math.min(100 - width, start + delta / 10 * width));
    expect(result[0]).toBeCloseTo(expected, 10); expect(result[1] - result[0]).toBeCloseTo(width, 10);
  }), { seed: 432451, numRuns: 500 });
});
test('category windows use IDs and preserve logical ordering across duplicate labels', () => {
  const ids = ['january-a', 'january-b', 'february', 'march', 'april', 'may'], ranks = new Map(ids.map((id, index) => [id, index])), current = { firstId: ids[0]!, lastId: ids[5]! };
  expect(value(zoomCategory(current, ids, ranks, 2, 0))).toEqual({ firstId: 'january-a', lastId: 'february' }); expect(value(zoomCategory(current, ids, ranks, 2, 1))).toEqual({ firstId: 'march', lastId: 'may' });
  const narrow = { firstId: 'january-b', lastId: 'february' }; expect(value(panCategory(narrow, ids, ranks, 1))).toEqual({ firstId: 'march', lastId: 'april' }); expect(value(panCategory(narrow, ids, ranks, -100))).toEqual({ firstId: 'january-a', lastId: 'january-b' });
  expect(panCategory({ firstId: 'missing', lastId: 'may' }, ids, ranks, 1).status).toBe('invalid'); expect(zoomCategory(current, ids, ranks, 0).status).toBe('invalid');
});
