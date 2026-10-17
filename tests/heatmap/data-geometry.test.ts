import { expect, it } from 'vitest';
import { validateHeatmap } from '../../src/heatmap/validate.js';
import { coordinateKey } from '../../src/heatmap/data.js';
import { projectHeatmap, pickHeatmap, navigateHeatmap, firstHeatmapTarget, reconcileHeatmap, heatmapIdentity, heatmapOrder } from '../../src/heatmap/geometry.js';
import { heatmapViewport } from '../../src/heatmap/viewport.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import { withViewportAxes } from '../../src/internal/interaction/viewport-axes.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const, measurer = { measure(text: string) { return { width: text.length * 6.5, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
function input(rows = 3, columns = 4) { return { family: 'heatmap', title: 'Measured grid', axes: { x: { kind: 'category', values: Array.from({ length: columns }, (_, i) => ({ id: 'c' + i, label: 'Column ' + i })) }, y: { kind: 'category', values: Array.from({ length: rows }, (_, i) => ({ id: 'r' + i, label: 'Row ' + i })) } }, data: [{ id: 'observed', rowId: 'r0', columnId: 'c0', value: 0 }, { id: 'missing', rowId: 'r1', columnId: 'c1', value: null }, { id: 'high', rowId: 'r2', columnId: 'c1', value: 5 }] }; }
function project(raw: unknown) {
  const parsed = validateHeatmap(raw); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed)); const data = parsed.value;
  const viewport = heatmapViewport(data); if (viewport.status !== 'ok') throw Error(JSON.stringify(viewport));
  const scoped = withViewportAxes(data.spec.axes, viewport.value); if (scoped.status !== 'ok') throw Error(JSON.stringify(scoped));
  const planned = planAxes({ x: scoped.value.x, y: scoped.value.y, domains: { x: null, y: null }, width: 744, height: 340, font, direction: data.spec.direction ?? 'ltr', labels: data.columnLabels, yLabels: data.rowLabels, measurer }); if (planned.status !== 'ok') throw Error(JSON.stringify(planned));
  const result = projectHeatmap(data, planned.value, scoped.value); if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value;
}
it('distinguishes zero, explicit null and absent coordinates without materializing a matrix', () => {
  const p = project(input()); expect(p.data.observedCount).toBe(2); expect(p.data.extent).toEqual([0, 5]); expect(p.cells).toHaveLength(2); expect(p.byId.size).toBe(3);
  expect(p.targetAt(0, 0)!.cell!.value).toBe(0); expect(p.targetAt(1, 1)!.cell!.value).toBe(null); expect(p.targetAt(0, 1)!.cell).toBe(null);
  const target = p.targetAt(0, 1)!; expect(pickHeatmap(p, target.cx, target.cy)!.cell).toBe(null); expect(heatmapIdentity(target)).toBe('m:' + coordinateKey('r0', 'c1'));
});
it('rejects duplicates, unknown coordinates, nonfinite values, sparse arrays and unsupported configuration', () => {
  const original = input(), cases = [
    { ...original, data: [...original.data, { id: 'other', rowId: 'r0', columnId: 'c0', value: 1 }] },
    { ...original, data: [...original.data, { id: 'observed', rowId: 'r2', columnId: 'c3', value: 1 }] },
    { ...original, data: [{ id: 'bad', rowId: 'unknown', columnId: 'c0', value: 1 }] },
    ...[NaN, Infinity, undefined].map(value => ({ ...original, data: [{ id: 'bad', rowId: 'r0', columnId: 'c0', value }] })),
    { ...original, data: new Array(2) }, { ...original, gapRatio: .6 }, { ...original, axes: { ...original.axes, y: { ...original.axes.y, kind: 'linear' } } },
    { ...original, selection: { mode: 'internal', initial: [{ pointId: 'missing' }] } }, { ...original, selection: { mode: 'internal', initial: [{ seriesId: 'fake', pointId: 'observed' }] } },
  ];
  for (const raw of cases) expect(validateHeatmap(raw).status).toBe('invalid');
});
it('keeps descriptor validation and opaque original datum identity without evaluating getters', () => {
  let calls = 0; const datum = Object.freeze({ get secret() { calls++; throw Error('Do not inspect opaque data'); } }), raw = input();
  const data = [{ ...raw.data[0]!, datum }]; const parsed = validateHeatmap({ ...raw, data }); expect(parsed.status).toBe('ok'); if (parsed.status === 'ok') expect(parsed.value.spec.data[0]!.datum).toBe(datum); expect(calls).toBe(0);
  const hostile = { ...raw }; Object.defineProperty(hostile, 'data', { enumerable: true, get() { calls++; return []; } }); expect(validateHeatmap(hostile).status).toBe('invalid'); expect(calls).toBe(0);
});
it('uses collision-safe row/column pairs and independent axis labels', () => {
  const raw = { family: 'heatmap', title: 'Names', axes: { x: { kind: 'category', values: [{ id: 'c', label: 'Column C' }, { id: 'b:c', label: 'Other column' }] }, y: { kind: 'category', values: [{ id: 'a:b', label: 'First row' }, { id: 'a', label: 'Other row' }] } }, data: [{ id: 'one', rowId: 'a:b', columnId: 'c', value: 1 }, { id: 'two', rowId: 'a', columnId: 'b:c', value: 2 }] };
  const p = project(raw); expect(p.data.cells.size).toBe(2); expect(p.targetAt(0, 0)!.cell!.id).toBe('one'); expect(p.targetAt(1, 1)!.cell!.id).toBe('two'); expect(p.axes.x.labels.map(label => label.full)).toContain('Column C'); expect(p.axes.y.labels.map(label => label.full)).toContain('First row');
  const sameId = project({ ...raw, axes: { x: { kind: 'category', values: [{ id: 'same', label: 'Column name' }] }, y: { kind: 'category', values: [{ id: 'same', label: 'Row name' }] } }, data: [{ id: '__proto__', rowId: 'same', columnId: 'same', value: 0 }] }); expect(sameId.axes.x.labels[0]!.full).toBe('Column name'); expect(sameId.axes.y.labels[0]!.full).toBe('Row name');
});
it('fits finite nonoverlapping bands and rejects pointer gaps in both orientations', () => {
  for (const reversed of [false, true]) {
    const raw = input(), p = project({ ...raw, gapRatio: .2, axes: { x: { ...raw.axes.x, reversed }, y: { ...raw.axes.y, reversed } } }), plot = p.axes.plot;
    for (const target of p.cells) { expect([target.x, target.y, target.width, target.height].every(Number.isFinite)).toBe(true); expect(target.x).toBeGreaterThanOrEqual(plot.x); expect(target.y).toBeGreaterThanOrEqual(plot.y); expect(target.x + target.width).toBeLessThanOrEqual(plot.x + plot.width); expect(target.y + target.height).toBeLessThanOrEqual(plot.y + plot.height); expect(target.cx).toBeCloseTo(p.axes.mapX(target.columnId)!, 10); expect(target.cy).toBeCloseTo(p.axes.mapY(target.row)!, 10); expect(pickHeatmap(p, target.cx, target.cy)!.cell!.id).toBe(target.cell!.id); }
    const a = p.targetAt(0, 0)!, b = p.targetAt(0, 1)!, gap = (reversed ? a.x + b.x + b.width : a.x + a.width + b.x) / 2; expect(pickHeatmap(p, gap, a.cy)).toBe(null);
  }
});
it('navigates missing coordinates, follows explicit reversed axes and preserves IDs through reconstruction', () => {
  const p = project(input()), first = firstHeatmapTarget(p)!; expect(first.cell!.id).toBe('observed');
  const missing = navigateHeatmap(p, first, 'ArrowRight', false)!; expect(missing.cell).toBe(null); const down = navigateHeatmap(p, missing, 'ArrowDown', false)!; expect(down.cell!.id).toBe('missing');
  const end = navigateHeatmap(p, first, 'End', true)!; expect([end.row, end.column]).toEqual([2, 3]); expect(navigateHeatmap(p, end, 'ArrowRight', false)).toBe(end);
  const rebuilt = project(structuredClone(input())); expect(reconcileHeatmap(rebuilt, heatmapIdentity(missing), heatmapOrder(p, missing))!.columnId).toBe('c1'); expect(reconcileHeatmap(rebuilt, heatmapIdentity(first), 0)!.cell!.id).toBe('observed');
  const raw = input(), reversed = project({ ...raw, axes: { x: { ...raw.axes.x, reversed: true }, y: { ...raw.axes.y, reversed: true } } }), visualFirst = firstHeatmapTarget(reversed)!; expect([visualFirst.row, visualFirst.column]).toEqual([2, 3]); expect(navigateHeatmap(reversed, visualFirst, 'ArrowRight', false)!.column).toBe(2);
  const rtl = project({ ...input(), direction: 'rtl' }); expect(navigateHeatmap(rtl, firstHeatmapTarget(rtl)!, 'ArrowRight', false)!.column).toBe(1);
});
it('scopes both category axes while retaining every raw record and full color extent', () => {
  const raw = input(), p = project({ ...raw, viewport: { mode: 'internal', axes: 'xy', initial: { x: { firstId: 'c1', lastId: 'c2' }, y: { firstId: 'r1', lastId: 'r2' } } } });
  expect(p.columns).toEqual(['c1', 'c2']); expect(p.rows).toEqual(['r1', 'r2']); expect(p.cells).toHaveLength(1); expect(p.data.spec.data).toHaveLength(3); expect(p.data.extent).toEqual([0, 5]); expect(p.byId.has('observed')).toBe(false);
});
it('stores only K supplied cells for a100-million-coordinate sparse domain', () => {
  const raw = input(10000, 10000), p = project(raw); expect(p.rows).toHaveLength(10000); expect(p.columns).toHaveLength(10000); expect(p.cells).toHaveLength(2); expect(p.byId.size).toBe(3);
  for (let i = 0; i < 1000; i++) { const target = p.targetAt(i * 997 % 10000, i * 283 % 10000)!; expect(target).not.toBe(null); }
  expect(p.byId.size).toBe(3);
});
