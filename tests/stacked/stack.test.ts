import { expect, test } from 'vitest';
import fc from 'fast-check';
import { computeStack } from '../../src/stacked/stack.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const point = (id: string, x: string, y: number | null) => ({ id, x, y });

test('hand-computed positive/negative prefixes never collapse to a net stack', () => {
  const result = value(computeStack(['a', 'b'], [
    { id: 'first', data: [point('a0', 'a', 4), point('b0', 'b', -3)] },
    { id: 'second', data: [point('a1', 'a', 3), point('b1', 'b', 8)] },
    { id: 'third', data: [point('a2', 'a', -6), point('b2', 'b', -2)] },
  ], 'sum'));
  expect(result.categories.get('a')).toMatchObject({ positive: 7, negative: -6, total: 1, complete: true });
  expect(result.categories.get('b')).toMatchObject({ positive: 8, negative: -5, total: 3, complete: true });
  expect(result.categories.get('a')!.segments.map(s => [s.seriesId, s.base, s.end])).toEqual([['first', 0, 4], ['second', 4, 7], ['third', 0, -6]]);
  expect(result.categories.get('b')!.segments.map(s => [s.base, s.end])).toEqual([[0, -3], [0, 8], [-3, -5]]);
  expect(result.extent).toEqual([-6, 8]);
});
test('zero is a segment, null and absence are missing, known totals carry completeness', () => {
  const result = value(computeStack(['a', 'b', 'c'], [
    { id: 'first', data: [point('a0', 'a', 0), point('b0', 'b', null), point('c0', 'c', 2)] },
    { id: 'second', data: [point('a1', 'a', 0)] },
  ], 'sum'));
  expect(result.categories.get('a')).toMatchObject({ complete: true, total: 0 });
  expect(result.categories.get('a')!.segments).toHaveLength(2);
  expect(result.categories.get('b')).toMatchObject({ complete: false, segments: [], total: 0 });
  expect(result.categories.get('c')).toMatchObject({ complete: false, total: 2 });
  expect(result.drawableCount).toBe(3);
});
test('explicit category order wins over incoming observation order and duplicate visible labels', () => {
  const a = { ...point('January-a', 'a', 2), label: 'January' }, b = { ...point('January-b', 'b', 3), label: 'January' };
  const result = value(computeStack(['b', 'a'], [{ id: 's', data: [a, b] }], 'sum'));
  expect([...result.categories.keys()]).toEqual(['b', 'a']);
  expect(result.series[0]!.segments.map(s => s.point.id)).toEqual(['January-b', 'January-a']);
  expect(result.series[0]!.segments[0]!.point).toBe(b);
});
test('percent geometry closes at 100 while every segment retains its original value', () => {
  const result = value(computeStack(['a'], [2, 3, 5, 0].map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y)] })), 'percent'));
  expect(result.categories.get('a')).toMatchObject({ positive: 10, negative: 0, total: 10, complete: true, percentageDefined: true });
  expect(result.categories.get('a')!.segments.map(s => [s.base, s.end, s.percentage, s.point.y])).toEqual([[0, 20, 20, 2], [20, 50, 30, 3], [50, 100, 50, 5], [100, 100, 0, 0]]);
  expect(result.extent).toEqual([0, 100]);
});
test('thirds preserve unrounded proportions and absorb only geometric rounding residue', () => {
  const result = value(computeStack(['a'], [0, 1, 2].map(i => ({ id: 's' + i, data: [point('p' + i, 'a', 1)] })), 'percent'));
  const segments = result.categories.get('a')!.segments;
  expect(segments.at(-1)!.end).toBe(100);
  for (const segment of segments) {
    expect(segment.percentage).toBeCloseTo(100 / 3, 12);
    expect(Math.abs(segment.end - segment.base - segment.percentage!)).toBeLessThan(32 * Number.EPSILON * 100);
  }
});
test('percent zero totals and incomplete categories do not fabricate geometry', () => {
  const result = value(computeStack(['zero', 'null', 'absent'], [
    { id: 'a', data: [point('az', 'zero', 0), point('an', 'null', 4), point('aa', 'absent', 9)] },
    { id: 'b', data: [point('bz', 'zero', 0), point('bn', 'null', null)] },
  ], 'percent'));
  expect(result.drawableCount).toBe(0);
  expect(result.categories.get('zero')).toMatchObject({ total: 0, complete: true, percentageDefined: false });
  expect(result.categories.get('null')).toMatchObject({ total: 4, complete: false, percentageDefined: false });
  expect(result.categories.get('absent')).toMatchObject({ total: 9, complete: false, percentageDefined: false });
});
test('normalization survives overflowing raw totals without an Infinity or false total', () => {
  const source = [0, 1].map(i => ({ id: 's' + i, data: [point('p' + i, 'a', Number.MAX_VALUE)] }));
  expect(computeStack(['a'], source, 'sum')).toMatchObject({ status: 'invalid', diagnostic: { reason: 'STACK_OVERFLOW' } });
  const percent = value(computeStack(['a'], source, 'percent')).categories.get('a')!;
  expect(percent.total).toBeNull(); expect(percent.positive).toBeNull();
  expect(percent.segments.map(s => [s.base, s.end, s.percentage])).toEqual([[0, 50, 50], [50, 100, 50]]);
  const negative = source.map(s => ({ ...s, data: s.data.map(p => ({ ...p, y: -p.y! })) }));
  expect(computeStack(['a'], negative, 'sum')).toMatchObject({ status: 'invalid', diagnostic: { reason: 'STACK_OVERFLOW' } });
});
test('extreme ratios and mixed extreme signs remain finite and retain subpixel data', () => {
  const source = [Number.MAX_VALUE, Number.MIN_VALUE].map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y)] }));
  const percent = value(computeStack(['a'], source, 'percent')).categories.get('a')!;
  expect(percent.segments.map(s => [s.base, s.end, s.percentage])).toEqual([[0, 100, 100], [100, 100, 0]]);
  expect(percent.segments[1]!.point.y).toBe(Number.MIN_VALUE);
  const mixed = value(computeStack(['a'], [Number.MAX_VALUE, -Number.MAX_VALUE].map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y)] })), 'sum'));
  expect(mixed.extent).toEqual([-Number.MAX_VALUE, Number.MAX_VALUE]);
  expect(mixed.categories.get('a')!.total).toBe(0);
});
test('compensation preserves representable small additions and relative precision at tiny magnitudes', () => {
  for (const sign of [1, -1]) {
    const source = [1e16, 1, 1].map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y * sign)] }));
    const category = value(computeStack(['a'], source, 'sum')).categories.get('a')!;
    expect(category.total).toBe(sign * 10000000000000002);
  }
  for (const scale of [1, 1e-300]) {
    const source = [.1, .2, .3].map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y * scale)] }));
    const total = value(computeStack(['a'], source, 'sum')).categories.get('a')!.total!;
    expect(Math.abs(total / scale - .6)).toBeLessThan(16 * Number.EPSILON);
  }
});
test('finite percent raw totals match exact large-integer sums near the representable boundary', () => {
  for (let divisor = 2; divisor <= 16; divisor++) for (const count of [divisor - 1, divisor]) {
    const part = Number.MAX_VALUE / divisor, exact = BigInt(part) * BigInt(count);
    if (exact > BigInt(Number.MAX_VALUE)) continue;
    const source = Array.from({ length: count }, (_, i) => ({ id: 's' + i, data: [point('p' + i, 'a', part)] }));
    expect(value(computeStack(['a'], source, 'percent')).categories.get('a')!.total).toBe(Number(exact));
  }
});
test('hidden series are excluded by the caller without mutating the raw inputs', () => {
  const series = [2, 6].map((y, i) => Object.freeze({ id: 's' + i, data: Object.freeze([Object.freeze(point('p' + i, 'a', y))]) }));
  Object.freeze(series); const before = JSON.stringify(series);
  const all = value(computeStack(['a'], series, 'percent')), visible = value(computeStack(['a'], [series[0]!], 'percent'));
  expect(all.series[0]!.segments[0]!.percentage).toBe(25);
  expect(visible.series[0]!.segments[0]!.percentage).toBe(100);
  expect(JSON.stringify(series)).toBe(before);
  expect(Object.isFrozen(visible.series)).toBe(true); expect(Object.isFrozen(visible.series[0]!.segments)).toBe(true);
});
test.each([NaN, Infinity, -Infinity])('invalid finite-number input fails explicitly: %s', y => {
  expect(computeStack(['a'], [{ id: 's', data: [point('p', 'a', y)] }], 'sum').status).toBe('invalid');
});
test('negative percent, duplicate identity, unknown category and resource bounds fail explicitly', () => {
  expect(computeStack(['a'], [{ id: 's', data: [point('p', 'a', -1)] }], 'percent')).toMatchObject({ status: 'invalid', diagnostic: { reason: 'NEGATIVE_PERCENT_VALUE' } });
  for (const data of [[point('p', 'a', 1), point('q', 'a', 2)], [point('p', 'a', 1), point('p', 'b', 2)], [point('p', 'unknown', 1)]]) expect(computeStack(['a', 'b'], [{ id: 's', data }], 'sum').status).toBe('invalid');
  expect(computeStack(['a', 'a'], [], 'sum').status).toBe('invalid');
  expect(computeStack(['a'], [{ id: 's', data: [] }, { id: 's', data: [] }], 'sum').status).toBe('invalid');
  expect(computeStack(['a'], Array.from({ length: 17 }, (_, i) => ({ id: 's' + i, data: [] })), 'sum').status).toBe('invalid');
  expect(computeStack(Array.from({ length: 10001 }, (_, i) => 'c' + i), [], 'sum').status).toBe('invalid');
});
test('empty and all-zero sum stacks keep exact logical rows and finite extents', () => {
  expect(value(computeStack([], [], 'sum'))).toMatchObject({ extent: [0, 0], drawableCount: 0, series: [] });
  const result = value(computeStack(['a'], [{ id: 'empty', data: [] }, { id: 'zero', data: [point('p', 'a', 0)] }], 'sum'));
  expect(result.series[0]!.segments).toEqual([]); expect(result.series[1]!.segments).toHaveLength(1); expect(result.extent).toEqual([0, 0]);
});
test('sum prefixes and totals match independent exact integer arithmetic', () => {
  fc.assert(fc.property(fc.array(fc.array(fc.integer({ min: -1000000, max: 1000000 }), { minLength: 4, maxLength: 4 }), { minLength: 1, maxLength: 16 }), values => {
    const categoryIds = ['a', 'b', 'c', 'd'], series = values.map((row, si) => ({ id: 's' + si, data: row.map((y, ci) => point('p' + si + '-' + ci, categoryIds[ci]!, y)) }));
    const result = value(computeStack(categoryIds, series, 'sum'));
    for (let ci = 0; ci < 4; ci++) {
      const exact = values.map(row => BigInt(row[ci]!)), positive = exact.filter(v => v >= 0n).reduce((a, b) => a + b, 0n), negative = exact.filter(v => v < 0n).reduce((a, b) => a + b, 0n);
      const category = result.categories.get(categoryIds[ci]!)!;
      expect(category.positive).toBe(Number(positive)); expect(category.negative).toBe(Number(negative));
      category.segments.forEach((segment, si) => {
        const value = exact[si]!, prefix = exact.slice(0, si).filter(v => value < 0n ? v < 0n : v >= 0n).reduce((a, b) => a + b, 0n);
        expect(segment.base).toBe(Number(prefix)); expect(segment.end).toBe(Number(prefix + value));
      });
    }
  }), { seed: 160116, numRuns: 1000 });
});
test('percent matches bounded raw-sum ratios independently of max normalization', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1000000 }), { minLength: 1, maxLength: 16 }), values => {
    const series = values.map((y, i) => ({ id: 's' + i, data: [point('p' + i, 'a', y)] }));
    const result = value(computeStack(['a'], series, 'percent')).categories.get('a')!, total = values.reduce((a, b) => a + b, 0);
    if (!total) { expect(result.percentageDefined).toBe(false); return; }
    expect(result.segments.at(-1)!.end).toBe(100);
    result.segments.forEach((segment, i) => expect(segment.percentage!).toBeCloseTo(values[i]! / total * 100, 10));
  }), { seed: 160117, numRuns: 500 });
});
