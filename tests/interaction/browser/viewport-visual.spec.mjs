import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mount, ready, captureCoverage } from './helpers.mjs';
const directory = process.env.NC_VIEWPORT_ARTIFACT_DIR ?? 'artifacts/v1-viewport';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local viewport evidence required');
test.afterEach(async ({ page }, info) => { await captureCoverage(page, info, 'viewport-visual', directory); });
for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'scatter']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) {
  test(family + ' viewport @visual ' + width + '/' + theme, async ({ page }, info) => {
    await page.setViewportSize({ width: width + 32, height: 650 });
    const direction = width === 320 ? 'rtl' : 'ltr';
    await mount(page, family, false, { theme, direction, viewport: { mode: 'internal', axes: 'xy', gesture: 'zoom', wheel: true } }, directory + '/browser-harness.js');
    await page.locator('#host').evaluate((element, width) => { element.style.width = width + 'px'; }, width); await ready(page);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await ready(page);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
    const group = await page.getByRole('group', { name: 'Chart viewport' }).boundingBox(), plot = await grid.boundingBox();
    expect(group.y).toBeGreaterThanOrEqual(plot.y + plot.height);
    const filename = `${family}-viewport-keyboard-${width}x400-${theme}-${direction}-${info.project.name}.png`, visual = directory + '/visual'; fs.mkdirSync(visual, { recursive: true });
    await page.locator('#host').screenshot({ animations: 'disabled' });
    const png = await page.locator('#host').screenshot({ path: visual + '/' + filename, animations: 'disabled' }), second = await page.locator('#host').screenshot({ animations: 'disabled' });
    const sha256 = createHash('sha256').update(png).digest('hex'); expect(createHash('sha256').update(second).digest('hex')).toBe(sha256);
    const overlap = await page.evaluate(() => {
      const root = document.querySelector('[data-nc-root]'), header = document.getElementById(root.getAttribute('aria-labelledby')).parentElement.getBoundingClientRect(), controls = document.querySelector('[data-nc-viewport]').getBoundingClientRect();
      const tip = [...document.querySelectorAll('[data-nc-tooltip],[data-nc-detail]')].find(element => !element.hidden && getComputedStyle(element).visibility === 'visible' && getComputedStyle(element).display !== 'none');
      if (!tip) return 0; const bounds = tip.getBoundingClientRect(), area = rect => Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left)) * Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
      return area(header) + area(controls);
    }); expect(overlap).toBe(0);
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const axe = await page.evaluate(() => window.axe.run(document)); expect(axe.violations).toEqual([]);
    fs.writeFileSync(visual + '/' + filename + '.json', JSON.stringify({ family, variant: 'viewport', file: filename, case: family + ' applied viewport keyboard', width, height: 400, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), browser: info.project.name, theme, direction, state: 'zoomed-keyboard', sha256, baseline: null, automated: 'PASS', humanApproval: 'PENDING', axeViolations: axe.violations.length }, null, 2));
  });
}
