import { expect, test } from 'vitest';
import type { ChartResult } from '../../src/public/chart-types.js';
import { describeRadial } from '../../src/radial/describe.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result.diagnostic)); return result.value; }
const spec = { family: 'pie', title: 'Contribution', data: [{ id: 'a', label: 'January', value: 2 }, { id: 'b', label: 'January', value: 3 }, { id: 'c', label: 'Zero', value: 0 }, { id: 'd', label: 'Missing', value: null }] };
test('pure description has actual slice columns, original values and distinct duplicate identities', () => {
  const description = value(describeRadial(spec, 'pie'));
  expect(description.table.columns).toEqual(['Slice', 'Value', 'Visible share', 'Visibility']);
  expect(description.table.rows.map(row => row.cells.slice(0, 3))).toEqual([['January (a)', '2', '40%'], ['January (b)', '3', '60%'], ['Zero', '0', '0%'], ['Missing', 'Missing observation', 'Missing observation']]);
  expect(description.total).toBe(5); expect(description.context).toContain('incomplete'); expect(description.context).toContain('rounded independently'); expect(description.view).toBe('ready');
  expect(Object.isFrozen(description.table.rows[0]!.cells)).toBe(true);
});
test('visibility is slice-specific and percentages use only applied visible values', () => {
  const controlled = { ...spec, state: { mode: 'controlled', value: { hiddenSliceIds: ['b'] } } };
  const description = value(describeRadial(controlled, 'pie'));
  expect(description.table.rows[0]!.cells[2]).toBe('100%'); expect(description.table.rows[1]!.cells.slice(2)).toEqual(['Not included: hidden', 'Slice hidden']);
  expect(describeRadial(controlled, 'pie', { initialState: { hiddenSliceIds: [] } }).status).toBe('invalid');
  expect(value(describeRadial(spec, 'pie', { initialState: { hiddenSliceIds: ['b'] } })).total).toBe(2);
});
test('zero/missing/all hidden expose honest states and never invent 100 percent', () => {
  const zeros = { ...spec, data: [{ id: 'z', label: 'Zero', value: 0 }] }, empty = value(describeRadial(zeros, 'pie'));
  expect(empty.view).toBe('empty'); expect(empty.table.rows[0]!.cells[2]).toContain('Undefined');
  expect(value(describeRadial(zeros, 'pie', { initialState: { hiddenSliceIds: ['z'] } })).view).toBe('no-visible-slices');
  const missing = value(describeRadial({ ...spec, data: [{ id: 'm', label: 'Missing', value: null }] }, 'pie'));
  expect(missing.total).toBeNull(); expect(missing.totalOverflow).toBe(false); expect(missing.totalIncomplete).toBe(true); expect(missing.context).not.toContain('total: 0');
});
test('unrepresentable totals and tiny positive shares do not become Infinity or an invented zero', () => {
  const overflow = value(describeRadial({ ...spec, data: [{ id: 'a', label: 'A', value: Number.MAX_VALUE }, { id: 'b', label: 'B', value: Number.MAX_VALUE }] }, 'pie'));
  expect(overflow.total).toBeNull(); expect(overflow.totalOverflow).toBe(true); expect(overflow.table.rows.map(row => row.cells[2])).toEqual(['50%', '50%']); expect(JSON.stringify(overflow)).not.toContain('Infinity');
  const tiny = value(describeRadial({ ...spec, data: [{ id: 'a', label: 'A', value: Number.MAX_VALUE }, { id: 'b', label: 'B', value: Number.MIN_VALUE }] }, 'pie'));
  expect(tiny.table.rows[1]!.cells[1]).toBe(String(Number.MIN_VALUE)); expect(tiny.table.rows[1]!.cells[2]).toBe('<0.000001%');
});
test('status overrides and direction remain explicit, without removing raw rows', () => {
  for (const kind of ['loading', 'empty', 'error'] as const) {
    const description = value(describeRadial({ ...spec, direction: 'rtl', status: kind === 'error' ? { kind, message: 'Unavailable' } : { kind } }, 'pie'));
    expect(description.view).toBe(kind); expect(description.direction).toBe('rtl'); expect(description.table.rows).toHaveLength(4); expect(description.status.length).toBeGreaterThan(0);
    if (kind === 'empty') { expect(description.status).toContain('preserves provided observations'); expect(description.status).not.toContain('No positive'); }
  }
});
test('pure description rejects invalid unknown input and unsafe state-option accessors', () => {
  expect(describeRadial({ ...spec, data: [{ id: 'a', label: 'A', value: NaN }] }, 'pie').status).toBe('invalid');
  expect(describeRadial(spec, 'pie', null).status).toBe('invalid');
  const options = {}; let calls = 0; Object.defineProperty(options, 'initialState', { get() { calls++; return {}; } });
  expect(describeRadial(spec, 'pie', options).status).toBe('invalid'); expect(calls).toBe(0);
});
