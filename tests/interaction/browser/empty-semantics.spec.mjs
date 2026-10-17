import { test, expect } from '@playwright/test';
import { mount, ready } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
const directory = process.env.NC_EMPTY_SEMANTICS_DIR ?? 'artifacts/v1-empty-semantics';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local empty semantics evidence');
for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter']) test(family + ' clears grid-only ARIA in empty state and restores real data navigation', async ({ page }, info) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' }, {}, directory + '/browser-harness.js');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.chart.getSelection().length)).toBe(1);
  expect((await page.evaluate(radial => window.chart.update(radial ? { ...window.spec, data: [] } : { ...window.spec, series: [] }), family === 'pie' || family === 'donut')).status).toBe('ok'); await ready(page);
  expect(await page.evaluate(() => window.chart.getSnapshot().view)).toBe('empty');
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
  const report = await page.evaluate(async () => ({ violations: (await window.axe.run(document.getElementById('host'))).violations, role: document.querySelector('[data-nc-grid]').getAttribute('role'), selected: window.chart.getSelection() }));
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/empty-' + family + '-' + info.project.name + '.json', JSON.stringify(report, null, 2));
  expect(report.violations).toEqual([]); expect(report.role).toBe('group'); expect(report.selected).toEqual([]); await expect(grid).not.toHaveAttribute('aria-activedescendant'); await expect(grid).not.toHaveAttribute('aria-rowcount'); await expect(grid.locator('[role="gridcell"]')).toHaveCount(0);
  expect((await page.evaluate(() => window.chart.update(window.spec))).status).toBe('ok'); await ready(page); await expect(grid).toHaveAttribute('role', 'grid'); await grid.focus(); await grid.press('Home'); await expect(grid.locator('[role="gridcell"]')).toHaveCount(1); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]);
  for (const kind of ['loading', 'error', 'empty']) {
    const result = await page.evaluate(kind => window.chart.update({ ...window.spec, status: kind === 'error' ? { kind, message: 'Measurement unavailable.' } : { kind } }), kind);
    expect(result).toMatchObject({ status: 'ok' }); await ready(page);
    await expect(grid).toHaveAttribute('role', 'group'); await expect(grid).not.toHaveAttribute('aria-activedescendant'); await expect(grid).not.toHaveAttribute('aria-rowcount'); await expect(grid).not.toHaveAttribute('aria-colcount'); await expect(grid).not.toHaveAttribute('aria-readonly'); await expect(grid.locator('[role="gridcell"]')).toHaveCount(0);
    expect(await page.evaluate(async () => (await window.axe.run(document.getElementById('host'))).violations)).toEqual([]);
    expect((await page.evaluate(() => window.chart.update(window.spec))).status).toBe('ok'); await ready(page); await expect(grid).toHaveAttribute('role', 'grid');
  }
});
