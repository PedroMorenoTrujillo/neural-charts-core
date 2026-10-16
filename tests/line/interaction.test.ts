import { expect, it } from 'vitest';
import { validateLine } from '../../src/line/validate.js';
import { normalizeLine } from '../../src/line/normalize.js';
import { projectLine } from '../../src/line/geometry.js';
import { buildHitIndex, pickPoint, nearestX, firstTarget, navigate, reconcileTarget } from '../../src/line/hit-index.js';
import { tooltipModel, rowText, detailText, fullX } from '../../src/internal/tooltip/model.js';
import { placeTooltip, intersect } from '../../src/internal/tooltip/place.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';

function index() {
  const r = validateLine({ family: 'line', title: 'T', axes: { x: { kind: 'linear', domain: [0, 10] }, y: { kind: 'linear', domain: [0, 10] } }, series: [
    { id: 'a', name: 'A', data: [{ id: 'a0', x: 0, y: 1 }, { id: 'a3', x: 3, y: 5 }, { id: 'a9', x: 9, y: 9 }] },
    { id: 'empty', name: 'Empty', data: [] },
    { id: 'b', name: 'B', data: [{ id: 'b2', x: 2, y: 1 }, { id: 'b3', x: 3, y: null }, { id: 'b4', x: 4, y: 5 }] },
    { id: 'c', name: 'C', data: [{ id: 'c', x: 3.001, y: 9 }] },
  ] });
  if (r.status !== 'ok') throw Error('fixture'); const data = normalizeLine(r.value), projected = projectLine(data, { hiddenSeriesIds: [] }, { x: 0, y: 0, width: 100, height: 100 }, [0, 10], [0, 10]); if (projected.status !== 'ok') throw Error('fixture');
  return { data, index: buildHitIndex(projected.value, x => x as number) };
}
it('Shared irregular golden: value at3, explicit null at3, absent at3 despite3.001 sample', () => {
  const { data } = index(), palette = defaultPalette('light', false), series = data.series.map(s => ({ id: s.spec.id, name: s.spec.name, color: palette.series[s.colorIndex]!, dash: s.dash, byX: s.byX }));
  const model = tooltipModel(7, 'a', 'a3', 3, 'linear', 'shared', series, new Map());
  expect(model.rows.map(r => [r.name, r.value, r.availability])).toEqual([['A', 5, 'value'], ['Empty', null, 'absent'], ['B', null, 'null'], ['C', null, 'absent']]); expect(rowText(model.rows[2]!)).toBe('B: Missing observation'); expect(rowText(model.rows[3]!)).toBe('C: No sample'); expect(detailText(model, 'Units')).toContain('Units');
  expect(tooltipModel(7, 'a', 'a3', 3, 'linear', 'point', series, new Map()).rows).toHaveLength(1);
});
it('Category missing golden: b=0 remains value; absent series is not null or interpolated', () => {
  const series = [{ id: 'a', name: 'A', color: '#123', dash: 'solid' as const, byX: new Map([['b', { y: 0 }]]) }, { id: 'b', name: 'B', color: '#456', dash: 'dashed' as const, byX: new Map([['a', { y: 4 }]]) }];
  const m = tooltipModel(1, 'a', 'p', 'b', 'category', 'shared', series, new Map([['b', 'Beta']])); expect(m.header).toBe('Beta (b)'); expect(m.rows.map(r => r.availability)).toEqual(['value', 'absent']); expect(rowText(m.rows[0]!)).toBe('A: 0'); expect(fullX(0, 'time', new Map())).toBe('1970-01-01T00:00:00.000Z');
});
it('nearest-X search enforces plot/tolerance, stable tie order and transformed CSS coordinates', () => {
  const { index: i } = index(), identity = (x: number, y: number) => ({ x, y });
  expect(pickPoint(i, { x: 30, y: 50 }, { x: 30, y: 50 }, identity)?.point.point.id).toBe('a3'); expect(pickPoint(i, { x: -1, y: 50 }, { x: -1, y: 50 }, identity)).toBeNull(); expect(pickPoint(i, { x: 50, y: 50 }, { x: 50, y: 80 }, identity)).toBeNull();
  expect(pickPoint(i, { x: 30, y: 50 }, { x: 60, y: 100 }, (x, y) => ({ x: x * 2, y: y * 2 }))?.point.point.id).toBe('a3'); expect(pickPoint(i, { x: 30, y: 50 }, { x: 30, y: 50 }, () => null)).toBeNull();
  expect(nearestX(i.targets[2]!, 30)?.point.point.id).toBe('b2');
});
it('keyboard skips empty series, uses earlier nearest-X ties, never wraps and reconciles by ID', () => {
  const { index: i } = index(), first = firstTarget(i)!; expect(first.point.point.id).toBe('a0'); expect(firstTarget(i, true)?.point.point.id).toBe('c');
  const middle = navigate(i, first, 'ArrowRight', false)!; expect(middle.point.point.id).toBe('a3'); expect(navigate(i, middle, 'ArrowDown', false)?.point.point.id).toBe('b2'); expect(navigate(i, first, 'ArrowLeft', false)).toBe(first); expect(navigate(i, first, 'ArrowUp', false)).toBe(first);
  expect(navigate(i, middle, 'End', false)?.point.point.id).toBe('a9'); expect(navigate(i, middle, 'Home', true)?.point.point.id).toBe('a0'); expect(navigate(i, middle, 'End', true)?.point.point.id).toBe('c');
  expect(reconcileTarget(i, middle, true, 30)).toBe(middle); expect(reconcileTarget(i, middle, false, 30)).toBe(first); expect([...i.columns.keys()]).toEqual([0, 2, 3, 3.001, 4, 9]); expect(i.columns.get(3)).toBe(3);
});
it('coincident projected X positions use indexed Y lookup and preserve deterministic datum identity', () => {
  const spec = validateLine({ family: 'line', title: 'Extreme', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: Array.from({ length: 10000 }, (_, i) => ({ id: 'p' + i, x: i === 9999 ? 1e300 : i, y: i % 11 })) }] });
  if (spec.status !== 'ok') throw Error('fixture');
  const projection = projectLine(normalizeLine(spec.value), { hiddenSeriesIds: [] }, { x: 20, y: 20, width: 700, height: 300 }, [0, 1e300], [0, 10]);
  if (projection.status !== 'ok') throw Error('projection');
  const hit = buildHitIndex(projection.value, x => x as number);
  expect(hit.coincident.get(0)?.get(20)).toHaveLength(9999);
  for (let y = 0; y <= 10; y++) {
    const position = { x: 22, y: 320 - y * 30 };
    expect(pickPoint(hit, position, position, (x, y) => ({ x, y }))?.point.point.id).toBe('p' + y);
    if (y > 0) { const offset = { ...position, y: position.y + .25 }; expect(pickPoint(hit, offset, offset, (x, y) => ({ x, y }))?.point.point.id).toBe('p' + y); }
  }
});
it('solver uses preferred/opposite, logical direction, minimum overflow and bounded clamp', () => {
  const allowed = { x: 0, y: 0, width: 200, height: 200 }, anchor = { x: 100, y: 100, width: 0, height: 0 }, size = { width: 40, height: 20 };
  expect(placeTooltip(anchor, size, allowed, 'top', 'ltr')).toEqual({ kind: 'floating', x: 80, y: 72, placement: 'top' });
  expect(placeTooltip({ ...anchor, y: 8 }, size, allowed, 'top', 'ltr')).toEqual({ kind: 'floating', x: 80, y: 16, placement: 'bottom' });
  expect(placeTooltip(anchor, size, allowed, 'start', 'rtl')).toEqual({ kind: 'floating', x: 108, y: 90, placement: 'start' });
  expect(placeTooltip({ ...anchor, x: 0, y: 0 }, { width: 100, height: 100 }, allowed, 'top', 'ltr')).toMatchObject({ kind: 'floating', x: 8, y: 8 });
  expect(placeTooltip(anchor, { width: 185, height: 20 }, allowed, 'top', 'ltr')).toEqual({ kind: 'docked' }); expect(placeTooltip(anchor, size, { ...allowed, width: 0 }, 'top', 'ltr')).toEqual({ kind: 'closed' }); expect(placeTooltip(anchor, { width: Infinity, height: 20 }, allowed, 'top', 'ltr')).toEqual({ kind: 'closed' });
  expect(intersect({ x: 0, y: 0, width: 2, height: 2 }, { x: 4, y: 4, width: 2, height: 2 })).toEqual({ x: 4, y: 4, width: 0, height: 0 });
});
