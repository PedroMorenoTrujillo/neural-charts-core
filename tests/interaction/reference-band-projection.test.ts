import { expect, it } from 'vitest';
import { projectReferenceBands, referenceBandsScene, validateReferenceBands } from '../../src/internal/axes/reference-bands.js';
import type { ReferenceBand, ReferenceBandAxis } from '../../src/internal/axes/reference-bands.js';
import { emptyLayers } from '../../src/internal/axes/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { drawReferenceBands, parseReferenceBands, referenceBandContext, referenceLabelScene } from '../../src/internal/axes/reference-band-view.js';
import { referenceBandAxes } from '../../src/internal/axes/reference-band-axes.js';
import type { AxesPlan } from '../../src/internal/axes/plan.js';

const plot = {x: 10, y: 20, width: 100, height: 200};
const ranks = new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
const x = {type: 'category', dimension: 'y', ranks, first: 1, last: 2, slot: (rank: number) => [40 + rank * 40, 80 + rank * 40]} as const satisfies ReferenceBandAxis;
const y = {type: 'linear', dimension: 'x', domain: [0, 50], map: (value: number) => 110 - 2 * value} as const satisfies ReferenceBandAxis;
const bands = [
  {id: 'period', axis: 'x', from: 'a', to: 'c', color: '#112233', opacity: .4},
  {id: 'limit', axis: 'y', from: 10, to: 20, label: 'Permitted'},
] as const satisfies readonly ReferenceBand[];

it('uses physical dimensions and clips semantic ranks when reference bands are transposed', () => {
  const result = projectReferenceBands(bands, plot, {x, y});
  if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic));
  expect(result.value).toEqual([
    {band: bands[0], box: {x: 10, y: 80, width: 100, height: 80}},
    {band: bands[1], box: {x: 70, y: 20, width: 20, height: 200}},
  ]);
  const layers = emptyLayers();
  referenceBandsScene(result.value, '#334455', layers);
  expect(layers['reference-bands']).toMatchObject([
    {key: 'band:6:period', clipKey: 'plot', presentation: {fill: {type: 'solid', value: '#112233'}, fillOpacity: .4}},
    {key: 'band:5:limit', clipKey: 'plot', presentation: {fill: {type: 'solid', value: '#334455'}, fillOpacity: .12}},
  ]);
  expect(layers.labels).toEqual([]);
});

it('produces no drawable band when outside a closed viewport or when its scale collapses', () => {
  const outside = [
    {...bands[0], from: 'd', to: 'd'},
    {...bands[1], from: -10, to: 0},
    {...bands[1], from: 50, to: 60},
  ] as const;
  expect(projectReferenceBands(outside, plot, {x, y})).toEqual({status: 'ok', value: []});
  expect(projectReferenceBands([bands[1]], plot, {x, y: {...y, domain: null}})).toEqual({status: 'ok', value: []});
  expect(projectReferenceBands([bands[1]], plot, {x, y: {...y, map: () => 70}})).toEqual({status: 'ok', value: []});
  expect(projectReferenceBands(bands, {...plot, width: 0}, {x, y})).toEqual({status: 'ok', value: []});
});

it('reports the exact reference owner when parsed and represented domains disagree', () => {
  const errors = [
    [{...bands[0], from: 0}, 'BAD_REFERENCE_BAND', 'period'],
    [{...bands[0], to: 'lost'}, 'BAD_REFERENCE_BAND', 'period'],
    [{...bands[0], from: 'd'}, 'BAD_REFERENCE_BAND', 'period'],
    [{...bands[1], from: 'x'}, 'BAD_REFERENCE_BAND', 'limit'],
    [{...bands[1], to: 'x'}, 'BAD_REFERENCE_BAND', 'limit'],
    [{...bands[1], from: 30}, 'BAD_REFERENCE_BAND', 'limit'],
  ] as const;
  for (const [band, reason, path] of errors) expect(projectReferenceBands([band], plot, {x, y})).toMatchObject({
    status: 'invalid', diagnostic: {reason, path},
  });
  expect(projectReferenceBands([bands[0]], plot, {x: {...x, slot: () => null}, y})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_REFERENCE_BAND', path: 'period'},
  });
  for (const broken of [() => null, () => Infinity, (value: number) => value === 20 ? NaN : 90]) {
    expect(projectReferenceBands([bands[1]], plot, {x, y: {...y, map: broken}})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_REFERENCE_BAND', path: 'limit'},
    });
  }
  expect(projectReferenceBands(bands, {...plot, height: -1}, {x, y})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_PLOT', path: 'referenceBands.plot'},
  });
  expect(validateReferenceBands(new Proxy([...bands], {ownKeys() { throw Error('Invalid transport'); }}), {x, y}))
    .toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_REFERENCE_BANDS', path: 'referenceBands'}});
});

