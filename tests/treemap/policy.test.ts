import { expect, it } from 'vitest';
import { treemapPolicy } from '../../src/treemap/strategy.js';
import { describeTreemap } from '../../src/treemap/describe.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { emptyLayers, frame } from '../../src/internal/axes/scene.js';
import { familyFrame } from '../../src/internal/chart/frame.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer = { measure(text: string) { return { width: [...text].length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
const datum = Object.freeze({ secret: 'opaque' });
const input = { family: 'treemap', title: 'Portfolio', root: { id: 'all', label: 'All', children: [{ id: 'group', label: 'Group', children: [{ id: 'a', label: 'Repeated', value: 6, colorValue: null, datum }, { id: 'b', label: 'Repeated', value: 4, colorValue: -10 }, { id: 'missing', value: null }, { id: 'zero', value: 0 }] }, { id: 'other', value: 5 }] } };
function compute(overrides = {}) {
  const policy = treemapPolicy(), result = policy.parse({ ...input, ...overrides }); if (result.status !== 'ok') throw Error(JSON.stringify(result));
  const spec = result.value, state = policy.state([]), shell = shellFrame({ width: 768, height: 440 }, false, [], spec.legend?.position ?? 'bottom', font, spec.direction ?? 'ltr', measurer);
  const c = policy.compute(spec, state, shell, defaultPalette(spec.theme ?? 'light', false), font, measurer); if (c.status !== 'ok') throw Error(JSON.stringify(c));
  return { policy, spec, state, c: c.value };
}
it('retains the exact old frame defaults while allowing physical non-Cartesian label clips', () => {
  const layers = emptyLayers(); expect(familyFrame(3, 200, 100, layers, {})).toEqual(frame(3, 200, 100, layers));
  const { c } = compute(); expect(c.axes).toBeUndefined(); expect(c.clips!.length).toBeGreaterThan(0); expect(c.clips!.length).toBeLessThanOrEqual(200);
  const scene = familyFrame(2, c.shell.body.width, c.shell.body.height, c.layers, c); expect(validateSceneFrame(scene).status).toBe('ok');
  for (const label of c.layers.labels.filter(mark => mark.classes?.includes('nc-owned-hierarchy-label'))) expect(scene.defs.some(clip => clip.key === label.clipKey)).toBe(true);
});
it('keeps raw tree rows, derived subtotals and independent color values distinct', () => {
  const { policy, c, spec, state } = compute({ color: { by: 'value' }, selection: { mode: 'controlled', value: [{ pointId: 'a' }] } });
  const exported = policy.exportRecords(spec, state, c, [{ pointId: 'a' }]); expect(exported.rows).toHaveLength(7);
  expect(exported.rows[0]).toEqual(['all', 'All', null, 0, 'branch', null, 15, 'false', null, 'false']);
  expect(exported.rows[2]).toEqual(['a', 'Repeated', 'group', 2, 'leaf', 6, 6, 'true', null, 'true']);
  expect(exported.rows[3]![8]).toBe(-10); expect(JSON.stringify(exported)).not.toContain('opaque');
  expect(exported.rows[4]![5]).toBe(null); expect(exported.rows[4]![6]).toBe(null); expect(exported.rows[5]![6]).toBe(0);
  const d = describeTreemap({ ...input, selection: { mode: 'controlled', value: [{ pointId: 'group' }] } }); expect(d.status).toBe('ok');
  if (d.status === 'ok') { expect(d.value.table.rows[1]!.cells.at(-1)).toBe('Selected'); expect(d.value.context).toContain('incomplete'); }
});
it('preserves opaque activation data and complete ID paths without making missing selectable', () => {
  const { policy, c } = compute(); const a = c.projection.byId.get('a')!, missing = c.projection.byId.get('missing')!, group = c.projection.byId.get('group')!;
  const event = policy.activate(a, 'keyboard', 7); expect(event.path).toEqual(['all', 'group', 'a']); expect(event.node.datum).toBe(datum); expect(event.total).toBe(6);
  expect(policy.activate(group, 'pointer', 8)).toMatchObject({ total: 10, incomplete: true }); expect(policy.activate(missing, 'keyboard', 9).total).toBe(null);
  expect(policy.selectionEligible!(missing)).toBe(false); expect(policy.selectionEligible!(c.projection.byId.get('zero')!)).toBe(true);
  expect(policy.tooltip(c, a, 1).header).toBe('Repeated (a)'); expect(policy.semantic(c, missing).text).toContain('No screen area: missing');
});
it('uses a quantitative key from the same color evaluator with a nonnumeric missing swatch', () => {
  const { c } = compute({ color: { by: 'value', scale: { kind: 'diverging', domain: [-10, 0, 10], colors: ['#123', '#fff', '#789'] } } });
  expect(c.layers.labels.some(mark => mark.key === 'color-key-missing-label')).toBe(true);
  expect(c.layers.marks.some(mark => mark.key === 'tree-color-missing:a')).toBe(true);
  expect(c.layers.labels.filter(mark => mark.key.startsWith('color-key:'))).toHaveLength(64);
  expect(validateSceneFrame(familyFrame(2, c.shell.body.width, c.shell.body.height, c.layers, c)).status).toBe('ok');
});
it('keeps zero/unknown hierarchy reachable without fabricated area and draws only a focus indicator', () => {
  const { policy, c } = compute({ root: { id: 'root', children: [{ id: 'missing', value: null }, { id: 'zero', value: 0 }] } });
  expect(c.description.view).toBe('empty'); expect(policy.enabled(c)).toBe(true); expect(c.layers.marks).toHaveLength(0); expect(c.description.status).toContain('No positive area');
  const root = policy.reconcile(c.projection, null, 0)!; expect(root.record.node.id).toBe('root'); const first = policy.navigate(c.projection, root, 'ArrowRight', false)!; expect(first.record.node.id).toBe('missing');
  const layers = emptyLayers(); policy.focus(c.projection, first, c.palette, layers); expect(layers.interaction).toHaveLength(1); expect(layers.interaction[0]!.kind).toBe('path');
});
it('distinguishes automatic empty geometry from an explicitly applied empty/loading/error status', () => {
  const empty = compute({ root: { id: 'root', children: [] } }); expect(empty.c.description.view).toBe('empty'); expect(empty.policy.enabled(empty.c)).toBe(true);
  for (const kind of ['empty', 'loading', 'error']) { const forced = compute({ status: { kind, message: 'Explicit consumer state' } }); expect(forced.policy.enabled(forced.c)).toBe(false); expect(forced.c.description.status).toBe('Explicit consumer state'); }
});
it('retains ID-derived colors and canonical order after rebuilding, reversing input or applying RTL', () => {
  const first = compute(), second = compute({ direction: 'rtl', root: { ...input.root, children: [...input.root.children].reverse() } });
  for (const id of ['a', 'b', 'other']) { const key = 'tree-node:' + id; expect(second.c.layers.marks.find(mark => mark.key === key)?.presentation?.fill).toEqual(first.c.layers.marks.find(mark => mark.key === key)?.presentation?.fill); expect(second.c.projection.byId.get(id)!.order).toBe(first.c.projection.byId.get(id)!.order); }
});
