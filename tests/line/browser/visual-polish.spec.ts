import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

async function ready(page: Page) { await page.waitForFunction(() => { const s = (globalThis as any).chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision; }); }
async function mount(page: Page, theme: 'light' | 'dark', collision = false) {
  await page.setContent('<style>body{margin:0}#host{width:768px;height:400px}</style><div id="host"></div>');
  await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
  await page.evaluate(({ theme, collision }) => {
    const w = globalThis as any, data = [{ id: 'p0', x: 0, y: 2 }, { id: 'p1', x: 1, y: 5 }];
    w.spec = { family: 'line', title: 'Weekly activity', description: 'Completed sessions', theme, axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: collision ? [{ id: 'a', name: 'A', color: '#255eb8', data }, { id: 'b', name: 'B', color: '#255eb8', data }] : [{ id: 's', name: 'Completed', data }], tooltip: { mode: 'shared' } };
    const r = w.NCLine.createLineChart(document.getElementById('host'), w.spec, { instanceId: 'polish' }); if (r.status !== 'ok') throw Error(JSON.stringify(r)); w.chart = r.value;
  }, { theme, collision }); await ready(page);
}
test.afterEach(async ({ page }, info) => {
  const coverage = await page.evaluate(() => (globalThis as any).__coverage__ ?? null);
  if (coverage && info.project.name === 'chromium') { const dir = path.resolve('artifacts/nc-01b/browser-coverage'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'polish-' + info.testId.replace(/[^a-z0-9]/gi, '-') + '.json'), JSON.stringify(coverage)); }
});
for (const theme of ['light', 'dark'] as const) {
  test(`@a11y visual foundation ${theme}: quiet controls, real hierarchy and visible keyboard focus`, async ({ page }) => {
    await mount(page, theme); const root = page.locator('[data-nc-root]'), grid = page.locator('[data-nc-grid]'), table = page.locator('[data-nc-table-toggle]'), legend = page.locator('[data-nc-series]');
    await expect(root).toHaveCSS('font-family', 'sans-serif'); await expect(page.locator('[id$="title"]').first()).toHaveCSS('font-size', '16px');
    expect(await page.locator('[id$="description"]').evaluate(e => getComputedStyle(e).color)).not.toBe(await root.evaluate(e => getComputedStyle(e).color));
    await expect(table).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)'); await expect(legend).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('[data-nc-layer="background"] rect')).toHaveCount(0); await expect(page.locator('[data-nc-layer="marks"] path')).not.toHaveAttribute('stroke-dasharray');
    await expect(grid).not.toHaveCSS('outline-style', 'solid'); await grid.focus(); await expect(grid).toHaveCSS('outline-width', '2px');
    const tooltip = page.locator('[data-nc-tooltip]'); await expect(tooltip).toBeVisible(); await expect(tooltip.locator('[data-nc-tooltip-heading]')).toHaveCSS('font-weight', '600'); await expect(tooltip.locator('[data-nc-tooltip-value]')).toHaveCSS('font-weight', '600');
    await expect(tooltip).toContainText('Completed: 2'); await grid.press('Escape'); await table.focus(); await expect(table).toHaveCSS('outline-width', '2px');
    await table.click(); await expect(page.locator('[data-nc-table]')).toBeVisible(); await page.getByRole('button', { name: 'Close data table' }).click(); await expect(table).toBeFocused();
    await legend.click(); await ready(page); await expect(legend).toHaveAttribute('aria-pressed', 'false'); await expect(legend.locator('span').last()).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.locator('[data-nc-status]')).toContainText('No visible series'); await expect(page.locator('[data-nc-status]')).toHaveCSS('justify-content', 'center');
  });
  test(`@a11y visual polish ${theme}: forced colors preserve native control and dock cues`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' }); await mount(page, theme);
    const grid = page.locator('[data-nc-grid]'), table = page.locator('[data-nc-table-toggle]'); await grid.focus(); await expect(grid).toHaveCSS('outline-width', '2px');
    await expect(table).toHaveCSS('border-top-style', 'solid'); await expect(table).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    const tip = page.locator('[data-nc-tooltip]'); await expect(tip).toBeVisible(); await expect(tip).toHaveCSS('box-shadow', 'none');
    await page.evaluate(() => { document.body.style.transform = 'translate(0)'; window.dispatchEvent(new Event('resize')); });
    await expect(page.locator('[data-nc-detail]')).toBeVisible(); await page.locator('[data-nc-detail]').focus(); await expect(page.locator('[data-nc-detail]')).toHaveCSS('outline-width', '2px');
  });
}
test('visual dash resolution agrees across plot, legend and shared detail; one surviving series becomes solid', async ({ page }) => {
  await mount(page, 'light', true); const paths = page.locator('[data-nc-layer="marks"] path'); await expect(paths).toHaveCount(2); await expect(paths.first()).not.toHaveAttribute('stroke-dasharray'); await expect(paths.last()).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(page.locator('[data-nc-series="a"] span').first()).toHaveCSS('border-top-style', 'solid'); await expect(page.locator('[data-nc-series="b"] span').first()).toHaveCSS('border-top-style', 'dashed');
  await page.locator('[data-nc-grid]').focus(); await expect(page.locator('[data-nc-tooltip-row]')).toHaveCount(2); await expect(page.locator('[data-nc-tooltip-row]').last().locator('span').first()).toHaveCSS('border-top-style', 'dashed');
  await page.locator('[data-nc-grid]').press('Escape'); await page.locator('[data-nc-series="a"]').click(); await ready(page); await expect(paths).toHaveCount(1); await expect(paths).not.toHaveAttribute('stroke-dasharray'); await expect(page.locator('[data-nc-series="b"] span').first()).toHaveCSS('border-top-style', 'solid');
  await page.evaluate(() => { const w = globalThis as any; w.chart.update({ ...w.spec, series: w.spec.series.map((s: any) => ({ ...s, dash: 'dotted' })) }); }); await ready(page); await expect(paths).toHaveAttribute('stroke-dasharray', '1 4');
});
