import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const directory = process.env.NC_HEATMAP_ARTIFACT_DIR ?? 'artifacts/v1-heatmap';
async function captureDensity(page, info, variant) {
  fs.mkdirSync(path.join(directory, 'visual'), { recursive: true }); const file = 'heatmap-' + variant + '-768x440-light-' + info.project.name + '.png', bytes = await page.locator('#host').screenshot({ path: path.join(directory, 'visual', file), animations: 'disabled' });
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'heatmap', variant, width: 768, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme: 'light', direction: 'ltr', state: 'density with full raw data retained', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true); }
async function mount(page, { count = 5, sparse = false, end = false } = {}) {
  await page.setContent('<!doctype html><html lang="en"><title>Heatmap edge cases</title><main><div id="host" style="width:768px;height:440px"></div></main></html>'); await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  const result = await page.evaluate(({ count, sparse, end }) => {
    const values = Array.from({ length: count }, (_, i) => ({ id: 'c' + i, label: i === 0 || i === 1 ? 'Repeated name' : 'Category ' + i }));
    window.events = []; window.diagnostics = []; window.spec = { family: 'heatmap', title: '<safe> Measurements', direction: end ? 'rtl' : 'ltr', legend: { position: end ? 'end' : 'bottom' }, labels: 'auto', axes: { x: { kind: 'category', values }, y: { kind: 'category', values } }, data: sparse ? [{ id: 'first', rowId: 'c0', columnId: 'c0', value: 0 }, { id: 'negative', rowId: 'c1', columnId: 'c0', value: -8 }, { id: 'null', rowId: 'c2', columnId: 'c1', value: null }] : values.flatMap((row, r) => values.map((column, c) => ({ id: 'p' + r + '-' + c, rowId: row.id, columnId: column.id, value: r * count + c }))), viewport: { mode: 'internal', axes: 'xy', wheel: true, gesture: 'pan' }, selection: { mode: 'internal', kind: 'multiple' } };
    const mounted = window.NCHeatmap.createHeatmapChart(document.getElementById('host'), window.spec, { instanceId: 'heatmap-edge', onPointActivate: event => window.events.push({ kind: 'activate', ...event }), onSelectionChange: event => window.events.push({ kind: 'selection', ...event }), onViewportChange: event => window.events.push({ kind: 'viewport', ...event }), onDiagnostic: event => window.diagnostics.push(event) }); if (mounted.status === 'ok') window.chart = mounted.value; return mounted.status === 'ok' ? { status: 'ok' } : mounted;
  }, { count, sparse, end }); expect(result).toEqual({ status: 'ok' }); await ready(page);
}
test('100 million implicit coordinates retain only three supplied records and one virtual semantic cell', async ({ page }, info) => {
  await mount(page, { count: 10000, sparse: true }); await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(2); expect(await page.locator('svg *').count()).toBeLessThan(1000);
  await captureDensity(page, info, 'sparse-100M');
  const grid = page.locator('[data-nc-grid]'); await expect(grid).toHaveAttribute('aria-rowcount', '10000'); await expect(grid).toHaveAttribute('aria-colcount', '10000'); await grid.focus(); await grid.press('Control+End'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1))).toMatchObject({ rowId: 'c9999', columnId: 'c9999', cell: null }); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(grid.locator('[role="gridcell"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(3); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('10000 observed cells preserve all values and final identity without unbounded label work', async ({ page }, info) => {
  await mount(page, { count: 100 }); await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(10000); expect(await page.locator('.nc-owned-data-label').count()).toBeLessThanOrEqual(200);
  await captureDensity(page, info, 'dense-10000');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+End'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).cell)).toMatchObject({ id: 'p99-99', value: 9999 });
  expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ pointId: 'p99-99' }]); const csv = await page.evaluate(() => window.NCHeatmap.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value.split('\r\n').filter(Boolean)).toHaveLength(10001);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(100); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('both category axes pan through the shared real pointer owner and retain one viewport change', async ({ page }) => {
  await mount(page, { count: 10 }); expect(await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'c2', lastId: 'c6' }, y: { firstId: 'c2', lastId: 'c6' } }).status)).toBe('ok'); await ready(page);
  const before = await page.evaluate(() => ({ value: window.chart.getViewport(), events: window.events.filter(e => e.kind === 'viewport').length }));
  const plot = await page.locator('[data-nc-viewport-surface]').boundingBox();
  expect(plot).not.toBeNull(); await page.mouse.move(plot.x + plot.width * .65, plot.y + plot.height * .65); await page.mouse.down(); await page.mouse.move(plot.x + plot.width * .25, plot.y + plot.height * .25, { steps: 4 }); await page.mouse.up(); await ready(page);
  await expect.poll(() => page.evaluate(() => window.events.filter(e => e.kind === 'viewport').length)).toBe(before.events + 1);
  const after = await page.evaluate(() => window.chart.getViewport()); expect(after.x.firstId).not.toBe(before.value.x.firstId); expect(after.y.firstId).not.toBe(before.value.y.firstId); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('invalid updates retain the last accepted drawing and valid replacement removes stale tooltip identity', async ({ page }) => {
  await mount(page); const marks = page.locator('[data-nc-layer="marks"]').first(), before = await marks.innerHTML();
  const invalid = await page.evaluate(() => window.chart.update({ ...window.spec, data: [...window.spec.data, { id: 'duplicate-coordinate', rowId: 'c0', columnId: 'c0', value: 1 }] })); expect(invalid.status).toBe('invalid'); expect(await marks.innerHTML()).toBe(before);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('Enter'); await expect(page.locator('[data-nc-tooltip]')).toBeVisible();
  expect(await page.evaluate(() => { window.spec = { ...window.spec, data: window.spec.data.filter(cell => cell.id !== 'p0-0').map(cell => ({ ...cell })) }; return window.chart.update(window.spec).status; })).toBe('ok'); await ready(page); await grid.press('Control+Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).cell)).toBe(null); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('loading/error/empty transitions restore the same valid semantic grid and safe text', async ({ page }) => {
  await mount(page); await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
  for (const kind of ['loading', 'error', 'empty', 'ready']) {
    expect(await page.evaluate(kind => window.chart.update({ ...window.spec, status: kind === 'ready' ? { kind } : { kind, message: 'Original ' + kind + ' <img onerror="alert(1)">' } }).status, kind)).toBe('ok'); await ready(page);
    await expect(page.locator('[data-nc-grid]')).toHaveAttribute('role', kind === 'ready' ? 'grid' : 'group'); expect(await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'))).violations)).toEqual([]); await expect(page.locator('#host img')).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
});
test('actual glyph bounds remain inside their own cells and RTL end key stays outside the plot', async ({ page }) => {
  await mount(page, { count: 5, end: true });
  const result = await page.evaluate(() => {
    const rectangles = [...document.querySelectorAll('[data-nc-layer="marks"] rect')].map(rect => rect.getBoundingClientRect());
    const labels = [...document.querySelectorAll('.nc-owned-data-label')].map(label => { const box = label.getBoundingClientRect(), cell = rectangles[Number(label.textContent)]; return { valid: !!cell && box.left >= cell.left && box.right <= cell.right && box.top >= cell.top && box.bottom <= cell.bottom, text: label.textContent }; });
    const key = document.querySelector('[data-nc-layer="labels"] rect').getBoundingClientRect(); return { labels, keyRight: key.right, plotLeft: Math.min(...rectangles.map(rect => rect.left)) };
  }); expect(result.labels.length).toBeGreaterThan(0); expect(result.labels.every(label => label.valid)).toBe(true); expect(result.keyRight).toBeLessThan(result.plotLeft);
});
