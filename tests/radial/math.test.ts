import { expect, test } from 'vitest';
import fc from 'fast-check';
import { normalizeRadial, sectorPath, polar, pickRadial, TAU } from '../../src/radial/math.js';
import type { RadialFrame } from '../../src/radial/math.js';
import type { ChartResult } from '../../src/public/chart-types.js';
import { serializePath } from '../../src/internal/geometry/path.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const frame = Object.freeze({ cx: 200, cy: 150, radius: 100, innerRadius: 0 });
const points = (values: readonly (number | null)[]) => Object.freeze(values.map((value, i) => Object.freeze({ id: 'p' + i, value, datum: Object.freeze({ original: i }) })));
test('finite coordinates that cannot represent an arc never invent a full or tiny sector', () => {
  expect(sectorPath({ cx: Number.MAX_VALUE / 2, cy: Number.MAX_VALUE / 2, radius: 1, innerRadius: 0 }, 0, TAU)).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNREPRESENTABLE_GEOMETRY' } });
  expect(value(sectorPath({ cx: 1, cy: 1, radius: 1, innerRadius: 0 }, 0, Number.MIN_VALUE))).toEqual([]);
});
test('radial proportions preserve ordered original points, zero and missing semantics', () => {
  const input = points([2, 0, null, 3]), data = value(normalizeRadial(input, new Set()));
  expect(data.total).toBe(5); expect(data.missing).toBe(1); expect(data.positive).toBe(2);
  expect(data.slices[0]!.fraction).toBeCloseTo(.4, 14); expect(data.slices[3]!.fraction).toBeCloseTo(.6, 14);
  expect(data.slices[1]!.fraction).toBe(0); expect(data.slices[2]!.fraction).toBe(0);
  expect(data.drawn.map(slice => slice.point.id)).toEqual(['p0', 'p3']); expect(data.eligible.map(slice => slice.point.id)).toEqual(['p0', 'p1', 'p3']);
  expect(data.slices.every(slice => slice.point === input[slice.index])).toBe(true);
  expect(data.drawn.at(-1)!.end).toBe(TAU); expect(input[2]!.value).toBeNull();
});
test('hidden slices are excluded from visible totals without mutating raw data', () => {
  const input = points([2, 3, 5]), data = value(normalizeRadial(input, new Set(['p1'])));
  expect(data.total).toBe(7); expect(data.hidden).toBe(1); expect(data.slices.map(slice => slice.point.id)).toEqual(['p0', 'p2']);
  expect(data.slices[0]!.fraction).toBeCloseTo(2 / 7, 15); expect(input[1]!.value).toBe(3);
});
test('zero/all missing/all hidden never manufacture a full circle', () => {
  for (const input of [points([0, 0]), points([null, null]), points([])]) {
    const data = value(normalizeRadial(input, new Set())); expect(data.drawn).toEqual([]); expect(data.total).toBe(0); expect(pickRadial(data, frame, 200, 100)).toBeNull();
  }
  expect(value(normalizeRadial(points([2]), new Set(['p0']))).drawn).toEqual([]);
});
test('raw total overflow does not destroy representable proportions', () => {
  const data = value(normalizeRadial(points([Number.MAX_VALUE, Number.MAX_VALUE]), new Set()));
  expect(data.total).toBeNull(); expect(data.slices.map(slice => slice.fraction)).toEqual([.5, .5]);
  expect(data.drawn[1]!.end).toBe(TAU);
});
test('tiny values normalize before summing and retain their raw values', () => {
  const data = value(normalizeRadial(points([Number.MIN_VALUE, Number.MIN_VALUE, 0]), new Set()));
  expect(data.total).toBe(Number.MIN_VALUE * 2); expect(data.slices.map(slice => slice.fraction)).toEqual([.5, .5, 0]);
  const extreme = value(normalizeRadial(points([Number.MAX_VALUE, Number.MIN_VALUE]), new Set()));
  expect(extreme.eligible).toHaveLength(2); expect(extreme.drawn).toHaveLength(1); expect(extreme.drawn[0]!.end).toBe(TAU);
});
test('invalid raw numbers and unknown or duplicate identities are rejected even when hidden', () => {
  for (const raw of [-1, NaN, Infinity, -Infinity, undefined]) expect(normalizeRadial([{ id: 'p', value: raw as number }], new Set(['p'])).status).toBe('invalid');
  expect(normalizeRadial([{ id: 'p', value: 1 }, { id: 'p', value: 2 }], new Set()).status).toBe('invalid');
  expect(normalizeRadial(points([1]), new Set(['unknown'])).status).toBe('invalid');
  expect(normalizeRadial([{ id: '', value: 1 }], new Set()).status).toBe('invalid');
  expect(normalizeRadial(points(Array.from({ length: 10001 }, () => 1)), new Set()).status).toBe('invalid');
});
test('full-circle Pie and Donut have two arcs per contour and opposite winding', () => {
  for (const innerRadius of [0, 50, 99.999999]) {
    const path = value(sectorPath({ ...frame, innerRadius }, 0, TAU)), arcs = path.filter(command => command.kind === 'A');
    expect(arcs.map(arc => arc.sweep)).toEqual(innerRadius ? [1, 1, 0, 0] : [1, 1]);
    expect(path.some(command => command.kind === 'L')).toBe(false); expect(path.filter(command => command.kind === 'M')).toHaveLength(innerRadius ? 2 : 1);
    expect(path[0]).toEqual({ kind: 'M', x: 200, y: 50 }); expect(path.at(-1)).toEqual({ kind: 'Z' });
    expect(value(serializePath(path))).not.toMatch(/NaN|Infinity/);
  }
});
test('semicircle flags and annular return arc are deterministic around pi', () => {
  for (const delta of [Math.PI - 1e-8, Math.PI, Math.PI + 1e-8]) {
    const path = value(sectorPath({ ...frame, innerRadius: 50 }, 0, delta)), arcs = path.filter(command => command.kind === 'A');
    expect(arcs.map(arc => arc.largeArc)).toEqual([delta > Math.PI ? 1 : 0, delta > Math.PI ? 1 : 0]);
    expect(arcs.map(arc => arc.sweep)).toEqual([1, 0]); expect(serializePath(path).status).toBe('ok');
  }
});
test('zero angular area and numerically coincident endpoints have no invalid arc', () => {
  expect(value(sectorPath(frame, 0, 0))).toEqual([]);
  expect(serializePath(value(sectorPath(frame, 1, 1 + Number.EPSILON))).status).toBe('ok');
});
test('invalid radial geometry fails explicitly', () => {
  for (const mutation of [{ radius: 0 }, { innerRadius: -1 }, { innerRadius: 100 }, { cx: Infinity }, { radius: Infinity }]) expect(sectorPath({ ...frame, ...mutation }, 0, TAU).status).toBe('invalid');
  for (const [start, end] of [[-1, 1], [2, 1], [0, Infinity], [0, TAU + 1]]) expect(sectorPath(frame, start!, end!).status).toBe('invalid');
});
test('radial hit respects the hole, exterior, semi-open boundary and top seam', () => {
  const data = value(normalizeRadial(points([1, 1]), new Set())), donut = { ...frame, innerRadius: 40 };
  expect(pickRadial(data, donut, 200, 150)).toBeNull(); expect(pickRadial(data, donut, 200, 151)).toBeNull();
  expect(pickRadial(data, donut, 200, 49)).toBeNull(); expect(pickRadial(data, donut, 200, 50)?.point.id).toBe('p1');
  const afterSeam = polar(donut, 60, 1e-6); expect(pickRadial(data, donut, afterSeam.x, afterSeam.y)?.point.id).toBe('p0');
  expect(pickRadial(data, donut, 200, 250)?.point.id).toBe('p1');
  expect(pickRadial(data, frame, 200, 150)?.point.id).toBe('p0');
  expect(pickRadial(data, frame, NaN, 150)).toBeNull();
});
test('seeded radial conservation, path validity and independent midpoint hit oracle', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 100 }), fc.double({ min: 0, max: .99, noNaN: true }), (values, hole) => {
    const input = points(values), data = value(normalizeRadial(input, new Set())), local: RadialFrame = { ...frame, innerRadius: 100 * hole };
    expect(data.total).toBe(values.reduce((sum, value) => sum + value, 0));
    if (!values.some(value => value > 0)) return;
    expect(data.drawn.at(-1)!.end).toBe(TAU);
    for (let i = 0; i < data.slices.length; i++) {
      const slice = data.slices[i]!; expect(slice.end).toBeGreaterThanOrEqual(slice.start); expect(slice.end).toBeLessThanOrEqual(TAU);
      if (i) expect(slice.start).toBe(data.slices[i - 1]!.end);
      expect(slice.fraction).toBeCloseTo(values[i]! / data.total!, 12);
      expect(serializePath(value(sectorPath(local, slice.start, slice.end))).status).toBe('ok');
      if (slice.end - slice.start > 1e-9) {
        const angle = slice.start + (slice.end - slice.start) / 2, point = polar(local, (local.radius + local.innerRadius) / 2, angle);
        expect(pickRadial(data, local, point.x, point.y)?.point.id).toBe(slice.point.id);
      }
    }
  }), { seed: 160119, numRuns: 1000 });
});
