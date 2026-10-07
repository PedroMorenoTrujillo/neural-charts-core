import { it, expect } from 'vitest';
import { defaultPalette, resolveDashes } from '../../src/internal/chart/presentation.js';
import { displayLabels } from '../../src/internal/axes/scene.js';
import type { TickLabel } from '../../src/internal/axes/plan.js';

const palette = defaultPalette('light', false), item = (id: string, colorIndex = 0, dash?: 'solid' | 'dashed' | 'dotted', color?: string) => ({ spec: { id, ...(dash ? { dash } : {}), ...(color ? { color } : {}) }, colorIndex });
it('single visible/default series is solid and explicit dash always wins', () => {
  expect(resolveDashes([], new Set(), palette).size).toBe(0);
  expect(resolveDashes([item('s')], new Set(), palette).get('s')).toBe('solid');
  for (const dash of ['solid', 'dashed', 'dotted'] as const) expect(resolveDashes([item('s', 0, dash)], new Set(), palette).get('s')).toBe(dash);
  expect(resolveDashes([item('a'), item('b')], new Set(['b']), palette).get('a')).toBe('solid');
  expect([...resolveDashes([item('a'), item('b')], new Set(['a', 'b']), palette).values()]).toEqual(['solid', 'solid']);
});
it('distinct palette colors stay solid; colliding colors are distinguished independent of reorder', () => {
  expect([...resolveDashes([item('a'), item('b', 1)], new Set(), palette).values()]).toEqual(['solid', 'solid']);
  const series = [item('a'), item('b'), item('c'), item('d')], first = resolveDashes(series, new Set(), palette), reordered = resolveDashes([...series].reverse(), new Set(), palette);
  expect(first.get('a')).toBe('solid'); expect(first.get('b')).toBe('dashed'); expect(first.get('c')).toBe('dotted'); expect(first.get('d')).toBe('solid');
  for (const s of series) expect(reordered.get(s.spec.id)).toBe(first.get(s.spec.id));
});
it('explicit patterns, canonical hex aliases and CSS-token color collisions are respected', () => {
  const series = [item('a', 0, 'solid', '#ABC'), item('b', 1, undefined, '#aabbccff')];
  expect(resolveDashes(series, new Set(), palette).get('b')).toBe('dashed');
  const forced = [item('a', 0, 'solid'), item('b', 0, 'dashed'), item('c', 0, 'dotted'), item('d')];
  expect(resolveDashes(forced, new Set(), palette).get('d')).toBe('solid');
  expect(resolveDashes([item('a'), item('b', 1)], new Set(), { ...palette, series: palette.series.map(() => '#255eb8') }).get('b')).toBe('dashed');
});
const label = (full: string, text: string | null, position: number): TickLabel => ({ value: full, full, text, position, box: { x: position, y: 0, width: 80, height: 15 }, baseline: 12 });
it('redundant interior truncations are visually culled without altering first/last or layout boxes', () => {
  const labels = [label('A long name 0', 'A long…', 0), label('A long name 1', 'A long…', 100), label('Unique', 'Unique', 200), label('A long name 3', 'A long…', 300)], before = JSON.stringify(labels), shown = displayLabels(labels);
  expect(shown.has(labels[0]!)).toBe(true); expect(shown.has(labels[1]!)).toBe(false); expect(shown.has(labels[2]!)).toBe(true); expect(shown.has(labels[3]!)).toBe(true); expect(JSON.stringify(labels)).toBe(before);
});
it('intentional repeated full labels, one truncated full value and empty layouts are retained correctly', () => {
  expect(displayLabels([]).size).toBe(0); expect(displayLabels([label('Absent', null, 0)]).size).toBe(0);
  const repeated = [label('Same', 'Same', 0), label('Same', 'Same', 100), label('Same', 'Same', 200)]; expect(displayLabels(repeated).size).toBe(3);
  const short = [label('A long name', 'A long…', 0), label('A long name', 'A long…', 100), label('A long name', 'A long…', 200)]; expect(displayLabels(short).size).toBe(3);
});
