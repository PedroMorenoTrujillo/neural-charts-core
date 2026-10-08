import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { reviewFixture } from '../../../../../apps/core-lab/review-fixtures.js';

async function ready(page: Page) {
  await page.waitForFunction(() => { const s = (globalThis as any).chart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision; });
}
async function mount(page: Page, width: number, height: number, theme: 'light' | 'dark', direction: 'ltr' | 'rtl' = 'ltr') {
  await page.setContent(`<style>html,body{margin:0}#host{width:${width}px;height:${height}px}</style><div id="host"></div>`);
  await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
  await page.evaluate(spec => {
    const w = globalThis as any, r = w.NCLine.createLineChart(document.getElementById('host'), spec, { instanceId: 'compact-review' });
    if (r.status !== 'ok') throw Error(JSON.stringify(r)); w.chart = r.value;
  }, { ...reviewFixture('simple-line'), theme, direction });
  await ready(page);
}
for (const theme of ['light', 'dark'] as const) for (const [width, height] of [[320, 240], [390, 300]] as const) {
  test(`@a11y compact header ${width}x${height} ${theme}: full context, separate rows and native controls`, async ({ page }) => {
    await mount(page, width, height, theme);
    const root = page.locator('[data-nc-root]'), description = page.locator('[id$="description"]'), table = page.getByRole('button', { name: 'View data table', exact: true });
    await expect(table).toHaveText('Data table'); await expect(table).toHaveCSS('height', '32px');
    await expect(description).toHaveText('Completed sessions · Last seven days');
    const boxes = await page.evaluate(() => {
      const desc = document.querySelector('[id$="description"]')!, title = document.querySelector('[id$="title"]')!, table = document.querySelector('[data-nc-table-toggle]')!;
      const d = desc.getBoundingClientRect(), t = title.getBoundingClientRect(), b = table.getBoundingClientRect();
      return { fits: desc.scrollWidth <= desc.clientWidth, separate: d.top >= Math.max(t.bottom, b.bottom), titleFits: t.right <= b.left, descriptionWidth: d.width };
    });
    expect(boxes).toEqual({ fits: true, separate: true, titleFits: true, descriptionWidth: width - 24 });
    const described = await root.evaluate(e => (e.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '));
    expect(described).toContain('Completed sessions · Last seven days');
    await expect(root.locator('svg text').filter({ hasText: /^Day$/ })).toHaveCount(1); await expect(root.locator('svg text').filter({ hasText: /^Sessions$/ })).toHaveCount(1);
    const radii = await root.locator('[data-nc-layer="marks"] circle').evaluateAll(es => es.map(e => e.getAttribute('r')));
    expect(radii).toHaveLength(7); expect(radii.every(r => r === '3')).toBe(true);
    await table.focus(); await expect(table).toHaveCSS('outline-width', '2px'); await table.press('Enter');
    await expect(page.locator('[data-nc-table]')).toBeVisible(); await expect(page.locator('[data-nc-table]')).toContainText('Day'); await expect(page.locator('[data-nc-table]')).toContainText('Sessions');
    await page.getByRole('button', { name: 'Close data table' }).click(); await expect(table).toBeFocused();
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await expect(page.locator('[data-nc-tooltip]')).toContainText('Completed: 2');
    const pointContext = await grid.evaluate(e => (e.getAttribute('aria-describedby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '));
    expect(pointContext).toContain('X: Day'); expect(pointContext).toContain('Y: Sessions');
    await grid.press('ArrowRight'); await expect(page.locator('[data-nc-tooltip]')).toContainText('Completed: 7'); await grid.press('Escape');
    expect((await root.locator('[data-nc-series]').first().boundingBox())?.height).toBeGreaterThanOrEqual(32);
    await root.locator('[data-nc-series]').first().click(); await ready(page); await expect(root.locator('[data-nc-series]').first()).toHaveAttribute('aria-pressed', 'false');
    await root.locator('[data-nc-series]').first().click(); await ready(page); await expect(root.locator('[data-nc-layer="marks"] circle')).toHaveCount(7);
    expect(await root.evaluate(e => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)).toBe(true);
    await page.evaluate(() => (globalThis as any).chart.destroy()); await expect(root).toHaveCount(0); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  });
}
for (const direction of ['ltr', 'rtl'] as const) {
  test(`compact layout ${direction}: resizing across the existing breakpoint restores desktop and settles`, async ({ page }) => {
    await mount(page, 320, 240, 'light', direction);
    const table = page.getByRole('button', { name: 'View data table', exact: true });
    for (const width of [663, 664, 768, 390, 1280, 320]) {
      await page.evaluate(width => { const host = document.getElementById('host')!; host.style.width = width + 'px'; host.style.height = width < 664 ? '300px' : '400px'; }, width);
      await expect(page.locator('[data-nc-root]')).toHaveCSS('width', width + 'px');
      await expect(table).toHaveText(width < 664 ? 'Data table' : 'View data table'); await ready(page);
      const state = await page.evaluate(async () => {
        const w = globalThis as any, start = w.chart.getSnapshot().revision;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return { start, end: w.chart.getSnapshot().revision, count: document.querySelectorAll('[data-nc-root]').length };
      });
      expect(state).toEqual({ start: state.start, end: state.start, count: 1 });
      await expect(page.locator('[id$="description"]')).toHaveText('Completed sessions · Last seven days');
      await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(7);
    }
    await page.evaluate(() => (globalThis as any).chart.destroy()); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  });
}
