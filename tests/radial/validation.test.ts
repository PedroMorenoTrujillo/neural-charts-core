import { expect, test } from 'vitest';
import { validateRadial, validateRadialOptions } from '../../src/radial/validate.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
function fixture(family: 'pie' | 'donut' = 'pie') { return { family, title: 'Contribution', data: [{ id: 'a', label: 'January', value: 2 }, { id: 'b', label: 'January', value: 0 }, { id: 'c', label: 'Other', value: null }] }; }
test('radial parser freezes structural copies and preserves opaque datum identity', () => {
  const datum = Object.freeze({ sku: 'original' }), input = { ...fixture(), data: [Object.freeze({ id: 'a', label: 'January', value: 2, datum, color: '#ABC' })] };
  Object.freeze(input.data); Object.freeze(input);
  const parsed = value(validateRadial<{ sku: string }>(input, 'pie'));
  expect(parsed).not.toBe(input); expect(parsed.data).not.toBe(input.data); expect(parsed.data[0]!.datum).toBe(datum); expect(parsed.data[0]!.color).toBe('#abc');
  expect(Object.isFrozen(parsed)).toBe(true); expect(Object.isFrozen(parsed.data)).toBe(true); expect(Object.isFrozen(parsed.data[0])).toBe(true);
});
test('duplicate labels, zeros and null remain distinct slice observations', () => {
  const parsed = value(validateRadial(fixture(), 'pie')); expect(parsed.data.map(point => point.id)).toEqual(['a', 'b', 'c']); expect(parsed.data.map(point => point.value)).toEqual([2, 0, null]);
});
test('required fields, plain arrays and color types are strict while explicit defaults are valid', () => {
  const { title, ...missingTitle } = fixture(); void title;
  const exotic = [...fixture().data]; Object.setPrototypeOf(exotic, null);
  for (const input of [missingTitle, { ...fixture(), data: {} }, { ...fixture(), data: exotic }, { ...fixture(), data: [{ id: 'a', label: 'A', value: 1, color: 123 }] }]) expect(validateRadial(input, 'pie').status).toBe('invalid');
  const defaults = value(validateRadial({ ...fixture(), state: { mode: 'internal' }, status: { kind: 'ready' } }, 'pie'));
  expect(defaults.state).toEqual({ mode: 'internal' }); expect(defaults.status).toEqual({ kind: 'ready' });
  expect(Object.isFrozen(defaults.state)).toBe(true); expect(Object.isFrozen(defaults.status)).toBe(true);
});
test('negative/nonfinite/undefined values fail explicitly including hidden slices', () => {
  for (const raw of [-1, Infinity, NaN, undefined]) {
    const input = { ...fixture(), data: [{ id: 'a', label: 'A', value: raw }], state: { mode: 'controlled', value: { hiddenSliceIds: ['a'] } } };
    expect(validateRadial(input, 'pie').status).toBe('invalid');
  }
});
test('Pie rejects Donut-only properties and both reject unsupported angles/multiring', () => {
  for (const patch of [{ holeRatio: .5 }, { center: false }, { startAngle: 90 }, { series: [] }]) expect(validateRadial({ ...fixture(), ...patch }, 'pie').status).toBe('invalid');
  for (const holeRatio of [-1, 1, Infinity, NaN]) expect(validateRadial({ ...fixture('donut'), holeRatio }, 'donut').status).toBe('invalid');
  for (const holeRatio of [0, .6, 1 - Number.EPSILON]) expect(validateRadial({ ...fixture('donut'), holeRatio }, 'donut').status).toBe('ok');
  expect(validateRadial({ ...fixture('donut'), center: { label: '<b>Plain text</b>', value: 'Custom value' } }, 'donut').status).toBe('ok');
  expect(validateRadial({ ...fixture('donut'), center: false }, 'donut').status).toBe('ok');
});
test('strict descriptor validation rejects accessors/prototypes/symbols without reading getters', () => {
  let calls = 0;
  const title = { ...fixture() }; Object.defineProperty(title, 'title', { get() { calls++; return 'Unsafe'; } });
  const point = { id: 'a', label: 'A' }; Object.defineProperty(point, 'value', { get() { calls++; return 2; } });
  for (const input of [title, { ...fixture(), data: [point] }, Object.assign(Object.create({ inherited: true }), fixture()), { ...fixture(), [Symbol('extra')]: 1 }]) expect(validateRadial(input, 'pie').status).toBe('invalid');
  expect(calls).toBe(0);
});
test('sparse and accessor arrays or duplicate/unknown state identities are rejected', () => {
  const sparse = Array(2), accessor = [{ id: 'a', label: 'A', value: 2 }];
  Object.defineProperty(accessor, '0', { get() { throw Error('Getter must not run'); } });
  for (const data of [sparse, accessor, [fixture().data[0], fixture().data[0]], Array.from({ length: 1001 }, (_, i) => ({ id: 'p' + i, label: 'Slice', value: 1 }))]) expect(validateRadial({ ...fixture(), data }, 'pie').status).toBe('invalid');
  for (const hiddenSliceIds of [['unknown'], ['a', 'a']]) expect(validateRadial({ ...fixture(), state: { mode: 'controlled', value: { hiddenSliceIds } } }, 'pie').status).toBe('invalid');
  expect(validateRadial({ ...fixture(), state: { mode: 'internal', value: { hiddenSliceIds: [] } } }, 'pie').status).toBe('invalid');
});
test('font/theme/tooltip/status contracts remain bounded and explicit', () => {
  const valid = { ...fixture(), font: { family: 'monospace', size: 14, weight: 500 }, theme: 'auto', direction: 'rtl', labels: 'inside', legend: { position: 'end' }, tooltip: { mode: 'point', placement: 'start' }, status: { kind: 'error', message: 'Unavailable' } };
  expect(validateRadial(valid, 'pie').status).toBe('ok');
  for (const patch of [{ status: { kind: 'error' } }, { status: { kind: 'ready', message: 'No' } }, { font: { size: 1000 } }, { tooltip: { mode: 'shared' } }, { theme: 'unknown' }, { labels: 'all' }]) expect(validateRadial({ ...fixture(), ...patch }, 'pie').status).toBe('invalid');
});
test('options keep actual callbacks and validate slice state plus CSS-safe instance IDs', () => {
  const handler = () => undefined, ids = new Set(['a', 'b']);
  const parsed = value(validateRadialOptions({ instanceId: 'pie-1', initialState: { hiddenSliceIds: ['b'] }, onPointActivate: handler }, ids)); expect(parsed.onPointActivate).toBe(handler); expect(parsed.initialState).toEqual({ hiddenSliceIds: ['b'] });
  for (const patch of [{ instanceId: 'invalid id' }, { onPointActivate: 'handler' }, { initialState: { hiddenSeriesIds: [] } }, { initialState: { hiddenSliceIds: ['other'] } }]) expect(validateRadialOptions({ instanceId: 'pie', ...patch }, ids).status).toBe('invalid');
});
