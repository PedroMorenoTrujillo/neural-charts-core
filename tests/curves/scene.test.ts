import { expect, test } from 'vitest';
import type { ChartResult } from '../../src/public/chart-types.js';
import { validateVariant } from '../../src/line/variant.js';
import { normalizeLine, lineDomains } from '../../src/line/normalize.js';
import { projectLine } from '../../src/line/geometry.js';
import { areaScene } from '../../src/area/scene.js';
import { splineScene } from '../../src/spline/scene.js';
import { emptyLayers } from '../../src/internal/axes/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
import type { SceneCommand } from '../../src/internal/scene/model.js';

function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
function spec(family: 'spline' | 'area', values: readonly (number | null)[], gaps: 'break' | 'connect' = 'break') {
  return { family, title: 'Observed values', axes: { x: { kind: 'category', values: values.map((_, i) => ({ id: 'c' + i, label: i < 2 ? 'Repeated' : 'Category ' + i })) }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Series', gaps, markers: 'on', data: values.map((y, i) => ({ id: 'p' + i, x: 'c' + i, y })) }] };
}
const plot = Object.freeze({ x: 20, y: 30, width: 500, height: 300 });
function render(input: unknown, family: 'spline' | 'area', hiddenSeriesIds: readonly string[] = []) {
  const checked = value(validateVariant(input, family)), data = normalizeLine(checked), state = { hiddenSeriesIds };
  const domains = value(lineDomains(data, state));
  if (!domains.y) throw Error('No numeric Y domain');
  const projection = value(projectLine(data, state, plot, domains.x, domains.y));
  const layers = emptyLayers();
  value((family === 'area' ? areaScene : splineScene)(projection, defaultPalette('light', false), layers, new Map()));
  expect(validateSceneFrame({ revision: 1, width: 768, height: 400, defs: [{ key: 'plot', kind: 'clip-rect', ...plot }], layers }).status).toBe('ok');
  return { checked, data, domains, projection, layers };
}
const paths = (marks: readonly SceneCommand[]) => marks.filter((mark): mark is Extract<SceneCommand, { kind: 'path' }> => mark.kind === 'path');

test.each([{ values: [10, 20, 30] }, { values: [-10, -20, -30] }, { values: [-10, 20, -5] }, { values: [0, 0, 0] }, { values: [1e-300, 2e-300, 1e-300] }, { values: [1e150, -2e150, 1e150] }])('Area closes at real zero without nonfinite geometry: $values', ({ values }) => {
  const result = render(spec('area', values), 'area'), marks = paths(result.layers.marks);
  const fill = marks.find(mark => mark.presentation?.fillOpacity === .18)!;
  const zero = result.projection.mapY(0)!;
  expect(fill.commands.at(-1)).toEqual({ kind: 'Z' });
  expect(fill.commands.slice(-3, -1).every(command => command.kind === 'L' && command.y === zero)).toBe(true);
  expect(result.domains.y![0]).toBeLessThanOrEqual(0); expect(result.domains.y![1]).toBeGreaterThanOrEqual(0);
  expect(result.layers.marks.filter(mark => mark.kind === 'circle')).toHaveLength(values.length);
});
test('Area gap runs close independently, while connect explicitly joins them', () => {
  for (const gaps of ['break', 'connect'] as const) {
    const result = render(spec('area', [2, 5, null, -4, 2], gaps), 'area');
    const fills = paths(result.layers.marks).filter(mark => mark.presentation?.fillOpacity === .18);
    expect(fills).toHaveLength(gaps === 'break' ? 2 : 1);
    for (const fill of fills) expect(fill.commands.filter(command => command.kind === 'Z')).toHaveLength(1);
    expect(result.data.series[0]!.points[2]!.y).toBeNull();
    expect(result.projection.series[0]!.eligible.map(point => point.point.id)).toEqual(['p0', 'p1', 'p3', 'p4']);
  }
});
test('Area explicit cropping and reversed Y clamp the baseline at the correct physical edge', () => {
  for (const reversed of [false, true]) {
    const source = spec('area', [12, 18, 15]); source.axes.y = { ...source.axes.y, ...{ domain: [10, 20], reversed } };
    const result = render(source, 'area'), fill = paths(result.layers.marks).find(mark => mark.presentation?.fillOpacity === .18)!;
    expect(result.domains.y).toEqual([10, 20]);
    const baseline = reversed ? plot.y : plot.y + plot.height;
    expect(fill.commands.slice(-3, -1).every(command => command.kind === 'L' && command.y === baseline)).toBe(true);
    expect(result.checked.series[0]!.data.map(point => point.y)).toEqual([12, 18, 15]);
  }
});
test('Area singleton runs keep the original marker without fabricating fill width', () => {
  const result = render(spec('area', [null, 4, null]), 'area');
  expect(paths(result.layers.marks)).toHaveLength(0);
  expect(result.layers.marks.filter(mark => mark.kind === 'circle')).toHaveLength(1);
});
test('Spline samples never replace logical points, and gaps remain separate moves', () => {
  const source = spec('spline', [4, 9, 2, null, 3, 8]);
  const result = render(source, 'spline'), commands = paths(result.layers.marks)[0]!.commands;
  expect(commands.filter(command => command.kind === 'M')).toHaveLength(2);
  expect(commands.length).toBeGreaterThan(5);
  expect(result.projection.series[0]!.eligible.map(point => point.point.id)).toEqual(['p0', 'p1', 'p2', 'p4', 'p5']);
  expect(result.layers.marks.filter(mark => mark.kind === 'circle')).toHaveLength(5);
  expect(source.family).toBe('spline'); expect(source.series[0]!.data[3]!.y).toBeNull();
});
test('hidden series change domains and marks without mutating immutable source', () => {
  const source = spec('area', [1, 4, 2]);
  source.series.push({ ...source.series[0]!, id: 'large', name: 'Large', data: source.series[0]!.data.map(point => ({ ...point, y: 1000 })) });
  const freeze = (input: unknown): void => { if (input && typeof input === 'object' && !Object.isFrozen(input)) { Object.freeze(input); for (const item of Object.values(input)) freeze(item); } };
  freeze(source); const before = JSON.stringify(source);
  const visible = render(source, 'area'), hidden = render(source, 'area', ['large']);
  expect(visible.domains.y![1]).toBeGreaterThanOrEqual(1000); expect(hidden.domains.y![1]).toBeLessThan(1000);
  expect(hidden.projection.series).toHaveLength(1); expect(JSON.stringify(source)).toBe(before);
});
test('variant parsing preserves Core validation and never executes accessors', () => {
  let reads = 0;
  const source = spec('spline', [2, 3]);
  const getter = { ...source }; Object.defineProperty(getter, 'title', { enumerable: true, get() { reads++; return 'unsafe'; } });
  expect(validateVariant(getter, 'spline').status).toBe('invalid'); expect(reads).toBe(0);
  const family = { ...source }; Object.defineProperty(family, 'family', { enumerable: true, get() { reads++; return 'spline'; } });
  expect(validateVariant(family, 'spline').status).toBe('invalid'); expect(reads).toBe(0);
  expect(validateVariant({ ...source, family: 'line' }, 'spline').status).toBe('invalid');
  expect(validateVariant(Object.assign(Object.create({ foreign: true }), source), 'spline').status).toBe('invalid');
  expect(validateVariant({ ...source, extra: 1 }, 'spline').status).toBe('invalid');
  expect(validateVariant({ ...source, series: [{ ...source.series[0], curve: 'straight' }] }, 'spline').status).toBe('invalid');
  const area = spec('area', [1, 2]);
  expect(validateVariant({ ...area, axes: { ...area.axes, y: { kind: 'linear', includeZero: false } } }, 'area').status).toBe('invalid');
  expect(validateVariant({ ...source, series: [{ ...source.series[0], data: [{ id: 'a', x: 'c0', y: 2 }, { id: 'b', x: 'c0', y: 3 }] }] }, 'spline').status).toBe('invalid');
});
