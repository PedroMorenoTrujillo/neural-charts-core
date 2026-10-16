import { expect, test } from 'vitest';
import { validateScatter, validateScatterOptions } from '../../src/scatter/validate.js';
import { describeScatter } from '../../src/scatter/describe.js';
import type { ScatterChartSpec } from '../../src/scatter.js';
const basic: ScatterChartSpec = { family: 'scatter', title: 'Measurements', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Set', data: [{ id: 'a', x: 4, y: -2 }, { id: 'b', x: 0, y: 0 }, { id: 'duplicate', x: 4, y: -2 }, { id: 'missing', x: null, y: 5 }] }] };
test('descriptor-safe structural copies preserve opaque datum and immutable XY order', () => {
  const datum = Object.freeze({ raw: true }), spec = Object.freeze({ ...basic, series: Object.freeze([Object.freeze({ ...basic.series[0]!, data: Object.freeze(basic.series[0]!.data.map(point => Object.freeze({ ...point, datum }))) })]) }), before = JSON.stringify(spec), parsed = validateScatter<typeof datum>(spec);
  expect(parsed.status).toBe('ok'); if (parsed.status !== 'ok') return;
  expect(parsed.value).not.toBe(spec); expect(Object.isFrozen(parsed.value)).toBe(true); expect(parsed.value.series[0]!.data[0]!.datum).toBe(datum); expect(Object.isFrozen(parsed.value.series[0]!.data[0])).toBe(true); expect(JSON.stringify(spec)).toBe(before);
});
test('accessors are rejected without invocation, opaque payloads are not inspected', () => {
  let calls = 0; const trap = { ...basic }; Object.defineProperty(trap, 'title', { get() { calls++; return 'Trap'; }, enumerable: true }); expect(validateScatter(trap).status).toBe('invalid'); expect(calls).toBe(0);
  const point = { id: 'a', x: 1 }; Object.defineProperty(point, 'y', { get() { calls++; return 2; }, enumerable: true }); expect(validateScatter({ ...basic, series: [{ id: 's', name: 'Set', data: [point] }] }).status).toBe('invalid'); expect(calls).toBe(0);
  const opaque = new Proxy({}, { get() { throw Error('Do not inspect opaque domain payload'); } }); expect(validateScatter({ ...basic, series: [{ id: 's', name: 'Set', data: [{ id: 'a', x: 1, y: 2, datum: opaque }] }] }).status).toBe('ok');
});
test('nonfinite/undefined coordinates and fake category/string X reject atomically', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 'January']) for (const axis of ['x', 'y']) expect(validateScatter({ ...basic, series: [{ id: 's', name: 'Set', data: [{ id: 'a', x: 1, y: 2, [axis]: value }] }] }).status).toBe('invalid');
  for (const point of [{ id: 'a', x: null, y: null }, { id: 'a', x: 0, y: -0 }, { id: 'a', x: Number.MAX_VALUE, y: Number.MIN_VALUE }]) expect(validateScatter({ ...basic, series: [{ id: 's', name: 'Set', data: [point] }] }).status).toBe('ok');
});
test('resource limits, sparse arrays and duplicate identities are not concealed', () => {
  for (const series of [Array.from({ length: 17 }, (_, i) => ({ id: String(i), name: 'Set', data: [] })), [{ id: 's', name: 'Set', data: new Array(3) }], [basic.series[0], basic.series[0]], [{ id: 's', name: 'Set', data: [{ id: 'a', x: 1, y: 2 }, { id: 'a', x: 2, y: 3 }] }], [{ id: 's', name: 'Set', data: Array.from({ length: 50001 }, (_, i) => ({ id: String(i), x: 1, y: 2 })) }]]) expect(validateScatter({ ...basic, series }).status).toBe('invalid');
  const symbol = { ...basic, [Symbol('extra')]: true }; expect(validateScatter(symbol).status).toBe('invalid');
  const nullPrototype = Object.assign(Object.create(null), basic); expect(validateScatter(nullPrototype).status).toBe('ok');
});
test('axis contracts reject invalid/inverted domains and unsupported decorations', () => {
  for (const x of [{ kind: 'category' }, { kind: 'linear', domain: [2, 1] }, { kind: 'linear', domain: [1, 1] }, { kind: 'linear', domain: [0, Infinity] }, { kind: 'linear', domain: [0, 2], nice: true }, { kind: 'linear', ticks: { targetCount: 2.5 } }, { kind: 'linear', reversed: 'yes' }, { kind: 'linear', labels: { maxWidth: -1 } }]) expect(validateScatter({ ...basic, axes: { x, y: basic.axes.y } }).status).toBe('invalid');
  expect(validateScatter({ ...basic, axes: { x: { kind: 'linear', domain: [-2, 8], nice: false, reversed: true, includeZero: true, title: 'X', grid: true, ticks: { targetCount: 6 }, labels: { maxWidth: 120 } }, y: { kind: 'linear', reversed: true } } }).status).toBe('ok');
});
test('presentation is bounded, inert and typed, with no arbitrary styles/HTML', () => {
  for (const patch of [{ theme: 'pink' }, { font: { family: 'url(x)' } }, { font: { size: 100 } }, { legend: { position: 'top' } }, { tooltip: { mode: 'shared' } }, { labels: 'all' }, { status: { kind: 'error' } }, { status: { kind: 'ready', message: 'ignored' } }, { references: [{ id: 'r', axis: 'x', value: 1 }, { id: 'r', axis: 'y', value: 2 }] }]) expect(validateScatter({ ...basic, ...patch }).status).toBe('invalid');
  for (const marker of [{ size: 0 }, { size: 25 }, { shape: 'bubble' }, { size: Infinity }]) expect(validateScatter({ ...basic, series: [{ ...basic.series[0], marker }] }).status).toBe('invalid');
  expect(validateScatter({ ...basic, title: '<img src=x>', direction: 'rtl', theme: 'dark', labels: 'auto', font: { family: 'serif', size: 14, weight: 600 }, tooltip: { mode: 'point', placement: 'end' }, status: { kind: 'loading', message: 'Wait' }, series: [{ ...basic.series[0], color: '#AABBCC', marker: { size: 12, shape: 'diamond' } }], references: [{ id: 'r', axis: 'x', value: 2, label: 'Reference', color: '#abc', dash: 'dotted' }] }).status).toBe('ok');
});
test('visibility/options validate IDs and prohibit duplicate or unknown state', () => {
  for (const hiddenSeriesIds of [['s', 's'], ['unknown']]) expect(validateScatter({ ...basic, state: { mode: 'controlled', value: { hiddenSeriesIds } } }).status).toBe('invalid');
  expect(validateScatter({ ...basic, state: { mode: 'internal', value: { hiddenSeriesIds: [] } } }).status).toBe('invalid');
  for (const options of [{ instanceId: 'bad space' }, { instanceId: 'valid', onPointActivate: true }, { instanceId: 'valid', initialState: { hiddenSeriesIds: ['unknown'] } }]) expect(validateScatterOptions(options, new Set(['s'])).status).toBe('invalid');
  expect(validateScatterOptions({ instanceId: 'valid', initialState: { hiddenSeriesIds: ['s'] }, onPointActivate() {}, onStateChange() {}, onDiagnostic() {} }, new Set(['s'])).status).toBe('ok');
});
test('pure description retains actual XY, coincident IDs, incomplete values and hidden records', () => {
  const result = describeScatter(basic); expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
  expect(result.value.table.columns).toEqual(['Series', 'Observation', 'X', 'Y', 'Visibility']); expect(result.value.table.rows.map(row => row.cells.slice(1, 4))).toEqual([['a', '4', '-2'], ['b', '0', '0'], ['duplicate', '4', '-2'], ['missing', 'Missing observation', '5']]);
  const hidden = describeScatter(basic, { initialState: { hiddenSeriesIds: ['s'] } }); expect(hidden.status).toBe('ok'); if (hidden.status === 'ok') { expect(hidden.value.view).toBe('no-visible-series'); expect(hidden.value.table.rows).toHaveLength(4); expect(hidden.value.table.rows[0]!.cells[4]).toBe('Series hidden'); }
  expect(describeScatter({ ...basic, state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } }, { initialState: { hiddenSeriesIds: [] } }).status).toBe('invalid');
});
