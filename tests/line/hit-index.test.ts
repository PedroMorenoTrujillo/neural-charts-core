import { describe, expect, it } from 'vitest';
import { validateLine } from '../../src/line/validate.js';
import { normalizeLine } from '../../src/line/normalize.js';
import { projectLine } from '../../src/line/geometry.js';
import { buildHitIndex, firstTarget, navigate, nearestX, neighbors, pickPoint, reconcileTarget } from '../../src/line/hit-index.js';
import type { ChartResult } from '../../src/public/chart-types.js';

function accept<T>(result: ChartResult<T>): T {
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}

const baseSeries: {id: string; name: string; data: {id: string; x: number; y: number | null}[]}[] = [
  { id: 'source', name: 'Source', data: [
    { id: 'first', x: 1, y: 2 }, { id: 'middle', x: 2, y: 6 },
    { id: 'overlap', x: 3, y: 6 }, { id: 'last', x: 8, y: 8 },
  ] },
  { id: 'gap', name: 'Gap', data: [{ id: 'missing', x: 1, y: null }] },
  { id: 'compare', name: 'Compare', data: [{ id: 'aa', x: 1, y: 2 }, { id: 'bb', x: 8, y: 8 }] },
  { id: 'high', name: 'High', data: [{ id: 'highest', x: 9, y: 10 }] },
];
const plot = { x: 0, y: 0, width: 100, height: 100 };

function index(series = baseSeries, hiddenSeriesIds: string[] = []) {
  const input = accept(validateLine({
    family: 'line', title: 'Data', series,
    axes: { x: { type: 'linear', domain: [0, 10] }, y: { type: 'linear', domain: [0, 10] } },
  }));
  const projected = accept(projectLine(normalizeLine(input), { hiddenSeriesIds }, plot, [0, 10], [0, 10], {
    // A renderer may quantize neighboring X values into the same pixel bucket.
    mapX: x => 10 * Math.ceil(Number(x) / 3),
    mapY: y => (1 - y / 10) * 100,
  }));
  return buildHitIndex(projected, Number);
}

describe('line hit index identity and visual navigation', () => {
  it('merges ordered domains and handles coincident hits without inventing observations', () => {
    const fixture = index();
    expect([...fixture.columns.keys()]).toEqual([1, 2, 3, 8, 9]);
    expect(fixture.columnCount).toBe(5);
    expect(fixture.targets[1]).toEqual([]);
    const points = fixture.targets[0]!;
    expect(neighbors(points, -1)).toEqual([points[0]]);
    expect(neighbors(points, 101)).toEqual([points.at(-1)]);
    expect(neighbors(points, 23).map(t => t.point.point.id)).toEqual(['overlap', 'last']);
    expect(nearestX(points, points[0]!.point.x)).toBe(points[0]);
    expect(nearestX([], 52)).toBeNull();

    const hit = (x: number, y: number) => pickPoint(fixture, { x, y }, { x, y }, (x, y) => ({ x, y }));
    expect(hit(10, 40)?.point.point.id).toBe('middle');
    expect(hit(10, 41)?.point.point.id).toBe('middle');
    expect(hit(10, 79)?.point.point.id).toBe('first');
    expect(hit(30, 20)?.point.point.id).toBe('last');
    expect(hit(70, 70)).toBeNull();
    for (const [x, y] of [[-1, 40], [101, 40], [10, -1], [10, 101]]) expect(hit(x!, y!)).toBeNull();
    expect(pickPoint(fixture, { x: 10, y: 40 }, { x: 10, y: 40 }, () => null)).toBeNull();
  });

  it('supports local and global edges and crosses empty series without losing X', () => {
    const fixture = index();
    const first = firstTarget(fixture);
    if (!first) throw Error('Expected an observation');
    expect(first.point.point.id).toBe('first');
    expect(firstTarget(fixture, true)?.point.point.id).toBe('highest');
    expect(navigate(fixture, null, 'Home', false)).toBe(first);
    expect(navigate(fixture, first, 'ArrowLeft', false)).toBe(first);
    expect(navigate(fixture, first, 'ArrowRight', false)?.point.point.id).toBe('middle');
    expect(navigate(fixture, first, 'End', false)?.point.point.id).toBe('last');
    expect(navigate(fixture, first, 'Home', false)).toBe(first);
    expect(navigate(fixture, first, 'End', true)?.point.point.id).toBe('highest');
    expect(navigate(fixture, first, 'Home', true)).toBe(first);
    expect(navigate(fixture, first, 'Escape', false)).toBe(first);
    expect(navigate(fixture, first, 'ArrowUp', false)).toBe(first);
    const compare = navigate(fixture, first, 'ArrowDown', false);
    if (!compare) throw Error('Expected an adjacent series');
    expect(compare.point.point.id).toBe('aa');
    expect(navigate(fixture, compare, 'ArrowUp', false)).toBe(first);
  });

  it('reconciles stable IDs before nearest-X fallback when a series hides or loses points', () => {
    const start = index();
    const first = firstTarget(start);
    const oldLast = firstTarget(start, true);
    if (!first || !oldLast) throw Error('Expected source endpoints');
    expect(reconcileTarget(start, first, true, 90)).toBe(first);
    expect(reconcileTarget(start, null, true, 10)).toBe(first);
    expect(reconcileTarget(start, oldLast, false, 10)).toBe(first);
    const withoutFirst = [{ ...baseSeries[0]!, data: baseSeries[0]!.data.slice(1) }, ...baseSeries.slice(1)];
    const sameSeries = index(withoutFirst);
    expect(reconcileTarget(sameSeries, first, true, null)?.point.point.id).toBe('middle');
    expect(reconcileTarget(sameSeries, first, true, 35)?.point.point.id).toBe('last');
    const hiddenFirst = index(baseSeries, ['source']);
    expect(reconcileTarget(hiddenFirst, first, true, null)?.point.point.id).toBe('aa');
    expect(reconcileTarget(hiddenFirst, first, true, 35)?.point.point.id).toBe('bb');
    const hiddenLast = index(baseSeries, ['high']);
    expect(reconcileTarget(hiddenLast, oldLast, true, null)?.point.point.id).toBe('aa');
    expect(reconcileTarget(hiddenLast, oldLast, true, 35)?.point.point.id).toBe('bb');
    const allHidden = index(baseSeries, baseSeries.map(s => s.id));
    expect(firstTarget(allHidden)).toBeNull();
    expect(reconcileTarget(allHidden, first, true, null)).toBeNull();
  });
});
