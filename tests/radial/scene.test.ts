import { expect, test } from 'vitest';
import fc from 'fast-check';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { RadialChartSpec, PieChartSpec, DonutChartSpec } from '../../src/public/radial-types.js';
import { validateRadial } from '../../src/radial/validate.js';
import { projectRadial } from '../../src/radial/geometry.js';
import { describeRadialData } from '../../src/radial/describe.js';
import { radialScene, radialFocusScene } from '../../src/radial/scene.js';
import { insideLabelInk } from '../../src/radial/contrast.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { emptyLayers, frame } from '../../src/internal/axes/scene.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const state = { hiddenSliceIds: [] }, font = { family: 'sans-serif', size: 12, weight: 400 } as const;
function fixture(): PieChartSpec;
function fixture(family: 'pie'): PieChartSpec;
function fixture(family: 'donut'): DonutChartSpec;
function fixture(family: 'pie' | 'donut'): RadialChartSpec;
function fixture(family: 'pie' | 'donut' = 'pie'): RadialChartSpec { return { family, title: 'Contribution', data: [{ id: 'a', label: 'A', value: 2 }, { id: 'b', label: 'B', value: 3 }, { id: 'c', label: 'C', value: 5 }] }; }
function scene(spec: RadialChartSpec, width = 768, height = 280, measure = (text: string) => text.length * 6) {
  const projection = value(projectRadial(spec, state, { x: 0, y: 0, width, height })), description = describeRadialData(spec, state, projection.data), layers = emptyLayers();
  value(radialScene(projection, spec, description, defaultPalette('light', false), font, (text, font) => ({ width: measure(text), height: font.size * 1.25, baseline: font.size }), layers));
  expect(validateSceneFrame(frame(1, width, height, layers)).status).toBe('ok'); return { projection, description, layers };
}
test('Pie and Donut produce real arc paths, bounded outside labels and stable original IDs', () => {
  for (const family of ['pie', 'donut'] as const) {
    const { layers } = scene(fixture(family)); expect(layers.marks).toHaveLength(3); expect(layers.marks.every(mark => mark.kind === 'path')).toBe(true);
    for (const label of layers.labels) if (label.kind === 'text') { expect(label.x).toBeGreaterThanOrEqual(0); expect(label.x).toBeLessThanOrEqual(768); expect(label.y).toBeGreaterThanOrEqual(0); expect(label.y).toBeLessThanOrEqual(280); }
    expect(layers.labels.some(label => label.key.includes('radial-label'))).toBe(true);
  }
});
test('inside labels have explicit high-contrast ink and fit the actual sector', () => {
  const { layers } = scene({ ...fixture(), labels: 'inside', data: [{ id: 'one', label: 'Only', value: 1, color: '#ffffff' }] });
  const label = layers.labels.find(label => label.key.startsWith('radial-label')); expect(label?.presentation?.fill).toEqual({ kind: 'solid', value: '#000000' });
  const dark = scene({ ...fixture(), labels: 'inside', data: [{ id: 'one', label: 'Only', value: 1, color: '#000000' }] });
  expect(dark.layers.labels.find(label => label.key.startsWith('radial-label'))?.presentation?.fill).toEqual({ kind: 'solid', value: '#ffffff' });
});
test('small Donut centers drop secondary text before encroaching on the ring', () => {
  const { projection, layers } = scene({ ...fixture('donut'), data: [{ id: 'a', label: 'A', value: 123456 }] }, 240, 104);
  const center = layers.labels.filter(label => label.key.startsWith('radial-center')); expect(center).toHaveLength(1);
  expect(center[0]?.key).toBe('radial-center-value'); if (center[0]?.kind === 'text') expect(center[0].y).toBe(projection.frame.cy);
});
test('custom center text is plain content and does not acquire an invented total label', () => {
  const spec = value(validateRadial({ ...fixture('donut'), center: { value: '<b>Custom</b>' } }, 'donut'));
  const { layers, description } = scene(spec); expect(layers.labels.some(label => label.key === 'radial-center-label')).toBe(false);
  expect(layers.labels.find(label => label.key === 'radial-center-value')).toMatchObject({ kind: 'text', text: '<b>Custom</b>' }); expect(description.context).toContain('<b>Custom</b>');
  const disabled = scene({ ...fixture('donut'), center: false }); expect(disabled.layers.labels.some(label => label.key.startsWith('radial-center'))).toBe(false);
});
test('large radial datasets omit dense separators and preserve every slice', () => {
  const spec = { ...fixture(), labels: 'off' as const, data: Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, label: 'Slice ' + i, value: 1 })) }, { layers } = scene(spec);
  expect(layers.marks).toHaveLength(1000); expect(layers.marks.every(mark => !mark.presentation?.stroke)).toBe(true); expect(layers.labels).toEqual([]);
});
test('invalid text metrics fail before writing SVG while unfit labels can be omitted', () => {
  for (const labels of ['outside', 'inside'] as const) for (const width of [NaN, Infinity, -1]) {
    const spec = { ...fixture(), labels }, projection = value(projectRadial(spec, state, { x: 0, y: 0, width: 768, height: 280 })), description = describeRadialData(spec, state, projection.data);
    const result = radialScene(projection, spec, description, defaultPalette('light', false), font, () => ({ width, height: 15, baseline: 12 }), emptyLayers());
    expect(result).toMatchObject({ status: 'invalid', diagnostic: { reason: 'BAD_TEXT_MEASUREMENT' } });
  }
  const unfit = scene(fixture(), 768, 280, () => 10000);
  expect(unfit.layers.marks).toHaveLength(3); expect(unfit.layers.labels).toEqual([]);
});
test('zero and subpixel targets get a focus indicator without an invented sector', () => {
  const { projection } = scene({ ...fixture(), data: [{ id: 'z', label: 'Zero', value: 0 }, { id: 'p', label: 'Positive', value: 2 }] });
  const layers = emptyLayers(); radialFocusScene(projection, projection.byId.get('z')!, defaultPalette('light', false), layers);
  expect(layers.interaction).toMatchObject([{ kind: 'circle', key: 'radial-zero-focus' }]); expect(projection.markById.has('z')).toBe(false);
});
test('black/white choice meets the WCAG text ratio on seeded opaque sRGB fills', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffff }), raw => {
    const color = '#' + raw.toString(16).padStart(6, '0'), ink = insideLabelInk(color, '#ffffff'); expect(ink).not.toBeNull();
    const channels = [raw >>> 16 & 255, raw >>> 8 & 255, raw & 255].map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4));
    const luminance = channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722, contrast = ink === '#ffffff' ? 1.05 / (luminance + .05) : (luminance + .05) / .05;
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }), { seed: 160122, numRuns: 1000 });
  expect(insideLabelInk('#0000', '#fff')).toBe('#000000'); expect(insideLabelInk('#fff8', '#0000')).toBeNull(); expect(insideLabelInk('red', '#fff')).toBeNull();
});
