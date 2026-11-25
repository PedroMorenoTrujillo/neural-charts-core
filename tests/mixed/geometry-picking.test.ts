import { expect, it } from 'vitest';
import { pickMixed, projectMixed } from '../../src/mixed/geometry.js';
import { normalizeMixed } from '../../src/mixed/data.js';
import { createMixedCategoryFrame } from '../../src/mixed/frame.js';
import { validateMixed } from '../../src/mixed/validate.js';
import type { AxesPlan } from '../../src/internal/axes/plan.js';

const plot = {x: 10, y: 20, width: 280, height: 200};
const categories = [{id: 'month-1', label: 'Month'}, {id: 'month-2', label: 'Month'}];
const values = (id: string, left: number, right: number) => [
  {id: id + '-1', x: 'month-1', y: left},
  {id: id + '-2', x: 'month-2', y: right},
];
const spec = {
  family: 'mixed', title: 'Actual and projected', axes: {x: {type: 'category', values: categories}, y: {type: 'linear'}},
  series: [
    {id: 'area', name: 'Context', type: 'area', data: values('area', 30, 85)},
    {id: 'column', name: 'Actual', type: 'column', data: values('column', 50, 30)},
    {id: 'line', name: 'Projected', type: 'line', data: values('line', 70, 65)},
  ],
};
const visibility = {hiddenSeriesIds: []};
const validated = validateMixed(spec);
if (validated.status === 'invalid') throw Error(JSON.stringify(validated.diagnostic));
const model = normalizeMixed(validated.value);
const frame = createMixedCategoryFrame(categories.map(category => category.id), plot);
if (frame.status === 'invalid') throw Error(JSON.stringify(frame.diagnostic));
const defaultAxes = {
  plot, tooSmall: false, x: {domain: null, labels: [], ticks: [], interval: null, target: 2},
  y: {domain: [0, 100], labels: [], ticks: [], interval: null, target: 5},
  mapX: (x: string | number) => typeof x === 'string' ? frame.value.points.center(x) : null,
  mapY: (y: number) => plot.y + plot.height - y * 2, xTitle: null, yTitle: null,
  font: {family: 'sans-serif', size: 12, weight: 400}, direction: 'ltr',
} as const satisfies AxesPlan;
const sourceId = (target: ReturnType<typeof pickMixed>) => target?.series.series.spec.id ?? null;

it('selects the visible line marker, column interior and exposed area at the same category', () => {
  const result = projectMixed(model, visibility, defaultAxes, frame.value);
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  const p = result.value;
  const first = defaultAxes.mapX('month-1')!;
  const second = defaultAxes.mapX('month-2')!;
  expect(sourceId(pickMixed(p, first, defaultAxes.mapY(70)))).toBe('line');
  expect(sourceId(pickMixed(p, first, defaultAxes.mapY(30)))).toBe('column');
  expect(sourceId(pickMixed(p, second, defaultAxes.mapY(85)))).toBe('area');
  expect(pickMixed(p, first, defaultAxes.mapY(99))).toBeNull();
  expect(pickMixed(p, first, Infinity)).toBeNull();
  expect(pickMixed(p, NaN, 20)).toBeNull();
  expect(p.index.targets.map(row => row.map(target => target.series.series.spec.id))).toEqual([
    ['area', 'area'], ['column', 'column'], ['line', 'line'],
  ]);
});

it('preserves deliberate empty layouts and reports missing mixed frames and category bands', () => {
  const tiny = projectMixed(model, visibility, {...defaultAxes, tooSmall: true}, null);
  expect(tiny).toMatchObject({status: 'ok', value: {frame: null, column: null}});
  if (tiny.status === 'ok') expect(pickMixed(tiny.value, 20, 25)).toBeNull();
  expect(projectMixed(model, visibility, defaultAxes, null)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'MISSING_MIXED_FRAME', path: 'plot'},
  });
  expect(projectMixed(model, visibility, {...defaultAxes, y: {...defaultAxes.y, domain: null}}, frame.value)).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'MISSING_MIXED_FRAME', path: 'plot'},
  });
  expect(projectMixed(model, visibility, defaultAxes, frame.value, {firstId: 'missing', lastId: 'month-1'})).toMatchObject({
    status: 'invalid', diagnostic: {path: 'viewport.x'},
  });
});
