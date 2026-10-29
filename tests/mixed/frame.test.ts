import { expect, it } from 'vitest';
import { createMixedCategoryFrame } from '../../src/mixed/frame.js';
it('uses one exact frame and point index for line/area observations and column bands', () => {
  const ids = Object.freeze(['jan-1', 'jan-2', 'feb']), result = createMixedCategoryFrame(ids, { x: 20, y: 10, width: 600, height: 300 }); expect(result.status).toBe('ok'); if (result.status === 'invalid') return;
  const { frame, points, bands } = result.value; expect(points).toBe(bands); expect(points.frame).toBe(frame); expect(bands.frame).toBe(frame);
  expect(ids.map(id => points.center(id))).toEqual([120, 320, 520]);
  for (let i = 0; i < ids.length; i++) { expect(points.center(ids[i]!)).toBe(bands.band(ids[i]!)!.center); expect(points.indexAt(bands.band(ids[i]!)!.center)).toBe(i); }
  expect(ids).toEqual(['jan-1', 'jan-2', 'feb']); expect(points.center('unknown')).toBe(null);
});
it('independently matches pixel-space category centers for varying density and spacing', () => {
  for (const count of [1, 2, 3, 10, 30, 100, 1000, 5000]) for (const gap of [0, .2, .5, .9]) {
    const ids = Array.from({ length: count }, (_, index) => 'category-' + index), plot = { x: 17, y: 23, width: 900, height: 400 }, result = createMixedCategoryFrame(ids, plot, gap); expect(result.status).toBe('ok'); if (result.status === 'invalid') continue;
    const { points, bands } = result.value;
    for (let i = 0; i < count; i++) { const center = 17 + 900 * (i + .5) / count, band = bands.band(ids[i]!)!; expect(points.center(ids[i]!)).toBeCloseTo(center, 10); expect(band.center).toBe(points.center(ids[i]!)); expect(band.width).toBeCloseTo(900 / count * (1 - gap), 10); expect(Math.min(band.start, band.end)).toBeGreaterThanOrEqual(plot.x); expect(Math.max(band.start, band.end)).toBeLessThanOrEqual(plot.x + plot.width); }
  }
});
it('rejects duplicate identities/nonfinite plot/invalid gaps without editing frozen category math', () => {
  const plot = { x: 0, y: 0, width: 400, height: 300 };
  for (const ids of [['same', 'same'], ['']]) expect(createMixedCategoryFrame(ids, plot).status).toBe('invalid');
  for (const groupGap of [-.1, 1, NaN, Infinity]) expect(createMixedCategoryFrame(['a'], plot, groupGap).status).toBe('invalid');
  for (const bad of [{ ...plot, width: -1 }, { ...plot, x: Infinity }, { ...plot, x: Number.MAX_VALUE, width: Number.MAX_VALUE }]) expect(createMixedCategoryFrame(['a'], bad).status).toBe('invalid');
});
it('keeps empty and suspended frames finite without manufacturing points', () => {
  const empty = createMixedCategoryFrame([], { x: 0, y: 0, width: 400, height: 300 }); expect(empty.status).toBe('ok'); if (empty.status === 'ok') { expect(empty.value.points.indexAt(50)).toBe(null); expect(empty.value.bands.bandAt(50)).toBe(null); }
  const suspended = createMixedCategoryFrame(['a', 'b'], { x: 0, y: 0, width: 0, height: 0 }); expect(suspended.status).toBe('ok'); if (suspended.status === 'ok') expect(suspended.value.points.indexAt(0)).toBe(null);
});
