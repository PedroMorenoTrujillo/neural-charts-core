import { expect, it } from 'vitest';
import { validateReferenceBands, projectReferenceBands, referenceBandsScene, type ReferenceBandAxis } from '../../src/internal/axes/reference-bands.js';
import { referenceBandAxes } from '../../src/internal/axes/reference-band-axes.js';
import { createLinearScale } from '../../src/internal/math/linear.js';
import { emptyLayers } from '../../src/internal/axes/scene.js';
import { planColumnAxes } from '../../src/column/axes.js';
import type { ColumnChartSpec } from '../../src/public/column-types.js';
const plot = Object.freeze({ x: 20, y: 10, width: 400, height: 300 }), contracts = { x: { kind: 'linear' }, y: { kind: 'linear' } } as const;
function numeric(domain: readonly [number, number], range: readonly [number, number]): ReferenceBandAxis { const scale = createLinearScale(domain, range, false); if (scale.status === 'invalid') throw Error(JSON.stringify(scale)); return { kind: 'linear', domain, map: scale.value.map }; }
it('clips numeric ranges against actual domains in both physical directions', () => {
  const bands = validateReferenceBands([{ id: 'x', axis: 'x', from: -100, to: 5 }, { id: 'y', axis: 'y', from: 2, to: 7 }], contracts); if (bands.status === 'invalid') throw Error(JSON.stringify(bands));
  for (const reversed of [false, true]) { const result = projectReferenceBands(bands.value, plot, { x: numeric([0, 10], [20, 420]), y: numeric([0, 10], reversed ? [10, 310] : [310, 10]) }); if (result.status === 'invalid') throw Error(JSON.stringify(result)); expect(result.value[0]!.box).toEqual({ x: 20, y: 10, width: 200, height: 300 }); const y = result.value[1]!.box; expect(y.x).toBe(20); expect(y.width).toBe(400); expect(y.y).toBeCloseTo(reversed ? 70 : 100, 8); expect(y.height).toBeCloseTo(150, 8); }
});
it('uses inclusive category identities and actual slots after viewport clipping', () => {
  const ranks = new Map(['jan-a', 'jan-b', 'feb', 'mar'].map((id, i) => [id, i])), axes = { x: { kind: 'category', ranks }, y: { kind: 'linear' } } as const;
  const bands = validateReferenceBands([{ id: 'first', axis: 'x', from: 'jan-a', to: 'feb' }, { id: 'single', axis: 'x', from: 'jan-b', to: 'jan-b' }, { id: 'outside', axis: 'x', from: 'mar', to: 'mar' }], axes); if (bands.status === 'invalid') throw Error(JSON.stringify(bands));
  const result = projectReferenceBands(bands.value, plot, { x: { kind: 'category', ranks, first: 1, last: 2, slot: rank => [20 + (rank - 1) * 200, 20 + (rank - 1 + 1) * 200] }, y: numeric([0, 10], [310, 10]) }); if (result.status === 'invalid') throw Error(JSON.stringify(result)); expect(result.value).toHaveLength(2); expect(result.value[0]!.box).toEqual(plot); expect(result.value[1]!.box.width).toBe(200);
});
it('maps overflowing raw spans after clipping without nonfinite geometry', () => {
  const bands = validateReferenceBands([{ id: 'wide', axis: 'x', from: -Number.MAX_VALUE, to: Number.MAX_VALUE }], contracts); if (bands.status === 'invalid') throw Error(JSON.stringify(bands)); const result = projectReferenceBands(bands.value, plot, { x: numeric([-Number.MAX_VALUE, Number.MAX_VALUE], [20, 420]), y: numeric([0, 10], [310, 10]) }); if (result.status === 'invalid') throw Error(JSON.stringify(result)); expect(result.value[0]!.box).toEqual(plot);
});
it('preserves readonly raw ranges and writes only the existing reference-bands layer', () => {
  const input = Object.freeze([Object.freeze({ id: 'range', axis: 'x', from: -2, to: 8, color: '#ABCDEF', opacity: .2, label: 'Original range' })]), before = JSON.stringify(input), bands = validateReferenceBands(input, contracts); if (bands.status === 'invalid') throw Error(JSON.stringify(bands)); const projected = projectReferenceBands(bands.value, plot, { x: numeric([0, 10], [20, 420]), y: numeric([0, 10], [310, 10]) }); if (projected.status === 'invalid') throw Error(JSON.stringify(projected)); const layers = emptyLayers(); referenceBandsScene(projected.value, '#123456', layers);
  expect(layers['reference-bands']).toEqual([{ kind: 'rect', key: 'band:5:range', x: 20, y: 10, width: 320, height: 300, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: '#abcdef' }, fillOpacity: .2 } }]); expect(layers.marks).toEqual([]); expect(JSON.stringify(input)).toBe(before); expect(bands.value[0]!.from).toBe(-2);
});
it('rejects getters, duplicate/unknown/reversed categories, unsafe colors and invalid time ranges', () => {
  const axes = { x: { kind: 'category', ranks: new Map([['a', 0], ['b', 1]]) }, y: { kind: 'time' } } as const;
  for (const input of [[{ id: 'x', axis: 'x', from: 'b', to: 'a' }], [{ id: 'x', axis: 'x', from: 'unknown', to: 'b' }], [{ id: 'x', axis: 'y', from: 0, to: Infinity }], [{ id: 'x', axis: 'y', from: 0, to: .5 }], [{ id: 'x', axis: 'y', from: -8.65e15, to: 1 }], [{ id: 'x', axis: 'x', from: 'a', to: 'b', color: 'url(unsafe)' }], [{ id: 'x', axis: 'x', from: 'a', to: 'b', opacity: 2 }], [{ id: 'x', axis: 'x', from: 'a', to: 'b' }, { id: 'x', axis: 'x', from: 'a', to: 'b' }]]) expect(validateReferenceBands(input, axes).status).toBe('invalid');
  let called = 0; const input = Object.defineProperty({ id: 'safe', axis: 'x', to: 'b' }, 'from', { enumerable: true, get() { called++; return 'a'; } }); expect(validateReferenceBands([input], axes).status).toBe('invalid'); expect(called).toBe(0);
});
const font = { family: 'sans-serif', size: 12, weight: 400 } as const, measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
const ids = ['jan-a', 'jan-b', 'feb', 'mar', 'apr'], original = { x: { kind: 'category', values: ids.map(id => ({ id, label: 'Repeated' })) }, y: { kind: 'linear', domain: [0, 10], nice: false } } as const;
it('maps logical Bar category/value ranges onto actual physical dimensions', () => {
  for (const reversed of [false, true]) { const axes = { ...original, y: { ...original.y, reversed } }, spec: ColumnChartSpec = { family: 'column', orientation: 'horizontal', title: 'Bar', axes, series: [] }, plan = planColumnAxes(spec, [0, 10], 768, 400, font, new Map(ids.map(id => [id, 'Repeated'])), measurer, false); if (plan.status === 'invalid') throw Error(JSON.stringify(plan)); const p = plan.value.plot, result = projectReferenceBands([{ id: 'rows', axis: 'x', from: 'jan-b', to: 'mar' }, { id: 'values', axis: 'y', from: 2, to: 4 }], p, referenceBandAxes(plan.value, axes, axes, true)); if (result.status === 'invalid') throw Error(JSON.stringify(result));
    const rows = result.value[0]!.box, values = result.value[1]!.box; expect(rows.x).toBe(p.x); expect(rows.width).toBe(p.width); expect(rows.y).toBeCloseTo(p.y + p.height / 5, 8); expect(rows.height).toBeCloseTo(3 * p.height / 5, 8); expect(values.x).toBeCloseTo(p.x + (reversed ? .6 : .2) * p.width, 8); expect(values.width).toBeCloseTo(.2 * p.width, 8); expect(values.y).toBe(p.y); expect(values.height).toBe(p.height);
  }
});
it('retains original identities while clipping into a real scoped Bar frame', () => {
  const axes = { ...original, x: { ...original.x, values: original.x.values.slice(1, 4) } }, spec: ColumnChartSpec = { family: 'column', orientation: 'horizontal', title: 'Scoped Bar', axes, series: [] }, plan = planColumnAxes(spec, [0, 10], 768, 400, font, new Map(ids.map(id => [id, 'Repeated'])), measurer, false); if (plan.status === 'invalid') throw Error(JSON.stringify(plan)); const p = plan.value.plot, result = projectReferenceBands([{ id: 'inclusive', axis: 'x', from: 'jan-a', to: 'feb' }], p, referenceBandAxes(plan.value, axes, original, true)); if (result.status === 'invalid') throw Error(JSON.stringify(result)); expect(result.value).toHaveLength(1); expect(result.value[0]!.box.y).toBeCloseTo(p.y, 8); expect(result.value[0]!.box.height).toBeCloseTo(p.height * 2 / 3, 8);
});
