import { expect, it } from 'vitest';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import type { TextMeasurer } from '../../src/internal/layout/text.js';

const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer: TextMeasurer = { measure(text) { return { width: text.length * 8, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
it('compact density shares the existing inner-width breakpoint and keeps bounded legend slots', () => {
  const names = Array.from({ length: 64 }, (_, i) => 'Long series ' + i);
  const compact = shellFrame({ width: 663, height: 300 }, true, names, 'end', font, 'rtl', measurer);
  const desktop = shellFrame({ width: 664, height: 400 }, true, names, 'end', font, 'rtl', measurer);
  expect(compact.compact).toBe(true); expect(compact.legendPosition).toBe('bottom'); expect(compact.legend.height).toBe(72);
  expect(desktop.compact).toBe(false); expect(desktop.legendPosition).toBe('end'); expect(desktop.body).toEqual({ x: 180, y: 60, width: 472, height: 328 });
  expect(shellFrame({ width: 768, height: 400 }, true, ['Completed'], 'bottom', font, 'ltr', measurer).body).toEqual({ x: 12, y: 60, width: 744, height: 288 });
});
it('compact reservations increase usable plot height while retaining both configured titles and numeric domain', () => {
  const frame = shellFrame({ width: 320, height: 240 }, true, ['Completed'], 'bottom', font, 'ltr', measurer);
  const result = planAxes({ x: { kind: 'category', values: [{ id: 'a' }, { id: 'b' }], title: 'Day' }, y: { kind: 'linear', title: 'Sessions', nice: false }, domains: { x: null, y: [0, 10] }, width: frame.body.width, height: frame.body.height, compact: frame.compact, font, direction: 'ltr', labels: new Map(), measurer });
  if (result.status !== 'ok') throw Error('Expected valid compact chart');
  // V04 reserves six additional pixels between tick text and the axis title.
  expect(result.value.plot.height).toBe(63); expect(result.value.tooSmall).toBe(false);
  expect(result.value.xTitle).toBe('Day'); expect(result.value.yTitle).toBe('Sessions'); expect(result.value.y.domain).toEqual([0, 10]);
  expect(result.value.mapY(10)).toBe(result.value.plot.y); expect(result.value.mapY(0)).toBe(result.value.plot.y + result.value.plot.height);
});
