import { expect, test } from 'vitest';
import { describeRadial } from '../../src/radial/describe.js';
import { describeScatter } from '../../src/scatter/describe.js';
import { cartesianRecords } from '../../src/internal/export/records.js';
import { seriesIdentities, sliceIdentities } from '../../src/internal/interaction/identities.js';
const series = [{ id: 's', name: 'Series', data: [{ id: 'a', x: 3, y: -2 }, { id: 'zero', x: 0, y: 0 }, { id: 'gap', x: 1, y: null }] }];
test('raw Cartesian export adds applied selection only when enabled, preserving gaps and zero', () => {
  const spec = { series, axes: { x: { kind: 'linear' } } }, before = JSON.stringify(spec);
  expect(cartesianRecords(spec, []).columns).not.toContain('Selected');
  const records = cartesianRecords(spec, ['s'], [{ seriesId: 's', pointId: 'zero' }]);
  expect(records.columns.at(-1)).toBe('Selected'); expect(records.rows.map(row => row.slice(-3))).toEqual([[-2, 'false', 'false'], [0, 'false', 'true'], [null, 'false', 'false']]); expect(JSON.stringify(spec)).toBe(before);
});
test('selectable indexes keep observed zero and reject missing XY without confusing duplicate point IDs across series', () => {
  const spec = { series: [...series, { id: 'other', data: [{ id: 'a', x: null, y: 3 }, { id: 'zero', x: 0, y: 0 }] }] };
  expect([...seriesIdentities(spec).values()]).toEqual([{ seriesId: 's', pointId: 'a' }, { seriesId: 's', pointId: 'zero' }, { seriesId: 'other', pointId: 'zero' }]);
  expect([...sliceIdentities({ data: [{ id: 'a', value: 0 }, { id: 'missing', value: null }] }).values()]).toEqual([{ pointId: 'a' }]);
});
test('pure radial SSR describes the applied slice identity without inventing a series', () => {
  const spec = { family: 'pie', title: 'Shares', selection: { mode: 'controlled', value: [{ pointId: 'zero' }] }, data: [{ id: 'a', label: 'Repeated', value: 3 }, { id: 'zero', label: 'Repeated', value: 0 }, { id: 'gap', label: 'Missing', value: null }] };
  const result = describeRadial(spec, 'pie'); expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
  expect(result.value.context).toContain('Selection: 1 observations.'); expect(result.value.table.columns.at(-1)).toBe('Selected'); expect(result.value.table.rows.map(row => row.cells.at(-1))).toEqual(['Not selected', 'Selected', 'Not selected']);
  expect(describeRadial({ ...spec, selection: { mode: 'internal', initial: [{ pointId: 'gap' }] } }, 'pie').status).toBe('invalid');
  expect(describeRadial({ ...spec, selection: false }, 'pie').status).toBe('ok');
});
test('pure Scatter SSR preserves true numeric XY and validates controlled identities before describing selection', () => {
  const spec = { family: 'scatter', title: 'XY', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series, selection: { mode: 'internal', initial: [{ seriesId: 's', pointId: 'a' }] } };
  const result = describeScatter(spec); expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
  expect(result.value.table.rows[0]!.cells.slice(2, 4)).toEqual(['3', '-2']); expect(result.value.table.rows.map(row => row.cells.at(-1))).toEqual(['Selected', 'Not selected', 'Not selected']);
  expect(describeScatter({ ...spec, selection: { mode: 'controlled', value: [{ seriesId: 's', pointId: 'gap' }] } }).status).toBe('invalid');
});
