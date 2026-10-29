import { expect, it } from 'vitest';
import type { MixedChartSpec, MixedSeries } from '../../src/public/mixed-types.js';
import { mixedPolicy } from '../../src/mixed/strategy.js';
import { validateMixed } from '../../src/mixed/validate.js';
import { normalizeMixed, mixedDomains } from '../../src/mixed/data.js';
import { describeMixed } from '../../src/mixed/describe.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { familyFrame } from '../../src/internal/chart/frame.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
import { pointKey } from '../../src/line/normalize.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer = { measure(text: string) { return { width: [...text].length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
const categoryIds = ['jan-a', 'jan-b', 'feb', 'mar'];
function base(): MixedChartSpec<{ original: string }> {
  const series = (id: string, kind: MixedSeries['kind'], values: readonly (number | null)[]) => ({ id, name: id, kind, data: values.map((y, i) => ({ id: 'p' + i, x: categoryIds[i]!, y, datum: { original: id + i } })) });
  return { family: 'mixed', title: 'Measured mixed', axes: { x: { kind: 'category', values: categoryIds.map(id => ({ id, label: id.startsWith('jan') ? 'January' : id })) }, y: { kind: 'linear' } }, series: [series('area', 'area', [2, 5, null, 3]), series('column-a', 'column', [4, -2, 0, 6]), series('line', 'line', [7, 3, 8, 4]), series('column-b', 'column', [1, 4, -3, null])], tooltip: { mode: 'shared' }, labels: 'auto' };
}
function compute(input: unknown = base(), hidden: readonly string[] = [], width = 768, height = 400, previousViewport: Parameters<ReturnType<typeof mixedPolicy>['compute']>[6] = null) {
  const policy = mixedPolicy<{ original: string }>(), parsed = policy.parse(input); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed));
  const spec = parsed.value, state = policy.state(hidden), shell = shellFrame({ width, height }, false, policy.names(spec), 'bottom', font, spec.direction ?? 'ltr', measurer), viewport = previousViewport ?? policy.viewport.prepare(spec, state, null); const applied = viewport && 'status' in viewport ? (viewport.status === 'ok' ? viewport.value : null) : viewport;
  const result = policy.compute(spec, state, shell, defaultPalette(spec.theme ?? 'light', false), font, measurer, applied); if (result.status === 'invalid') throw Error(JSON.stringify(result));
  return { policy, spec, state, c: result.value };
}
function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
it('has one shared frame/band index with independent grouped columns and center-aligned Line/Area', () => {
  const { c } = compute(), p = c.projection, frame = p.frame!; expect(frame.points).toBe(frame.bands); expect(p.column!.bands).toBe(frame.bands);
  for (const [i, id] of categoryIds.entries()) {
    const expected = p.plot.x + p.plot.width * (i + .5) / categoryIds.length;
    expect(frame.points.center(id)).toBeCloseTo(expected, 10); expect(c.axes!.mapX(id)).toBe(frame.points.center(id));
    for (const series of p.line.series) for (const point of series.points.filter(point => point.point.x === id)) expect(point.x).toBe(frame.points.center(id));
    const rects = p.column!.rects.filter(rect => rect.point.x === id).sort((a, b) => a.x - b.x); if (rects.length === 2) expect(rects[0]!.x + rects[0]!.width).toBeLessThan(rects[1]!.x);
  }
});
it('combines all visible extrema and keeps a truthful zero baseline across legend changes', () => {
  const data = normalizeMixed(base()), all = mixedDomains(data, { hiddenSeriesIds: [] }); expect(all).toEqual({ status: 'ok', value: { x: null, y: [-3, 8] } });
  expect(mixedDomains(data, { hiddenSeriesIds: ['column-a', 'column-b', 'area'] })).toEqual({ status: 'ok', value: { x: null, y: [0, 8] } });
  for (const hidden of [[], ['column-a'], ['line'], ['area', 'line']]) {
    const { c } = compute(base(), hidden); for (const rect of c.projection.column!.rects) { const zero = c.axes!.mapY(0)!; if (rect.point.y! >= 0) expect(rect.y + rect.height).toBeCloseTo(zero, 8); else expect(rect.y).toBeCloseTo(zero, 8); }
  }
});
it('groups only visible Column series; hidden Area/Line cannot consume a subslot', () => {
  const both = compute(), onlyLinesHidden = compute(base(), ['area', 'line']), oneColumnHidden = compute(base(), ['column-b']);
  expect(both.c.projection.column!.slotWidth).toBe(onlyLinesHidden.c.projection.column!.slotWidth);
  expect(oneColumnHidden.c.projection.column!.slotWidth).toBeGreaterThan(both.c.projection.column!.slotWidth);
  const rect = oneColumnHidden.c.projection.column!.rects[0]!; expect(rect.anchor.x).toBe(oneColumnHidden.c.axes!.mapX(rect.point.x));
});
it('clips applied positive-only domains at the domain edge and retains original raw values', () => {
  const spec = base(), { c, policy, state } = compute({ ...spec, axes: { ...spec.axes, y: { kind: 'linear', domain: [2, 5] } } });
  for (const rect of c.projection.column!.rects) { expect(rect.y).toBeGreaterThanOrEqual(c.projection.plot.y - 1e-9); expect(rect.y + rect.height).toBeLessThanOrEqual(c.projection.plot.y + c.projection.plot.height + 1e-9); expect(rect.point.y).toBeGreaterThanOrEqual(2); }
  const data = policy.exportRecords(c.projection.data.spec, state, c); expect(data.rows.some(row => row.includes(-3))).toBe(true); expect(data.columns).toContain('Kind');
});
it('supports reversed Y, negative/zero/tiny/large domains with finite deterministic Scene commands', () => {
  for (const values of [[0, 0, 0, 0], [-3, -5, -1, -7], [1e-200, 3e-200, 0, -2e-200], [1e150, -2e150, 3e150, 0]]) for (const reversed of [false, true]) {
    const spec = base(), series = spec.series.map(s => ({ ...s, data: s.data.map((p, i) => ({ ...p, y: values[i]! })) }));
    const { c } = compute({ ...spec, axes: { ...spec.axes, y: { kind: 'linear', reversed } }, series });
    expect(validateSceneFrame(familyFrame(1, c.shell.body.width, c.shell.body.height, c.layers, c)).status).toBe('ok');
    for (const r of c.projection.column!.rects) expect([r.x, r.y, r.width, r.height].every(Number.isFinite)).toBe(true);
  }
});
it('keeps duplicate labels as distinct categories and shares exact original data/kind in tooltip/event/table/CSV', () => {
  const { c, policy, spec, state } = compute(freeze(base())), target = c.projection.index.byId.get(pointKey('column-a', 'p1'))!;
  const event = policy.activate(target, 'keyboard', 7); expect(event.kind).toBe('column'); expect(event.point).toBe(spec.series[1]!.data[1]); expect(event.point.datum).toEqual({ original: 'column-a1' }); expect(event.xKind).toBe('category');
  const tooltip = policy.tooltip(c, target, 7); expect(tooltip.header).toBe('January (jan-b)'); expect(tooltip.rows).toHaveLength(4); expect(tooltip.rows.find(row => row.seriesId === 'column-a')!.value).toBe(-2);
  expect(c.description.table.rows[5]!.cells).toEqual(['column-a', 'column', 'p1', 'jan-b', 'January (jan-b)', '-2', 'Visible']);
  const csv = policy.exportRecords(spec, state, c); expect(JSON.stringify(csv)).not.toContain('original'); expect(policy.semantic(c, target).text).toContain('Kind: column');
});
it('distinguishes explicit null, absent category and zero and breaks missing Area/Line runs without synthetic raw points', () => {
  const spec = base(), series = spec.series.map(s => s.id === 'line' ? { ...s, data: s.data.filter(p => p.x !== 'jan-b') } : s);
  const { c, policy } = compute({ ...spec, series }), line = c.projection.data.line.series.find(s => s.spec.id === 'line')!;
  expect(line.runs.map(run => run.map(p => p.x))).toEqual([['jan-a'], ['feb', 'mar']]); expect(line.points).toHaveLength(3);
  const target = c.projection.index.byId.get(pointKey('column-a', 'p1'))!, tooltip = policy.tooltip(c, target, 1); expect(tooltip.rows.find(row => row.seriesId === 'line')!.availability).toBe('absent');
  expect(c.projection.column!.byId.get(pointKey('column-a', 'p2'))!.height).toBe(0); expect(c.projection.index.byId.has(pointKey('area', 'p2'))).toBe(false);
});
it('renders area then columns then line while keyboard and legend keep consumer series order', () => {
  const { c, policy } = compute(), marks = c.layers.marks, firstColumn = marks.findIndex(m => m.kind === 'rect'), lastColumn = marks.map(m => m.kind).lastIndexOf('rect'), linePath = marks.findIndex(m => m.kind === 'path' && m.key.includes('4:line|'));
  expect(firstColumn).toBeGreaterThan(0); expect(linePath).toBeGreaterThan(lastColumn); expect(c.legend.map(item => item.id)).toEqual(['area', 'column-a', 'line', 'column-b']);
  let target = policy.reconcile(c.projection, null, 0)!; expect(target.series.series.spec.id).toBe('area'); target = policy.navigate(c.projection, target, 'ArrowDown', false)!; expect(target.series.series.spec.id).toBe('column-a'); target = policy.navigate(c.projection, target, 'ArrowDown', false)!; expect(target.series.series.spec.id).toBe('line');
});
it('selects the actual grouped rectangle even far from its endpoint and honors point marks painted above it', () => {
  const { c, policy } = compute(), r = c.projection.column!.byId.get(pointKey('column-a', 'p0'))!;
  const picked = policy.pick(c.projection, r.x + r.width / 2, r.y + r.height * .75); expect(picked?.series.series.spec.id).toBe('column-a'); expect(picked?.point.point.id).toBe('p0');
  expect(policy.pick(c.projection, NaN, 0)).toBeNull(); expect(policy.pick(c.projection, -100, -100)).toBeNull();
});
it('uses the same scoped frame after zoom, retains edge segments/raw data, and restores stable identities on reconstruction/kind change', () => {
  const spec = base(), { c, policy } = compute({ ...spec, viewport: { mode: 'internal', axes: 'xy', initial: { x: { firstId: 'jan-b', lastId: 'feb' }, y: [-3, 8] } } });
  const frame = c.projection.frame!; expect(frame.frame.ids).toEqual(['jan-b', 'feb']); expect(c.projection.column!.bands).toBe(frame.bands);
  expect(c.axes!.mapX('jan-a')).toBeLessThan(c.projection.plot.x); expect(c.projection.index.byId.has(pointKey('line', 'p0'))).toBe(false); expect(c.description.table.rows).toHaveLength(16);
  for (const rect of c.projection.column!.rects) expect(['jan-b', 'feb']).toContain(rect.point.x);
  const old = c.projection.index.byId.get(pointKey('column-a', 'p1'))!, reconstructed = compute({ ...structuredClone(spec), series: spec.series.map(s => s.id === 'column-a' ? { ...s, kind: 'line' } : s) });
  const current = policy.reconcile(reconstructed.c.projection, policy.identity(old), policy.order(old))!; expect(current.point.point.id).toBe('p1'); expect(current.series.series.spec.id).toBe('column-a');
});
it('handles empty/no-visible/loading/error/tiny with no stale interactive geometry', () => {
  for (const width of [0, 24, 160, 320, 768]) for (const status of [undefined, { kind: 'loading' }, { kind: 'error', message: 'Unavailable' }, { kind: 'empty' }]) {
    const { c, policy } = compute({ ...base(), ...(status ? { status } : {}) }, [], width); if (!width || status) expect(policy.enabled(c)).toBe(false);
    if (status) expect(c.layers.marks).toEqual([]); const scene = validateSceneFrame(familyFrame(1, c.shell.body.width, c.shell.body.height, c.layers, c));
    if (!c.shell.body.width || !c.shell.body.height) { expect(scene.status).toBe('invalid'); if (scene.status === 'invalid') expect(scene.diagnostic.reason).toBe('BAD_SIZE'); expect(c.layers.marks).toEqual([]); expect(policy.enabled(c)).toBe(false); }
    else expect(scene.status, JSON.stringify({ width, status, body: c.shell.body, scene })).toBe('ok');
  }
  expect(compute(base(), base().series.map(s => s.id)).c.description.view).toBe('no-visible-series'); expect(compute({ ...base(), series: [] }).c.description.view).toBe('empty');
});
it('rejects invalid runtime options, getters, duplicate/unknown identities, nonfinite values and unsupported composition', () => {
  const s = base(); const bad = [ { ...s, family: 'line' }, { ...s, stacking: 'sum' }, { ...s, orientation: 'horizontal' }, { ...s, groupGap: 1 }, { ...s, axes: { ...s.axes, x: { ...s.axes.x, edgeSpacing: 0 } } }, { ...s, axes: { ...s.axes, y: { kind: 'linear', includeZero: false } } }, { ...s, series: s.series.map(a => a.kind === 'column' ? { ...a, curve: 'straight' } : a) }, { ...s, series: [...s.series, s.series[0]] }, { ...s, series: [{ ...s.series[0], data: [{ id: 'p', x: 'unknown', y: 1 }] }] }, ...[NaN, Infinity, undefined].map(y => ({ ...s, series: [{ ...s.series[0], data: [{ id: 'p', x: 'feb', y }] }] })), { ...s, series: [{ ...s.series[0], data: [{ id: 'p', x: 'feb', y: 1 }, { id: 'q', x: 'jan-a', y: 2 }] }] } ];
  for (const value of bad) expect(validateMixed(value).status).toBe('invalid'); let calls = 0; const getter = Object.defineProperty({ ...s }, 'title', { get() { calls++; return 'unsafe'; } }); expect(validateMixed(getter).status).toBe('invalid'); expect(calls).toBe(0);
});
it('validates SSR description selection/viewport rather than pretending invalid state is ready', () => {
  const spec = base(); expect(describeMixed({ ...spec, viewport: { mode: 'internal', axes: 'x', initial: { x: { firstId: 'missing', lastId: 'feb' } } } }).status).toBe('invalid');
  expect(describeMixed({ ...spec, selection: { mode: 'controlled', kind: 'single', value: [{ seriesId: 'line', pointId: 'missing' }] } }).status).toBe('invalid');
  const result = describeMixed({ ...spec, selection: { mode: 'controlled', kind: 'single', value: [{ seriesId: 'line', pointId: 'p0' }] } }); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(result.value.table.columns).toContain('Selected');
});
it('keeps independent centers and finite geometry through deterministic multi-density mixed updates', () => {
  for (let round = 1; round <= 30; round++) {
    const n = round * 3, ids = Array.from({ length: n }, (_, i) => 'c' + i), spec: MixedChartSpec = { family: 'mixed', title: 'Deterministic', axes: { x: { kind: 'category', values: ids.map(id => ({ id, label: 'Repeated' })) }, y: { kind: 'linear', reversed: round % 2 === 0 } }, series: (['area', 'column', 'line', 'column'] as const).map((kind, j) => ({ kind, id: 's' + j, name: 'S' + j, data: ids.map((x, i) => ({ id: 'p' + i, x, y: (i * 17 + j * 5 + round) % 11 === 0 ? null : ((i + j + 1) * 13 % 17 - 8) * .25 })) })), groupGap: (round % 9) / 10 };
    const { c } = compute(freeze(spec)); expect(c.projection.column!.bands).toBe(c.projection.frame!.bands); expect(validateSceneFrame(familyFrame(round, c.shell.body.width, c.shell.body.height, c.layers, c)).status).toBe('ok');
    for (const [i, id] of ids.entries()) expect(c.axes!.mapX(id)).toBeCloseTo(c.projection.plot.x + c.projection.plot.width * (i + .5) / n, 8);
  }
});
