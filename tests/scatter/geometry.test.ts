import { expect, test } from 'vitest';
import { createLinearScale } from '../../src/internal/math/linear.js';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { AxisPlan } from '../../src/internal/axes/plan.js';
import type { Plot } from '../../src/internal/layout/frame.js';
import { normalizeScatter } from '../../src/scatter/data.js';
import type { ScatterDataSpec, ScatterSeries } from '../../src/scatter/data.js';
import { projectScatter, pickScatter, navigateScatter } from '../../src/scatter/geometry.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const visible = { hiddenSeriesIds: [] }, plot = { x: 12, y: 20, width: 400, height: 200 };
function fixture(series: readonly ScatterSeries[]): ScatterDataSpec { return { axes: { x: { type: 'linear', domain: [-10, 10] }, y: { type: 'linear', domain: [-10, 10] } }, series }; }
function mapper(bounds: Plot = plot, reverseX = false, reverseY = false) {
  const x = value(createLinearScale([-10, 10], reverseX ? [bounds.x + bounds.width, bounds.x] : [bounds.x, bounds.x + bounds.width], false)), y = value(createLinearScale([-10, 10], reverseY ? [bounds.y, bounds.y + bounds.height] : [bounds.y + bounds.height, bounds.y], false));
  const axis: AxisPlan = { domain: [-10, 10], ticks: [], labels: [], interval: null, target: 4 };
  return { plot: bounds, tooSmall: false, x: axis, y: axis, mapX: (value: string | number) => typeof value === 'number' ? x.map(value) : null, mapY: y.map };
}
test('actual frozen scales project unordered raw pairs without a Line path or categorical conversion', () => {
  const points = [{ id: 'a', x: 8, y: -2, datum: { id: 'raw' } }, { id: 'b', x: -6, y: 0 }, { id: 'c', x: 0, y: 4 }, { id: 'd', x: 8, y: -2 }].map(point => Object.freeze(point));
  Object.freeze(points); const data = value(normalizeScatter(fixture([{ id: 's', name: 'Unordered', data: points }]))), projection = value(projectScatter(data, visible, mapper()));
  expect(projection.targets.map(target => target.point.id)).toEqual(['a', 'b', 'c', 'd']); expect(projection.targets[0]!.point).toBe(points[0]);
  for (const target of projection.targets) { expect(target.x).toBeCloseTo(plot.x + (target.point.x + 10) / 20 * plot.width, 10); expect(target.y).toBeCloseTo(plot.y + (10 - target.point.y) / 20 * plot.height, 10); }
  expect(projection.spatial.unique).toBe(3); expect(projection.spatial.query(projection.targets[0]!.x, projection.targets[0]!.y, 0).multiplicity).toBe(2);
});
test('explicit-domain clipping precedes extrapolation and retains complete raw observations', () => {
  const source = fixture([{ id: 's', name: 'Clipped', data: [{ id: 'a', x: Number.MAX_VALUE, y: 2 }, { id: 'b', x: -Number.MAX_VALUE, y: 2 }, { id: 'c', x: 0, y: 0 }] }]), data = value(normalizeScatter(source)), base = mapper(), mapped: number[] = [];
  const projection = value(projectScatter(data, visible, { ...base, mapX(x) { if (typeof x === 'number') mapped.push(x); return base.mapX(x); } }));
  expect(mapped).toEqual([0]); expect(projection.clipped).toBe(2); expect(projection.targets).toHaveLength(1); expect(data.rawCount).toBe(3); expect(source.series[0]!.data).toHaveLength(3);
});
test('XY-nearest series navigation and input-order navigation are independent', () => {
  const data = value(normalizeScatter(fixture([{ id: 'a', name: 'A', data: [{ id: 'a', x: 0, y: 0 }] }, { id: 'b', name: 'B', data: [{ id: 'far-x', x: 5, y: 0 }, { id: 'far-y', x: 0, y: 8 }, { id: 'near', x: 1, y: 1 }, { id: 'clipped', x: 100, y: 0 }] }]))), p = value(projectScatter(data, visible, mapper())), first = p.targets[0]!, near = navigateScatter(p, first, 'ArrowDown')!;
  expect(near.point.id).toBe('near'); expect(navigateScatter(p, near, 'ArrowUp')).toBe(first); expect(navigateScatter(p, near, 'ArrowLeft')!.point.id).toBe('far-y');
  expect(navigateScatter(p, near, 'Home')!.point.id).toBe('far-x'); expect(navigateScatter(p, first, 'End', true)).toBe(near); expect(navigateScatter(p, near, 'Home', true)).toBe(first);
  expect(navigateScatter(p, near, 'ArrowDown')).toBe(near);
});
test('reversed coordinates preserve semantic order and pointer tolerance stays inside the plot', () => {
  const data = value(normalizeScatter(fixture([{ id: 's', name: 'A', data: [{ id: 'a', x: -10, y: -10 }, { id: 'b', x: 10, y: 10 }] }]))), p = value(projectScatter(data, visible, mapper(plot, true, true)));
  expect(p.targets[0]).toMatchObject({ x: plot.x + plot.width, y: plot.y }); expect(p.targets[1]).toMatchObject({ x: plot.x, y: plot.y + plot.height });
  expect(navigateScatter(p, p.targets[0]!, 'ArrowRight')).toBe(p.targets[1]); expect(pickScatter(p, plot.x - 1, plot.y + plot.height)).toBeNull();
  expect(pickScatter(p, plot.x + 11, plot.y + plot.height)).toBe(p.targets[1]); expect(pickScatter(p, plot.x + 13, plot.y + plot.height)).toBeNull();
});
test('reconstructed observations replace stale targets by composite domain identity', () => {
  const source = fixture([{ id: 's', name: 'A', data: [{ id: 'same', x: 1, y: 2 }] }]), old = value(projectScatter(value(normalizeScatter(source)), visible, mapper())).targets[0]!;
  const next = value(projectScatter(value(normalizeScatter(fixture([{ id: 's', name: 'A', data: [{ id: 'same', x: 3, y: 4 }] }]))), visible, mapper()));
  expect(navigateScatter(next, old, 'Unrecognized')).toBe(next.targets[0]); expect(navigateScatter(next, old, 'Unrecognized')!.point.x).toBe(3);
  const empty = value(projectScatter(value(normalizeScatter(source)), { hiddenSeriesIds: ['s'] }, mapper())); expect(navigateScatter(empty, old, 'Home')).toBeNull();
});
test('invalid geometry is diagnosed instead of silently relocating or dropping observed points', () => {
  const data = value(normalizeScatter(fixture([{ id: 's', name: 'A', data: [{ id: 'a', x: 0, y: 0 }] }]))), base = mapper();
  for (const raw of [null, NaN, Infinity]) expect(projectScatter(data, visible, { ...base, mapX: () => raw }).status).toBe('invalid');
  expect(projectScatter(data, visible, { ...base, mapX: () => plot.x + plot.width + 10 })).toMatchObject({ status: 'invalid', diagnostic: { reason: 'OUT_OF_PLOT_MAPPING' } });
  expect(projectScatter(data, visible, { ...base, plot: { ...plot, width: -1 } }).status).toBe('invalid');
  const huge = { x: 1e300, y: 0, width: 1e292, height: 200 };
  expect(projectScatter(data, visible, { ...mapper(huge), mapY: () => 201 }).status).toBe('invalid');
});
test('roundoff at an in-domain boundary is bounded per axis and tiny layouts suspend targets', () => {
  const data = value(normalizeScatter(fixture([{ id: 's', name: 'A', data: [{ id: 'a', x: 10, y: 10 }] }]))), base = mapper(), edge = plot.x + plot.width;
  expect(value(projectScatter(data, visible, { ...base, mapX: () => edge + Math.abs(edge) * Number.EPSILON })).targets[0]!.x).toBe(edge);
  expect(value(projectScatter(data, visible, { ...base, tooSmall: true })).targets).toEqual([]); expect(value(projectScatter(data, visible, { ...base, plot: { ...plot, width: 0 } })).targets).toEqual([]);
});
