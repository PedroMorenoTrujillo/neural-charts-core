import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const harness = path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap', 'browser-harness.js');
async function capture(page, info, variant, width, theme, state) {
  const directory = path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap', 'visual'); fs.mkdirSync(directory, { recursive: true });
  const file = 'treemap-' + variant + '-' + width + 'x440-' + theme + '-' + info.project.name + '.png', bytes = await page.locator('#host').screenshot({ animations: 'disabled' }); fs.writeFileSync(path.join(directory, file), bytes);
  fs.writeFileSync(path.join(directory, file.replace('.png', '.json')), JSON.stringify({ file, family: 'treemap', variant, width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true); }
test('10000 hierarchy nodes preserve all raw values, finite Scene, bounded labels and last identity', async ({ page }, info) => {
  await page.setContent('<!doctype html><html lang="en"><title>Treemap density</title><main><div id="host" style="width:768px;height:440px"></div></main></html>'); await page.addScriptTag({ path: harness });
  const result = await page.evaluate(() => { window.events = []; const mounted = window.NCTree.createTreemapChart(document.getElementById('host'), { family: 'treemap', title: '10000 retained hierarchy nodes', root: { id: 'root', children: Array.from({ length: 9999 }, (_, index) => ({ id: 'p' + String(index).padStart(5, '0'), value: 1 })) }, selection: { mode: 'internal' } }, { instanceId: 'tree-density', onPointActivate: event => window.events.push(event) }); if (mounted.status === 'ok') window.chart = mounted.value; return mounted.status; }); expect(result).toBe('ok'); await ready(page);
  await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(10000); expect(await page.locator('svg *').count()).toBeLessThan(13000); expect(await page.locator('.nc-owned-hierarchy-label').count()).toBeLessThanOrEqual(200);
  await capture(page, info, 'density-10000', 768, 'light', 'all10000 hierarchy nodes retained');
  const group = page.locator('[data-nc-grid]'); await group.focus(); await group.press('Control+End'); await group.press('Enter'); expect(await page.evaluate(() => window.events.at(-1).node.id)).toBe('p09998');
  const csv = await page.evaluate(() => window.NCTree.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value.split('\r\n').filter(Boolean)).toHaveLength(10001); expect(csv.value).toContain('p09998');
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(100);
  fs.writeFileSync(path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap', 'density-' + info.project.name + '.json'), JSON.stringify({ nodes: 10000, svgNodes: await page.locator('svg *').count(), rawRows: 10000, csvRows: 10000, lastActivated: 'p09998' }));
});
for (const theme of ['light', 'dark']) for (const last of [false, true]) test('native touch/whole-leaf tooltip/' + theme + '/' + last, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 352, height: 680 }, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); await page.setContent('<!doctype html><html lang="en"><title>Treemap touch</title><main><div id="host" style="width:320px;height:440px"></div></main></html>'); await page.addScriptTag({ path: harness });
    const mounted = await page.evaluate(theme => { window.events = []; const result = window.NCTree.createTreemapChart(document.getElementById('host'), { family: 'treemap', title: 'Touch leaf detail', theme, direction: theme === 'dark' ? 'rtl' : 'ltr', root: { id: 'root', children: [{ id: 'a', label: 'First leaf', value: 6 }, { id: 'b', label: 'Middle leaf', value: 4 }, { id: 'c', label: 'Last leaf', value: 3 }] }, selection: { mode: 'internal' } }, { instanceId: 'tree-touch', onPointActivate: event => window.events.push(event) }); if (result.status === 'ok') window.chart = result.value; return result.status; }, theme); expect(mounted).toBe('ok'); await ready(page);
    const rect = page.locator('[data-nc-layer="marks"] rect').nth(last ? 3 : 1), shape = await rect.boundingBox(); expect(shape).not.toBeNull(); await page.touchscreen.tap(shape.x + shape.width / 2, shape.y + shape.height / 2); await expect(page.locator('[role="tooltip"]')).toBeVisible();
    expect(await page.evaluate(() => window.events.map(event => ({ id: event.node.id, source: event.source })))).toEqual([{ id: last ? 'c' : 'a', source: 'touch' }]);
    const tooltip = await page.locator('[role="tooltip"]').boundingBox(); expect(tooltip).not.toBeNull(); const overlap = Math.min(shape.x + shape.width, tooltip.x + tooltip.width) > Math.max(shape.x, tooltip.x) && Math.min(shape.y + shape.height, tooltip.y + tooltip.height) > Math.max(shape.y, tooltip.y); expect(overlap).toBe(false);
    await capture(page, info, last ? 'touch-last' : 'touch-first', 320, theme, 'native touch; whole selected leaf remains visible');
  } finally { await context.close(); }
});
