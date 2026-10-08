import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="host" style="width:768px;height:400px"></div><button id="outside">Outside</button>'); await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
});
test.afterEach(async ({ page }, info) => {
  if (process.env.NC_COVERAGE === '1' && info.project.name === 'chromium') { fs.mkdirSync('artifacts/nc-01b/browser-coverage', { recursive: true }); fs.writeFileSync(`artifacts/nc-01b/browser-coverage/${info.testId.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(await page.evaluate(() => (globalThis as any).__coverage__))); }
});
async function settle(page: Page) { await page.waitForFunction(() => { const s = (globalThis as any).chart?.getSnapshot(); return s?.phase === 'active' && s.revision === s.committedRevision; }); }
async function mount(page: Page, extra: object = {}) {
  expect(await page.evaluate(extra => {
    const w = globalThis as any; w.spec = { family: 'line', title: 'Measurements', axes: { x: { kind: 'linear', domain: [0, 10] }, y: { kind: 'linear', domain: [0, 10] } }, series: [{ id: 'a', name: 'A', color: '#123abc', dash: 'solid', data: [{ id: 'a0', x: 0, y: 2 }, { id: 'a5', x: 5, y: 5 }, { id: 'a9', x: 9, y: 8 }] }, { id: 'b', name: 'B', dash: 'dotted', data: [{ id: 'b2', x: 2, y: 1 }, { id: 'b5', x: 5, y: null }, { id: 'b8', x: 8, y: 5 }] }], tooltip: { mode: 'shared' }, ...extra }; w.diagnostics = []; w.activations = []; w.states = [];
    const r = w.NCLine.createLineChart(document.getElementById('host'), w.spec, { instanceId: 'advanced', onDiagnostic: (e: unknown) => w.diagnostics.push(e), onPointActivate: (e: unknown) => w.activations.push(e), onStateChange: (e: unknown) => w.states.push(e) }); if (r.status === 'ok') w.chart = r.value; return r.status === 'ok' ? 'ok' : r.diagnostic;
  }, extra)).toBe('ok'); await settle(page);
}
async function update(page: Page, change: object) { expect(await page.evaluate(change => { const w = globalThis as any; w.spec = { ...w.spec, ...change }; return w.chart.update(w.spec).status; }, change)).toBe('ok'); await settle(page); }
async function point(page: Page, index: number) { return page.evaluate(index => { const svg = document.querySelector('[data-nc-root] svg') as SVGSVGElement, circle = document.querySelectorAll('[data-nc-layer="marks"] circle')[index]!, m = svg.getScreenCTM()!, x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy')); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }, index); }
test('irregular numeric/time data, gaps, all curves, markers and reference rendering', async ({ page }) => {
  await mount(page);
  for (const kind of ['linear', 'time']) for (const curve of ['straight', 'step-before', 'step-after', 'step-mid']) {
    await update(page, { axes: { x: { kind, domain: [0, 10], grid: true }, y: { kind: 'linear', domain: [0, 10], reversed: true, grid: false } }, series: [{ id: 's', name: 'S', curve, markers: 'on', gaps: 'connect', dash: 'dashed', data: [{ id: 'p', x: 0, y: 1 }, { id: 'null', x: 3, y: null }, { id: 'q', x: 9, y: 9 }] }], references: [{ id: 'x', axis: 'x', value: 3, label: 'Time/number' }, { id: 'y', axis: 'y', value: 5, label: 'Threshold', dash: 'dotted' }, { id: 'out', axis: 'y', value: 11 }] });
    await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1); await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(2); await expect(page.locator('[data-nc-layer="reference-lines"] line')).toHaveCount(2);
    await page.locator('[data-nc-grid]').focus(); await expect(page.locator('[role="gridcell"]')).toContainText(kind === 'time' ? '1970-01-01T00:00:00.000Z' : 'X 0');
  }
});
test('shared tooltip distinguishes null/absent and excludes hidden series', async ({ page }) => {
  await mount(page); const p = await point(page, 1); await page.mouse.move(p.x, p.y); const tip = page.locator('[data-nc-tooltip]'); await expect(tip).toBeVisible(); await expect(tip).toContainText('A: 5'); await expect(tip).toContainText('B: Missing observation');
  await page.getByRole('button', { name: 'B', exact: true }).click(); await settle(page); await page.mouse.move(p.x, p.y); await expect(tip).toBeVisible(); await expect(tip).not.toContainText('B:');
});
test('@a11y focus priority, keyboard series nearest-X, reconciliation and Escape stale-work guard', async ({ page }) => {
  await mount(page); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('ArrowRight'); await expect(page.locator('[role="gridcell"]')).toContainText('X 5'); const p = await point(page, 2); await page.mouse.move(p.x, p.y); await expect(page.locator('[role="gridcell"]')).toContainText('X 5');
  await grid.press('ArrowDown'); await expect(page.locator('[role="gridcell"]')).toContainText('B. X 2'); await grid.press('ArrowUp'); await expect(page.locator('[role="gridcell"]')).toContainText('A. X 0');
  await grid.press('Control+End'); await expect(page.locator('[role="gridcell"]')).toContainText('B. X 8'); await grid.press('Control+Home'); await expect(page.locator('[role="gridcell"]')).toContainText('A. X 0');
  await grid.press('Escape'); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  await update(page, { series: [{ id: 'a', name: 'A renamed', data: [{ id: 'a5', x: 5, y: 7 }] }] }); await expect(grid).toBeFocused(); await expect(page.locator('[role="gridcell"]')).toContainText('A renamed. X 5. Y 7');
  await update(page, { series: [] }); await expect(grid).toBeFocused(); await expect(grid).not.toHaveAttribute('role', 'grid'); await expect(grid).not.toHaveAttribute('aria-activedescendant');
});
test('@a11y loading focus fallback, table page clamp, hidden/null table semantics and explicit reopen', async ({ page }) => {
  const data = Array.from({ length: 205 }, (_, x) => ({ id: String(x), x, y: x === 0 ? null : x })); await mount(page, { axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Rows', data }] });
  await page.getByRole('button', { name: 'Rows', exact: true }).click(); await settle(page); await page.getByRole('button', { name: 'View data table' }).click(); await expect(page.locator('tbody tr').first()).toContainText('Series hidden'); await page.getByRole('button', { name: 'Next page' }).click(); await page.getByRole('button', { name: 'Next page' }).click();
  await update(page, { series: [{ id: 's', name: 'Rows', data: data.slice(0, 20) }] }); await expect(page.locator('tbody tr')).toHaveCount(20); await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await update(page, { status: { kind: 'loading', message: 'Fetching records' } }); await expect(page.locator('[data-nc-root]')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('tbody tr')).toHaveCount(0); await expect(page.locator('[data-nc-grid]')).toBeFocused();
  await update(page, { status: { kind: 'ready' } }); await expect(page.locator('[data-nc-table]')).toBeHidden(); await expect(page.getByRole('button', { name: 'View data table' })).toBeVisible();
});
test('touch tap boundary/cancel/pin allows scrolling and emits no synthetic click duplicate', async ({ page }) => {
  await mount(page); const p = await point(page, 1);
  const gesture = async (cancel: boolean, displacement: number) => page.evaluate(({ p, cancel, displacement }) => {
    const body = document.querySelector('[data-nc-grid]')!, make = (type: string, x: number) => new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: p.y, button: 0, bubbles: true, cancelable: true }); const down = make('pointerdown', p.x); body.dispatchEvent(down); body.dispatchEvent(make(cancel ? 'pointercancel' : 'pointerup', p.x + displacement)); return down.defaultPrevented;
  }, { p, cancel, displacement });
  expect(await gesture(true, 0)).toBe(false); expect(await gesture(false, 9)).toBe(false); expect(await page.evaluate(() => (globalThis as any).activations.length)).toBe(0); expect(await gesture(false, 0)).toBe(false);
  await expect.poll(() => page.evaluate(() => (globalThis as any).activations.length)).toBe(1); expect(await page.evaluate(() => (globalThis as any).activations[0].source)).toBe('touch'); await expect(page.locator('[data-nc-tooltip]')).toBeVisible();
  await page.mouse.move(0, 0); await expect(page.locator('[data-nc-tooltip]')).toBeVisible(); await page.locator('[data-nc-grid]').dispatchEvent('click'); expect(await page.evaluate(() => (globalThis as any).activations.length)).toBe(1);
});
test('host transform uses SVG CTM; unsupported portal transform and noninvertible CTM dock safely', async ({ page }) => {
  await page.locator('#host').evaluate(e => { e.style.transform = 'scale(.8)'; e.style.transformOrigin = 'top left'; }); await mount(page); const p = await point(page, 1); await page.mouse.move(p.x, p.y); await expect(page.locator('[data-nc-tooltip]')).toContainText('A: 5');
  await page.evaluate(() => { document.body.style.transform = 'translateX(1px)'; }); await page.locator('[data-nc-grid]').focus(); await expect(page.locator('[data-nc-detail]')).toBeVisible(); await expect(page.locator('[data-nc-detail]')).toHaveAttribute('tabindex', '0'); await page.locator('[data-nc-detail]').focus(); await page.locator('[data-nc-detail]').press('Escape'); await expect(page.locator('[data-nc-grid]')).toBeFocused(); await expect(page.locator('[data-nc-detail]')).toBeHidden();
  await page.evaluate(() => { document.body.style.transform = ''; document.getElementById('host')!.style.transform = 'scale(0)'; }); await page.locator('[data-nc-grid]').press('ArrowRight');
  // A zero transform has no visible pixels; verify the semantic fallback rather than a visible box.
  await expect(page.locator('[role="gridcell"]')).toContainText('X 5'); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  await page.evaluate(() => { document.getElementById('host')!.style.transform = ''; const original = SVGSVGElement.prototype.getScreenCTM; (globalThis as any).restoreMatrix = () => { SVGSVGElement.prototype.getScreenCTM = original; }; SVGSVGElement.prototype.getScreenCTM = (() => new DOMMatrix([0, 0, 0, 0, 0, 0])) as any; });
  await page.locator('[data-nc-grid]').press('ArrowRight'); await expect(page.locator('[data-nc-detail]')).toBeVisible(); await expect(page.locator('[role="gridcell"]')).toContainText('X 9'); await page.evaluate(() => (globalThis as any).restoreMatrix());
});
test('oversize shared detail docks and remains bounded within 320px chart', async ({ page }) => {
  await page.locator('#host').evaluate(e => { e.style.width = '320px'; e.style.height = '240px'; }); const series = Array.from({ length: 64 }, (_, i) => ({ id: 's' + i, name: 'Long series name ' + i, data: [{ id: 'p', x: 5, y: 5 }] })); await mount(page, { series, legend: { position: 'none' } }); await page.locator('[data-nc-grid]').focus(); await expect(page.locator('[data-nc-detail]')).toBeVisible();
  const bounds = await page.evaluate(() => { const detail = document.querySelector('[data-nc-detail]')!, body = detail.parentElement!, d = detail.getBoundingClientRect(), b = body.getBoundingClientRect(); return { width: d.width <= b.width, height: d.height <= b.height, rows: detail.children.length }; }); expect(bounds).toEqual({ width: true, height: true, rows: 65 });
});
test('nested overflow scroll repositions tooltip with no page-size growth or stale Escape reopen', async ({ page }) => {
  await page.evaluate(() => { const clip = document.createElement('div'); Object.assign(clip.style, { width: '500px', height: '330px', overflow: 'auto' }); const host = document.getElementById('host')!; host.before(clip); clip.append(host); }); await mount(page); const p = await point(page, 1); await page.mouse.move(p.x, p.y); await expect(page.locator('[data-nc-tooltip]')).toBeVisible();
  await page.evaluate(() => { document.getElementById('host')!.parentElement!.scrollTop = 20; });
  await expect.poll(() => page.locator('[data-nc-tooltip]').evaluate(e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility === 'visible' && r.x >= 8 && r.x + r.width <= 508; })).toBe(true);
  await page.locator('[data-nc-grid]').focus(); await page.locator('[data-nc-grid]').press('Escape'); await page.evaluate(() => document.dispatchEvent(new Event('scroll'))); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
});
test('@a11y RTL themes/tokens/end legend, font invalidation, forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'reduce' }); await mount(page, { theme: 'auto', direction: 'rtl', font: { family: 'serif', size: 18, weight: 700 }, legend: { position: 'end' }, axes: { x: { kind: 'linear', title: 'X units' }, y: { kind: 'linear', title: 'Y units' } } });
  await expect(page.locator('[data-nc-root]')).toHaveAttribute('dir', 'rtl'); expect(await page.locator('[data-nc-root]').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(17, 25, 39)'); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('ArrowRight'); await expect(page.locator('[role="gridcell"]')).toContainText('X 5');
  await page.emulateMedia({ colorScheme: 'light' }); await expect.poll(() => page.locator('[data-nc-root]').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.evaluate(() => { document.fonts.dispatchEvent(new Event('loadingdone')); document.fonts.dispatchEvent(new Event('loadingerror')); }); await settle(page);
  await page.locator('#host').evaluate(e => e.style.setProperty('--nc-surface', '#123456')); await page.evaluate(() => (globalThis as any).chart.refresh()); await settle(page); expect(await page.locator('[data-nc-root]').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(18, 52, 86)');
  await page.emulateMedia({ forcedColors: 'active' }); await grid.focus(); expect(await grid.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid'); await expect(page.locator('svg [tabindex]')).toHaveCount(0);
});
test('platform acquisition errors clean partial mount and allow the same ID to retry', async ({ page }) => {
  const result = await page.evaluate(() => { const w = globalThis as any, host = document.getElementById('host')!, spec = { family: 'line', title: 'T', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [] }, original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = (() => null) as any; const bad = w.NCLine.createLineChart(host, spec, { instanceId: 'retry' }); HTMLCanvasElement.prototype.getContext = original; const good = w.NCLine.createLineChart(host, spec, { instanceId: 'retry' }); if (good.status === 'ok') good.value.destroy(); return { reason: bad.diagnostic.reason, retry: good.status, children: host.children.length }; }); expect(result).toEqual({ reason: 'PLATFORM_UNAVAILABLE', retry: 'ok', children: 0 });
  const collision = await page.evaluate(() => { const w = globalThis as any, node = document.createElement('div'); node.id = 'nc-duplicate-grid'; document.body.append(node); const spec = { family: 'line', title: 'T', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [] }; const r = w.NCLine.createLineChart(document.getElementById('host'), spec, { instanceId: 'duplicate' }); node.remove(); return r.diagnostic.reason; }); expect(collision).toBe('ID_COLLISION');
});
test('faulted writer fails closed, update refuses, and destroy clears the failure shell', async ({ page }) => {
  await mount(page); await page.evaluate(() => { const w = globalThis as any, original = Element.prototype.setAttribute; w.restore = () => { Element.prototype.setAttribute = original; }; Element.prototype.setAttribute = function (name, value) { if (name === 'd' && this.isConnected) throw Error('Injected DOM fault'); original.call(this, name, value); }; w.chart.update({ ...w.spec, title: 'Changed', series: [{ ...w.spec.series[0], data: [{ id: 'a0', x: 0, y: 1 }, { id: 'a5', x: 5, y: 6 }] }] }); });
  await expect.poll(() => page.evaluate(() => (globalThis as any).chart.getSnapshot().phase)).toBe('faulted'); await expect(page.locator('svg')).toHaveCount(0); await expect(page.getByRole('region', { name: 'Chart unavailable' })).toBeVisible();
  expect(await page.evaluate(() => { const w = globalThis as any; w.restore(); return [w.chart.update(w.spec).diagnostic.reason, w.chart.refresh().diagnostic.reason, w.chart.getState()]; })).toEqual(['FAULTED', 'FAULTED', { hiddenSeriesIds: [] }]); await page.evaluate(() => (globalThis as any).chart.destroy()); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
});
test('synchronous geometry preflight rejects finite but unrepresentable projections atomically', async ({ page }) => {
  await mount(page); const result = await page.evaluate(() => { const w = globalThis as any, before = document.getElementById('host')!.innerHTML, snapshot = JSON.stringify(w.chart.getSnapshot()), r = w.chart.update({ ...w.spec, axes: { x: { kind: 'linear', domain: [0, Number.MIN_VALUE] }, y: { kind: 'linear', domain: [0, 10] } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: Number.MAX_VALUE, y: 1 }] }] }); return { reason: r.diagnostic.reason, html: before === document.getElementById('host')!.innerHTML, snapshot: snapshot === JSON.stringify(w.chart.getSnapshot()) }; }); expect(result).toEqual({ reason: 'UNREPRESENTABLE_GEOMETRY', html: true, snapshot: true });
});
test('100k table and dense 10k scene have bounded DOM; retained controllers dispose deterministically', async ({ page }) => {
  const data = Array.from({ length: 10000 }, (_, x) => ({ id: String(x), x, y: x % 10 })); await mount(page, { axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Dense', data, markers: 'auto' }] }); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1); await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(0); expect(await page.locator('[data-nc-root] *').count()).toBeLessThanOrEqual(256);
  await page.evaluate(() => { const w = globalThis as any; w.chart.destroy(); w.retained = [w.chart]; });
  // Build the stress data in the consumer's realm. Firefox's automation bridge
  // makes 100k transferred objects costly even in the preserved historical bundle.
  // Keep the real pointer click, row/resource bounds and retained-controller checks.
  expect(await page.evaluate(() => {
    const w = globalThis as any, spec = { family: 'line', title: 'Measurements', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Stress', data: Array.from({ length: 100000 }, (_, x) => ({ id: String(x), x, y: 1 })) }] };
    const r = w.NCLine.createLineChart(document.getElementById('host'), spec, { instanceId: 'advanced' }); if (r.status === 'ok') w.chart = r.value; return r.status;
  })).toBe('ok'); await settle(page); await page.getByRole('button', { name: 'View data table' }).click(); await expect(page.locator('tbody tr')).toHaveCount(100); await page.evaluate(() => { const w = globalThis as any; w.chart.destroy(); w.retained.push(w.chart); }); await expect(page.locator('[data-nc-root], [data-nc-tooltip]')).toHaveCount(0);
});
