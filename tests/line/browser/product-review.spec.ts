import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { reviewNames, reviewFixture } from '../../../../../apps/core-lab/review-fixtures.js';

const phase = process.env.NC_PRODUCT_VISUAL_PHASE === 'before' ? 'before' : 'after';
for (const [width, height] of [[320, 240], [390, 300], [768, 400], [1280, 600]] as const) for (const theme of ['light', 'dark'] as const) for (const name of reviewNames) {
  test(`@visual @product-review ${name} ${width}x${height} ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Canonical product-design captures use Chromium DPR1.');
    await page.setViewportSize({ width: width + 32, height: height + 32 });
    await page.setContent(`<style>html,body{margin:0}#host{width:${width}px;height:${height}px}</style><div id="host"></div>`);
    await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
    const spec = { ...reviewFixture(name), theme };
    expect(Object.hasOwn(spec, 'font')).toBe(false);
    await page.evaluate(({ spec, dock }) => {
      if (dock) document.body.style.transform = 'translate(0)';
      const w = globalThis as any, r = w.NCLine.createLineChart(document.getElementById('host'), spec, { instanceId: 'product-review', onStateChange() {} });
      if (r.status !== 'ok') throw Error(JSON.stringify(r)); w.chart = r.value;
    }, { spec, dock: name === 'tooltip-dock' });
    await page.waitForFunction(() => { const s = (globalThis as any).chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision; });
    await expect(page.locator('[data-nc-root]')).toHaveCSS('font-family', 'sans-serif');
    if (name === 'focus') { const grid = page.locator('[role="grid"]'); await grid.focus(); await grid.press('Escape'); }
    if (name.startsWith('tooltip')) {
      const markers = page.locator('[data-nc-root] svg circle'), marker = name === 'tooltip-edge' ? markers.last() : markers.first(), box = await marker.boundingBox();
      if (!box) throw Error('Visible product tooltip target'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator(name === 'tooltip-dock' ? '[data-nc-detail]' : '[data-nc-tooltip]')).toBeVisible();
    }
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const first = await page.screenshot({ animations: 'disabled' }), second = await page.screenshot({ animations: 'disabled' });
    expect(second.equals(first), 'Product captures must be repeatable').toBe(true);
    const dir = path.resolve('artifacts/nc-01b/visual-review', phase), id = `${name}-${width}x${height}-${theme}`;
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, id + '.png'), first);
    fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ id, name, width, height, theme, phase, sha256: crypto.createHash('sha256').update(first).digest('hex'), repeatCapture: 'PASS', head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), font: 'actual product defaults: sans-serif', viewport: [width + 32, height + 32], browser: info.project.name, DPR: 1, timezone: 'UTC', motion: 'none', approval: 'HUMAN REVIEW PENDING' }, null, 2));
    await page.evaluate(() => (globalThis as any).chart.destroy());
  });
}
