import { expect, it } from 'vitest';
import { validateLine, validateOptions, validateState } from '../../src/line/validate.js';
import { normalizeLine, lineDomains } from '../../src/line/normalize.js';
import { projectLine, runCommands } from '../../src/line/geometry.js';
import { planAxes, formatAxis } from '../../src/internal/axes/plan.js';
import { emptyLayers, axesScene, referenceScene } from '../../src/internal/axes/scene.js';
import { ellipsis, createTextMeasurer } from '../../src/internal/layout/text.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { buildHitIndex, firstTarget, navigate, reconcileTarget, pickPoint } from '../../src/line/hit-index.js';
import type { LineChartSpec } from '../../src/public/line-types.js';
import type { NormalizedLine } from '../../src/line/normalize.js';

const input = () => ({ family: 'line', title: 'T', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 1, y: 5 }] }] });
function data(value: unknown) { const r = validateLine(value); if (r.status !== 'ok') throw Error(r.diagnostic.reason); return normalizeLine(r.value); }
const font = { family: 'sans-serif', size: 12, weight: 400 } as const, measure = (text: string) => ({ width: Array.from(text).length * 8, height: 15, baseline: 12 }), measurer = { measure, invalidate() {}, destroy() {} };
it('accepts complete closed presentation, category, reference and controlled-state contracts', () => {
  const spec = { family: 'line', title: 'T', description: 'D', theme: 'auto', direction: 'rtl', font: { family: 'monospace', size: 18, weight: 700 }, legend: { position: 'end' }, tooltip: { mode: 'shared', placement: 'start' }, status: { kind: 'loading', message: 'Waiting' }, state: { mode: 'controlled', value: { hiddenSeriesIds: ['s'] } }, axes: { x: { kind: 'category', values: [{ id: 'a', label: 'A' }], edgeSpacing: 2, title: 'X', grid: true, ticks: { targetCount: 12 }, labels: { maxWidth: 256 } }, y: { kind: 'linear', nice: true, includeZero: true, reversed: true, grid: false, labels: { maxWidth: 8 } } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 'a', y: 0 }], curve: 'step-after', gaps: 'connect', markers: 'on', dash: 'solid', color: '#ABC' }], references: [{ id: 'x', axis: 'x', value: 'a', label: 'X ref', color: '#abcd', dash: 'dotted' }, { id: 'y', axis: 'y', value: 0, color: '#ABCDEF12', dash: 'solid' }] };
  const r = validateLine(spec); expect(r.status).toBe('ok'); if (r.status === 'ok') { expect(r.value.series[0]!.color).toBe('#abc'); expect(r.value.references?.[1]!.color).toBe('#abcdef12'); }
  expect(validateLine({ ...input(), font: {}, legend: {}, tooltip: {}, status: { kind: 'ready' }, state: { mode: 'internal' }, axes: { x: { kind: 'time', ticks: {}, labels: {}, domain: [0, 10], nice: false }, y: { kind: 'linear', ticks: {}, labels: {} } } }).status).toBe('ok');
});
it('rejects malformed optional fields without defaulting or coercion', () => {
  const a = input(), mutations: object[] = [
    { title: '' }, { title: 'a'.repeat(257) }, { description: '' }, { description: 'x'.repeat(2049) }, { theme: new String('light') }, { direction: 'auto' },
    { font: { size: 9 } }, { font: { size: 19 } }, { font: { size: NaN } }, { font: { weight: 900 } }, { font: { family: 'system-ui' } },
    { legend: { position: 'top' } }, { tooltip: { mode: 'average' } }, { tooltip: { placement: 'auto' } }, { status: { kind: 'ready', message: 'Extra' } }, { status: { kind: 'unknown' } },
    { state: { mode: 'internal', value: { hiddenSeriesIds: [] } } }, { state: { mode: 'other' } }, { state: { mode: 'controlled' } },
    { references: [{ id: '', axis: 'y', value: 1 }] }, { references: [{ id: 'r', axis: 'z', value: 1 }] }, { references: [{ id: 'r', axis: 'y', value: 1, label: '' }] }, { references: [{ id: 'r', axis: 'y', value: 1, dash: 'bad' }] }, { references: [{ id: 'r', axis: 'y', value: 1, color: 'rgb(1,2,3)' }] },
  ];
  for (const mutation of mutations) expect(validateLine({ ...a, ...mutation }).status).toBe('invalid');
  for (const axis of [{ kind: 'linear', values: [] }, { kind: 'linear', edgeSpacing: 1 }, { kind: 'category' }, { kind: 'category', values: [], domain: [0, 1] }, { kind: 'category', values: [], nice: false }, { kind: 'category', values: [], edgeSpacing: -1 }, { kind: 'category', values: [], edgeSpacing: 3 }, { kind: 'time', domain: [.5, 1] }, { kind: 'linear', domain: [0] }, { kind: 'linear', labels: { maxWidth: 257 } }]) expect(validateLine({ ...a, axes: { ...a.axes, x: axis } }).status).toBe('invalid');
  for (const series of [{ id: '', name: 'S', data: [] }, { id: 's', name: '', data: [] }, { id: 's', name: 'S', data: [{ id: '', x: 0, y: 1 }] }, { id: 's', name: 'S', data: [{ id: 'p', x: '0', y: 1 }] }]) expect(validateLine({ ...a, series: [series] }).status).toBe('invalid');
  expect(validateLine({ ...a, axes: { ...a.axes, x: { kind: 'category', values: [{ id: 'a' }] } }, series: [], references: [{ id: 'r', axis: 'x', value: 'missing' }] }).status).toBe('invalid');
  expect(validateLine({ ...a, axes: { ...a.axes, x: { kind: 'category', values: [{ id: 'a' }] } }, series: [], references: [{ id: 'r', axis: 'x', value: 1 }] }).status).toBe('invalid');
});
it('boundary containers reject symbols/accessors, and option/state boundary exceptions stay bounded', () => {
  const a = input(); expect(validateLine({ ...a, [Symbol('hidden')]: 1 }).status).toBe('invalid');
  const points = [a.series[0]!.data[0]]; Object.defineProperty(points, '0', { get() { throw Error('secret'); } }); expect(validateLine({ ...a, series: [{ ...a.series[0], data: points }] }).status).toBe('invalid');
  expect(validateOptions(new Proxy({}, { ownKeys() { throw Error('secret'); } })).status).toBe('invalid'); expect(validateState(new Proxy({}, { ownKeys() { throw Error('secret'); } }), new Set()).status).toBe('invalid');
  expect(validateLine({ ...a, series: [{ id: 's', name: 'S', data: new Array(50001).fill({ id: 'p', x: 0, y: null }) }, { id: 's2', name: 'S2', data: new Array(50000).fill({ id: 'p', x: 0, y: null }) }] }).status).toBe('invalid');
});
it('empty, constant, hidden and UTC domains use frozen normalization, including Date endpoints', () => {
  expect(lineDomains(data(input()), { hiddenSeriesIds: [] })).toEqual({ status: 'ok', value: { x: [.95, 1.05], y: [4.75, 5.25] } });
  const empty = { ...input(), series: [] }; expect(lineDomains(data(empty), { hiddenSeriesIds: [] })).toEqual({ status: 'ok', value: { x: null, y: null } });
  const category = { ...empty, axes: { ...empty.axes, x: { kind: 'category', values: [{ id: 'a' }] } } }; expect(lineDomains(data(category), { hiddenSeriesIds: [] })).toEqual({ status: 'ok', value: { x: null, y: null } });
  for (const explicit of [false, true]) {
    const t = data({ ...input(), axes: { ...input().axes, x: { kind: 'time', ...(explicit ? { domain: [0, 10] } : {}) } } }); expect(lineDomains(t, { hiddenSeriesIds: [] })).toMatchObject({ status: 'ok', value: { x: explicit ? [0, 10] : [-999, 1001] } });
  }
  const allNull = data({ ...input(), series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 1, y: null }] }] }); expect(lineDomains(allNull, { hiddenSeriesIds: [] })).toMatchObject({ value: { y: null } });
  const badExtent = { status: 'invalid', diagnostic: { code: 'INVALID_NUMBER', reason: 'NONFINITE', path: 'extent', message: 'NONFINITE' } } as const;
  const d = data(input()); expect(lineDomains({ ...d, series: [{ ...d.series[0]!, yExtent: badExtent }] }, { hiddenSeriesIds: [] }).status).toBe('invalid');
  expect(lineDomains({ ...d, xExtent: badExtent }, { hiddenSeriesIds: [] }).status).toBe('invalid');
  // Internal domain-planning boundaries must also reject corrupted explicit tuples rather than emit a scene.
  const malformed = { ...d, spec: { ...d.spec, axes: { ...d.spec.axes, y: { kind: 'linear', domain: [1, 1] } } } } as unknown as NormalizedLine<unknown>; expect(lineDomains(malformed, { hiddenSeriesIds: [] }).status).toBe('invalid');
});
it('projection rejects invalid domains, missing X domains and unrepresentable finite data', () => {
  const d = data(input()), plot = { x: 0, y: 0, width: 100, height: 100 };
  expect(projectLine(d, { hiddenSeriesIds: [] }, plot, [0, 2], [1, 1]).status).toBe('invalid'); expect(projectLine(d, { hiddenSeriesIds: [] }, plot, null, [0, 10]).status).toBe('invalid'); expect(projectLine(d, { hiddenSeriesIds: [] }, plot, [1, 1], [0, 10]).status).toBe('invalid');
  expect(projectLine(d, { hiddenSeriesIds: ['s'] }, plot, [0, 2], [0, 10])).toMatchObject({ status: 'ok', value: { series: [] } });
  const huge = data({ ...input(), series: [{ id: 's', name: 'S', data: [{ id: 'p', x: Number.MAX_VALUE, y: 5 }] }] }); expect(projectLine(huge, { hiddenSeriesIds: [] }, plot, [0, Number.MIN_VALUE], [0, 10])).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNREPRESENTABLE_GEOMETRY' } });
  const numeric = projectLine(d, { hiddenSeriesIds: [] }, plot, [0, 2], [0, 10]); if (numeric.status === 'ok') expect(numeric.value.mapX('1')).toBeNull();
  const categorical = data({ ...input(), axes: { ...input().axes, x: { kind: 'category', values: [{ id: 'a' }] } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 'a', y: 5 }] }] }), p = projectLine(categorical, { hiddenSeriesIds: [] }, plot, null, [0, 10]); if (p.status === 'ok') expect(p.value.mapX(1)).toBeNull();
  expect(projectLine(categorical, { hiddenSeriesIds: [] }, { ...plot, width: Infinity }, null, [0, 10]).status).toBe('invalid');
  expect(runCommands([], 'straight')).toEqual([]);
});
it('axes handle time interval precision, duplicate category labels, collision and bounded references', () => {
  for (const unit of ['year', 'month', 'day', 'week', 'hour', 'minute', 'second', 'millisecond'] as const) expect(formatAxis(0, 'time', { unit, step: 1 }, new Map())).toContain('1970');
  const r = planAxes({ x: { kind: 'category', values: Array.from({ length: 12 }, (_, i) => ({ id: String(i) })), title: 'Long X title', grid: true, ticks: { targetCount: 12 } }, y: { kind: 'linear', reversed: true, nice: false, title: 'Y title', grid: false }, domains: { x: null, y: [0, 10] }, width: 190, height: 150, font, direction: 'rtl', labels: new Map(Array.from({ length: 12 }, (_, i) => [String(i), 'Same long label'])), measurer });
  if (r.status !== 'ok') throw Error('fixture'); const layers = emptyLayers(); axesScene(r.value, { kind: 'category', grid: true }, { kind: 'linear', grid: false }, defaultPalette('dark', false), layers);
  expect(r.value.x.labels.every(l => l.full !== 'Same long label')).toBe(true); expect(layers.grid.length).toBeGreaterThan(0);
  referenceScene([{ id: 'x', axis: 'x', value: '2', label: 'X reference', color: '#fff', dash: 'dotted' }, { id: 'y', axis: 'y', value: 5, label: 'Same', dash: 'solid' }, { id: 'duplicate', axis: 'y', value: 5, label: 'Same' }, { id: 'unknown', axis: 'x', value: 'missing' }], r.value, defaultPalette('dark', false), layers, text => ({ text, ...measure(text) }));
  expect(layers['reference-lines']).toHaveLength(3); expect(layers.labels.filter(c => c.key === 'r:9:duplicate-label')).toHaveLength(0);
  const continuous = planAxes({ x: { kind: 'time' }, y: { kind: 'linear' }, domains: { x: [0, 10], y: [0, 10] }, width: 400, height: 200, font, direction: 'ltr', labels: new Map(), measurer }); expect(continuous.status).toBe('ok');
  const noDomains = planAxes({ x: { kind: 'linear' }, y: { kind: 'linear' }, domains: { x: null, y: null }, width: 400, height: 200, font, direction: 'ltr', labels: new Map(), measurer }); expect(noDomains).toMatchObject({ status: 'ok', value: { tooSmall: true } });
});
it('text measurement contains acquisition failures and verifies the final ellipsis width', () => {
  expect(createTextMeasurer({ createElement() { throw Error('platform'); } } as unknown as Document).status).toBe('invalid');
  const r = createTextMeasurer({ createElement() { return { getContext() { return { measureText() { return { width: Infinity }; } }; } }; } } as unknown as Document); if (r.status === 'ok') { expect(() => r.value.measure('x', font, 'ltr')).toThrow(); r.value.destroy(); }
  let verified = 0; const unstable = (text: string) => { if (text === 'ab…') verified++; return { width: text === 'abcd' ? 100 : text === 'ab…' && verified > 1 ? 100 : text.length * 8, height: 15, baseline: 12 }; };
  expect(ellipsis('abcd', 24, unstable)).toBe('a…');
});
it('navigation fallback covers removed identities, missing series and empty indexes', () => {
  const create = (series: unknown[]) => { const d = data({ ...input(), axes: { x: { kind: 'linear', domain: [0, 10] }, y: { kind: 'linear', domain: [0, 10] } }, series }), p = projectLine(d, { hiddenSeriesIds: [] }, { x: 0, y: 0, width: 100, height: 100 }, [0, 10], [0, 10]); if (p.status !== 'ok') throw Error('fixture'); return buildHitIndex(p.value, x => x as number); };
  const series = (id: string, x: number, pointId = id) => ({ id, name: id, data: [{ id: pointId, x, y: 5 }] });
  const old = create([series('a', 1), series('b', 5), series('c', 9)]), target = old.targets[1]![0]!, same = create([series('a', 1), series('b', 6, 'new'), series('c', 9)]);
  expect(reconcileTarget(same, target, true, 50)?.point.point.id).toBe('new'); expect(reconcileTarget(same, target, true, null)?.point.point.id).toBe('new');
  expect(reconcileTarget(create([series('a', 1), series('c', 9)]), target, true, 50)?.point.point.id).toBe('c'); expect(reconcileTarget(create([series('a', 1)]), target, true, null)?.point.point.id).toBe('a');
  const empty = create([]); expect(firstTarget(empty)).toBeNull(); expect(reconcileTarget(empty, target, true, 50)).toBeNull(); expect(navigate(empty, null, 'ArrowRight', false)).toBeNull();
  expect(navigate(old, target, 'ArrowUp', false)?.point.point.id).toBe('a'); expect(navigate(old, target, 'unhandled', false)).toBe(target);
  const duplicate = create([series('a', 1), series('b', 1)]); expect(pickPoint(duplicate, { x: 10, y: 50 }, { x: 10, y: 50 }, (x, y) => ({ x, y }))?.series.series.spec.id).toBe('a');
});
