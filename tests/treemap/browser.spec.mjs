import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../tooling/browser-resource-probe.mjs';
const directory = path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap');
function fixture(variant = 'group') {
  const root = { id: 'root', label: 'Portfolio', children: [{ id: 'group-a', label: 'Research', children: [{ id: 'a', label: 'Repeated label', value: 12, colorValue: null }, { id: 'b', label: 'Repeated label', value: 8, colorValue: -10 }, { id: 'zero', label: 'Known zero', value: 0 }, { id: 'missing', label: 'Missing observation', value: null }] }, { id: 'group-b', label: 'Operations · نشاط', children: [{ id: 'c', label: 'Production', value: 5, colorValue: 5 }, { id: 'd', label: 'Quality', value: 5, colorValue: 10 }] }, { id: 'solo', label: 'Other', value: 3, colorValue: 0 }] };
  if (variant === 'zero') root.children = [{ id: 'zero', value: 0 }, { id: 'missing', value: null }];
  if (variant === 'extreme') root.children = [{ id: 'large', label: 'Very large', value: Number.MAX_VALUE }, { id: 'tiny', label: 'Subnormal', value: Number.MIN_VALUE }, { id: 'zero', value: 0 }];
  if (variant === 'deep') { let node = { id: 'leaf', label: 'Deep terminal', value: 10 }; for (let i = 0; i < 12; i++) node = { id: 'level-' + i, label: 'Hierarchy level ' + i, children: [node] }; root.children = [node, { id: 'other', value: 6 }]; }
  return { family: 'treemap', title: 'Portfolio allocation', description: 'Original leaf values and known subtotals.', root, ...(variant === 'value' ? { color: { by: 'value', scale: { kind: 'diverging', domain: [-10, 0, 10], colors: ['#4e6d96', '#f3f1e9', '#b45845'] } } } : {}), selection: { mode: 'internal', kind: 'multiple' } };
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true); }
async function mount(page, spec = fixture(), width = 768) {
  await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Treemap review</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>'); await page.addScriptTag({ path: path.join(directory, 'browser-harness.js') });
  const result = await page.evaluate(spec => { window.spec = spec; window.events = []; window.diagnostics = []; const result = window.NCTree.createTreemapChart(document.getElementById('host'), spec, { instanceId: 'tree-native', onPointActivate: event => window.events.push({ kind: 'activate', ...event }), onSelectionChange: event => window.events.push({ kind: 'selection', ...event }), onDiagnostic: diagnostic => window.diagnostics.push(diagnostic) }); if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? { status: 'ok' } : result; }, spec);
  expect(result).toEqual({ status: 'ok' }); await ready(page); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
}
async function capture(page, info, variant, width, theme, state = 'default', bytes = null) {
  const output = path.join(directory, 'visual'); fs.mkdirSync(output, { recursive: true }); const file = 'treemap-' + variant + '-' + width + 'x440-' + theme + '-' + info.project.name + '.png'; bytes ??= await page.locator('#host').screenshot({ animations: 'disabled' }); fs.writeFileSync(path.join(output, file), bytes); fs.writeFileSync(path.join(output, file.replace('.png', '.json')), JSON.stringify({ file, family: 'treemap', variant, width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
for (const variant of ['group', 'value', 'zero', 'extreme', 'deep']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('@visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 680 }); await mount(page, { ...fixture(variant), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }, width);
  expect(await page.locator('svg').first().innerHTML()).not.toMatch(/NaN|Infinity/); expect(await page.locator('.nc-owned-hierarchy-label').count()).toBeLessThanOrEqual(200);
  await expect(page.locator('[data-nc-grid]')).toHaveAttribute('role', 'group'); await expect(page.locator('[data-nc-grid]')).not.toHaveAttribute('aria-activedescendant');
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); expect(await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'))).violations)).toEqual([]);
  await capture(page, info, variant, width, theme);
});
test('hierarchy keyboard reaches root, child, siblings, missing and zero without fabricated area', async ({ page }) => {
  await mount(page); const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('Control+Home'); await group.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ node: { id: 'root' }, total: 33, incomplete: true, path: ['root'] });
  await group.press('ArrowRight'); await group.press('ArrowRight'); await group.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).path)).toEqual(['root', 'group-a', 'a']);
  await group.press('ArrowDown'); await group.press('ArrowDown'); await group.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ node: { id: 'missing' }, total: null });
  expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ pointId: 'root' }, { pointId: 'a' }]); await expect(group.locator('[data-nc-hierarchy-current]')).toContainText('No screen area: missing');
  await group.press('End'); await group.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ node: { id: 'zero' }, total: 0 }); await expect(group.locator('[data-nc-hierarchy-current]')).toContainText('Selected');
  await group.press('ArrowLeft'); await group.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).node.id)).toBe('group-a');
});
test('actual leaf pointer hit activates its original identity exactly once', async ({ page }) => {
  await mount(page); const leaf = page.locator('[data-nc-layer="marks"] rect').nth(2), box = await leaf.boundingBox(); expect(box).not.toBeNull(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').map(e => e.node.id))).toEqual(['a']); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ pointId: 'a' }]);
});
test('controlled rejection and immutable acceptance retain focus, path and exactly one proposal', async ({ page }) => {
  await mount(page, { ...fixture(), selection: { mode: 'controlled', kind: 'multiple', value: [] } }); const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('ArrowRight'); await group.press('ArrowRight'); await group.press('Enter');
  expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(group.locator('[data-nc-hierarchy-current]')).toContainText('Not selected'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection'))).toHaveLength(1);
  expect(await page.evaluate(() => { window.spec = structuredClone(window.spec); window.spec.root.children.reverse(); window.spec.selection.value = [{ pointId: 'a' }]; return window.chart.update(window.spec).status; })).toBe('ok'); await ready(page); await expect(group).toBeFocused(); await expect(group.locator('[data-nc-hierarchy-current]')).toContainText('Repeated label (a)'); await expect(group.locator('[data-nc-hierarchy-current]')).toContainText('Selected');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection'))).toHaveLength(1);
});
test('hierarchical raw table and CSV preserve original values and live selected state', async ({ page }) => {
  await mount(page, fixture('value')); const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('ArrowRight'); await group.press('ArrowRight'); await group.press('Enter'); await group.press('Escape');
  const csv = await page.evaluate(() => window.NCTree.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value).toContain('Original value'); expect(csv.value).toContain('Known subtotal'); expect(csv.value.split('\r\n').filter(Boolean)).toHaveLength(11);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(10); await expect(page.locator('[data-nc-table] thead')).toContainText('Selected'); const a = page.locator('[data-nc-table] tbody tr').filter({ has: page.getByRole('rowheader', { name: 'a', exact: true }) }); await expect(a.locator('td').last()).toHaveText('true');
  await page.getByRole('button', { name: 'Close data table', exact: true }).click(); await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
});
test('invalid cycles/overflow retain accepted drawing and removal reconciles logical focus', async ({ page }) => {
  await mount(page); const before = await page.locator('[data-nc-layer="marks"]').first().innerHTML(); const bad = await page.evaluate(() => { const root = { id: 'cycle', children: [] }; root.children.push(root); return window.chart.update({ ...window.spec, root }); }); expect(bad.status).toBe('invalid'); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).toBe(before);
  const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('ArrowRight'); await group.press('ArrowRight'); await group.press('Enter');
  expect(await page.evaluate(() => { window.spec = structuredClone(window.spec); window.spec.root.children[0].children = window.spec.root.children[0].children.filter(node => node.id !== 'a'); return window.chart.update(window.spec).status; })).toBe('ok'); await ready(page); await expect(group).toBeFocused(); await expect(group.locator('[data-nc-hierarchy-current]')).not.toContainText('Repeated label (a)'); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]);
});
for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('@visual keyboard tooltip/' + width + '/' + theme, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 680 }); await mount(page, { ...fixture('value'), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }, width); const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('ArrowRight'); await group.press('ArrowRight'); await group.press('ArrowDown'); await group.press('Enter'); await expect(page.locator('[role="tooltip"]')).toBeVisible(); await capture(page, info, 'keyboard-tooltip', width, theme, 'keyboard selection and tooltip');
});
test('all status transitions restore hierarchy semantics without stale grid attributes', async ({ page }) => {
  await mount(page); await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
  for (const kind of ['loading', 'empty', 'error', 'ready']) { expect(await page.evaluate(kind => window.chart.update({ ...window.spec, status: kind === 'ready' ? { kind } : { kind, message: 'Original ' + kind } }).status, kind)).toBe('ok'); await ready(page); await expect(page.locator('[data-nc-grid]')).toHaveAttribute('role', 'group'); expect(await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'))).violations)).toEqual([]); }
});
test('actual SVG/PNG export preserves physical clips and original hierarchy CSV', async ({ page }, info) => {
  await mount(page, fixture('value')); const result = await page.evaluate(async () => { const svg = window.NCTree.exportSvg(window.chart), png = await window.NCTree.exportPng(window.chart, { pixelRatio: 2 }); if (svg.status !== 'ok' || png.status !== 'ok') throw Error(JSON.stringify({ svg, png })); const bytes = new Uint8Array(await png.value.blob.arrayBuffer()); return { svg: svg.value.svg, width: png.value.width, height: png.value.height, base64: btoa([...bytes].map(value => String.fromCharCode(value)).join('')) }; }); expect(result.svg).not.toMatch(/NaN|Infinity|<script/); expect(result.svg).toContain('clipPath'); expect([result.width, result.height]).toEqual([1536, 880]); await capture(page, info, 'value-png', 768, 'light', 'actual2x PNG export', Buffer.from(result.base64, 'base64'));
});
test('100 create/update/table/destroy cycles release every owned resource and opaque datum', async ({ page }, info) => {
  await mount(page); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.resourceProbe=' + probeChartResources.toString()); const report = await page.evaluate(async template => window.resourceProbe({ factoryPath: 'NCTree.createTreemapChart', template, cycles: 100, datumPath: ['root', 'children', 0, 'children', 0, 'datum'], stateful: false, exercise(chart) { const result = window.NCTree.exportSvg(chart); if (result.status !== 'ok') throw Error(JSON.stringify(result)); } }), fixture()); expect(report.cycles).toHaveLength(100); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.__ncResourceReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.writeFileSync(path.join(directory, 'resources-' + info.project.name + '.json'), JSON.stringify(report, null, 2));
});
