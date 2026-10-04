import { test } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { validateLine } from '../../src/line/validate.js';
import { normalizeLine, lineDomains } from '../../src/line/normalize.js';
import { projectLine } from '../../src/line/geometry.js';
import { buildHitIndex, pickPoint } from '../../src/line/hit-index.js';
import { tooltipModel } from '../../src/internal/tooltip/model.js';
import { placeTooltip } from '../../src/internal/tooltip/place.js';
import type { Placement } from '../../src/internal/tooltip/place.js';
import type { PathCommand } from '../../src/internal/geometry/path.js';
import type { LineChartSpec } from '../../src/public/line-types.js';

function requireTrue(condition: boolean, message: string): asserts condition { if (!condition) throw Error(message); }
function run<T extends unknown[]>(name: string, property: fc.IProperty<T>, seed: number): void {
  const extended = process.env.NC_PROPERTY_EXTENDED === '1', result = fc.check(property, { seed: Number(process.env.NC_PROPERTY_SEED ?? seed), ...(process.env.NC_PROPERTY_PATH ? { path: process.env.NC_PROPERTY_PATH } : {}), numRuns: extended ? 10000 : 1000, interruptAfterTimeLimit: 10000, markInterruptAsFailure: true, verbose: 1 });
  const dir = path.resolve('artifacts/nc-01b/property', extended ? 'extended' : 'ordinary'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ name, seed: result.seed, successfulRuns: result.numRuns, interrupted: result.interrupted, failed: result.failed, counterexample: result.counterexample, shrinkPath: result.counterexamplePath, timestamp: new Date().toISOString() }, null, 2));
  requireTrue(!result.failed && !result.interrupted && result.numRuns === (extended ? 10000 : 1000), `Property ${name} failed: seed=${result.seed}, path=${result.counterexamplePath}, counterexample=${JSON.stringify(result.counterexample)} ${result.errorInstance instanceof Error ? result.errorInstance.message : ''}`);
}
const values = fc.array(fc.oneof(fc.constant(null), fc.integer({ min: -10, max: 10 })), { minLength: 0, maxLength: 24 });
type LinearSpec = Extract<LineChartSpec, { axes: { x: { kind: 'linear' } } }>;
function snapshot(ys: readonly (number | null)[], extra: object = {}): LinearSpec {
  return { family: 'line', title: 'Properties', axes: { x: { kind: 'linear', domain: [0, 100] }, y: { kind: 'linear', domain: [-10, 10] } }, series: [{ id: 's', name: 'Series', data: ys.map((y, i) => ({ id: 'p' + i, x: i * 3, y })), ...extra }] };
}
function normalized(input: LineChartSpec) { const r = validateLine(input); requireTrue(r.status === 'ok', 'valid fixture rejected'); return normalizeLine(r.value); }
function projection(input: LineChartSpec, width = 100) { const data = normalized(input), r = projectLine(data, { hiddenSeriesIds: [] }, { x: 0, y: 0, width, height: 100 }, [0, 100], [-10, 10]); requireTrue(r.status === 'ok', 'projection rejected'); return r.value; }
test('B1 canonical order, identity, caller immutability and exact duplicate rejection', () => run('B1-snapshot', fc.property(values, ys => {
  const input = snapshot(ys), before = JSON.stringify(input), data = normalized(input);
  requireTrue(JSON.stringify(input) === before, 'caller mutated'); requireTrue(data.series[0]!.points.every((p, i) => p.id === 'p' + i && p.x === i * 3 && p.y === ys[i]), 'order/identity changed');
  if (ys.length) { const s = input.series[0]!, bad = { ...input, series: [{ ...s, data: [...s.data, { ...s.data[0]!, id: 'duplicate-x' }] }] }; const rejected = validateLine(bad); requireTrue(rejected.status === 'invalid' && rejected.diagnostic.reason === 'DUPLICATE_X', 'duplicate accepted'); }
}), 201));
test('B2 break/connect runs follow only explicit nulls, never absent synthetic samples', () => run('B2-gaps', fc.property(values, fc.boolean(), (ys, connect) => {
  const data = normalized(snapshot(ys, { gaps: connect ? 'connect' : 'break' })), expected: string[][] = []; let current: string[] = [];
  ys.forEach((y, i) => { if (y === null) { if (!connect && current.length) { expected.push(current); current = []; } } else current.push('p' + i); }); if (current.length) expected.push(current);
  requireTrue(JSON.stringify(data.series[0]!.runs.map(r => r.map(p => p.id))) === JSON.stringify(expected), 'run boundary differs'); requireTrue(data.series[0]!.valid.length === ys.filter(y => y !== null).length, 'nonnull sample count changed');
}), 202));
test('B3 straight endpoints follow independent affine projection and gap boundaries', () => run('B3-straight', fc.property(values, ys => {
  const p = projection(snapshot(ys)), expected: { kind: string; x: number; y: number }[] = []; let start = 0;
  while (start < ys.length) { if (ys[start] === null) { start++; continue; } let end = start + 1; while (end < ys.length && ys[end] !== null) end++; if (end - start >= 2) for (let i = start; i < end; i++) expected.push({ kind: i === start ? 'M' : 'L', x: i * 3, y: (10 - ys[i]!) * 5 }); start = end; }
  const actual = p.series[0]!.commands; requireTrue(actual.length === expected.length, 'stroke/run count differs'); actual.forEach((c, i) => { const e = expected[i]!; requireTrue(c.kind === e.kind && 'x' in c && Math.abs(c.x - e.x) < 1e-12 && Math.abs(c.y - e.y) < 1e-12, 'independent endpoint mismatch'); });
}), 203));
test('B4 step formulas, monotone X, reversed Y and odd-millisecond intervals', () => run('B4-steps', fc.property(fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 2, maxLength: 24 }), fc.constantFrom('step-before', 'step-after', 'step-mid'), fc.boolean(), fc.boolean(), (ys, curve, reversed, time) => {
  const input = snapshot(ys, { curve });
  const spec: LineChartSpec = time ? { ...input, axes: { x: { kind: 'time', domain: [0, 100] }, y: { kind: 'linear', domain: [-10, 10], reversed } } } : { ...input, axes: { x: { kind: 'linear', domain: [0, 100] }, y: { kind: 'linear', domain: [-10, 10], reversed } } };
  const p = projection(spec), expected: { kind: string; x: number; y: number }[] = [], y = (i: number) => reversed ? (ys[i]! + 10) * 5 : (10 - ys[i]!) * 5;
  expected.push({ kind: 'M', x: 0, y: y(0) });
  for (let i = 1; i < ys.length; i++) { const x0 = (i - 1) * 3, x1 = i * 3; if (curve === 'step-before') expected.push({ kind: 'L', x: x0, y: y(i) }); else if (curve === 'step-after') expected.push({ kind: 'L', x: x1, y: y(i - 1) }); else expected.push({ kind: 'L', x: x0 + 1.5, y: y(i - 1) }, { kind: 'L', x: x0 + 1.5, y: y(i) }); expected.push({ kind: 'L', x: x1, y: y(i) }); }
  const actual = p.series[0]!.commands; requireTrue(actual.length === expected.length, 'step command count differs'); actual.forEach((c, i) => { const e = expected[i]!; requireTrue(c.kind === e.kind && 'x' in c && Math.abs(c.x - e.x) < 1e-12 && Math.abs(c.y - e.y) < 1e-12, 'step formula differs'); });
}), 204));
test('B5 visible Y excludes null/hidden while all-series X and explicit domains remain stable', () => run('B5-domains', fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 100 }), fc.boolean(), (lo, span, explicit) => {
  const spec: LineChartSpec = { family: 'line', title: 'D', axes: { x: { kind: 'linear', ...(explicit ? { domain: [-10, 80] as const } : {}) }, y: { kind: 'linear', ...(explicit ? { domain: [-2000, 2000] as const } : {}) } }, series: [{ id: 'visible', name: 'V', data: [{ id: 'a', x: 0, y: lo }, { id: 'b', x: 2, y: lo + span }, { id: 'null', x: 57, y: null }] }, { id: 'hidden', name: 'H', data: [{ id: 'h', x: 50, y: 1e6 }] }], references: [{ id: 'r', axis: 'x', value: 1e8 }, { id: 'ry', axis: 'y', value: -1e9 }] };
  const result = lineDomains(normalized(spec), { hiddenSeriesIds: ['hidden'] }); requireTrue(result.status === 'ok', 'domain rejected'); requireTrue(JSON.stringify(result.value) === JSON.stringify({ x: explicit ? [-10, 80] : [0, 57], y: explicit ? [-2000, 2000] : [lo, lo + span] }), 'domain visibility/reference policy differs');
}), 205));
test('B6 auto marker policy has exact 200 count and 8px spacing; off creates none', () => run('B6-markers', fc.property(fc.integer({ min: 0, max: 201 }), fc.integer({ min: 40, max: 3000 }), fc.constantFrom('auto', 'on', 'off'), (count, width, markers) => {
  const input: LineChartSpec = { family: 'line', title: 'M', axes: { x: { kind: 'linear', domain: [0, 300] }, y: { kind: 'linear', domain: [0, 10] } }, series: [{ id: 's', name: 'S', markers, data: Array.from({ length: count }, (_, x) => ({ id: String(x), x, y: 5 })) }] };
  const p = projectLine(normalized(input), { hiddenSeriesIds: [] }, { x: 0, y: 0, width, height: 100 }, [0, 300], [0, 10]); requireTrue(p.status === 'ok', 'markers projection rejected');
  // Independent bounded affine coordinates preserve actual binary64 spacing at the exact 8px boundary.
  const coordinates = Array.from({ length: count }, (_, x) => x / 300 * width); let minimumSpacing = Infinity;
  for (let i = 1; i < count; i++) minimumSpacing = Math.min(minimumSpacing, coordinates[i]! - coordinates[i - 1]!);
  const expected = markers === 'off' ? 0 : markers === 'on' || count <= 200 && minimumSpacing >= 8 ? count : 0;
  requireTrue(p.value.series[0]!.markers.length === expected, 'marker count policy differs'); requireTrue(p.value.series[0]!.markers.every(p => p.point.y === 5), 'marker fabricated');
}), 206));
test('B7 hit policy matches an independent linear nearest-X-candidate oracle; shared exact matching', () => run('B7-hits', fc.property(values, values, fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (a, b, mx, my) => {
  const input = snapshot(a, { markers: 'off' }), spec: LineChartSpec = { ...input, series: [...input.series, { id: 'other', name: 'Other', markers: 'off', data: b.map((y, i) => ({ id: 'b' + i, x: i * 3 + 1, y })) }] }, data = normalized(spec), p = projection(spec), index = buildHitIndex(p, x => x as number);
  const candidates: { id: string; series: number; order: number; x: number; y: number; d: number; dx: number }[] = [];
  // The independently tested projection is the input to this search-policy oracle, never the hit index/result.
  p.series.forEach((s, si) => {
    const points = s.points.filter(p => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100).map(p => ({ id: p.point.id, series: si, order: p.index, x: p.x, y: p.y }));
    const successor = points.findIndex(p => p.x >= mx), right = successor < 0 ? points.length : successor;
    for (const i of [right - 1, right]) { const p = points[i]; if (!p) continue; const dx = Math.abs(p.x - mx), d = dx ** 2 + (p.y - my) ** 2; if (d <= 144) candidates.push({ ...p, d, dx }); }
  });
  candidates.sort((a, b) => a.d - b.d || a.dx - b.dx || a.series - b.series || a.order - b.order);
  const actual = pickPoint(index, { x: mx, y: my }, { x: mx, y: my }, (x, y) => ({ x, y })); requireTrue((actual?.point.point.id ?? null) === (candidates[0]?.id ?? null), 'nearest-X candidate differs');
  if (actual) {
    const series = data.series.map(s => ({ id: s.spec.id, name: s.spec.name, color: '#123', dash: s.dash, byX: s.byX })), model = tooltipModel(1, actual.series.series.spec.id, actual.point.point.id, actual.point.point.x, 'linear', 'shared', series, new Map());
    model.rows.forEach((r, i) => { const ys = i === 0 ? a : b, x = actual.point.point.x as number, j = (x - i) / 3, exists = Number.isInteger(j) && j >= 0 && j < ys.length; requireTrue(r.availability === (!exists ? 'absent' : ys[j] === null ? 'null' : 'value'), 'shared exact-X policy differs'); });
  }
}), 207));
test('B8 solver finite bounds, oversize docking, empty area and logical preferred placement', () => run('B8-tooltip-place', fc.property(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 1, max: 600 }), fc.integer({ min: 1, max: 600 }), fc.integer({ min: -100, max: 600 }), fc.integer({ min: -100, max: 600 }), fc.constantFrom<Placement>('top', 'bottom', 'start', 'end'), fc.boolean(), (w, h, tw, th, ax, ay, preferred, rtl) => {
  const r = placeTooltip({ x: ax, y: ay, width: 0, height: 0 }, { width: tw, height: th }, { x: 0, y: 0, width: w, height: h }, preferred, rtl ? 'rtl' : 'ltr');
  if (w <= 16 || h <= 16) requireTrue(r.kind === 'closed', 'no area did not close');
  else if (tw > w - 16 || th > h - 16) requireTrue(r.kind === 'docked', 'oversize did not dock');
  else { requireTrue(r.kind === 'floating', 'fitting box did not float'); requireTrue(Number.isFinite(r.x) && Number.isFinite(r.y) && r.x >= 8 && r.y >= 8 && r.x + tw <= w - 8 && r.y + th <= h - 8, 'unbounded/nonfinite box');
    const horizontal = preferred === 'start' || preferred === 'end', left = preferred === (rtl ? 'end' : 'start'), x = horizontal ? left ? ax - 8 - tw : ax + 8 : ax - tw / 2, y = horizontal ? ay - th / 2 : preferred === 'top' ? ay - 8 - th : ay + 8;
    if (x >= 8 && y >= 8 && x + tw <= w - 8 && y + th <= h - 8) requireTrue(r.placement === preferred && r.x === x && r.y === y, 'preferred fully fitting candidate not chosen');
  }
}), 208));
// Type-only guard: property oracles construct explicit command records, never production expected output.
export type PropertyCommand = PathCommand;
