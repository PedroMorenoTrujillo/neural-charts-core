import { test, expect } from '@playwright/test';
import { mount, ready } from './helpers.mjs';
const directory = process.env.NC_SELECTION_PAINT_DIR ?? 'artifacts/v1-selection-paint';
const families = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter', 'stacked-area'];
for (const family of families) test(family + ' preserves a real keyboard selection through a pending layout-only refresh', async ({ page }) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' }, {}, directory + '/browser-harness.js');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  const result = await page.evaluate(() => {
    const refreshed = window.chart.refresh(), before = window.chart.getSnapshot(), api = window.chart.requestSelection([]);
    document.querySelector('[data-nc-grid]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { refreshed, before, api, selection: window.chart.getSelection(), activations: window.activations, changes: window.selections };
  });
  expect(result.refreshed.status).toBe('ok'); expect(result.before.revision).toBeGreaterThan(result.before.committedRevision);
  expect(result.api).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UPDATE_PENDING' } });
  expect(result.selection).toHaveLength(1); expect(result.activations).toHaveLength(1); expect(result.changes).toHaveLength(1); expect(result.changes[0].source).toBe('keyboard');
  await ready(page); expect(await page.evaluate(() => window.chart.getSelection())).toEqual(result.selection); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'View data table', exact: true }).click();
  const row = family === 'scatter' ? page.locator('[data-nc-table] tbody tr').filter({ hasText: result.selection[0].pointId }) : page.locator('[data-nc-table] tbody tr').first();
  await expect(row.locator('td').last()).toHaveText('true');
});
for (const family of families) test(family + ' proposes once during layout refresh without optimistic controlled selection', async ({ page }) => {
  await mount(page, family, { mode: 'controlled', kind: 'multiple', value: [] }, {}, directory + '/browser-harness.js');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  await page.evaluate(() => { window.chart.refresh(); document.querySelector('[data-nc-grid]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await ready(page); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]);
  const events = await page.evaluate(() => window.selections); expect(events).toHaveLength(1); expect(events[0].effect).toBe('proposal'); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false');
  expect((await page.evaluate(selection => window.chart.update({ ...window.spec, selection: { mode: 'controlled', kind: 'multiple', value: selection } }), events[0].selection)).status).toBe('ok'); await ready(page);
  expect(await page.evaluate(() => window.selections)).toHaveLength(1); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
});
for (const family of families) test(family + ' still refuses selection while business data have not committed', async ({ page }) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' }, {}, directory + '/browser-harness.js');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  const result = await page.evaluate(() => {
    const updated = window.chart.update(structuredClone(window.spec)), api = window.chart.requestSelection([]);
    document.querySelector('[data-nc-grid]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { updated, api, selected: window.chart.getSelection(), changes: window.selections };
  });
  expect(result.updated.status).toBe('ok'); expect(result.api).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UPDATE_PENDING' } }); expect(result.selected).toEqual([]); expect(result.changes).toEqual([]); await ready(page);
});
for (const family of families) test(family + ' coalesces layout paints without losing either rapid selection gesture', async ({ page }) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' }, {}, directory + '/browser-harness.js');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  const result = await page.evaluate(() => {
    window.chart.refresh(); const grid = document.querySelector('[data-nc-grid]');
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); const first = window.chart.getSelection();
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { first, second: window.chart.getSelection(), activations: window.activations.length, changes: window.selections.map(event => event.selection) };
  });
  expect(result.first).toHaveLength(1); expect(result.second).toEqual([]); expect(result.activations).toBe(2); expect(result.changes).toEqual([result.first, []]); await ready(page); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false');
});
