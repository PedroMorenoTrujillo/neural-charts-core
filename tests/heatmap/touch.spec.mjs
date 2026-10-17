import { test, expect } from '@playwright/test';
import path from 'node:path';
const directory = process.env.NC_HEATMAP_ARTIFACT_DIR ?? 'artifacts/v1-heatmap';
for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('native touch keeps the whole selected cell clear/' + width + '/' + theme, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: width + 32, height: 680 }, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); await page.setContent('<!doctype html><html lang="en"><title>Heatmap touch</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>'); await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
    const result = await page.evaluate(theme => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ id: 'r' + i })), columns = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i }));
      window.events = []; window.diagnostics = [];
      const spec = { family: 'heatmap', title: 'Measured workload', theme, direction: theme === 'dark' ? 'rtl' : 'ltr', axes: { x: { kind: 'category', values: columns }, y: { kind: 'category', values: rows } }, data: rows.flatMap((row, r) => columns.map((column, c) => ({ id: 'p' + r + '-' + c, rowId: row.id, columnId: column.id, value: r * 6 + c }))), selection: { mode: 'internal', kind: 'multiple' }, labels: 'auto' };
      const mounted = window.NCHeatmap.createHeatmapChart(document.getElementById('host'), spec, { instanceId: 'heatmap-touch', onPointActivate: event => window.events.push(event), onDiagnostic: event => window.diagnostics.push(event) }); if (mounted.status === 'ok') window.chart = mounted.value; return mounted.status === 'ok' ? { status: 'ok' } : mounted;
    }, theme); expect(result).toEqual({ status: 'ok' });
    await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision; })).toBe(true);
    const cells = page.locator('[data-nc-layer="marks"] rect'); await expect(cells).toHaveCount(30);
    for (const [cell, id] of [[cells.first(), 'p0-0'], [cells.last(), 'p4-5']]) {
      const before = await page.evaluate(() => window.events.length), box = await cell.boundingBox(); expect(box).not.toBeNull(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => page.evaluate(() => window.events.length)).toBe(before + 1); expect(await page.evaluate(() => { const e = window.events.at(-1); return [e.source, e.cell?.id]; })).toEqual(['touch', id]);
      const tooltip = page.locator('[data-nc-tooltip]'); await expect(tooltip).toBeVisible(); const detail = await tooltip.boundingBox(); expect(detail).not.toBeNull();
      expect(detail.x < box.x + box.width && detail.x + detail.width > box.x && detail.y < box.y + box.height && detail.y + detail.height > box.y).toBe(false);
    }
    expect(await page.evaluate(() => window.diagnostics)).toEqual([]); await page.evaluate(() => window.chart.destroy());
  } finally { await context.close(); }
});
