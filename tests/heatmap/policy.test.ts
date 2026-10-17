import { expect, it } from 'vitest';
import { heatmapPolicy } from '../../src/heatmap/strategy.js';
import { describeHeatmap } from '../../src/heatmap/describe.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { frame } from '../../src/internal/axes/scene.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
const input = { family: 'heatmap', title: 'Values', description: 'Raw measurements', labels: 'auto', axes: { x: { kind: 'category', values: [{ id: 'x0', label: 'January' }, { id: 'x1', label: 'January' }] }, y: { kind: 'category', values: [{ id: 'y0' }, { id: 'y1' }] } }, data: [{ id: 'zero', rowId: 'y0', columnId: 'x0', value: 0 }, { id: 'high', rowId: 'y1', columnId: 'x0', value: 10 }, { id: 'null', rowId: 'y1', columnId: 'x1', value: null }] };
function compute(overrides = {}) {
  const policy = heatmapPolicy(), parsed = policy.parse({ ...input, ...overrides }); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed)); const spec = parsed.value, state = policy.state([]);
  const shell = shellFrame({ width: 768, height: 440 }, true, [], spec.legend?.position ?? 'bottom', font, spec.direction ?? 'ltr', measurer), colors = defaultPalette(spec.theme ?? 'light', false);
  const viewport = policy.viewport.prepare(spec, state, null); if (viewport.status !== 'ok') throw Error(JSON.stringify(viewport));
  const c = policy.compute(spec, state, policy.viewport.shell(shell, viewport.value), colors, font, measurer, viewport.value); if (c.status !== 'ok') throw Error(JSON.stringify(c));
  return { policy, spec, state, c: c.value };
}
it('produces a validated own SVG Scene and opaque numeric cells over one sparse hatch', () => {
  const { c } = compute(); expect(c.layers.marks.filter(mark => mark.kind === 'rect')).toHaveLength(2); expect(c.layers.marks.filter(mark => mark.kind === 'path')).toHaveLength(1);
  expect(c.layers.labels.filter(mark => mark.classes?.includes('nc-owned-data-label'))).toHaveLength(2);
  expect(validateSceneFrame(frame(1, c.shell.body.width, c.shell.body.height, c.layers, c.axes)).status).toBe('ok');
});
it('keeps absence navigable but ineligible for selection and does not invent activation data', () => {
  const { policy, c } = compute(); const missing = c.projection.targetAt(0, 1)!, nullCell = c.projection.targetAt(1, 1)!, zero = c.projection.targetAt(0, 0)!;
  expect(policy.selectionEligible!(missing)).toBe(false); expect(policy.selectionEligible!(nullCell)).toBe(false); expect(policy.selectionEligible!(zero)).toBe(true);
  expect(policy.activate(missing, 'keyboard', 2)).toEqual({ rowId: 'y0', columnId: 'x1', cell: null, source: 'keyboard', revision: 2 });
  expect(policy.tooltip(c, missing, 2).rows[0]!.availability).toBe('absent'); expect(policy.tooltip(c, nullCell, 2).rows[0]!.availability).toBe('null'); expect(policy.tooltip(c, zero, 2).rows[0]!.value).toBe(0);
  expect(() => policy.datumId(missing)).toThrow(); expect(policy.datumId(zero)).toEqual({ pointId: 'zero' });
});
it('keeps the raw sparse table and CSV stable across viewport and applied selection', () => {
  const { policy, c, spec, state } = compute({ viewport: { mode: 'internal', axes: 'xy', initial: { x: { firstId: 'x0', lastId: 'x0' }, y: { firstId: 'y0', lastId: 'y0' } } }, selection: { mode: 'controlled', value: [{ pointId: 'zero' }] } });
  expect(c.projection.cells).toHaveLength(1); expect(c.description.table.rows).toHaveLength(3); expect(c.description.table.rows[0]!.cells[0]).toBe('y0');
  const exported = policy.exportRecords(spec, state, c, [{ pointId: 'zero' }]); expect(exported.rows).toHaveLength(3); expect(exported.rows[0]).toEqual(['zero', 'y0', 'y0', 'x0', 'January', 0, 'true']); expect(exported.rows[2]![5]).toBe(null);
  const d = describeHeatmap({ ...input, selection: { mode: 'controlled', value: [{ pointId: 'zero' }] } }); expect(d.status).toBe('ok'); if (d.status === 'ok') { expect(d.value.table.columns).toEqual(['Row', 'Column', 'Value', 'Selected']); expect(d.value.table.rows[0]!.cells.at(-1)).toBe('Selected'); expect(d.value.table.rows).toHaveLength(3); }
});
it('positions a quantitative end key in RTL without reversing either category order', () => {
  const { c } = compute({ direction: 'rtl', legend: { position: 'end' } });
  expect(c.axes!.plot.x).toBeGreaterThan(100); expect(c.projection.rows).toEqual(['y0', 'y1']); expect(c.projection.columns).toEqual(['x0', 'x1']);
  const key = c.layers.labels.find(mark => mark.key === 'color-key:0')!; expect(key.kind).toBe('rect'); if (key.kind === 'rect') expect(key.x).toBeLessThan(c.axes!.plot.x);
  expect(validateSceneFrame(frame(1, c.shell.body.width, c.shell.body.height, c.layers, c.axes)).status).toBe('ok');
});
it('uses threshold equality consistently in cells and key, without treating zero as absence', () => {
  const { c } = compute({ colorScale: { kind: 'threshold', boundaries: [0, 10], colors: ['#123', '#456', '#789'] } });
  const marks = c.layers.marks.filter(mark => mark.kind === 'rect'); expect(marks[0]!.presentation!.fill).toEqual({ kind: 'solid', value: '#445566' }); expect(marks[1]!.presentation!.fill).toEqual({ kind: 'solid', value: '#778899' });
  expect(c.layers.labels.filter(mark => mark.key.startsWith('color-key:'))).toHaveLength(3);
});
it('keeps finite extreme quantitative key values finite after significant-digit formatting', () => {
  for (const colorScale of [undefined, { kind: 'threshold', boundaries: [-Number.MAX_VALUE, Number.MAX_VALUE], colors: ['#123', '#456', '#789'] }]) {
    const { c } = compute({ data: [{ id: 'low', rowId: 'y0', columnId: 'x0', value: -Number.MAX_VALUE }, { id: 'high', rowId: 'y1', columnId: 'x0', value: Number.MAX_VALUE }], ...(colorScale ? { colorScale } : {}) });
    const texts = c.layers.labels.filter(mark => mark.kind === 'text' && mark.key.startsWith('color-key-label:')).map(mark => mark.kind === 'text' ? mark.text : '');
    expect(texts.join(' ')).not.toMatch(/NaN|Infinity/); expect(texts.join(' ')).toContain('e+308');
  }
});
