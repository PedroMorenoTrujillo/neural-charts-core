import {expect, it} from 'vitest';
import {validateLine} from '../../src/line/validate.js';
import {normalizeLine} from '../../src/line/normalize.js';
import {projectLine} from '../../src/line/geometry.js';
import {projectPlanLine} from '../../src/plan/line-projection.js';

const plot = {x: 16, y: 14, width: 700, height: 300};
for (const curve of ['straight', 'step-before', 'step-after', 'step-mid'] as const) for (const gaps of ['break', 'connect'] as const) {
  it(`streams exact ${curve} paths with ${gaps} gaps, offscreen neighbours and raw identities`, () => {
    const source = {family: 'line', title: 'Dense', axes: {x: {type: 'linear'}, y: {type: 'linear', reversed: true}}, series: [
      {id: 's', name: 'Visible', curve, gaps, data: Array.from({length: 3000}, (_, i) => ({id: 'p' + i, x: i, y: i % 113 === 0 ? null : Math.sin(i / 11)}))},
      {id: 'hidden', name: 'Hidden', data: [{id: 'h', x: 10, y: 4}]},
    ]};
    const before = JSON.stringify(source), checked = validateLine(source); if (checked.status === 'invalid') throw Error(checked.diagnostic.reason);
    const data = normalizeLine(checked.value), state = {hiddenSeriesIds: ['hidden']};
    const full = projectLine(data, state, plot, [1200, 1500], [-.5, .5]), streamed = projectPlanLine(data, state, plot, [1200, 1500], [-.5, .5]);
    if (full.status === 'invalid' || streamed.status === 'invalid') throw Error('Expected projection');
    expect(streamed.value.series).toHaveLength(1);
    expect(streamed.value.series[0]!.commands).toEqual(full.value.series[0]!.commands);
    expect(streamed.value.series[0]!.eligible).toEqual(full.value.series[0]!.eligible);
    expect(streamed.value.series[0]!.eligible[0]!.point).toBe(full.value.series[0]!.eligible[0]!.point);
    expect(JSON.stringify(source)).toBe(before);
  });
}

it('keeps isolated observations and duplicate category labels at original logical positions', () => {
  const values = Array.from({length: 6000}, (_, i) => ({id: 'c' + i, label: 'Repeated'}));
  const checked = validateLine({family: 'line', title: 'Category', axes: {x: {type: 'category', values}, y: {type: 'linear'}}, series: [{id: 's', name: 'Source', data: values.map((c, i) => ({id: 'p' + i, x: c.id, y: i % 2 === 0 ? i % 7 : null}))}]});
  if (checked.status === 'invalid') throw Error(checked.diagnostic.reason);
  const data = normalizeLine(checked.value), scales = {mapX: (value: string | number) => (Number(String(value).slice(1)) - 1400) * 7 + plot.x, mapY: (value: number) => plot.y + value * 20};
  const full = projectLine(data, {hiddenSeriesIds: []}, plot, null, [0, 10], scales), streamed = projectPlanLine(data, {hiddenSeriesIds: []}, plot, null, [0, 10], scales);
  if (full.status === 'invalid' || streamed.status === 'invalid') throw Error('Expected projection');
  expect(streamed.value.series[0]!.eligible).toEqual(full.value.series[0]!.eligible);
  expect(streamed.value.series[0]!.commands).toEqual([]);
});

it('preserves invalid offscreen-coordinate rejection and its exact source path', () => {
  const checked = validateLine({family: 'line', title: 'Overflow', axes: {x: {type: 'linear'}, y: {type: 'linear'}}, series: [{id: 's', name: 'Source', data: Array.from({length: 3000}, (_, i) => ({id: 'p' + i, x: i, y: i}))}]});
  if (checked.status === 'invalid') throw Error(checked.diagnostic.reason);
  const data = normalizeLine(checked.value), scales = {mapX: (v: string | number) => v === 42 ? null : Number(v) - 2900, mapY: (v: number) => v};
  expect(projectPlanLine(data, {hiddenSeriesIds: []}, plot, [2900, 2999], [0, 3000], scales)).toEqual(projectLine(data, {hiddenSeriesIds: []}, plot, [2900, 2999], [0, 3000], scales));
});
