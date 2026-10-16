import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { flattenCubics, monotoneCubics, splineCommands, visibleSplineCommands } from '../../src/spline/interpolate.js';
import type { CubicSegment, SplineCoordinate } from '../../src/spline/interpolate.js';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { PathCommand } from '../../src/internal/geometry/path.js';
import { serializePath } from '../../src/internal/geometry/path.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
function at(s: CubicSegment, t: number): SplineCoordinate {
  const u = 1 - t, a = u ** 3, b = 3 * u * u * t, c = 3 * u * t * t, d = t ** 3;
  return { x: a * s.a.x + b * s.b.x + c * s.c.x + d * s.d.x, y: a * s.a.y + b * s.b.y + c * s.c.y + d * s.d.y };
}
function vertices(commands: readonly PathCommand[]): SplineCoordinate[] {
  return commands.flatMap(command => command.kind === 'M' || command.kind === 'L' ? [{ x: command.x, y: command.y }] : []);
}
function distanceToPolyline(p: SplineCoordinate, points: readonly SplineCoordinate[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}
describe('monotone mathematical interpolation and frozen-path approximation', () => {
  test('passes through originals and produces a genuine curved interpolant', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 0 }];
    const cubics = value(monotoneCubics(points)), commands = value(splineCommands(points));
    expect(at(cubics[0]!, .5).y).toBeCloseTo(12.5);
    expect(commands.length).toBeGreaterThan(points.length);
    for (const point of points) expect(vertices(commands)).toContainEqual(point);
    expect(value(serializePath(commands))).not.toMatch(/NaN|Infinity/);
    expect(commands.every(command => command.kind === 'M' || command.kind === 'L')).toBe(true);
  });
  test('constant and linear data need no gratuitous subdivisions', () => {
    expect(value(splineCommands([{ x: 0, y: 2 }, { x: 10, y: 2 }, { x: 100, y: 2 }]))).toHaveLength(3);
    expect(value(splineCommands([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 100, y: 100 }]))).toHaveLength(3);
    expect(value(splineCommands([]))).toEqual([]);
    expect(value(splineCommands([{ x: 1, y: 2 }]))).toEqual([]);
  });
  test('C1 joins survive irregular spacing and sign changes', () => {
    const cubics = value(monotoneCubics([{ x: 0, y: -20 }, { x: 1, y: -18 }, { x: 250, y: 50 }, { x: 251, y: -4 }, { x: 900, y: -5 }]));
    for (let i = 1; i < cubics.length; i++) {
      const left = cubics[i - 1]!, right = cubics[i]!;
      const l = (left.d.y - left.c.y) / (left.d.x - left.c.x), r = (right.b.y - right.a.y) / (right.b.x - right.a.x);
      expect(Math.abs(l - r)).toBeLessThan(1e-9 * Math.max(1, Math.abs(l), Math.abs(r)));
    }
  });
  test('measured geometric approximation error stays within 0.2 projected pixels', () => {
    const points = [{ x: 2, y: 250 }, { x: 10, y: -150 }, { x: 600, y: 300 }, { x: 610, y: 30 }];
    const cubics = value(monotoneCubics(points)), path = vertices(value(flattenCubics(cubics)));
    for (const cubic of cubics) for (let i = 0; i <= 1000; i++) expect(distanceToPolyline(at(cubic, i / 1000), path)).toBeLessThanOrEqual(.20000001);
  });
  test('readonly inputs remain unchanged and all output coordinates are immutable', () => {
    const points = Object.freeze([Object.freeze({ x: 0, y: 20 }), Object.freeze({ x: 30, y: 4 }), Object.freeze({ x: 500, y: -2 })]);
    const before = JSON.stringify(points), cubics = value(monotoneCubics(points)), commands = value(splineCommands(points));
    expect(JSON.stringify(points)).toBe(before); expect(Object.isFrozen(cubics)).toBe(true);
    expect(cubics.every(s => Object.isFrozen(s) && [s.a, s.b, s.c, s.d].every(Object.isFrozen))).toBe(true);
    expect(Object.isFrozen(commands)).toBe(true); expect(commands.every(Object.isFrozen)).toBe(true);
    expect(value(splineCommands(points))).toEqual(commands);
  });
  test.each([
    [{ x: 0, y: 1 }, { x: 0, y: 2 }],
    [{ x: 1, y: 1 }, { x: 0, y: 2 }],
    [{ x: NaN, y: 1 }], [{ x: 0, y: Infinity }],
    [{ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 1 }],
    [{ x: 0, y: -Number.MAX_VALUE }, { x: 1, y: Number.MAX_VALUE }],
  ].map(points => ({ points })))('rejects invalid or unrepresentable projected coordinates %#', ({ points }) => {
    expect(monotoneCubics(points).status).toBe('invalid');
  });
  test('subnormal spacing and very small or large finite coordinates never produce invalid commands', () => {
    for (const points of [
      [{ x: 0, y: 0 }, { x: Number.MIN_VALUE, y: 2 }, { x: 1, y: 3 }],
      [{ x: 0, y: 1e-300 }, { x: 1, y: 2e-300 }, { x: 2, y: 1e-300 }],
      [{ x: 1e100, y: 1e100 }, { x: 1.1e100, y: 1.1e100 }],
    ]) {
      const result = splineCommands(points);
      if (result.status === 'ok') expect(serializePath(result.value).status).toBe('ok');
      else expect(['RESOURCE_LIMIT', 'UNREPRESENTABLE_GEOMETRY']).toContain(result.diagnostic.reason);
    }
  });
  test('exact command budgets work and subdivision fails explicitly instead of degrading tolerance', () => {
    const cubics = value(monotoneCubics([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 0 }]));
    const commands = value(flattenCubics(cubics));
    expect(value(flattenCubics(cubics, .2, commands.length))).toEqual(commands);
    expect(flattenCubics(cubics, .2, commands.length - 1).status).toBe('invalid');
    expect(flattenCubics(cubics, Number.MIN_VALUE).status).toBe('invalid');
    for (const tolerance of [0, -1, NaN, Infinity, 2]) expect(flattenCubics(cubics, tolerance).status).toBe('invalid');
    for (const budget of [0, 1.5, NaN, Infinity, 1000001]) expect(flattenCubics(cubics, .2, budget).status).toBe('invalid');
    const gap = [{ ...cubics[1]!, a: { x: 11, y: 20 } }];
    expect(flattenCubics([cubics[0]!, ...gap]).status).toBe('invalid');
  });
  test('shape-preserving properties hold across generated irregular data', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: -10000, max: 10000 })), { minLength: 2, maxLength: 30 }), data => {
      let x = 0; const points = data.map(([step, y]) => ({ x: x += step, y }));
      const cubics = value(monotoneCubics(points));
      for (const cubic of cubics) {
        const lo = Math.min(cubic.a.y, cubic.d.y), hi = Math.max(cubic.a.y, cubic.d.y), sign = Math.sign(cubic.d.y - cubic.a.y);
        let previous = cubic.a.y;
        for (let i = 0; i <= 64; i++) {
          const p = at(cubic, i / 64);
          expect(p.y).toBeGreaterThanOrEqual(lo - 1e-8); expect(p.y).toBeLessThanOrEqual(hi + 1e-8);
          expect((p.y - previous) * sign).toBeGreaterThanOrEqual(-1e-8); previous = p.y;
        }
      }
    }), { numRuns: 250, seed: 160106 });
  });
  test('50000 original positions remain addressable without a command explosion', () => {
    const points = Array.from({ length: 50000 }, (_, x) => ({ x, y: x / 10 }));
    const commands = value(splineCommands(points));
    expect(commands).toHaveLength(50000); expect(commands.at(-1)).toEqual({ kind: 'L', x: 49999, y: 4999.9 });
  });
  test('viewport culling preserves full-run tangents and retains boundary crossings', () => {
    const points = Array.from({ length: 1000 }, (_, x) => ({ x: x * 80, y: Math.sin(x / 2) * 200 }));
    const min = points[100]!.x + 20, max = points[110]!.x - 20;
    const full = value(monotoneCubics(points)).filter(segment => segment.a.x <= max && segment.d.x >= min);
    expect(value(visibleSplineCommands(points, min, max))).toEqual(value(flattenCubics(full)));
    expect(value(visibleSplineCommands(points, -20, -10))).toEqual([]);
    expect(value(visibleSplineCommands(points, 1e6, 2e6))).toEqual([]);
    expect(value(visibleSplineCommands(points, -1, points.at(-1)!.x + 1))).toEqual(value(splineCommands(points)));
    expect(visibleSplineCommands(points, 2, 1).status).toBe('invalid');
    expect(visibleSplineCommands(points, NaN, 1).status).toBe('invalid');
  });
  test('raw spacing survives projected coordinate collisions and extreme intervals', () => {
    const points = [{ x: 20, y: 200 }, { x: 20, y: 20 }, { x: 700, y: 100 }];
    expect(monotoneCubics(points).status).toBe('invalid');
    for (const shape of [points, [{ x: 20, y: 200 }, { x: 20, y: 100 }, { x: 700, y: 20 }]]) for (const raw of [[0, 1, 1e300], [-Number.MAX_VALUE, Number.MAX_VALUE / 2, Number.MAX_VALUE], [0, Number.MIN_VALUE, 1]]) {
      const cubics = value(monotoneCubics(shape, raw));
      expect(value(serializePath(value(flattenCubics(cubics))))).not.toMatch(/NaN|Infinity/);
      expect(value(visibleSplineCommands(shape, 20, 700, 10000, raw))).toEqual(value(flattenCubics(cubics)));
      for (const s of cubics) expect([s.b.y, s.c.y].every(y => y >= Math.min(s.a.y, s.d.y) && y <= Math.max(s.a.y, s.d.y))).toBe(true);
    }
    expect(monotoneCubics(points, [0, 0, 1]).status).toBe('invalid');
    expect(monotoneCubics(points, [0, 1]).status).toBe('invalid');
  });
});
