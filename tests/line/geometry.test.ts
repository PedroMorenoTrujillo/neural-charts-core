import { expect, it } from 'vitest';
import { validateLine } from '../../src/line/validate.js';
import { normalizeLine, pointKey, seriesKey } from '../../src/line/normalize.js';
import { projectLine, runCommands } from '../../src/line/geometry.js';
import { serializePath } from '../../src/internal/geometry/path.js';
import { assignment, dashPattern, defaultPalette } from '../../src/internal/chart/presentation.js';

const y = { type: 'linear', domain: [0, 10] };
function project(x: unknown, points: readonly (readonly [string | number, number | null])[], options: object = {}, width = 100) {
  const r = validateLine({ family: 'line', title: 'T', axes: { x, y }, series: [{ id: 's', name: 'S', ...options, data: points.map(([x, y], i) => ({ id: String(i), x, y })) }] });
  if (r.status !== 'ok') throw Error(r.diagnostic.reason);
  const p = projectLine(normalizeLine(r.value), { hiddenSeriesIds: [] }, { x: 0, y: 0, width, height: 100 }, r.value.axes.x.type === 'category' ? null : r.value.axes.x.domain!, [0, 10]);
  if (p.status !== 'ok') throw Error(p.diagnostic.reason);
  return p.value;
}
function path(p: ReturnType<typeof project>): string { const r = serializePath(p.series[0]!.commands); if (r.status !== 'ok') throw Error('path'); return r.value; }
it('Category3: .5 padding gives centers 20,60,100 and exact Y 90,70,80', () => {
  const p = project({ type: 'category', values: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, [['a', 1], ['b', 3], ['c', 2]], {}, 120);
  expect(p.series[0]!.commands).toEqual([{ type: 'M', x: 20, y: 90 }, { type: 'L', x: 60, y: 70 }, { type: 'L', x: 100, y: 80 }]); expect(path(p)).toBe('M 20 90 L 60 70 L 100 80'); expect(p.mapX('b')).toBe(60);
});
it.each(['linear', 'time'])('%s irregular values preserve proportional spacing', type => {
  const p = project({ type, domain: [0, 10] }, [[0, 0], [type === 'time' ? 3 : 2, 5], [10, 10]]);
  expect(p.series[0]!.commands).toEqual([{ type: 'M', x: 0, y: 100 }, { type: 'L', x: type === 'time' ? 30 : 20, y: 50 }, { type: 'L', x: 100, y: 0 }]);
});
it('null break omits singleton stroke; connect joins provided neighbors', () => {
  const points = [[0, 2], [2, null], [4, 6], [6, 7]] as const, x = { type: 'linear', domain: [0, 6] };
  const broken = project(x, points, {}, 120), connected = project(x, points, { gaps: 'connect' }, 120);
  // Frozen affine interpolation computes (1-.7)*100: retain its exact double spelling.
  expect(path(broken)).toBe('M 80 40 L 120 30.000000000000004'); expect(path(connected)).toBe('M 0 80 L 80 40 L 120 30.000000000000004'); expect(broken.series[0]!.eligible.map(p => p.point.id)).toEqual(['0', '2', '3']);
});
it.each(['break', 'connect'])('absent sample joins under %s without synthesizing a record', gaps => {
  const p = project({ type: 'linear', domain: [0, 6] }, [[0, 2], [4, 6]], { gaps }, 120); expect(path(p)).toBe('M 0 80 L 80 40'); expect(p.series[0]!.points).toHaveLength(2);
});
it.each([
  ['straight', [{ type: 'M', x: 10, y: 80 }, { type: 'L', x: 30, y: 20 }]],
  ['step-before', [{ type: 'M', x: 10, y: 80 }, { type: 'L', x: 10, y: 20 }, { type: 'L', x: 30, y: 20 }]],
  ['step-after', [{ type: 'M', x: 10, y: 80 }, { type: 'L', x: 30, y: 80 }, { type: 'L', x: 30, y: 20 }]],
  ['step-mid', [{ type: 'M', x: 10, y: 80 }, { type: 'L', x: 20, y: 80 }, { type: 'L', x: 20, y: 20 }, { type: 'L', x: 30, y: 20 }]],
] as const)('manual %s commands', (curve, expected) => {
  const p = (x: number, y: number) => ({ x, y, index: 0, point: { id: 'p', x, y } }); expect(runCommands([[p(10, 80), p(30, 20)]], curve)).toEqual(expected);
});
it('reversed Y does not exchange before/after', () => {
  const p = (x: number, y: number) => ({ x, y, index: 0, point: { id: 'p', x, y } });
  expect(runCommands([[p(10, 20), p(30, 80)]], 'step-before')).toEqual([{ type: 'M', x: 10, y: 20 }, { type: 'L', x: 10, y: 80 }, { type: 'L', x: 30, y: 80 }]);
});
it('odd millisecond midpoint uses projected 50px, never a fractional timestamp', () => {
  const p = project({ type: 'time', domain: [0, 1] }, [[0, 0], [1, 10]], { curve: 'step-mid' }); expect(path(p)).toBe('M 0 100 L 50 100 L 50 0 L 100 0');
});
it('clipped values remain in stroke/data but are excluded from hits and explicit markers', () => {
  const p = project({ type: 'linear', domain: [0, 10] }, [[-2, 5], [5, 5]], { markers: 'on' }); expect(path(p)).toBe('M -20 50 L 50 50'); expect(p.series[0]!.eligible.map(p => p.point.x)).toEqual([5]); expect(p.series[0]!.markers).toHaveLength(1);
  expect(p.mapY(4)).toBe(60); expect(p.mapY(11)).toBeCloseTo(-10, 12);
});
it('auto markers are all-or-none at the 200 count and 8px spacing limits', () => {
  const p = project({ type: 'linear', domain: [0, 10] }, [[0, 1], [.5, 2], [10, 3]]); expect(p.series[0]!.markers).toHaveLength(0);
  expect(project({ type: 'linear', domain: [0, 10] }, [[0, 1], [1, 2]]).series[0]!.markers).toHaveLength(2);
  expect(project({ type: 'linear', domain: [0, 10] }, [[0, 1], [.8, 2]]).series[0]!.markers).toHaveLength(2);
  expect(project({ type: 'linear', domain: [0, 10] }, [[0, 1], [.799, 2]]).series[0]!.markers).toHaveLength(0);
  expect(project({ type: 'linear', domain: [0, 10] }, [[0, 1], [10, 2]], { markers: 'off' }).series[0]!.markers).toHaveLength(0);
});
it('IDs have unambiguous length-prefixed identities; palette uses stable UTF-16 hash', () => {
  expect(pointKey('a|p:1:b', 'c')).not.toBe(pointKey('a', 'b|p:1:c')); expect(seriesKey('abc')).toBe('s:3:abc|line');
  // Single UTF-16 unit 115: FNV h=4127999362, h%8=2, floor(h/8)%3=1.
  expect(assignment('s')).toEqual({ colorIndex: 2, dash: 'dashed' }); expect(assignment('s')).toEqual(assignment('s'));
  expect(dashPattern('solid')).toEqual([]); expect(dashPattern('dashed')).toEqual([6, 4]); expect(dashPattern('dotted')).toEqual([1, 4]);
  expect(defaultPalette('light', true).series[0]).toBe('#255eb8'); expect(defaultPalette('auto', true).series[0]).toBe('#82b4ff');
});
