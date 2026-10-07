import { expect, it } from 'vitest';
import { ellipsis, createTextMeasurer } from '../../src/internal/layout/text.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { formatAxis, filterLabels, planAxes } from '../../src/internal/axes/plan.js';
import { emptyLayers, axesScene, referenceScene } from '../../src/internal/axes/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { orderedState, toggleState, membershipChanged, derivedView } from '../../src/internal/chart/state.js';
import type { TextMeasurer } from '../../src/internal/layout/text.js';
import type { TickLabel } from '../../src/internal/axes/plan.js';

const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const metrics = (text: string) => ({ width: Array.from(text).length * 8, height: 15, baseline: 12 });
const measurer: TextMeasurer = { measure: metrics, invalidate() {}, destroy() {} };
it('codepoint ellipsis preserves complete Unicode characters and omits impossible labels', () => {
  expect(ellipsis('a😀bc', 24, metrics)).toBe('a😀…'); expect(ellipsis('a', 8, metrics)).toBe('a'); expect(ellipsis('abc', 7, metrics)).toBeNull(); expect(ellipsis('abc', 0, metrics)).toBeNull();
});
it('Canvas measurement has a bounded LRU, explicit font tuple and releasable context', () => {
  let calls = 0;
  const ctx = { font: '', direction: '', letterSpacing: '', textBaseline: '', measureText(text: string) { calls++; return { width: text.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; } };
  const document = { createElement() { return { getContext() { return ctx; } }; } } as unknown as Document;
  const r = createTextMeasurer(document); if (r.status !== 'ok') throw Error('fixture');
  expect(r.value.measure('a', font, 'rtl')).toEqual({ width: 5, height: 15, baseline: 10.5 }); expect(ctx.font).toBe('400 12px sans-serif'); expect(ctx.direction).toBe('rtl');
  r.value.measure('a', font, 'rtl'); expect(calls).toBe(1);
  for (let i = 0; i < 4096; i++) r.value.measure(String(i), font, 'rtl');
  r.value.measure('a', font, 'rtl'); expect(calls).toBe(4098);
  r.value.invalidate(); r.value.measure('a', font, 'rtl'); expect(calls).toBe(4099);
  r.value.destroy(); expect(() => r.value.measure('a', font, 'rtl')).toThrow();
  expect(createTextMeasurer({ createElement() { return { getContext() { return null; } }; } } as unknown as Document).status).toBe('invalid');
});
it('missing vertical metrics use a fixed line box without guessing widths', () => {
  const document = { createElement() { return { getContext() { return { measureText() { return { width: 6 }; } }; } }; } } as unknown as Document;
  const r = createTextMeasurer(document); if (r.status !== 'ok') throw Error('fixture'); expect(r.value.measure('a', font, 'ltr')).toEqual({ width: 6, height: 15, baseline: 12 }); r.value.destroy();
});
it('legend slot is bounded and end placement is responsive at 640px inner width', () => {
  const names = Array.from({ length: 64 }, (_, i) => 'Series ' + i);
  const narrow = shellFrame({ width: 320, height: 240 }, true, names, 'end', font, 'ltr', measurer), wide = shellFrame({ width: 664, height: 400 }, false, names, 'end', font, 'ltr', measurer);
  expect(narrow.legendPosition).toBe('bottom'); expect(narrow.legend.height).toBe(72); expect(wide.legendPosition).toBe('end'); expect(wide.legend.width).toBe(160); expect(wide.body.width).toBe(472);
  expect(shellFrame({ width: 10, height: 10 }, false, [], 'bottom', font, 'ltr', measurer).body.height).toBe(0);
});
it('time formatting retains signed/extended ISO years and UTC interval precision', () => {
  const labels = new Map<string, string>();
  expect(formatAxis(-0, 'linear', null, labels)).toBe('0'); expect(formatAxis('a', 'category', null, new Map([['a', 'A']]))).toBe('A');
  expect(formatAxis(0, 'time', { unit: 'hour', step: 1 }, labels)).toBe('1970-01-01T00Z'); expect(formatAxis(-1, 'time', null, labels)).toBe('1969-12-31T23:59:59.999Z');
  expect(formatAxis(-62167219200000, 'time', { unit: 'year', step: 1 }, labels)).toBe('0000');
  expect(formatAxis(8.64e15, 'time', { unit: 'month', step: 1 }, labels)).toBe('+275760-09');
  expect(formatAxis(-8.64e15, 'time', { unit: 'day', step: 1 }, labels)).toBe('-271821-04-20');
});
it('endpoint-priority filtering keeps deterministic non-overlapping labels', () => {
  const labels: TickLabel[] = [0, 1, 2, 3].map(i => ({ value: i, full: String(i), text: String(i), position: i * 20, box: { x: i * 20, y: 0, width: 30, height: 15 }, baseline: 12 }));
  expect(filterLabels(labels).map(l => l.text)).toEqual(['0', null, null, '3']); expect(filterLabels([])).toEqual([]);
});
function plan(width = 320, height = 180) {
  const r = planAxes({ x: { kind: 'category', values: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], title: 'X' }, y: { kind: 'linear', title: 'Y', nice: false }, domains: { x: null, y: [0, 10] }, width, height, font, direction: 'ltr', labels: new Map(), measurer });
  if (r.status !== 'ok') throw Error('fixture'); return r.value;
}
it('final category frame is shared by ticks, points and references; grid has no baseline duplication', () => {
  const p = plan(), layers = emptyLayers(), palette = defaultPalette('light', false);
  expect(p.tooSmall).toBe(false); for (const tick of p.x.labels) expect(tick.position).toBe(p.mapX(tick.value));
  axesScene(p, { kind: 'category' }, { kind: 'linear' }, palette, layers); expect(layers.axes.length).toBeGreaterThan(2); expect(layers.grid.every(c => c.kind === 'line' && c.y1 !== p.plot.y + p.plot.height)).toBe(true);
  const refs = referenceScene([{ id: 'r', axis: 'y', value: 4, label: 'Target' }, { id: 'out', axis: 'y', value: 11 }], p, palette, layers, text => ({ text, ...metrics(text) }));
  expect(refs).toEqual([{ id: 'r', outside: false }, { id: 'out', outside: true }]); expect(layers['reference-lines']).toHaveLength(1);
  expect(layers['reference-lines'][0]).toMatchObject({ y1: p.mapY(4), y2: p.mapY(4), clipKey: 'plot' });
  expect(plan(60, 30).tooSmall).toBe(true);
});
it('persistent state only contains hidden IDs and preserves spec order', () => {
  const a = { hiddenSeriesIds: ['c', 'a'] }; expect(orderedState(a, ['a', 'b', 'c'])).toEqual({ hiddenSeriesIds: ['a', 'c'] }); expect(toggleState(a, 'a', ['a', 'b', 'c'])).toEqual({ hiddenSeriesIds: ['c'] });
  expect(membershipChanged(a, { hiddenSeriesIds: ['a', 'c'] })).toBe(false); expect(membershipChanged(a, { hiddenSeriesIds: ['a'] })).toBe(true);
  expect(derivedView('ready', 2, 0, 2, 2)).toBe('no-visible-series'); expect(derivedView('ready', 0, 0, 2, 2)).toBe('empty'); expect(derivedView('ready', 2, 0, 2, 1)).toBe('empty'); expect(derivedView('loading', 2, 2, 2, 0)).toBe('loading');
});
