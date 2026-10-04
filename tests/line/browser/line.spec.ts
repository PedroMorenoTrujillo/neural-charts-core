import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="host" style="width:768px;height:400px"><span id="foreign">Application content</span></div><button id="outside">Outside</button>');
  await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
});
test.afterEach(async ({ page }, info) => {
  if (process.env.NC_COVERAGE === '1' && info.project.name === 'chromium') {
    const coverage = await page.evaluate(() => (globalThis as any).__coverage__);
    fs.mkdirSync('artifacts/nc-01b/browser-coverage', { recursive: true }); fs.writeFileSync(`artifacts/nc-01b/browser-coverage/${info.testId.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(coverage));
  }
});
async function mount(page: Page, config: object = {}, options: object = {}) {
  const result = await page.evaluate(({ config, options }) => {
    const w = globalThis as any;
    w.spec = { family: 'line', title: 'Sales', description: 'Observed sales', axes: { x: { kind: 'category', values: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }], title: 'Period' }, y: { kind: 'linear', domain: [0, 10], title: 'Units' } }, series: [{ id: 's', name: 'Series one', data: [{ id: 'p', x: 'a', y: 1 }, { id: 'q', x: 'b', y: 3 }, { id: 'r', x: 'c', y: 2 }] }], ...config };
    w.activations = []; w.states = []; w.diagnostics = [];
    const r = w.NCLine.createLineChart(document.getElementById('host'), w.spec, { instanceId: 'chart', onPointActivate: (e: unknown) => w.activations.push(e), onStateChange: (e: unknown) => w.states.push(e), onDiagnostic: (e: unknown) => w.diagnostics.push(e), ...options });
    if (r.status === 'ok') w.chart = r.value; return r.status === 'ok' ? 'ok' : r.diagnostic;
  }, { config, options });
  expect(result).toBe('ok'); await settled(page);
}
async function settled(page: Page) {
  await page.waitForFunction(() => { const c = (globalThis as any).chart, s = c?.getSnapshot(); return s?.phase === 'active' && s.revision === s.committedRevision; });
}
async function marker(page: Page, index = 0) {
  return page.evaluate(index => { const svg = document.querySelector('[data-nc-root] svg') as SVGSVGElement, p = document.querySelectorAll('[data-nc-layer="marks"] circle')[index]!, m = svg.getScreenCTM()!, x = Number(p.getAttribute('cx')), y = Number(p.getAttribute('cy')); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }, index);
}
test('mount real Line, preserve host ownership and destroy/remount', async ({ page }) => {
  await mount(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1); await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(3);
  await expect(page.locator('[data-nc-root] svg')).toHaveCount(2); await expect(page.locator('#foreign')).toHaveText('Application content');
  await page.evaluate(() => { const w = globalThis as any; w.chart.destroy(); w.chart.destroy(); });
  await expect(page.locator('[data-nc-root]')).toHaveCount(0); await expect(page.locator('#foreign')).toHaveCount(1);
  expect(await page.evaluate(() => { const w = globalThis as any; return [w.chart.getState(), w.chart.getSnapshot().phase, w.chart.update(w.spec).diagnostic.reason, w.chart.refresh().diagnostic.reason]; })).toEqual([{ hiddenSeriesIds: [] }, 'destroyed', 'DESTROYED', 'DESTROYED']);
  await mount(page);
});
test('invalid updates preserve accepted and committed state/HTML/revisions', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const w = globalThis as any, before = document.getElementById('host')!.innerHTML, snapshot = w.chart.getSnapshot(), state = w.chart.getState();
    const r = w.chart.update({ ...w.spec, series: [{ ...w.spec.series[0], data: [{ id: 'p', x: 'a', y: NaN }] }] });
    return { reason: r.diagnostic.reason, html: before === document.getElementById('host')!.innerHTML, snapshot: JSON.stringify(snapshot) === JSON.stringify(w.chart.getSnapshot()), state: JSON.stringify(state) === JSON.stringify(w.chart.getState()) };
  }); expect(result).toEqual({ reason: 'NONFINITE', html: true, snapshot: true, state: true });
});
test('point tooltip and overlay use real coordinates without rebuilding base path', async ({ page }) => {
  await mount(page); const p = await marker(page, 1);
  await page.evaluate(() => { (globalThis as any).pathNode = document.querySelector('[data-nc-layer="marks"] path'); });
  await page.mouse.move(p.x, p.y); await expect(page.locator('[data-nc-tooltip]')).toBeVisible(); await expect(page.locator('[data-nc-tooltip]')).toContainText('Beta'); await expect(page.locator('[data-nc-tooltip]')).toContainText('Series one: 3'); await expect(page.locator('[data-nc-layer="interaction"] circle')).toHaveCount(2);
  expect(await page.evaluate(() => (globalThis as any).pathNode === document.querySelector('[data-nc-layer="marks"] path'))).toBe(true);
  await page.mouse.click(p.x, p.y); await expect(page.locator('[data-nc-grid]')).toBeFocused(); await expect.poll(() => page.evaluate(() => (globalThis as any).activations.length)).toBe(1);
});
test('@a11y keyboard exact values, active descendant, counts, and normal Tab exit', async ({ page, browserName }) => {
  await mount(page); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await expect(grid).toHaveAttribute('role', 'grid'); await expect(grid).toHaveAttribute('aria-rowcount', '1'); await expect(grid).toHaveAttribute('aria-colcount', '3');
  await expect(page.locator('[role="gridcell"]')).toContainText('Alpha'); const firstId = await grid.getAttribute('aria-activedescendant'); await grid.press('ArrowRight'); await expect(page.locator('[role="gridcell"]')).toContainText('Beta'); expect(await grid.getAttribute('aria-activedescendant')).not.toBe(firstId);
  await grid.press('End'); await expect(page.locator('[role="gridcell"]')).toContainText('Gamma'); await grid.press('Home'); await expect(page.locator('[role="gridcell"]')).toContainText('Alpha'); await grid.press('Enter'); await expect.poll(() => page.evaluate(() => (globalThis as any).activations.length)).toBe(1);
  await grid.press('Escape'); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0); await grid.press('Tab'); await expect(grid).not.toBeFocused();
  // WebKit's default macOS native Tab policy skips buttons; Option+Tab includes them.
  if (browserName === 'webkit') { await grid.focus(); await grid.press('Alt+Tab'); }
  await expect(page.getByRole('button', { name: 'Series one', exact: true })).toBeFocused();
  await expect(page.locator('svg[aria-hidden="true"][focusable="false"]')).toHaveCount(2); await expect(page.locator('[aria-selected]')).toHaveCount(0);
});
test('internal legend accepts state; controlled legend emits only proposals', async ({ page }) => {
  await mount(page); const button = page.getByRole('button', { name: 'Series one', exact: true }); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'false'); await expect(page.locator('[role="status"]').first()).toContainText('No visible series');
  expect(await page.evaluate(() => (globalThis as any).states[0].effect)).toBe('accepted'); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (globalThis as any).chart.destroy()); await mount(page, { state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } }); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true'); expect(await page.evaluate(() => (globalThis as any).states[0].effect)).toBe('proposal');
  await page.evaluate(() => { const w = globalThis as any; w.spec = { ...w.spec, state: { mode: 'controlled', value: w.states[0].state } }; w.chart.update(w.spec); }); await settled(page); await expect(button).toHaveAttribute('aria-pressed', 'false');
});
test('@a11y paged table includes null and hidden data and returns focus', async ({ page }) => {
  const data = Array.from({ length: 205 }, (_, x) => ({ id: String(x), x, y: x === 0 ? null : x }));
  await mount(page, { axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Rows', data }] }); await page.getByRole('button', { name: 'View data table' }).click(); await expect(page.locator('tbody tr')).toHaveCount(100); await expect(page.locator('tbody tr').first()).toContainText('Missing observation'); await expect(page.locator('[data-nc-table] h3')).toBeFocused();
  await page.getByRole('button', { name: 'Next page' }).click(); await expect(page.locator('tbody tr').first()).toContainText('100'); await page.getByRole('button', { name: 'Next page' }).click(); await expect(page.locator('tbody tr')).toHaveCount(5); await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close data table' }).click(); await expect(page.locator('tbody tr')).toHaveCount(0); await expect(page.getByRole('button', { name: 'View data table' })).toBeFocused();
});
test('explicit statuses suppress ink and loading→ready restores data', async ({ page }) => {
  await mount(page); for (const status of [{ kind: 'loading' }, { kind: 'empty' }, { kind: 'error', message: 'Unavailable' }]) {
    await page.evaluate(status => { const w = globalThis as any; w.chart.update({ ...w.spec, status }); }, status); await settled(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Series one', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'View data table' })).toHaveCount(0);
  }
  await page.evaluate(() => { const w = globalThis as any; w.chart.update(w.spec); }); await settled(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1);
});
test('resize, zero-size suspension and small positive limitation', async ({ page }) => {
  await mount(page); await page.locator('#host').evaluate(e => { e.style.width = '0px'; }); await expect.poll(() => page.evaluate(() => (globalThis as any).chart.getSnapshot().phase)).toBe('suspended'); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
  await page.locator('#host').evaluate(e => { e.style.width = '50px'; e.style.height = '50px'; }); await settled(page); await expect(page.locator('[role="status"]').first()).toContainText('too small'); expect(await page.evaluate(() => (globalThis as any).chart.getSnapshot().view)).toBe('ready');
  await page.locator('#host').evaluate(e => { e.style.width = '390px'; e.style.height = '400px'; }); await settled(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1);
});
