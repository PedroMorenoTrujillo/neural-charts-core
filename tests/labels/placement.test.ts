import { describe, it, expect } from 'vitest';
import { labelIndices, layoutDataLabels, labelBoxesOverlap } from '../../src/internal/layout/data-labels.js';
import { labelObstacles } from '../../src/internal/layout/label-obstacles.js';
import { labelPaint } from '../../src/internal/layout/label-paint.js';
const plot = Object.freeze({ x: 10, y: 20, width: 200, height: 100 });
const measure = (text: string) => ({ width: text.length * 7, height: 12, baseline: 9 });
const candidate = (key: string, x: number, y: number, text = '12') => Object.freeze({ key, text, positions: () => Object.freeze([Object.freeze({ x, y, color: '#111111' })]) });
describe('bounded label placement', () => {
  it('samples deterministic complete input extents with no more than200 candidates', () => {
    for (const count of [0, 1, 3, 199, 200, 201, 1000, 50000]) {
      const indices = labelIndices(count); expect(indices.length).toBe(Math.min(200, count));
      expect(new Set(indices).size).toBe(indices.length); expect(indices).toEqual([...indices].sort((a, b) => a - b));
      if (count) { expect(indices[0]).toBe(0); expect(indices.at(-1)).toBe(count - 1); }
    }
    for (const invalid of [-1, .5, Infinity, NaN]) expect(labelIndices(invalid)).toEqual([]);
  });
  it('keeps boxes inside the plot and tries a clear alternative without mutating candidates', () => {
    const input = Object.freeze([candidate('first', 20, 30), Object.freeze({ key: 'second', text: '12', positions: () => [{ x: 20, y: 30, color: '#000' }, { x: 40, y: 60, color: '#000' }] }), candidate('outside', 0, 0)]);
    const result = layoutDataLabels(input, plot, measure, () => false); expect(result.status).toBe('ok');
    if (result.status === 'ok') { expect(result.value.map(v => v.key)).toEqual(['first', 'second']); expect(result.value[1]!.y).toBe(60); expect(Object.isFrozen(result.value)).toBe(true); }
  });
  it('caches repeated text measurement and retains only readable complete labels', () => {
    let calls = 0; const result = layoutDataLabels([candidate('a', 20, 30), candidate('b', 50, 30), candidate('huge', 20, 70, 'x'.repeat(100))], plot, text => { calls++; return measure(text); }, () => false);
    expect(calls).toBe(2); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(result.value.map(v => v.key)).toEqual(['a', 'b']);
  });
  it('rejects nonfinite/negative metrics, invalid positions and excess candidate work', () => {
    for (const value of [-1, Infinity, NaN]) expect(layoutDataLabels([candidate('a', 20, 30)], plot, () => ({ width: value, height: 12, baseline: 9 }), () => false).status).toBe('invalid');
    expect(layoutDataLabels([candidate('a', Infinity, 30)], plot, measure, () => false).status).toBe('invalid');
    expect(layoutDataLabels(Array.from({ length: 201 }, (_, i) => candidate(String(i), 20, 30)), plot, measure, () => false).status).toBe('invalid');
    expect(layoutDataLabels([], { ...plot, width: -1 }, measure, () => false).status).toBe('invalid');
  });
  it('does not lose raw identity when an obstacle suppresses only its presentation', () => {
    const input = Object.freeze([candidate('series:a|point:zero', 20, 30, '0')]);
    const result = layoutDataLabels(input, plot, measure, () => true); expect(result).toEqual({ status: 'ok', value: [] }); expect(input[0]!.text).toBe('0');
  });
  it('preserves fit and separation for seeded dense label candidates', () => {
    let state = 719; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    for (let run = 0; run < 80; run++) {
      const input = Array.from({ length: 200 }, (_, i) => candidate(String(i), random() * 250, random() * 150, String(i % 21 - 10)));
      const result = layoutDataLabels(input, plot, measure, () => false); expect(result.status).toBe('ok'); if (result.status !== 'ok') continue;
      for (let i = 0; i < result.value.length; i++) { const box = result.value[i]!; expect(box.x).toBeGreaterThanOrEqual(plot.x); expect(box.y).toBeGreaterThanOrEqual(plot.y); expect(box.x + box.width).toBeLessThanOrEqual(plot.x + plot.width); expect(box.y + box.height).toBeLessThanOrEqual(plot.y + plot.height); for (const other of result.value.slice(i + 1)) expect(labelBoxesOverlap(box, other, 3)).toBe(false); }
    }
  });
});
describe('label obstacle envelopes', () => {
  it('matches a brute geometric oracle with long spanning intervals in either orientation', () => {
    let seed = 71; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const items = Object.freeze([{ key: 'spanning', box: Object.freeze({ x: -100, y: -100, width: 1000, height: 1000 }) }, ...Array.from({ length: 100 }, (_, i) => Object.freeze({ key: String(i), box: Object.freeze({ x: random() * 300, y: random() * 200, width: random() * 80, height: random() * 40 }) }))]);
    for (const horizontal of [false, true]) {
      const hit = labelObstacles(items, horizontal);
      for (let n = 0; n < 400; n++) {
        const box = { x: random() * 400, y: random() * 300, width: random() * 20, height: random() * 15 }, ownKey = n % 2 ? 'spanning' : String(n % 100);
        const expected = items.some(item => item.key !== ownKey && box.x <= item.box.x + item.box.width + 2 && box.x + box.width >= item.box.x - 2 && box.y <= item.box.y + item.box.height + 2 && box.y + box.height >= item.box.y - 2);
        expect(hit(box, ownKey)).toBe(expected);
      }
    }
  });
  it('distinguishes a diagonal contour from its full bounding rectangle', () => {
    for (const segment of [[0, 0, 100, 100], [100, 100, 0, 0]] as const) {
      const hit = labelObstacles([{ key: 'path', box: { x: 0, y: 0, width: 100, height: 100 }, segment }]);
      expect(hit({ x: 20, y: 70, width: 10, height: 10 }, 'label')).toBe(false); expect(hit({ x: 45, y: 45, width: 10, height: 10 }, 'label')).toBe(true);
    }
  });
  it('handles vertical/horizontal strokes, own rectangles and zero size records', () => {
    const items = [{ key: 'bar', box: { x: 10, y: 20, width: 30, height: 100 } }, { key: 'vertical', box: { x: 70, y: 0, width: 0, height: 100 }, segment: [70, 0, 70, 100] as const }];
    for (const horizontal of [false, true]) { const hit = labelObstacles(items, horizontal); expect(hit({ x: 15, y: 30, width: 10, height: 10 }, 'bar')).toBe(false); expect(hit({ x: 15, y: 30, width: 10, height: 10 }, 'other')).toBe(true); expect(hit({ x: 65, y: 30, width: 10, height: 10 }, 'label')).toBe(true); expect(hit({ x: 90, y: 30, width: 10, height: 10 }, 'label')).toBe(false); }
  });
});

describe('painted obstacles', () => {
  it('uses actual RTL/LTR text anchoring and measured reference label boxes', () => {
    const command = { kind: 'text', key: 'reference', x: 100, y: 50, text: '10', anchor: 'start', baseline: 'middle', fontFamily: 'sans-serif', fontSize: 13, fontWeight: 400 } as const;
    expect(labelPaint([command], measure, false)[0]!.box).toEqual({ x: 100, y: 44, width: 14, height: 12 });
    expect(labelPaint([command], measure, true)[0]!.box).toEqual({ x: 86, y: 44, width: 14, height: 12 });
  });
  it('respects primitive translation and ignores filled area interiors', () => {
    const commands = [{ kind: 'rect', key: 'bar', x: 10, y: 20, width: 30, height: 40, translate: { x: 5, y: -4 } }, { kind: 'path', key: 'area', commands: [{ kind: 'M', x: 0, y: 0 }, { kind: 'L', x: 100, y: 100 }], presentation: { fill: { kind: 'solid', value: '#fff' }, stroke: { kind: 'none' } } }] as const;
    expect(labelPaint(commands, measure, false)).toEqual([{ key: 'bar', box: { x: 15, y: 16, width: 30, height: 40 } }]);
  });
});
