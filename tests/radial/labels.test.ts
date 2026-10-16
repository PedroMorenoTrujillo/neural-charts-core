import { expect, test } from 'vitest';
import fc from 'fast-check';
import { layoutRadialLabels } from '../../src/radial/labels.js';
import type { RadialLabelCandidate } from '../../src/radial/labels.js';
import { normalizeRadial, polar } from '../../src/radial/math.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const bounds = { x: 0, y: 0, width: 300, height: 300 }, frame = { cx: 150, cy: 150, radius: 75, innerRadius: 0 };
function candidates(values: readonly number[]): readonly RadialLabelCandidate[] {
  const data = value(normalizeRadial(values.map((value, i) => ({ id: 'p' + i, value })), new Set()));
  return Object.freeze(data.drawn.map(slice => {
    const angle = slice.start + (slice.end - slice.start) / 2, anchor = polar(frame, 75, angle), elbow = polar(frame, 83, angle), side = anchor.x >= frame.cx ? 'right' : 'left';
    return Object.freeze({ id: slice.point.id, text: 'Slice ' + slice.point.id, side, x: side === 'right' ? 240 : 0, idealY: anchor.y, width: 60, height: 16, priority: slice.fraction, anchor: Object.freeze(anchor), elbow: Object.freeze(elbow) });
  }));
}
test('outside labels are deterministic, bounded and preserve their own slice anchors', () => {
  const input = candidates([2, 3, 5, 7, 11, 13, 17, 19]), output = value(layoutRadialLabels(input, bounds));
  expect(output.length).toBeGreaterThan(0); expect(output).toEqual(value(layoutRadialLabels([...input].reverse(), bounds)));
  for (const label of output) { expect(label.leader[0]).toBe(input.find(candidate => candidate.id === label.id)!.anchor); expect(label.box.y).toBeGreaterThanOrEqual(0); expect(label.box.y + label.box.height).toBeLessThanOrEqual(300); }
});
test('impossible outside candidates are omitted while source data remain intact', () => {
  const input = candidates([2, 3, 5]);
  expect(value(layoutRadialLabels(input.map(candidate => ({ ...candidate, width: 500 })), bounds))).toEqual([]);
  expect(input).toHaveLength(3);
});
test('invalid dimensions, identities and candidate bounds fail explicitly', () => {
  const input = candidates([2]);
  for (const mutate of [{ width: -1 }, { height: 0 }, { idealY: NaN }, { priority: Infinity }]) expect(layoutRadialLabels(input.map(candidate => ({ ...candidate, ...mutate })), bounds).status).toBe('invalid');
  expect(layoutRadialLabels([...input, ...input], bounds).status).toBe('invalid');
  expect(layoutRadialLabels(input, { ...bounds, height: -1 }).status).toBe('invalid');
});
test('seeded outside layout never overlaps labels or mutates the ordered candidate data', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 300 }), values => {
    const input = candidates(values), before = JSON.stringify(input), output = value(layoutRadialLabels(input, bounds));
    expect(JSON.stringify(input)).toBe(before); expect(output.length).toBeLessThanOrEqual(200);
    expect(output).toEqual(value(layoutRadialLabels([...input].reverse(), bounds)));
    for (let i = 0; i < output.length; i++) {
      const a = output[i]!.box; expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(-1e-10); expect(a.x + a.width).toBeLessThanOrEqual(300); expect(a.y + a.height).toBeLessThanOrEqual(300 + 1e-10);
      for (let j = 0; j < i; j++) { const b = output[j]!.box, overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); expect(overlap).toBe(0); }
    }
  }), { seed: 160120, numRuns: 250 });
});
