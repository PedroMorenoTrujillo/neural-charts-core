import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../tooling/browser-resource-probe.mjs';
const directory = process.env.NC_HEATMAP_ARTIFACT_DIR ?? 'artifacts/v1-heatmap';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local Heatmap evidence required');
function fixture(variant = 'sequential') {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: 'r' + i, label: ['Platform', 'Research', 'Research', 'Operations', 'Support'][i] })), columns = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, label: ['January', 'January', 'March', 'April', 'May', 'June'][i] }));
  const data = variant === 'empty' ? [] : rows.flatMap((row, r) => columns.flatMap((column, c) => variant === 'missing' && (r + c) % 4 === 1 ? [] : [{ id: 'cell-' + r + '-' + c, rowId: row.id, columnId: column.id, value: variant === 'constant' ? 0 : variant === 'extreme' ? (r + c) % 3 === 0 ? -Number.MAX_VALUE : (r + c) % 3 === 1 ? 0 : Number.MAX_VALUE : variant === 'missing' && (r + c) % 4 === 2 ? null : (r * 17 + c * 13) % 101 - 40 }]));
  return { family: 'heatmap', title: 'Team workload', description: 'Original measurements by team and month.', labels: 'auto', axes: { x: { kind: 'category', values: columns }, y: { kind: 'category', values: rows } }, data, ...(variant === 'diverging' ? { colorScale: { kind: 'diverging', domain: [-50, 0, 60], colors: ['#4e6d96', '#f3f1e9', '#b45845'] } } : variant === 'threshold' ? { colorScale: { kind: 'threshold', boundaries: [0, 20, 40], colors: ['#273d59', '#537fa6', '#9dc5d8', '#dcecf1'] } } : {}), selection: { mode: 'internal', kind: 'multiple' }, viewport: { mode: 'internal', axes: 'xy' }, crosshair: 'xy' };
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true); }
async function mount(page, spec = fixture(), width = 768) {
  await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Heatmap acceptance</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>');
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  const result = await page.evaluate(spec => {
    window.spec = spec; window.events = []; window.diagnostics = [];
    const result = window.NCHeatmap.createHeatmapChart(document.getElementById('host'), spec, { instanceId: 'heatmap-native', onPointActivate: event => window.events.push({ kind: 'activate', ...event }), onSelectionChange: event => window.events.push({ kind: 'selection', ...event }), onViewportChange: event => window.events.push({ kind: 'viewport', ...event }), onDiagnostic: event => window.diagnostics.push(event) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? { status: 'ok' } : result;
  }, spec);
  expect(result).toEqual({ status: 'ok' }); await ready(page); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
}
async function capture(page, info, variant, width, theme, state = 'default', bytes = null) {
  fs.mkdirSync(path.join(directory, 'visual'), { recursive: true });
  const file = 'heatmap-' + variant + '-' + width + 'x440-' + theme + '-' + info.project.name + '.png';
  bytes ??= await page.locator('#host').screenshot({ path: path.join(directory, 'visual', file), animations: 'disabled' });
  fs.writeFileSync(path.join(directory, 'visual', file), bytes);
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'heatmap', variant, width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
for (const variant of ['sequential', 'diverging', 'threshold', 'missing', 'constant', 'extreme', 'empty']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('@visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 680 }); await mount(page, { ...fixture(variant), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }, width);
  const marks = page.locator('[data-nc-layer="marks"]').first(); expect(await marks.innerHTML()).not.toMatch(/NaN|Infinity/);
  expect(await page.locator('[data-nc-layer="labels"]').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/NaN|Infinity/)]));
  await expect(marks.locator('rect')).toHaveCount(variant === 'empty' ? 0 : fixture(variant).data.filter(cell => cell.value !== null).length);
  expect(await page.locator('.nc-owned-data-label').count()).toBeLessThanOrEqual(200);
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); expect(await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'))).violations)).toEqual([]);
  await capture(page, info, variant, width, theme);
});
test('missing coordinates remain navigable without fabricated selection or observations', async ({ page }) => {
  const spec = fixture('missing'); await mount(page, spec); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('ArrowRight'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ rowId: 'r0', columnId: 'c1', cell: null }); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(grid.locator('[role="gridcell"]')).not.toHaveAttribute('aria-selected');
  await grid.press('ArrowRight'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).cell)).toMatchObject({ id: 'cell-0-2', value: null }); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]);
  await grid.press('Control+Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ pointId: 'cell-0-0' }]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  await grid.press('Escape'); await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(spec.data.length); await expect(page.locator('[data-nc-table] thead')).toContainText('Selected');
  await expect(page.locator('[data-nc-table] tbody tr').first().locator('td').last()).toHaveText('true');
  expect(await page.locator('[data-nc-table] tbody tr td:last-child').allTextContents()).toEqual(spec.data.map(cell => String(cell.id === 'cell-0-0')));
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection').length)).toBe(1); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('controlled selection can be rejected and accepted exactly once after immutable data replacement', async ({ page }) => {
  const spec = { ...fixture(), selection: { mode: 'controlled', kind: 'multiple', value: [] } }; await mount(page, spec); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection'))).toHaveLength(1);
  await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false');
  expect(await page.evaluate(() => { const spec = structuredClone(window.spec); spec.selection.value = window.events.find(e => e.kind === 'selection').selection; window.spec = spec; return window.chart.update(spec).status; })).toBe('ok'); await ready(page);
  expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ pointId: 'cell-0-0' }]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection'))).toHaveLength(1);
});
test('two category viewport axes retain raw export and support real wheel/reset', async ({ page }) => {
  const spec = fixture(); spec.viewport.wheel = true; await mount(page, spec); expect(await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'c1', lastId: 'c4' }, y: { firstId: 'r1', lastId: 'r3' } }).status)).toBe('ok'); await ready(page);
  await expect(page.locator('[data-nc-grid]')).toHaveAttribute('aria-rowcount', '3'); await expect(page.locator('[data-nc-grid]')).toHaveAttribute('aria-colcount', '4');
  await expect(page.locator('[data-nc-layer="marks"]').first().locator('rect')).toHaveCount(12); const csv = await page.evaluate(() => window.NCHeatmap.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value.split('\r\n').filter(Boolean)).toHaveLength(31);
  const box = await page.locator('[data-nc-layer="marks"] rect').first().boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -700);
  await expect.poll(() => page.evaluate(() => window.events.filter(e => e.kind === 'viewport').length)).toBeGreaterThan(1); await ready(page);
  await page.getByRole('button', { name: /reset zoom/i }).click(); await ready(page); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({});
});
test('reversed axes navigate visually while RTL keeps the original domain order', async ({ page }) => {
  const spec = fixture(); spec.direction = 'rtl'; spec.axes.x.reversed = true; spec.axes.y.reversed = true; await mount(page, spec); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ rowId: 'r4', columnId: 'c5' }); await grid.press('ArrowRight'); await grid.press('ArrowDown'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ rowId: 'r3', columnId: 'c4' });
});
for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('@visual selected-tooltip/' + width + '/' + theme, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 680 }); await mount(page, { ...fixture('diverging'), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }, width); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+End'); await grid.press('Enter'); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[role="tooltip"]')).toBeVisible(); await capture(page, info, 'selected-tooltip', width, theme, 'keyboard selection and tooltip');
});
for (const variant of ['diverging', 'threshold']) test('actual PNG/SVG/CSV export/' + variant, async ({ page }, info) => {
  const theme = variant === 'threshold' ? 'dark' : 'light'; await mount(page, { ...fixture(variant), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' });
  const result = await page.evaluate(async () => { const svg = window.NCHeatmap.exportSvg(window.chart), csv = window.NCHeatmap.exportCsv(window.chart), png = await window.NCHeatmap.exportPng(window.chart, { pixelRatio: 2 }); if (svg.status !== 'ok' || csv.status !== 'ok' || png.status !== 'ok') throw Error(JSON.stringify({ svg, csv, png })); const bytes = new Uint8Array(await png.value.blob.arrayBuffer()); return { svg: svg.value.svg, csv: csv.value, width: png.value.width, height: png.value.height, base64: btoa([...bytes].map(value => String.fromCharCode(value)).join('')) }; });
  expect(result.svg).not.toMatch(/NaN|Infinity|<script/); expect(result.csv.split('\r\n').filter(Boolean)).toHaveLength(31); expect([result.width, result.height]).toEqual([1536, 880]); await capture(page, info, variant + '-png', 768, theme, 'actual2x PNG export', Buffer.from(result.base64, 'base64'));
});
test('100 create/update/table/destroy cycles release observations and all owned resources', async ({ page }, info) => {
  await mount(page); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.resourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async template => window.resourceProbe({ factoryPath: 'NCHeatmap.createHeatmapChart', template, cycles: 100, datumPath: ['data', 0, 'datum'], stateful: false, exercise(chart) { const result = window.NCHeatmap.exportSvg(chart); if (result.status !== 'ok') throw Error(JSON.stringify(result)); } }), fixture());
  expect(report.cycles).toHaveLength(100); expect(await page.locator('[data-nc-root]').count()).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.__ncResourceReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.writeFileSync(path.join(directory, 'resources-' + info.project.name + '.json'), JSON.stringify(report, null, 2));
});
