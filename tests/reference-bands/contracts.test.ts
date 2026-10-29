import { expect, it } from 'vitest';
import { validateLine } from '../../src/line/validate.js';
import { validateVariant } from '../../src/line/variant.js';
import { validateColumn } from '../../src/column/validate.js';
import { validateStacked } from '../../src/stacked/validate.js';
import { validateStackedArea } from '../../src/stacked-area/validate.js';
import { validateMixed } from '../../src/mixed/validate.js';
import { validateScatter } from '../../src/scatter/validate.js';
import { validateHeatmap } from '../../src/heatmap/validate.js';
import { mixedPolicy } from '../../src/mixed/strategy.js';
import { heatmapPolicy } from '../../src/heatmap/strategy.js';
import { referenceBandContext } from '../../src/internal/axes/reference-band-view.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { familyFrame } from '../../src/internal/chart/frame.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
import type { ChartReferenceBand } from '../../src/index.js';
import type { LineChartSpec } from '../../src/line.js';
const axes = { x: { kind: 'category', values: [{ id: 'a', label: 'Repeated' }, { id: 'b', label: 'Repeated' }, { id: 'c' }] }, y: { kind: 'linear', domain: [-2, 8], nice: false } } as const;
const series = [{ id: 's', name: 'Series', data: [{ id: 'p0', x: 'a', y: 0 }, { id: 'p1', x: 'b', y: 5 }, { id: 'p2', x: 'c', y: -1 }] }];
const bands = [{ id: 'category', axis: 'x', from: 'a', to: 'b', label: 'Window' }, { id: 'value', axis: 'y', from: -100, to: 3, label: 'Original range' }] as const;
const base = { title: 'Reference ranges', axes, series, referenceBands: bands };
it('adds ranges to each existing Cartesian validator without widening the value-line union', () => {
  for (const family of ['line', 'spline', 'area', 'column', 'stacked', 'stacked-area', 'mixed']) {
    const spec = { ...base, family, ...(family === 'stacked' || family === 'stacked-area' ? { stacking: 'sum' } : {}), ...(family === 'mixed' ? { series: series.map(s => ({ ...s, kind: 'line' })) } : {}) };
    const checked = family === 'line' ? validateLine(spec) : family === 'spline' || family === 'area' ? validateVariant(spec, family) : family === 'column' ? validateColumn(spec) : family === 'stacked' ? validateStacked(spec) : family === 'stacked-area' ? validateStackedArea(spec) : validateMixed(spec);
    expect(checked.status, family).toBe('ok'); if (checked.status === 'invalid') throw Error(family);
    expect(checked.value.referenceBands).toEqual(bands); expect(Object.isFrozen(checked.value.referenceBands)).toBe(true);
  }
});
it('accepts finite numeric/time X ranges and preserves original endpoints', () => {
  for (const kind of ['linear', 'time']) {
    const spec = { ...base, family: 'line', axes: { x: { kind }, y: axes.y }, series: [{ ...series[0], data: [{ id: 'p', x: 0, y: 1 }] }], referenceBands: [{ id: 'x', axis: 'x', from: -100, to: 100 }] };
    const result = validateLine(spec); expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.value.referenceBands?.[0]?.from).toBe(-100);
  }
  const result = validateScatter({ family: 'scatter', title: 'XY', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 0, y: 1 }] }], referenceBands: [{ id: 'xy', axis: 'x', from: -Number.MAX_VALUE, to: Number.MAX_VALUE }] });
  expect(result.status).toBe('ok');
});
it('rejects invalid range fields in the real validators without invoking getters', () => {
  let invoked = 0; const accessor = Object.defineProperty({ id: 'bad', axis: 'x', to: 'b' }, 'from', { enumerable: true, get() { invoked++; return 'a'; } });
  for (const referenceBands of [[accessor], [{ id: 'b', axis: 'x', from: 'b', to: 'a' }], [{ id: 'b', axis: 'x', from: 'unknown', to: 'a' }], [{ id: 'b', axis: 'y', from: 0, to: Infinity }], Array.from({ length: 17 }, (_, i) => ({ id: String(i), axis: 'y', from: 0, to: 1 })), undefined]) {
    expect(validateLine({ ...base, family: 'line', referenceBands }).status).toBe('invalid');
    expect(validateColumn({ ...base, family: 'column', referenceBands }).status).toBe('invalid');
  }
  expect(invoked).toBe(0);
});
const font = { family: 'sans-serif', size: 12, weight: 400 } as const, palette = defaultPalette('light', false);
const measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
it('uses real Mixed centers and existing Scene layers and preserves raw accessible ranges', () => {
  const policy = mixedPolicy(), parsed = policy.parse({ ...base, family: 'mixed', series: series.map(s => ({ ...s, kind: 'column' })) }); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed));
  const shell = shellFrame({ width: 768, height: 400 }, false, ['Series'], 'bottom', font, 'ltr', measurer), computed = policy.compute(parsed.value, policy.state([]), shell, palette, font, measurer);
  if (computed.status === 'invalid') throw Error(JSON.stringify(computed)); const c = computed.value, plot = c.axes!.plot;
  expect(c.layers['reference-bands']).toHaveLength(2); expect(c.layers['reference-bands'][0]!.kind).toBe('rect');
  const first = c.layers['reference-bands'][0]!; if (first.kind !== 'rect') throw Error('Wrong mark'); expect(first.x).toBeCloseTo(plot.x, 8); expect(first.width).toBeCloseTo(2 * plot.width / 3, 8);
  expect(c.description.context).toContain('Repeated (a)'); expect(c.description.context).toContain('Repeated (b)'); expect(c.description.context).toContain('from -100 to 3');
  expect(validateSceneFrame(familyFrame(1, c.shell.body.width, c.shell.body.height, c.layers, c)).status).toBe('ok');
});
const heatmapAxes = { x: axes.x, y: { kind: 'category', values: [{ id: 'r0', label: 'Repeated' }, { id: 'r1', label: 'Repeated' }] } } as const;
it('supports actual Heatmap category lines and outlined ranges without tinting data colors', () => {
  for (const reversed of [false, true]) {
    const policy = heatmapPolicy(), input = { family: 'heatmap', title: 'Heatmap ranges', axes: { x: { ...heatmapAxes.x, reversed }, y: { ...heatmapAxes.y, reversed } }, data: [{ id: 'p', rowId: 'r1', columnId: 'b', value: 2 }], referenceBands: [{ id: 'row', axis: 'y', from: 'r1', to: 'r1', label: 'Row' }], references: [{ id: 'line', axis: 'y', value: 'r1', label: 'Row center' }] };
    const parsed = policy.parse(input); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed));
    const shell = shellFrame({ width: 768, height: 400 }, false, [], 'bottom', font, 'ltr', measurer), result = policy.compute(parsed.value, policy.state([]), shell, palette, font, measurer); if (result.status === 'invalid') throw Error(JSON.stringify(result)); const c = result.value;
    expect(c.layers['reference-bands']).toEqual([]); const outline = c.layers['reference-lines'].find(node => node.kind === 'rect'), line = c.layers['reference-lines'].find(node => node.kind === 'line');
    expect(outline?.presentation?.fill).toEqual({ kind: 'none' }); expect(line?.kind).toBe('line'); if (line?.kind === 'line') expect(line.y1).toBe(c.axes!.mapY(1));
    expect(c.description.context).toContain('Repeated (r1)'); expect(c.description.context).toContain('References: Row center');
    expect(validateSceneFrame(familyFrame(1, c.shell.body.width, c.shell.body.height, c.layers, c)).status).toBe('ok');
  }
});
it('validates Heatmap categories on both axes and rejects invalid values and duplicate IDs', () => {
  const spec = { family: 'heatmap', title: 'References', axes: heatmapAxes, data: [] };
  for (const references of [[{ id: 'x', axis: 'x', value: 'unknown' }], [{ id: 'x', axis: 'y', value: 0 }], [{ id: 'x', axis: 'y', value: 'r1' }, { id: 'x', axis: 'x', value: 'a' }]]) expect(validateHeatmap({ ...spec, references }).status).toBe('invalid');
  expect(validateHeatmap({ ...spec, references: [{ id: 'x', axis: 'x', value: 'a' }, { id: 'y', axis: 'y', value: 'r1' }] }).status).toBe('ok');
});
it('keeps absent options and empty range prose unchanged', () => {
  expect(referenceBandContext(undefined, axes)).toBe(''); expect(referenceBandContext([], axes)).toBe('');
  const parsed = validateLine({ family: 'line', title: 'No bands', axes, series }); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed)); expect(Object.hasOwn(parsed.value, 'referenceBands')).toBe(false);
});
// Public contracts remain axis-discriminated and readonly.
const range: ChartReferenceBand<string, string> = { id: 'both', axis: 'y', from: 'r0', to: 'r1' }; void range;
// @ts-expect-error Numeric range endpoints are not category IDs.
const invalidCategory: ChartReferenceBand<string> = { id: 'bad', axis: 'x', from: 0, to: 1 }; void invalidCategory;
// @ts-expect-error A numeric X spec cannot acquire category reference ranges.
const invalidLine: LineChartSpec = { family: 'line', title: 'Bad tuple', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [], referenceBands: [{ id: 'bad', axis: 'x', from: 'a', to: 'b' }] }; void invalidLine;
