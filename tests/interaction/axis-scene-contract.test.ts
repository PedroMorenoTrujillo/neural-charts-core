import { describe, expect, it } from 'vitest';
import { axesScene, displayLabels, emptyLayers, referenceScene } from '../../src/internal/axes/scene.js';
import type { AxesPlan, TickLabel } from '../../src/internal/axes/plan.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';

const plot = {x: 20, y: 10, width: 180, height: 100};
const palette = defaultPalette('light', false);
const font = {family: 'sans-serif', size: 12, weight: 400} as const;
const categories = new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
const tick = (value: string | number, full: string, text: string | null, position: number): TickLabel =>
  ({value, full, text, position, box: {x: position - 5, y: 118, width: 10, height: 10}, baseline: 8});
const xLabels = [tick('a', 'Opening', 'Open', 20), tick('b', 'Northbound A', 'North…', 60),
  tick('c', 'Northbound B', 'North…', 100), tick('d', 'Closing', 'Close', 200)];
const yLabels = [tick(0, '0', '0', 110), tick(5, '5', '5', 60), tick(10, '10', null, 10)];
const plan = {
  plot, tooSmall: false, x: {domain: null, ticks: [...categories.keys()], labels: xLabels, interval: null, target: 4},
  y: {domain: [0, 10], ticks: [0, 5, 10], labels: yLabels, interval: null, target: 3},
  direction: 'rtl', font, xTitle: 'Sessions', yTitle: 'Revenue',
  mapX: (x: string | number) => typeof x === 'string' ? xLabels[categories.get(x) ?? -1]?.position ?? null : null,
  mapY: (y: number) => 110 - 10 * y,
} as const satisfies AxesPlan;

describe('axis scene geometry retains source ticks and excludes collisions', () => {
  it('preserves endpoints while culling one of two distinguishable truncated interior labels', () => {
    expect([...displayLabels(xLabels)].map(label => label.value)).toEqual(['a', 'd', 'b']);
    expect([...displayLabels([tick(0, '0', null, 0)])]).toHaveLength(0);
    const layers = emptyLayers();
    axesScene(plan, {type: 'category', grid: true}, {type: 'linear'}, palette, layers, true);
    expect(layers.axes.map(axis => axis.key)).toEqual([
      'x-baseline', 'y-baseline', 'x-tick-0', 'x-tick-1', 'x-tick-2', 'x-tick-3', 'y-tick-0', 'y-tick-1', 'y-tick-2',
    ]);
    expect(layers.grid.map(grid => grid.key)).toEqual(['x-tick-1-grid','x-tick-2-grid','x-tick-3-grid','y-tick-1-grid','y-tick-2-grid']);
    expect(layers.labels.map(label => label.key)).toEqual(['x-tick-0-label','x-tick-1-label','x-tick-3-label','y-tick-0-label','y-tick-1-label','x-title','y-title']);
    expect(layers.labels.find(label => label.key === 'x-title')).toMatchObject({x: 110, y: 145, anchor: 'middle'});
    expect(layers.labels.find(label => label.key === 'y-title')).toMatchObject({y: 10, anchor: 'end'});
  });

  it('honors disabled horizontal/vertical grids and keeps an unusable view empty', () => {
    const tiny = emptyLayers();
    axesScene({...plan, tooSmall: true}, {type: 'category', grid: true}, {type: 'linear'}, palette, tiny);
    expect([...tiny.axes, ...tiny.grid, ...tiny.labels]).toEqual([]);
    const fit = emptyLayers();
    axesScene({...plan, direction: 'ltr'}, {type: 'category', grid: false}, {type: 'linear', grid: false}, palette, fit);
    expect(fit.grid).toEqual([]);
    expect(fit.labels.find(label => label.key === 'x-title')).toMatchObject({y: 143});
    expect(fit.labels.find(label => label.key === 'y-title')).toMatchObject({y: 18, anchor: 'start'});
  });
});

describe('reference rule scene geometry', () => {
  const measure = (text: string) => ({text: text === 'hidden' ? null : text, width: 35, height: 12});
  it('keeps original IDs and paints clipped reference lines even when labels collide', () => {
    const layers = emptyLayers();
    const result = referenceScene([
      {id: 'period', axis: 'x', value: 'b', label: 'North', color: '#112233', dash: 'dotted'},
      {id: 'overlap', axis: 'x', value: 'b', label: 'Same pixel'},
      {id: 'threshold', axis: 'y', value: 2, label: 'Limit'},
      {id: 'too-high', axis: 'y', value: 10, label: 'No safe label box'},
      {id: 'measured-outside', axis: 'y', value: 12, label: 'Outside'},
      {id: 'missing-category', axis: 'x', value: 'unknown'},
      {id: 'unmapped', axis: 'y', value: 'a'},
      {id: 'no-fitting-label', axis: 'y', value: 4, label: 'hidden'},
    ], plan, palette, layers, measure, categories);
    expect(result.map(reference => [reference.id, reference.outside])).toEqual([
      ['period', false], ['overlap', false], ['threshold', false], ['too-high', false], ['measured-outside', true],
      ['missing-category', true], ['unmapped', false], ['no-fitting-label', false],
    ]);
    expect(layers['reference-lines']).toHaveLength(5);
    expect(layers['reference-lines'][0]).toMatchObject({x1: 60, x2: 60, y1: 10, y2: 110, clipKey: 'plot',
      presentation: {stroke: {type: 'solid', value: '#112233'}, lineCap: 'round'}});
    expect(layers['reference-lines'][2]).toMatchObject({x1: 20, x2: 200, y1: 90, y2: 90, clipKey: 'plot',
      presentation: {stroke: {type: 'solid', value: palette.reference}, lineCap: 'butt'}});
    expect(layers.labels).toHaveLength(2);
    expect(layers.labels[0]).toMatchObject({x: 99, y: 20, text: 'North'});
    expect(layers.labels[1]).toMatchObject({x: 59, y: 80, text: 'Limit'});
  });

  it('keeps valid status while suppressing paint before an axis can be laid out', () => {
    const layers = emptyLayers();
    expect(referenceScene([{id: 'r', axis: 'x', value: 'a'}], {...plan, tooSmall: true}, palette, layers, measure, categories))
      .toEqual([{id: 'r', outside: false}]);
    expect(layers.labels).toEqual([]);
    expect(layers['reference-lines']).toEqual([]);
  });
});
