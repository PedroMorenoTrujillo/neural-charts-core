import { describe, expect, it } from 'vitest';
import { validateStackedArea } from '../../src/stacked-area/validate.js';
import { areaStack, normalizeStackedArea, stackAreaDomains } from '../../src/stacked-area/data.js';
import { stackAreaBands } from '../../src/stacked-area/bands.js';
import { describeStackedArea } from '../../src/stacked-area.js';
import { areaViewport } from '../../src/stacked-area/viewport.js';
const empty = Object.freeze({ hiddenSeriesIds: Object.freeze([] as string[]) });
function freeze(value: unknown): void { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } }
const spec = (values: readonly (readonly (number | null)[])[], mode = 'sum', numeric = false) => ({ family: 'stacked-area', title: 'Complete stacks', stacking: mode, axes: { x: numeric ? { kind: 'linear' } : { kind: 'category', values: Array.from({ length: Math.max(0, ...values.map(row => row.length)) }, (_, i) => ({ id: 'x' + i, label: 'Repeated' })) }, y: { kind: 'linear' } }, series: values.map((row, si) => ({ id: 's' + si, name: 'Series ' + si, data: row.map((y, i) => ({ id: 'p' + i, x: numeric ? i * i * 3 : 'x' + i, y })) })) });
function prepared(input: unknown, state = empty) {
  const parsed = validateStackedArea(input); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed));
  const data = normalizeStackedArea(parsed.value), stack = areaStack(data, state); if (stack.status !== 'ok') throw Error(JSON.stringify(stack));
  const domains = stackAreaDomains(data, stack.value), bands = stackAreaBands(data, stack.value); if (domains.status !== 'ok' || bands.status !== 'ok') throw Error(JSON.stringify({ domains, bands }));
  return { data, stack: stack.value, domains: domains.value, bands: bands.value };
}
describe('Stacked Area arithmetic and signed contours', () => {
  it('separates positive/negative accumulators and derives their full extent', () => {
    const result = prepared(spec([[3, -4], [2, -6], [-7, 2]]));
    expect(result.domains.y).toEqual([-10, 5]);
    expect(result.stack.categories.get('x0')!.segments.map(p => [p.base, p.end])).toEqual([[0, 3], [3, 5], [0, -7]]);
  });
  it('breaks every component when one row is incomplete, retaining all original data', () => {
    const input = spec([[1, 2, 3, 4], [3, null, 5, 6]]), result = prepared(input);
    expect(result.bands.every(band => band.vertices[0]!.left === 2)).toBe(true);
    expect(result.data.spec.series[0]!.data).toHaveLength(4);
    const description = describeStackedArea(input); expect(description.status).toBe('ok');
    if (description.status === 'ok') { expect(description.value.table.rows).toHaveLength(8); expect(description.value.table.rows[5]!.cells).toContain('Missing observation'); }
  });
  it('does not include misleading partial totals in the auto domain', () => {
    const result = prepared(spec([[1, 1000000, 2], [3, null, 4]])); expect(result.domains.y).toEqual([0, 6]);
  });
  it('recomputes complete rows from visible series without changing IDs', () => {
    const result = prepared(spec([[1, 2, 3], [4, null, 6]]), { hiddenSeriesIds: ['s1'] });
    expect(result.bands).toHaveLength(2); expect(result.domains.y).toEqual([0, 3]); expect(result.bands.every(b => b.seriesId === 's0')).toBe(true);
  });
  it('keeps viewport bounds valid when hiding a missing component reveals a larger complete subtotal', () => {
    const parsed = validateStackedArea({ ...spec([[10, 1], [20, 1], [null, 1]]), viewport: { mode: 'internal', axes: 'xy' } }); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed));
    const data = normalizeStackedArea(parsed.value), initial = areaViewport(data, empty); expect(initial.status).toBe('ok'); if (initial.status !== 'ok') return;
    const visible = areaViewport(data, { hiddenSeriesIds: ['s2'] }, initial.value); expect(visible.status).toBe('ok');
    if (visible.status === 'ok' && visible.value?.context.y.kind === 'linear') { expect(visible.value.context.y.domain).toEqual([0, 30]); expect(visible.value.context.y.automatic).toEqual([0, 30]); }
  });
  it('uses normalized percent shares for huge raw values and leaves zero totals undefined', () => {
    const result = prepared(spec([[Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0]], 'percent'));
    const row = result.stack.categories.get('x0')!; expect(row.total).toBeNull(); expect(row.segments.map(s => s.percentage)).toEqual([50, 50]);
    expect(result.domains.y).toEqual([0, 100]); expect(result.stack.categories.get('x1')!.percentageDefined).toBe(false); expect(result.bands).toHaveLength(0);
  });
  it('preserves missing, duplicate category labels, zero and immutable raw identity', () => {
    const input = spec([[0, 3], [2, 0]]); const before = JSON.stringify(input); freeze(input); const result = prepared(input);
    expect(result.data.coordinates).toEqual(['x0', 'x1']); expect(result.data.line.labels.get('x0')).toBe('Repeated'); expect(result.data.line.labels.get('x1')).toBe('Repeated');
    expect(result.stack.categories.get('x0')!.segments[0]!.point.original.y).toBe(0); expect(JSON.stringify(input)).toBe(before);
  });
  it('inserts an exact shared crossing instead of a bowtie through positive/negative stacks', () => {
    const result = prepared(spec([[2, -2], [-4, -4], [3, 3]]));
    const first = result.bands.filter(b => b.seriesId === 's0'); expect(first).toHaveLength(2);
    expect(first[0]!.vertices[1]).toMatchObject({ fraction: .5, base: 0, end: 0 });
    expect(first[1]!.vertices[0]).toMatchObject({ fraction: .5, base: 0, end: 0 });
    const negative = result.bands.filter(b => b.seriesId === 's1'); expect(negative[0]!.vertices[1]).toMatchObject({ base: 0, end: -4 });
    expect(negative[1]!.vertices[1]).toMatchObject({ base: -2, end: -6 });
  });
  it('uses the negative baseline for a zero component approached from below', () => {
    const result = prepared(spec([[-4, -4], [-2, 2]])); const band = result.bands.filter(b => b.seriesId === 's1');
    expect(band[0]!.vertices[1]).toMatchObject({ fraction: .5, base: -4, end: -4 });
    expect(band[1]!.vertices[0]).toMatchObject({ fraction: .5, base: 0, end: 0 });
  });
  it('keeps irregular numeric/time coordinates and rejects duplicate X within a series', () => {
    const input = spec([[1, 2, 3], [3, 4, 5]], 'sum', true), result = prepared(input); expect(result.data.coordinates).toEqual([0, 3, 12]); expect(result.domains.x).toEqual([0, 12]);
    const duplicate = { ...input, series: [{ id: 's', name: 's', data: [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: 1, y: 3 }] }] }; expect(validateStackedArea(duplicate).status).toBe('invalid');
  });
  it('keeps a negative-zero endpoint on the negative accumulator for subnormal inputs', () => {
    const result = prepared(spec([[-2, -2], [-Number.MIN_VALUE, 0]])), band = result.bands.find(b => b.seriesId === 's1')!;
    expect(band.vertices[1]).toMatchObject({ base: -2, end: -2 });
    const crossing = prepared(spec([[-2, -2], [-Number.MIN_VALUE, Number.MIN_VALUE]])).bands.filter(b => b.seriesId === 's1');
    expect(crossing[0]!.vertices[1]).toMatchObject({ base: -2, end: -2 }); expect(crossing[1]!.vertices[0]).toMatchObject({ base: 0, end: 0 });
  });
  it('rejects percent negatives, connect gaps, curve options and accessor laundering without executing getters', () => {
    expect(validateStackedArea(spec([[-1, 2]], 'percent')).status).toBe('invalid');
    const input = spec([[1, 2]]); for (const options of [{ gaps: 'connect' }, { curve: 'straight' }]) expect(validateStackedArea({ ...input, series: input.series.map(s => ({ ...s, ...options })) }).status).toBe('invalid');
    let calls = 0; const accessor = { ...input }; Object.defineProperty(accessor, 'stacking', { enumerable: true, get() { calls++; return 'sum'; } }); expect(validateStackedArea(accessor).status).toBe('invalid'); expect(calls).toBe(0);
  });
  it('rejects overflow with no nonfinite geometry and permits an empty or single-coordinate chart', () => {
    const parsed = validateStackedArea(spec([[Number.MAX_VALUE, 1], [Number.MAX_VALUE, 1]])); expect(parsed.status).toBe('ok');
    if (parsed.status === 'ok') expect(areaStack(normalizeStackedArea(parsed.value), empty).status).toBe('invalid');
    expect(prepared(spec([])).bands).toHaveLength(0); expect(prepared(spec([[0], [0]])).bands).toHaveLength(0);
  });
  it('keeps all sampled signed bands finite and on one side of their baseline', () => {
    let seed = 9123; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let trial = 0; trial < 80; trial++) {
      const values = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => Math.floor(random() * 41) - 20)), result = prepared(spec(values));
      for (const band of result.bands) {
        const a = band.vertices[0]!, b = band.vertices[1]!; expect([a.base, a.end, b.base, b.end, a.fraction, b.fraction].every(Number.isFinite)).toBe(true);
        expect((a.end - a.base) * (b.end - b.base)).toBeGreaterThanOrEqual(-1e-10); expect(a.fraction).toBeLessThan(b.fraction);
      }
    }
  });
});
