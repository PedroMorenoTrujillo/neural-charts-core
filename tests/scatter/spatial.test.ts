import { expect, test } from 'vitest';
import fc from 'fast-check';
import { buildSpatialIndex } from '../../src/scatter/spatial.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
test('rectangle occupancy uses every competing point rather than only the nearest point', () => {
  const own = { x: 0, y: 0 }, other = { x: 2, y: 1 }, duplicate = { x: 0, y: 0 }, bounds = { minX: -1, minY: -1, maxX: 3, maxY: 2 };
  expect(value(buildSpatialIndex([own])).intersects(bounds, own)).toBe(false);
  expect(value(buildSpatialIndex([own, other])).intersects(bounds, own)).toBe(true);
  expect(value(buildSpatialIndex([own, duplicate])).intersects(bounds, own)).toBe(true);
  expect(value(buildSpatialIndex([own, other])).intersects({ minX: 10, minY: 10, maxX: 12, maxY: 12 })).toBe(false);
  expect(value(buildSpatialIndex([])).intersects(bounds)).toBe(false);
  expect(value(buildSpatialIndex([own])).intersects({ ...bounds, minX: NaN })).toBe(false);
  expect(value(buildSpatialIndex([own])).intersects({ ...bounds, minX: 4 })).toBe(false);
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 })), { maxLength: 100 }), fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 })), (coordinates, [x, y]) => {
    const points = coordinates.map(([x, y]) => ({ x, y })), index = value(buildSpatialIndex(points)), bounds = { minX: x, minY: y, maxX: x + 5, maxY: y + 7 };
    expect(index.intersects(bounds)).toBe(points.some(point => point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY));
  }), { seed: 432114, numRuns: 300 });
});
test('unsorted observations and duplicate coordinates retain original pointer identity without mutation', () => {
  const points = Object.freeze([{ id: 'last-x', x: 20, y: -5 }, { id: 'first-duplicate', x: 1, y: 3 }, { id: 'second-duplicate', x: 1, y: 3 }, { id: 'negative', x: -4, y: -5 }].map(point => Object.freeze(point)));
  const before = JSON.stringify(points), index = value(buildSpatialIndex(points)), hit = index.query(1, 3, 0);
  expect(hit.target).toBe(points[1]); expect(hit.multiplicity).toBe(2); expect(index.size).toBe(4); expect(index.unique).toBe(3); expect(JSON.stringify(points)).toBe(before);
  expect(index.query(-4, -5, 0).target).toBe(points[3]); expect(index.query(100, 100, 12).target).toBeNull();
});
test('equal-distance ties choose input order across opposing tree branches', () => {
  const points = [{ id: 'first', x: 5, y: 0 }, { id: 'second', x: -5, y: 0 }, { id: 'third', x: 0, y: 5 }, { id: 'fourth', x: 0, y: -5 }];
  expect(value(buildSpatialIndex(points)).query(0, 0, 5).target).toBe(points[0]); expect(value(buildSpatialIndex([...points].reverse())).query(0, 0, 5).target).toBe(points[3]);
});
test('balanced spatial lookup agrees with an independent exhaustive distance oracle', () => {
  fc.assert(fc.property(fc.array(fc.record({ x: fc.integer({ min: -100, max: 100 }), y: fc.integer({ min: -100, max: 100 }) }), { maxLength: 200 }), fc.array(fc.record({ x: fc.integer({ min: -120, max: 120 }), y: fc.integer({ min: -120, max: 120 }), radius: fc.integer({ min: 0, max: 150 }) }), { minLength: 1, maxLength: 20 }), (raw, queries) => {
    const points = raw.map((point, i) => Object.freeze({ ...point, id: 'p' + i })), index = value(buildSpatialIndex(points));
    for (const query of queries) {
      let expected: typeof points[number] | null = null, distance = query.radius;
      for (const point of points) { const candidate = Math.hypot(point.x - query.x, point.y - query.y); if (candidate < distance || candidate === distance && !expected) { expected = point; distance = candidate; } }
      const hit = index.query(query.x, query.y, query.radius); expect(hit.target).toBe(expected); expect(hit.distance).toBe(expected ? distance : null);
    }
  }), { seed: 160123, numRuns: 1000 });
});
test('coincident large datasets occupy one spatial node without erasing semantic observations', () => {
  const points = Array.from({ length: 50000 }, (_, id) => ({ id, x: -0, y: 5 })), index = value(buildSpatialIndex(points)), hit = index.query(0, 5, 12);
  expect(index.size).toBe(50000); expect(index.unique).toBe(1); expect(hit.target).toBe(points[0]); expect(hit.multiplicity).toBe(50000); expect(hit.visited).toBe(1);
});
test('adversarial sorted input stays balanced and its exact raw identities remain reachable', () => {
  const points = Array.from({ length: 50000 }, (_, i) => Object.freeze({ id: i, x: i % 500, y: Math.floor(i / 500) })), index = value(buildSpatialIndex(points));
  expect(index.depth).toBeLessThanOrEqual(16); expect(index.unique).toBe(50000);
  for (const i of [0, 1, 499, 500, 25000, 49999]) expect(index.query(points[i]!.x, points[i]!.y, 0).target).toBe(points[i]);
});
test('nonfinite projected input is diagnosed and invalid pointer queries produce no target', () => {
  for (const coordinate of [NaN, Infinity, -Infinity]) expect(buildSpatialIndex([{ x: coordinate, y: 1 }]).status).toBe('invalid');
  const empty = value(buildSpatialIndex([])); expect(empty.bounds).toBeNull(); expect(empty.query(0, 0, 12).target).toBeNull();
  const index = value(buildSpatialIndex([{ x: 0, y: 0 }]));
  for (const args of [[NaN, 0, 12], [0, Infinity, 12], [0, 0, -1]]) expect(index.query(...args as [number, number, number]).target).toBeNull();
});
