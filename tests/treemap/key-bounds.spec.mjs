import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
for (const width of [320, 768]) for (const direction of ['ltr', 'rtl']) for (const value of [false, true]) for (const end of width === 768 ? [false, true] : [false]) test('physical key glyph bounds/' + width + '/' + direction + '/' + value + '/end-' + end, async ({ page }, info) => {
  await page.setContent('<!doctype html><html lang="en"><title>Read-only key bounds</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>'); await page.addScriptTag({ path: path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap', 'browser-harness.js') });
  const result = await page.evaluate(({ direction, value, end }) => {
    const mounted = window.NCTree.createTreemapChart(document.getElementById('host'), { family: 'treemap', title: 'Key bounds', direction, legend: { position: end ? 'end' : 'bottom' }, theme: direction === 'rtl' ? 'dark' : 'light', ...(value ? { color: { by: 'value' } } : {}), root: { id: 'all', children: [{ id: 'group-a', label: 'Research', children: [{ id: 'a', value: 6, colorValue: null }, { id: 'b', value: 4, colorValue: 1 }] }, { id: 'other', label: 'Operations', value: 5 }] } }, { instanceId: 'key-glyph-bounds' }); if (mounted.status === 'ok') window.chart = mounted.value; return mounted.status;
  }, { direction, value, end }); expect(result).toBe('ok');
  await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true);
  const measured = await page.evaluate(() => { const host = document.getElementById('host').getBoundingClientRect(); return [...document.querySelectorAll('[data-nc-layer="labels"] text:not(.nc-owned-hierarchy-label)')].map(text => { const box = text.getBoundingClientRect(); return { text: text.textContent, within: box.left >= host.left && box.right <= host.right && box.top >= host.top && box.bottom <= host.bottom, left: box.left, right: box.right }; }); });
  expect(measured.length).toBeGreaterThan(0); expect(measured.filter(row => !row.within)).toEqual([]);
  if (value) { const caption = page.locator('svg text:not(.nc-owned-hierarchy-label)').filter({ hasText: /^Missing/ }); await expect(caption).toHaveCount(1); if (!end) await expect(caption).toHaveText('Missing color value'); const box = await caption.boundingBox(); expect(box.width).toBeGreaterThan(30); }
  if (end) {
    const directory = path.resolve(process.env.NC_TREEMAP_ARTIFACT_DIR ?? 'artifacts/v1-treemap', 'visual'); fs.mkdirSync(directory, { recursive: true }); const theme = direction === 'rtl' ? 'dark' : 'light', variant = value ? 'value-key-end' : 'group-key-end', file = 'treemap-' + variant + '-' + width + 'x440-' + theme + '-' + info.project.name + '.png', bytes = await page.locator('#host').screenshot({ animations: 'disabled' }); fs.writeFileSync(path.join(directory, file), bytes);
    fs.writeFileSync(path.join(directory, file.replace('.png', '.json')), JSON.stringify({ file, family: 'treemap', variant, width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction, state: 'read-only end key; actual glyph containment checked', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  }
});