const palette = defaultPalette('dark', false);
const numericAxes = {x: {type: 'linear'}, y: {type: 'linear'}} as const;
const basePlan = {
  plot, tooSmall: false, x: {domain: [0,50], ticks: [], labels: [], interval: null, target: 2},
  y: {domain: [0,50], ticks: [], labels: [], interval: null, target: 2},
  mapX: (value: string | number) => typeof value === 'number' ? plot.x + value * 2 : null,
  mapY: (value: number) => plot.y + plot.height - 4 * value,
  font: {family: 'sans-serif', size: 12, weight: 400}, direction: 'rtl', xTitle: null, yTitle: null,
} as const satisfies AxesPlan;
const measurer = {
  measure: (text: string) => ({width: text.length * 6, height: 12, baseline: 9}),
  invalidate() {}, destroy() {},
};

it('paints an outline over opaque marks and hides labels that collide or cannot fit', () => {
  const layers = emptyLayers();
  referenceLabelScene({type: 'text', key: 'existing', x: 42, y: 30, text: 'Old', anchor: 'middle'}, basePlan, palette, layers, measurer);
  const labels = [
    {id: 'occupied', axis: 'x', from: 10, to: 28, label: 'Overlap'},
    {id: 'good', axis: 'x', from: 27, to: 49, label: 'Fit', color: '#aabbcc', opacity: .5},
    {id: 'zero', axis: 'y', from: 20, to: 35, label: 'Hidden', opacity: 0},
    {id: 'narrow', axis: 'x', from: 46, to: 49, label: 'Longer'},
    {id: 'short', axis: 'y', from: 2, to: 4, label: 'Tiny'},
  ] as const satisfies readonly ReferenceBand[];
  expect(drawReferenceBands(labels, basePlan, numericAxes, numericAxes, palette, layers, measurer, false, true).status).toBe('ok');
  expect(layers['reference-bands']).toEqual([]);
  expect(layers['reference-lines']).toHaveLength(5);
  expect(layers['reference-lines'][1]).toMatchObject({key: 'band-outline:4:good', clipKey: 'plot', presentation: {
    fill: {type: 'none'}, stroke: {type: 'solid', value: '#aabbcc'},
  }});
  expect(layers.labels.map(label => label.key)).toEqual(['existing-backplate','existing','band-label:4:good-backplate','band-label:4:good']);
  expect(layers.labels[0]).toMatchObject({x: 31, y: 22, width: 22, height: 16, clipKey: 'plot'});
  expect(layers.labels[2]).toMatchObject({x: 66, y: 22, width: 22, height: 16, clipKey: 'plot'});
  expect(layers.labels[3]).toMatchObject({text: 'Fit', x: 86, y: 30, anchor: 'start'});
  expect(drawReferenceBands(labels, {...basePlan, tooSmall: true}, numericAxes, numericAxes, palette, emptyLayers(), measurer).status).toBe('ok');
});

it('retains UTC, category and original label provenance in the accessible reference context', () => {
  const timeAndCategory = {
    x: {type: 'category', values: [{id: 'a', label: 'Repeated'}, {id: 'b', label: 'Repeated'}]},
    y: {type: 'time'},
  } as const;
  const values = [
    {id: 'category', axis: 'x', from: 'a', to: 'b', label: 'Observed'},
    {id: 'session', axis: 'y', from: 0, to: 60_000},
  ] as const satisfies readonly ReferenceBand[];
  const validated = parseReferenceBands(values, timeAndCategory);
  expect(validated.status).toBe('ok');
  const context = referenceBandContext(values, timeAndCategory);
  expect(context).toContain('Observed. X from Repeated (a) to Repeated (b)');
  expect(context).toContain('session. Y from 0 UTC epoch ms to 60000 UTC epoch ms');
  expect(referenceBandContext(undefined, timeAndCategory)).toBe('');
  expect(parseReferenceBands(values, {...timeAndCategory, x: {type: 'category'}})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNKNOWN_CATEGORY', path: 'referenceBands[0]'},
  });
  expect(drawReferenceBands(values, basePlan, numericAxes, numericAxes, palette, emptyLayers(), measurer)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_REFERENCE_BAND', path: 'category'},
  });
});

it('retains an original rank and reversed directions for one visible categorical slot', () => {
  const original = {x: {type: 'category', values: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}, y: {type: 'linear'}} as const;
  const scoped = {...original, x: {...original.x, reversed: true, values: [{id: 'b'}]}} as const;
  const drawn = {...basePlan, mapX: (value: string | number) => value === 'b' ? plot.x + plot.width / 2 : null};
  const axis = referenceBandAxes(drawn, scoped, original).x;
  if (axis.type !== 'category') throw Error('Expected category slots');
  expect([axis.first, axis.last]).toEqual([1, 1]);
  expect(axis.slot(1)).toEqual([110,10]);
  for (const rank of [NaN, .5, 0, 2]) expect(axis.slot(rank)).toBeNull();
  const missing = referenceBandAxes({...drawn, mapX: () => null}, scoped, original).x;
  if (missing.type !== 'category') throw Error('Expected category slots');
  expect(missing.slot(1)).toBeNull();
});
