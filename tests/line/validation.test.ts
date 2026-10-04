import { describe, expect, it } from 'vitest';
import { validateLine, validateOptions, validateState } from '../../src/line/validate.js';
import { normalizeLine, lineDomains } from '../../src/line/normalize.js';

export const numeric = () => ({ family: 'line', title: 'T', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 0, y: 1 }, { id: 'q', x: 1, y: 2 }] }] });
function rejected(input: unknown, reason: string, path?: string): void {
  const r = validateLine(input); expect(r.status).toBe('invalid');
  if (r.status === 'invalid') { expect(r.diagnostic.reason).toBe(reason); if (path !== undefined) expect(r.diagnostic.path).toBe(path); }
}
describe('closed input validation and atomic canonical copy', () => {
  it('copies every container without touching opaque datum', () => {
    const datum = { business: 1 }, input = { ...numeric(), series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 0, y: 1, datum }] }] };
    const r = validateLine<typeof datum>(input); expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.value).not.toBe(input); expect(r.value.series[0]!.data[0]!.datum).toBe(datum);
      expect(Object.isFrozen(r.value.series[0]!.data[0])).toBe(true); expect(Object.isFrozen(datum)).toBe(false);
      input.series[0]!.data[0]!.y = 9; expect(r.value.series[0]!.data[0]!.y).toBe(1);
    }
  });
  it('rejects duplicates and order at the documented second occurrence', () => {
    const a = numeric(); rejected({ ...a, series: [a.series[0], a.series[0]] }, 'DUPLICATE_SERIES_ID', 'series[1].id');
    const s = a.series[0]!;
    rejected({ ...a, series: [{ ...s, data: [s.data[0], s.data[0]] }] }, 'DUPLICATE_POINT_ID', 'series[0].data[1].id');
    rejected({ ...a, series: [{ ...s, data: [{ id: 'a', x: -0, y: null }, { id: 'b', x: 0, y: 1 }] }] }, 'DUPLICATE_X', 'series[0].data[1].x');
    rejected({ ...a, series: [{ ...s, data: [{ id: 'a', x: 2, y: 1 }, { id: 'b', x: 1, y: 1 }] }] }, 'UNSORTED_X', 'series[0].data[1].x');
  });
  it('keeps point IDs qualified by series', () => {
    const a = numeric(); expect(validateLine({ ...a, series: [a.series[0], { ...a.series[0], id: 'other' }] }).status).toBe('ok');
  });
  it.each([NaN, Infinity, -Infinity, '2', new Number(2), undefined])('rejects invalid Y %s', y => {
    const a = numeric(); rejected({ ...a, series: [{ ...a.series[0], data: [{ id: 'p', x: 1, y }] }] }, typeof y === 'number' ? 'NONFINITE' : y === undefined ? 'BAD_LINE_SPEC' : 'WRONG_TYPE');
  });
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite X %s', x => {
    const a = numeric(); rejected({ ...a, series: [{ ...a.series[0], data: [{ id: 'p', x, y: 1 }] }] }, 'NONFINITE');
  });
  it.each([.5, 8.64e15 + 1, -8.64e15 - 1])('rejects malformed epoch %s', x => {
    const a = numeric(); rejected({ ...a, axes: { ...a.axes, x: { kind: 'time' } }, series: [{ ...a.series[0], data: [{ id: 'p', x, y: 1 }] }] }, 'OUTSIDE_DATE_RANGE');
  });
  it('rejects unknown categories, mixed X and invalid rank order', () => {
    const a = numeric(), axes = { x: { kind: 'category', values: [{ id: 'a' }, { id: 'b' }] }, y: a.axes.y };
    const make = (xs: unknown[]) => ({ ...a, axes, series: [{ id: 's', name: 'S', data: xs.map((x, i) => ({ id: String(i), x, y: null })) }] });
    rejected(make(['z']), 'UNKNOWN_CATEGORY'); rejected(make([1]), 'MIXED_AXIS_TYPE'); rejected(make(['b', 'a']), 'UNSORTED_X');
    rejected({ ...make([]), axes: { ...axes, x: { ...axes.x, values: [{ id: 'a' }, { id: 'a' }] } } }, 'DUPLICATE_ID');
  });
  it.each([['curve', 'smooth', 'BAD_CURVE'], ['gaps', 'fill', 'BAD_GAPS'], ['markers', 'yes', 'BAD_MARKERS'], ['color', 'red', 'BAD_COLOR'], ['dash', [], 'BAD_DASH']])('rejects %s', (key, value, reason) => {
    const a = numeric(); rejected({ ...a, series: [{ ...a.series[0], [key as string]: value }] }, reason as string);
  });
  it.each([[1, 1], [2, 1], [0, Infinity], ['0', 1]])('rejects explicit domain %s', (...domain) => {
    const a = numeric(); rejected({ ...a, axes: { ...a.axes, x: { kind: 'linear', domain } } }, 'BAD_DOMAIN');
  });
  it('rejects incompatible explicit domain options', () => {
    const a = numeric(); for (const key of ['nice', 'includeZero']) rejected({ ...a, axes: { ...a.axes, y: { kind: 'linear', domain: [0, 1], [key]: true } } }, 'BAD_DOMAIN_OPTIONS');
  });
  it('rejects malformed targets, labels, font and booleans', () => {
    const a = numeric(); for (const targetCount of [1, 13, 2.5, '2']) rejected({ ...a, axes: { ...a.axes, x: { kind: 'linear', ticks: { targetCount } } } }, 'BAD_TICK_TARGET');
    rejected({ ...a, font: { family: 'Arial' } }, 'BAD_LINE_SPEC'); rejected({ ...a, axes: { ...a.axes, y: { kind: 'linear', grid: 1 } } }, 'BAD_LINE_SPEC');
    rejected({ ...a, axes: { ...a.axes, x: { kind: 'linear', labels: { maxWidth: 7 } } } }, 'BAD_LINE_SPEC');
  });
  it('rejects status, state and reference defects even for suppressed views', () => {
    const a = numeric(); rejected({ ...a, status: { kind: 'error' } }, 'BAD_STATUS'); rejected({ ...a, status: { kind: 'empty', message: '' } }, 'BAD_STATUS');
    for (const hiddenSeriesIds of [['s', 's'], ['unknown']]) rejected({ ...a, state: { mode: 'controlled', value: { hiddenSeriesIds } } }, 'BAD_STATE');
    rejected({ ...a, references: [{ id: 'r', axis: 'y', value: 1 }, { id: 'r', axis: 'x', value: 1 }] }, 'BAD_REFERENCE');
    rejected({ ...a, status: { kind: 'loading' }, references: [{ id: 'r', axis: 'x', value: '1' }] }, 'WRONG_TYPE');
  });
  it('rejects coercion, inherited discriminants, own accessors and unknown fields', () => {
    const a = numeric(); rejected({ ...a, family: ['line'] }, 'BAD_LINE_SPEC'); rejected({ ...a, description: undefined }, 'BAD_LINE_SPEC');
    rejected(Object.assign(Object.create({ family: 'line' }), a), 'BAD_LINE_SPEC');
    rejected({ ...a, constructor: 'line' }, 'BAD_LINE_SPEC', 'constructor'); rejected({ ...a, axes: { ...a.axes, x: new String('linear') } }, 'BAD_LINE_SPEC');
    let invoked = 0; const accessor = { ...a }; Object.defineProperty(accessor, 'title', { get() { invoked++; throw Error('secret'); } });
    rejected(accessor, 'BAD_LINE_SPEC'); expect(invoked).toBe(0);
    rejected(new Proxy(a, { ownKeys() { throw Error('secret'); } }), 'BAD_LINE_SPEC');
  });
  it('rejects sparse and decorated data containers', () => {
    const a = numeric(), sparse = new Array(2), decorated = Object.assign([], { extra: 1 });
    rejected({ ...a, series: [{ ...a.series[0], data: sparse }] }, 'BAD_LINE_SPEC'); rejected({ ...a, series: decorated }, 'BAD_LINE_SPEC');
  });
  it('checks resource caps before normalization', () => {
    const a = numeric(); rejected({ ...a, series: new Array(65).fill(a.series[0]) }, 'RESOURCE_LIMIT');
    rejected({ ...a, references: new Array(17).fill({ id: 'r', axis: 'y', value: 1 }) }, 'RESOURCE_LIMIT');
    rejected({ ...a, series: [{ id: 's', name: 'S', markers: 'on', data: Array.from({ length: 5001 }, (_, x) => ({ id: String(x), x, y: 1 })) }] }, 'RESOURCE_LIMIT', 'series[0].markers');
    rejected({ ...a, series: [{ ...a.series[0], data: new Array(100001).fill(a.series[0]!.data[0]) }] }, 'RESOURCE_LIMIT');
    rejected({ ...a, axes: { ...a.axes, x: { kind: 'category', values: new Array(100001).fill({ id: 'a' }) } } }, 'RESOURCE_LIMIT');
  });
  it('validates mount options and external state without coercion', () => {
    expect(validateOptions({ instanceId: 'good_1', onPointActivate() {} }).status).toBe('ok');
    for (const options of [{ instanceId: '1bad' }, { instanceId: 'a', onDiagnostic: true }, { instanceId: 'a', extra: 1 }]) expect(validateOptions(options).status).toBe('invalid');
    expect(validateState({ hiddenSeriesIds: ['s'] }, new Set(['s'])).status).toBe('ok'); expect(validateState({ hiddenSeriesIds: ['x'] }, new Set(['s'])).status).toBe('invalid');
  });
  it('keeps all-series X and visible-only Y, without reference expansion', () => {
    const a = numeric(), r = validateLine({ ...a, series: [...a.series, { id: 'hidden', name: 'H', data: [{ id: 'h', x: 50, y: 100 }] }], references: [{ id: 'r', axis: 'y', value: 200 }] });
    if (r.status !== 'ok') throw Error('fixture');
    const data = normalizeLine(r.value); expect(lineDomains(data, { hiddenSeriesIds: ['hidden'] })).toEqual({ status: 'ok', value: { x: [0, 50], y: [1, 2] } });
    expect(lineDomains(data, { hiddenSeriesIds: ['s', 'hidden'] })).toEqual({ status: 'ok', value: { x: [0, 50], y: null } });
  });
});
