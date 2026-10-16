import { expect, test } from 'vitest';
import fc from 'fast-check';
import type { ChartResult, ChartState } from '../../src/public/chart-types.js';
import type { ColumnChartSpec } from '../../src/public/column-types.js';
import { validateColumn } from '../../src/column/validate.js';
import { normalizeColumn } from '../../src/column/normalize.js';
import { navigateColumn, reconcileColumn } from '../../src/column/geometry.js';
import { projectStacked, stackedDomain, pickStacked } from '../../src/stacked/geometry.js';
import { stackedScene } from '../../src/stacked/scene.js';
import { emptyLayers } from '../../src/internal/axes/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';

function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const plot = Object.freeze({ x: 20, y: 30, width: 400, height: 280 });
type Datum = Readonly<{ original: string }>;
function fixture(values: readonly (readonly (number | null)[])[], options: Readonly<{ orientation?: 'vertical' | 'horizontal'; reversed?: boolean; domain?: readonly [number, number]; maxBarWidth?: number }> = {}): ColumnChartSpec<Datum> {
  const count = Math.max(1, ...values.map(row => row.length));
  return { family: 'column', title: 'Stacked observations', ...(options.orientation ? { orientation: options.orientation } : {}), ...(options.maxBarWidth ? { maxBarWidth: options.maxBarWidth } : {}),
    axes: { x: { kind: 'category', values: Array.from({ length: count }, (_, i) => ({ id: 'c' + i, label: i < 2 ? 'January' : 'Category ' + i })) }, y: { kind: 'linear', ...(options.reversed === undefined ? {} : { reversed: options.reversed }), ...(options.domain ? { domain: options.domain } : {}) } },
    series: values.map((row, si) => ({ id: 's' + si, name: 'Series ' + si, data: row.map((y, ci) => ({ id: 'p' + si + '-' + ci, x: 'c' + ci, y, datum: { original: 's' + si + '/c' + ci } })) })),
  };
}
function project(spec: ColumnChartSpec<Datum>, mode: 'sum' | 'percent' = 'sum', state: ChartState = { hiddenSeriesIds: [] }) {
  const data = normalizeColumn(value(validateColumn<Datum>(spec))), domain = value(stackedDomain(data, state, mode));
  if (!domain) throw Error('Expected domain');
  return { data, domain, projection: value(projectStacked(data, state, plot, domain, mode)) };
}
for (const orientation of ['vertical', 'horizontal'] as const) {
  test(orientation + ' uses one category band and cumulative endpoints on the shared scale', () => {
    const { projection: p, domain } = project(fixture([[4], [3]], { orientation }));
    expect(domain).toEqual([0, 7]); expect(p.slotGap).toBe(0); expect(p.groupWidth).toBe(p.slotWidth);
    const a = p.rects[0]!, b = p.rects[1]!;
    if (orientation === 'vertical') {
      expect(a.x).toBe(b.x); expect(a.width).toBe(b.width); expect(a.y + a.height).toBeCloseTo(plot.y + plot.height, 10); expect(b.y + b.height).toBeCloseTo(a.y, 10);
      expect(a.height + b.height).toBeCloseTo(plot.height, 10);
    } else {
      expect(a.y).toBe(b.y); expect(a.height).toBe(b.height); expect(a.x).toBe(plot.x); expect(b.x).toBeCloseTo(a.x + a.width, 10);
      expect(a.width + b.width).toBeCloseTo(plot.width, 10);
    }
    expect(a.point.y).toBe(4); expect(b.point.y).toBe(3); expect(b.point.datum?.original).toBe('s1/c0');
    expect(a.anchor[orientation === 'vertical' ? 'y' : 'x']).toBe(p.mapValue(4));
    for (const rect of p.rects) expect(pickStacked(p, rect.x + rect.width / 2, rect.y + rect.height / 2)?.key).toBe(rect.key);
  });
  test(orientation + ' handles mixed signs, reversed coordinates and zero baseline independently', () => {
    for (const reversed of [false, true]) {
      const { projection: p, domain } = project(fixture([[4], [3], [-2], [-5]], { orientation, reversed }));
      expect(domain).toEqual([-7, 7]); const baseline = p.mapValue(0)!;
      for (const rect of p.rects) {
        const segment = p.stack.categories.get('c0')!.segments.find(s => s.seriesId === rect.series.spec.id)!;
        const low = Math.min(p.mapValue(segment.base)!, p.mapValue(segment.end)!), length = Math.abs(p.mapValue(segment.end)! - p.mapValue(segment.base)!);
        expect(orientation === 'vertical' ? rect.y : rect.x).toBe(low); expect(orientation === 'vertical' ? rect.height : rect.width).toBe(length);
        expect(Math.sign(p.mapValue(segment.end)! - baseline)).toBe((orientation === 'vertical' ? -1 : 1) * (reversed ? -1 : 1) * Math.sign(rect.point.y!));
      }
    }
  });
  test(orientation + ' percent sizes represent proportions but original values and IDs survive', () => {
    const { projection: p, domain } = project(fixture([[2], [3]], { orientation }), 'percent');
    expect(domain).toEqual([0, 100]); expect(p.rects.map(r => r.point.y)).toEqual([2, 3]);
    const extent = orientation === 'vertical' ? plot.height : plot.width;
    expect((orientation === 'vertical' ? p.rects[0]!.height : p.rects[0]!.width) / extent).toBeCloseTo(.4, 12);
    expect((orientation === 'vertical' ? p.rects[1]!.height : p.rects[1]!.width) / extent).toBeCloseTo(.6, 12);
  });
  test(orientation + ' crops cumulative intervals rather than restarting each segment at zero', () => {
    const { projection: p, domain } = project(fixture([[4], [3]], { orientation, domain: [2, 5] }));
    expect(domain).toEqual([2, 5]); expect(p.rects).toHaveLength(2);
    const extent = orientation === 'vertical' ? plot.height : plot.width;
    expect(orientation === 'vertical' ? p.rects[0]!.height : p.rects[0]!.width).toBeCloseTo(extent * 2 / 3, 10);
    expect(orientation === 'vertical' ? p.rects[1]!.height : p.rects[1]!.width).toBeCloseTo(extent / 3, 10);
    expect(project(fixture([[4], [3]], { orientation, domain: [10, 20] })).projection.rects).toEqual([]);
  });
}
test('band cap is centered and pointer gaps are not neighboring segments', () => {
  const { projection: p } = project(fixture([[4, 3, 2]], { maxBarWidth: 24 }));
  for (const rect of p.rects) {
    const band = p.bands.band(rect.point.x)!;
    expect(rect.width).toBe(24); expect(rect.x + rect.width / 2).toBeCloseTo(band.start + band.width / 2, 12);
    expect(pickStacked(p, band.start + 1, rect.y + rect.height / 2)).toBeNull();
  }
  expect(pickStacked(p, NaN, 40)).toBeNull(); expect(pickStacked(p, 10, 40)).toBeNull();
});
test('zero tolerance yields to a real segment and raw all-zero points remain keyboard targets', () => {
  const p = project(fixture([[0], [4]])).projection, real = p.rects[1]!;
  expect(pickStacked(p, real.x + real.width / 2, real.y + real.height - 1)?.point.id).toBe(real.point.id);
  const zeros = project(fixture([[0], [0]])).projection;
  expect(zeros.rects).toHaveLength(2); expect(zeros.rects.every(rect => rect.height === 0)).toBe(true);
  const first = zeros.rects[0]!; expect(pickStacked(zeros, first.x + first.width / 2, first.y)?.key).toBe(first.key);
  expect(navigateColumn(zeros, first, 'ArrowDown')?.point.id).toBe('p1-0');
});
test('missing percentages suppress a full category, while sum retains known segments', () => {
  const raw = fixture([[2, 0, 4], [null, 0, 6]]);
  const sum = project(raw).projection, percent = project(raw, 'percent').projection;
  expect(sum.byCategory[0]!.size).toBe(1); expect(sum.byCategory[1]!.size).toBe(2);
  expect(percent.byCategory[0]!.size).toBe(0); expect(percent.byCategory[1]!.size).toBe(0); expect(percent.byCategory[2]!.size).toBe(2);
  expect(percent.stack.categories.get('c0')!.complete).toBe(false);
});
test('legend changes recompute visible totals and rebuilt identities reconcile by logical key', () => {
  const raw = fixture([[2, 4], [6, 1]]), all = project(raw, 'percent').projection;
  const hidden = project(raw, 'percent', { hiddenSeriesIds: ['s1'] }).projection;
  expect(all.stack.series[0]!.segments[0]!.percentage).toBe(25); expect(hidden.stack.series[0]!.segments[0]!.percentage).toBe(100);
  const before = all.rects[1]!, rebuilt = project(structuredClone(raw), 'percent').projection;
  expect(reconcileColumn(rebuilt, before)?.key).toBe(before.key);
  expect(reconcileColumn(rebuilt, before)?.point).not.toBe(before.point);
});
test('finite frozen Scene rects use neutral separators only at a readable band width', () => {
  for (const count of [1, 1000]) {
    const { projection: p } = project(fixture([Array.from({ length: count }, () => 2), Array.from({ length: count }, () => 3)]));
    const layers = emptyLayers(), palette = defaultPalette('dark', true); stackedScene(p, palette, layers);
    expect(validateSceneFrame({ revision: 1, width: 768, height: 400, defs: [{ key: 'plot', kind: 'clip-rect', ...plot }], layers }).status).toBe('ok');
    for (const mark of layers.marks) expect(mark.presentation?.stroke).toEqual(count === 1 ? { kind: 'solid', value: palette.surface } : undefined);
  }
});
test('projected bounds and identity hold across independently generated signed data', () => {
  fc.assert(fc.property(fc.array(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 3, maxLength: 3 }), { minLength: 1, maxLength: 8 }), values => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const p = project(fixture(values, { orientation })).projection;
      expect(p.rects).toHaveLength(values.length * 3);
      for (const rect of p.rects) {
        expect(rect.width).toBeGreaterThanOrEqual(0); expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.x).toBeGreaterThanOrEqual(plot.x - 1e-7 * plot.width); expect(rect.x + rect.width).toBeLessThanOrEqual(plot.x + plot.width + 1e-7 * plot.width);
        expect(rect.y).toBeGreaterThanOrEqual(plot.y - 1e-7 * plot.height); expect(rect.y + rect.height).toBeLessThanOrEqual(plot.y + plot.height + 1e-7 * plot.height);
        expect(rect.point.y).toBe(values[rect.seriesIndex]![rect.categoryIndex]); expect(p.byId.get(rect.key)).toBe(rect);
      }
    }
  }), { seed: 160118, numRuns: 250 });
});
