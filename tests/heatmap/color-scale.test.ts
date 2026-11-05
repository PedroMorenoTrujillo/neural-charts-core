import { expect, it } from 'vitest';
import { parseColorStop, parseColorScale, createColorScale } from '../../src/internal/color/scale.js';
const scale = (input: unknown, extent: readonly [number, number] | null = [0, 100]) => {
  const result = createColorScale(parseColorScale(input), extent); if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value;
};
it('accepts only opaque hex or integer sRGB mathematical stops without reading getters', () => {
  expect(parseColorStop('#AbC', 'stop').hex).toBe('#aabbcc'); expect(parseColorStop(Object.freeze({ r: 255, g: 0, b: 127 }), 'stop').hex).toBe('#ff007f');
  for (const input of ['red', '#abcd', '#11223344', 'rgb(0 0 0)', 'var(--stop)', 'oklab(.5 0 0)', '#xyz', { r: 0, g: 0, b: .5 }, { r: NaN, g: 0, b: 0 }, { r: 0, g: 0, b: 0, a: 1 }]) expect(() => parseColorStop(input, 'stop')).toThrow();
  let calls = 0; const input = { g: 0, b: 0 }; Object.defineProperty(input, 'r', { enumerable: true, get() { calls++; return 0; } }); expect(() => parseColorStop(input, 'stop')).toThrow(); expect(calls).toBe(0);
});
it('clips sequential domains and preserves stops exactly at explicit positions', () => {
  const input = Object.freeze({ type: 'sequential', domain: Object.freeze([-10, 90]), colors: Object.freeze(['#000', '#123456', '#fff']), positions: Object.freeze([0, .25, 1]) }), before = JSON.stringify(input), s = scale(input);
  expect(s.color(-100)).toBe('#000000'); expect(s.color(-10)).toBe('#000000'); expect(s.color(15)).toBe('#123456'); expect(s.color(90)).toBe('#ffffff'); expect(s.color(1000)).toBe('#ffffff'); expect(JSON.stringify(input)).toBe(before);
  for (let i = 0; i < 1000; i++) expect(s.color(i / 10)).toMatch(/^#[0-9a-f]{6}$/);
});
it('maps auto constant domains to the perceptual middle, retaining the single domain value', () => {
  const s = scale({ type: 'sequential', colors: ['#000', '#fff'] }, [7, 7]); expect(s.constant).toBe(true); expect(s.domain).toEqual([7, 7]); expect(s.color(7)).toBe('#636363'); expect(s.fraction(7)).toBe(.5);
  expect(() => scale({ type: 'sequential', colors: ['#000', '#fff'], domain: [7, 7] })).toThrow();
});
it('uses robust extreme-domain mapping instead of overflowing the span', () => {
  const s = scale({ type: 'sequential', colors: ['#000', '#fff'], domain: [-Number.MAX_VALUE, Number.MAX_VALUE] });
  expect(s.color(-Number.MAX_VALUE)).toBe('#000000'); expect(s.color(0)).toBe('#636363'); expect(s.color(Number.MAX_VALUE)).toBe('#ffffff');
  expect(() => s.color(NaN)).toThrow(RangeError); expect(() => s.color(Infinity)).toThrow(RangeError);
});
it('joins diverging halves exactly at the declared center under asymmetric spans', () => {
  const s = scale({ type: 'diverging', domain: [-5, 0, 100], colors: ['#ff0000', '#fff', '#0000ff'] });
  expect(s.fraction(-5)).toBe(0); expect(s.fraction(0)).toBe(.5); expect(s.fraction(100)).toBe(1); expect(s.color(0)).toBe('#ffffff'); expect(s.color(-2.5)).toBe(s.colorAtFraction(.25)); expect(s.color(50)).toBe(s.colorAtFraction(.75)); expect(s.color(-100)).toBe('#ff0000'); expect(s.color(1000)).toBe('#0000ff');
});
it('assigns threshold equality to the upper class without treating zero as missing', () => {
  const s = scale({ type: 'threshold', boundaries: [-2, 0, 5], colors: ['#000', '#f00', '#0f0', '#fff'] });
  expect([-10, -2, -.1, 0, 4.9, 5, 100].map(value => s.color(value))).toEqual(['#000000', '#ff0000', '#ff0000', '#00ff00', '#00ff00', '#ffffff', '#ffffff']);
  for (let i = 0; i < 4; i++) expect(s.colorAtFraction((i + .5) / 4)).toBe(s.colors[i]);
});
it('rejects malformed/ambiguous scale contracts rather than silently changing the domain', () => {
  const cases = [
    { type: 'sequential', colors: ['#000'] }, { type: 'sequential', colors: ['#000', '#fff'], domain: [1, -1] },
    { type: 'sequential', colors: ['#000', '#fff'], positions: [0, .9] }, { type: 'sequential', colors: ['#000', '#f00', '#fff'], positions: [0, 0, 1] },
    { type: 'sequential', colors: ['#000', '#fff'], boundaries: [] }, { type: 'diverging', colors: ['#000', '#fff'], domain: [-1, 0, 1] },
    { type: 'diverging', colors: ['#000', '#f00', '#fff'], domain: [-1, -1, 1] }, { type: 'threshold', boundaries: [0, 0], colors: ['#000', '#f00', '#fff'] },
    { type: 'threshold', boundaries: [0], colors: ['#000', '#fff'], domain: [-1, 1] }, { type: 'threshold', boundaries: [0, 1], colors: ['#000', '#fff'] },
  ];
  for (const input of cases) expect(() => scale(input)).toThrow();
});
