import { expect, it } from 'vitest';
import { gaugePolicy } from '../../src/gauge/strategy.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { familyFrame } from '../../src/internal/chart/frame.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer = { measure(text: string) { return { width: [...text].length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
function compute(overrides = {}, width = 768, height = 400) {
  const policy = gaugePolicy(), parsed = policy.parse({ family: 'gauge', title: 'Pressure', domain: [0, 100], value: 42, target: { value: 70 }, ...overrides }); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed));
  const spec = parsed.value, state = policy.state([]), shell = shellFrame({ width, height }, false, [], 'none', font, spec.direction ?? 'ltr', measurer);
  const result = policy.compute(spec, state, shell, defaultPalette(spec.theme ?? 'light', false), font, measurer); if (result.status !== 'ok') throw Error(JSON.stringify(result)); return { policy, spec, state, c: result.value };
}
it('emits valid own Scene without fake Cartesian axes across presets/themes/tiny and normal frames', () => {
  for (const preset of ['arc', 'ring']) for (const theme of ['light', 'dark']) for (const width of [0, 24, 160, 320, 768]) for (const height of [24, 150, 400]) {
    const { c, policy } = compute({ preset, theme, bands: [{ id: 'low', from: 0, to: 25, color: '#255eb8' }, { id: 'high', from: 80, to: 100, color: '#26715b' }] }, width, height);
    expect(c.axes).toBeUndefined(); expect(c.plot).toEqual({ x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height }); const scene = familyFrame(3, c.shell.body.width, c.shell.body.height, c.layers, c), validated = validateSceneFrame(scene);
    if (!c.shell.body.width || !c.shell.body.height) { expect(validated.status).toBe('invalid'); expect(policy.enabled(c)).toBe(false); expect(c.layers.marks).toEqual([]); continue; }
    expect(validated.status, JSON.stringify({ preset, theme, width, height, validated })).toBe('ok');
    for (const label of c.layers.labels) if (label.kind === 'text') { const metric = measurer.measure(label.text), half = metric.width / 2; expect(label.x - half).toBeGreaterThanOrEqual(0); expect(label.x + half).toBeLessThanOrEqual(c.shell.body.width + 1e-9); expect(label.y).toBeLessThanOrEqual(c.shell.body.height); }
  }
});
it('reads raw out-of-range values via meter metadata and exports, without selecting them', () => { const { policy, spec, state, c } = compute({ value: 200, unit: 'kPa', target: { value: -20 } }); const target = policy.reconcile(c.projection, null, 0)!; expect(policy.semantic(c, target).meter?.value).toBe(200); expect(policy.semantic(c, target).detail).toContain('Above domain'); expect(policy.selectable(spec).size).toBe(0); expect(policy.selectionEligible!(target)).toBe(false); expect(policy.exportRecords(spec, state, c).rows[0]![2]).toBe(200); expect(policy.exportRecords(spec, state, c).rows[1]![2]).toBe(-20); });
it('null remains a navigable read-only no-measurement reading with no false zero arc', () => { const { policy, c } = compute({ value: null }); const target = policy.reconcile(c.projection, null, 0)!; expect(policy.enabled(c)).toBe(true); expect(policy.semantic(c, target).meter?.value).toBe(null); expect(c.projection.fill).toEqual([]); expect(policy.tooltip(c, target, 5).rows[0]!.availability).toBe('null'); });
it('consumer loading/empty/error suspend readings and do not paint stale values', () => { for (const status of [{ kind: 'loading' }, { kind: 'empty' }, { kind: 'error', message: 'Unavailable' }]) { const { policy, c } = compute({ status }); expect(policy.enabled(c)).toBe(false); expect(c.layers.marks).toEqual([]); expect(c.layers.labels).toEqual([]); } });
