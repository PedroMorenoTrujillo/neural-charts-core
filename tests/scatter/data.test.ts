import { expect, test } from 'vitest';
import { normalizeScatter, scatterDomains, targetKey } from '../../src/scatter/data.js';
import type { ScatterDataSpec, ScatterSeries } from '../../src/scatter/data.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const axes = { x: { kind: 'linear' as const }, y: { kind: 'linear' as const } }, visible = { hiddenSeriesIds: [] };
const make = (series: readonly ScatterSeries[]): ScatterDataSpec => ({ axes, series });
test('unordered duplicate XY values and incomplete pairs retain original logical identities', () => {
  const datum = Object.freeze({ original: true }), points = Object.freeze([{ id: 'a', x: 5, y: -2, datum }, { id: 'b', x: 0, y: 0 }, { id: 'c', x: 5, y: -2 }, { id: 'd', x: null, y: 7 }, { id: 'e', x: 8, y: null }].map(point => Object.freeze(point)));
  const spec = Object.freeze(make(Object.freeze([Object.freeze({ id: 's', name: 'Unordered', data: points })]))), before = JSON.stringify(spec), data = value(normalizeScatter(spec));
  expect(data.rawCount).toBe(5); expect(data.pairedCount).toBe(3); expect(data.series[0]!.paired.map(pair => pair.index)).toEqual([0, 1, 2]); expect(data.series[0]!.paired[0]!.point).toBe(points[0]); expect(data.series[0]!.paired[0]!.point.datum).toBe(datum);
  expect(data.series[0]!.byId.get('d')).toBe(3); expect(value(scatterDomains(data, visible))).toEqual({ x: [0, 5], y: [-2, 0] }); expect(JSON.stringify(spec)).toBe(before);
});
test('both automatic domains use visible finite pairs, with explicit and include-zero policies', () => {
  const series = [{ id: 'a', name: 'A', data: [{ id: 'a', x: -5, y: 2 }, { id: 'b', x: -2, y: 8 }] }, { id: 'b', name: 'B', data: [{ id: 'a', x: 100, y: -90 }, { id: 'b', x: 200, y: -80 }] }];
  const data = value(normalizeScatter(make(series))), hidden = { hiddenSeriesIds: ['b'] };
  expect(value(scatterDomains(data, hidden))).toEqual({ x: [-5, -2], y: [2, 8] }); expect(value(scatterDomains(data, { hiddenSeriesIds: ['a', 'b'] }))).toEqual({ x: null, y: null });
  const zero = value(normalizeScatter({ ...make(series), axes: { x: { kind: 'linear', includeZero: true }, y: { kind: 'linear', includeZero: true } } }));
  expect(value(scatterDomains(zero, hidden))).toEqual({ x: [-5, 0], y: [0, 8] });
  const explicit = value(normalizeScatter({ ...make(series), axes: { x: { kind: 'linear', domain: [-10, 300] }, y: { kind: 'linear', domain: [-100, 100] } } }));
  expect(value(scatterDomains(explicit, hidden))).toEqual({ x: [-10, 300], y: [-100, 100] });
});
test('constant zero/tiny/large domains use the certified expansion without fabricated pairs', () => {
  for (const raw of [0, Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const data = value(normalizeScatter(make([{ id: 'a', name: 'A', data: [{ id: 'one', x: raw, y: raw }] }]))), domains = value(scatterDomains(data, visible));
    for (const domain of [domains.x!, domains.y!]) { expect(domain.every(Number.isFinite)).toBe(true); expect(domain[0]).toBeLessThan(domain[1]); expect(raw).toBeGreaterThanOrEqual(domain[0]); expect(raw).toBeLessThanOrEqual(domain[1]); }
  }
  expect(value(normalizeScatter(make([{ id: 'a', name: 'A', data: [{ id: 'none', x: null, y: null }] }]))).pairedCount).toBe(0);
});
test('nonfinite values, duplicate identities and bounded resource limits fail before projection', () => {
  for (const [x, y] of [[NaN, 1], [1, Infinity], [null, Infinity], [-Infinity, null]]) expect(normalizeScatter(make([{ id: 'a', name: 'A', data: [{ id: 'bad', x: x!, y: y! }] }])).status).toBe('invalid');
  const row = { id: 'a', name: 'A', data: [{ id: 'p', x: 1, y: 2 }] };
  expect(normalizeScatter(make([row, row]))).toMatchObject({ status: 'invalid', diagnostic: { reason: 'DUPLICATE_SERIES_ID' } });
  expect(normalizeScatter(make([{ ...row, data: [row.data[0]!, row.data[0]!] }]))).toMatchObject({ status: 'invalid', diagnostic: { reason: 'DUPLICATE_POINT_ID' } });
  expect(normalizeScatter(make(Array(17).fill(row)))).toMatchObject({ status: 'invalid', diagnostic: { reason: 'TOO_MANY_SERIES' } });
  expect(normalizeScatter(make([{ ...row, data: Array(50001).fill(row.data[0]) }]))).toMatchObject({ status: 'invalid', diagnostic: { reason: 'TOO_MANY_POINTS' } });
  expect(normalizeScatter(make([row, { ...row, id: 'other' }])).status).toBe('ok');
});
test('invalid applied domains reject and composite keys cannot collide across delimiter-like IDs', () => {
  const data = value(normalizeScatter({ ...make([{ id: 'a', name: 'A', data: [] }]), axes: { x: { kind: 'linear', domain: [2, 1] }, y: { kind: 'linear' } } }));
  expect(scatterDomains(data, visible).status).toBe('invalid'); expect(targetKey('a|p:1:b', 'c')).not.toBe(targetKey('a', 'b|p:1:c'));
});
