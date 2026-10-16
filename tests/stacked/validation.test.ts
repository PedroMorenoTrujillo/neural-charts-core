import { expect, test } from 'vitest';
import type { ChartResult } from '../../src/public/chart-types.js';
import { validateStacked } from '../../src/stacked/validate.js';
import { normalizeColumn } from '../../src/column/normalize.js';
import { projectStacked, stackedDomain } from '../../src/stacked/geometry.js';
import { stackContext, stackEmptyStatus, stackedTooltip } from '../../src/stacked/semantics.js';
import { tooltipModel, detailText } from '../../src/internal/tooltip/model.js';

function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
function spec(stacking: 'sum' | 'percent' = 'sum', values: readonly (number | null)[] = [2, 3, 5]) {
  return { family: 'stacked', stacking, title: 'Visible totals', axes: { x: { kind: 'category', values: [{ id: 'a', label: 'January' }] }, y: { kind: 'linear' } }, series: values.map((y, i) => ({ id: 's' + i, name: 'Series ' + i, data: [{ id: 'p' + i, x: 'a', y }] })) };
}
function setup(source: unknown) {
  const checked = value(validateStacked(source)), data = normalizeColumn(checked), state = { hiddenSeriesIds: [] }, domain = value(stackedDomain(data, state, checked.stacking));
  if (!domain) throw Error('domain');
  const projection = value(projectStacked(data, state, { x: 20, y: 30, width: 500, height: 300 }, domain, checked.stacking));
  const sources = data.series.map(series => ({ id: series.spec.id, name: series.spec.name, color: '#255eb8', dash: 'solid' as const, byX: series.byX }));
  return { checked, data, projection, sources };
}
test('sum/percent validation preserves public inputs and retains a private immutable mode', () => {
  for (const mode of ['sum', 'percent'] as const) {
    const source = spec(mode), before = JSON.stringify(source), result = value(validateStacked(source));
    expect(JSON.stringify(source)).toBe(before); expect(result.stacking).toBe(mode); expect(result.family).toBe('column');
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.series)).toBe(true);
    expect(result.axes.y.title).toBe(mode === 'percent' ? 'Percent of visible total' : undefined);
  }
  const original = spec('percent'), axes = { ...original.axes, y: { ...original.axes.y, title: 'Consumer title' } };
  expect(value(validateStacked({ ...original, axes })).axes.y.title).toBe('Consumer title');
});
test('family/mode/unknown fields, bar subslots and foreign prototypes are never laundered', () => {
  const base = spec();
  for (const source of [null, [], { ...base, family: 'column' }, { ...base, stacking: 'normalized' }, { ...base, stacking: undefined }, { ...base, barGap: undefined }, { ...base, extra: 1 }, Object.assign(Object.create({ inherited: true }), base), { ...base, [Symbol('extra')]: 1 }]) expect(validateStacked(source).status).toBe('invalid');
});
test('accessors at family, mode and nested datum are rejected without execution', () => {
  let executions = 0;
  for (const key of ['family', 'stacking']) {
    const source = Object.defineProperty(spec(), key, { get() { executions++; return key === 'family' ? 'stacked' : 'sum'; }, enumerable: true });
    expect(validateStacked(source).status).toBe('invalid');
  }
  const source = spec(), point = Object.defineProperty({ ...source.series[0]!.data[0] }, 'y', { get() { executions++; return 2; }, enumerable: true });
  expect(validateStacked({ ...source, series: [{ ...source.series[0], data: [point] }] }).status).toBe('invalid');
  expect(executions).toBe(0);
});
test('percent negatives remain invalid even when their series is controlled-hidden', () => {
  expect(validateStacked({ ...spec('percent', [4, -2]), state: { mode: 'controlled', value: { hiddenSeriesIds: ['s1'] } } })).toMatchObject({ status: 'invalid', diagnostic: { reason: 'NEGATIVE_PERCENT_VALUE' } });
});
test('sum tooltip reports the original segment value and separate signed known totals', () => {
  const { data, projection: p, sources } = setup(spec('sum', [4, -3, null]));
  const target = p.rects[0]!, model = tooltipModel(8, target.series.spec.id, target.point.id, target.point.x, 'category', 'point', sources, data.labels);
  const result = stackedTooltip(target, model, p);
  expect(result.rows.map(row => row.value)).toEqual([4]);
  expect(result.context).toContain('Positive total: 4'); expect(result.context).toContain('Negative total: -3'); expect(result.context).toContain('Net total: 1'); expect(result.context).toContain('Incomplete total');
  expect(detailText(result, 'Raw values')).toContain(result.context);
  expect(stackContext(data)).toContain('Table values are original');
});
test('percent tooltip preserves raw rows and carries the derived share context', () => {
  const { data, projection: p, sources } = setup(spec('percent'));
  const target = p.rects[0]!, model = tooltipModel(8, target.series.spec.id, target.point.id, target.point.x, 'category', 'shared', sources, data.labels);
  const result = stackedTooltip(target, model, p);
  expect(result.rows.map(row => row.value)).toEqual([2, 3, 5]); expect(result.context).toContain('20%'); expect(result.context).toContain('Raw total: 10');
  expect(stackContext(data)).toContain('hidden series are excluded');
});
test('overflowing raw percent totals are explicitly described without an infinite display value', () => {
  const { data, projection: p, sources } = setup(spec('percent', [Number.MAX_VALUE, Number.MAX_VALUE]));
  const target = p.rects[0]!, model = tooltipModel(1, target.series.spec.id, target.point.id, 'a', 'category', 'point', sources, data.labels);
  const result = stackedTooltip(target, model, p);
  expect(result.context).toContain('50%'); expect(result.context).toContain('exceeds finite numeric range'); expect(result.context).not.toMatch(/NaN|Infinity/);
});
test('undefined percentage state is distinct from ordinary clipping or absent observations', () => {
  for (const values of [[0, 0], [2, null]]) {
    const { projection: p } = setup(spec('percent', values)); expect(p.rects).toEqual([]); expect(stackEmptyStatus(p)).toContain('undefined');
  }
  const source = spec('percent'), cropped = { ...source, axes: { ...source.axes, y: { ...source.axes.y, domain: [200, 300] } } };
  const { projection: p } = setup(cropped); expect(p.rects).toEqual([]); expect(stackEmptyStatus(p)).toBeNull();
  expect(stackEmptyStatus(setup(spec('sum')).projection)).toBeNull();
});
