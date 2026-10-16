import { expect, test } from 'vitest';
import fc from 'fast-check';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { RadialChartSpec } from '../../src/public/radial-types.js';
import { projectRadial, radialLabelFits, radialFocusAnchor, radialLeaderClear } from '../../src/radial/geometry.js';
import { TAU, pickRadial } from '../../src/radial/math.js';
import { serializePath } from '../../src/internal/geometry/path.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const bounds = Object.freeze({ x: 12, y: 20, width: 744, height: 280 });
test('unrepresentable finite layouts and invalid normalization propagate diagnostics', () => {
  const source = { family: 'pie' as const, title: 'Extreme bounds', data: [{ id: 'one', label: 'Only', value: 1 }] };
  expect(projectRadial(source, { hiddenSliceIds: [] }, { x: Number.MAX_VALUE / 2, y: Number.MAX_VALUE / 2, width: 100, height: 100 })).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNREPRESENTABLE_GEOMETRY' } });
  expect(projectRadial({ ...source, data: [{ id: 'bad', label: 'Bad', value: -1 }] }, { hiddenSliceIds: [] }, bounds).status).toBe('invalid');
});
function fixture(family: 'pie' | 'donut', values: readonly (number | null)[] = [2, 3, 5]): RadialChartSpec<{ source: number }> {
  return Object.freeze({ family, title: 'Contribution', data: Object.freeze(values.map((value, i) => Object.freeze({ id: 'p' + i, label: 'Slice ' + i, value, datum: Object.freeze({ source: i }) }))) });
}
for (const family of ['pie', 'donut'] as const) {
  test(family + ' derives one shared finite radius, stable original identity and valid paths', () => {
    const spec = fixture(family), p = value(projectRadial(spec, { hiddenSliceIds: [] }, bounds));
    expect(p.frame.radius).toBe(128); expect(p.frame.innerRadius).toBe(family === 'donut' ? 76.8 : 0); expect(p.outsideLabels).toBe(true);
    expect(p.marks).toHaveLength(3); expect(p.rankById.get('p1')).toBe(1); expect(p.byId.get('p2')!.point).toBe(spec.data[2]);
    for (const mark of p.marks) { expect(serializePath(mark.commands).status).toBe('ok'); expect(pickRadial(p.data, p.frame, mark.anchor.x, mark.anchor.y)?.point.id).toBe(mark.slice.point.id); expect(radialFocusAnchor(p, mark.slice)).toEqual(mark.anchor); }
  });
  test(family + ' hides outside labels in narrow containers without dropping slices', () => {
    const p = value(projectRadial(fixture(family), { hiddenSliceIds: [] }, { x: 0, y: 0, width: 320, height: 280 }));
    expect(p.outsideLabels).toBe(false); expect(p.marks).toHaveLength(3); expect(p.frame.radius).toBe(128);
  });
  test(family + ' preserves zero/missing observations and deterministically recomputes hidden totals', () => {
    const spec = fixture(family, [2, 0, null, 3]), p = value(projectRadial(spec, { hiddenSliceIds: ['p0'] }, bounds));
    expect(p.data.total).toBe(3); expect(p.data.missing).toBe(1); expect(p.byId.has('p1')).toBe(true); expect(p.byId.has('p2')).toBe(false); expect(p.marks).toHaveLength(1);
    expect(p.marks[0]!.slice.point).toBe(spec.data[3]); expect(p.marks[0]!.slice.end).toBe(TAU);
  });
}
test('zero-sized/very small plots remain finite and do not manufacture paths', () => {
  for (const width of [0, 10, 20]) {
    const p = value(projectRadial(fixture('donut'), { hiddenSliceIds: [] }, { x: 0, y: 0, width, height: width }));
    expect(p.tooSmall).toBe(true); expect(p.marks).toEqual([]); expect(p.frame.radius).toBe(0);
  }
  for (const patch of [{ width: -1 }, { height: Infinity }, { x: NaN }]) expect(projectRadial(fixture('pie'), { hiddenSliceIds: [] }, { ...bounds, ...patch }).status).toBe('invalid');
});
test('inside label containment accounts for the hole, disk edge, seam and concave sectors', () => {
  const f = { cx: 0, cy: 0, radius: 100, innerRadius: 40 };
  expect(radialLabelFits(f, { start: 0, end: TAU }, { x: -45, y: -45, width: 90, height: 90 })).toBe(false); // All corners clear the hole, but the box does not.
  expect(radialLabelFits(f, { start: 0, end: Math.PI }, { x: 55, y: -10, width: 15, height: 20 })).toBe(true);
  expect(radialLabelFits(f, { start: 0, end: Math.PI }, { x: -70, y: -10, width: 15, height: 20 })).toBe(false);
  expect(radialLabelFits({ ...f, innerRadius: 0 }, { start: 0, end: TAU }, { x: -10, y: -10, width: 20, height: 20 })).toBe(true);
  expect(radialLabelFits({ ...f, innerRadius: 0 }, { start: .2, end: TAU - .2 }, { x: -10, y: -80, width: 20, height: 20 })).toBe(false);
  expect(radialLabelFits(f, { start: 0, end: TAU }, { x: 90, y: -10, width: 20, height: 20 })).toBe(false);
  expect(radialLabelFits(f, { start: 0, end: TAU }, { x: 50, y: 10, width: -1, height: 20 })).toBe(false);
});
test('outside connector checks reject leaders that cut back through the disk', () => {
  const f = { cx: 0, cy: 0, radius: 100, innerRadius: 60 };
  expect(radialLeaderClear(f, [{ x: 100, y: 0 }, { x: 108, y: 0 }, { x: 150, y: 40 }])).toBe(true);
  expect(radialLeaderClear(f, [{ x: 0, y: -100 }, { x: 0, y: -108 }, { x: 150, y: 80 }])).toBe(false);
});
test('seeded responsive geometry retains all raw observations and finite serializable paths', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100000 }), { minLength: 1, maxLength: 100 }), fc.integer({ min: 80, max: 1200 }), fc.integer({ min: 80, max: 600 }), (values, width, height) => {
    const spec = fixture('donut', values), before = JSON.stringify(spec), p = value(projectRadial(spec, { hiddenSliceIds: [] }, { x: 0, y: 0, width, height }));
    expect(JSON.stringify(spec)).toBe(before); expect(p.data.slices).toHaveLength(values.length);
    for (const mark of p.marks) { expect(serializePath(mark.commands).status).toBe('ok'); expect(mark.slice.point).toBe(spec.data[mark.slice.index]); expect(Math.hypot(mark.anchor.x - p.frame.cx, mark.anchor.y - p.frame.cy)).toBeLessThanOrEqual(p.frame.radius + 1e-10); }
  }), { seed: 160121, numRuns: 300 });
});
