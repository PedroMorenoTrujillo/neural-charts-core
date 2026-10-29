import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import type { LineChartSpec, LineController } from '../../../src/line.js';
type PointerSample = Readonly<{ x: number; y: number; pointerId: number; pointerType: string }>;
const spec: LineChartSpec = { family: 'line', title: 'Stationary pointer', axes: { x: { kind: 'linear', domain: [0, 10] }, y: { kind: 'linear', domain: [0, 10] } }, series: [{ id: 'a', name: 'A', data: [{ id: 'a0', x: 0, y: 2 }, { id: 'a5', x: 5, y: 5 }, { id: 'a9', x: 9, y: 8 }] }, { id: 'b', name: 'B', data: [{ id: 'b2', x: 2, y: 1 }, { id: 'b5', x: 5, y: null }, { id: 'b8', x: 8, y: 5 }] }], tooltip: { mode: 'shared' } };
async function settled(page: Page) { await page.waitForFunction(() => { const snapshot = (Reflect.get(window, '__stationaryChart') as LineController).getSnapshot(); return snapshot.phase === 'active' && snapshot.revision === snapshot.committedRevision; }); }
async function point(page: Page, index = 1) { return page.evaluate(index => { const svg = document.querySelector('svg') as SVGSVGElement, circle = document.querySelectorAll('[data-nc-layer="marks"] circle')[index]!, matrix = svg.getScreenCTM()!, x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy')); return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }; }, index); }
async function echo(page: Page) { await page.evaluate(() => { const pointer = Reflect.get(window, '__stationaryPointer') as PointerSample; document.querySelector('[data-nc-grid]')!.dispatchEvent(new PointerEvent('pointermove', { pointerId: pointer.pointerId, pointerType: pointer.pointerType, clientX: pointer.x, clientY: pointer.y, bubbles: true })); }); await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }); }
test.beforeEach(async ({ page }) => {
  await page.bringToFront();
  await page.setContent('<div style="width:500px;height:330px;overflow:auto"><div id="host" style="width:768px;height:400px"></div></div><button>Outside</button>'); await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
  expect(await page.evaluate(spec => {
    document.addEventListener('pointermove', event => Reflect.set(window, '__stationaryPointer', { x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType }), true);
    const factory = Reflect.get(window, 'NCLine') as Pick<typeof import('../../../src/line.js'), 'createLineChart'>;
    const result = factory.createLineChart(document.getElementById('host')!, spec, { instanceId: 'stationary' }); if (result.status === 'ok') Reflect.set(window, '__stationaryChart', result.value); return result.status;
  }, spec)).toBe('ok'); await settled(page); const target = await point(page); await page.mouse.move(target.x, target.y); await expect(page.locator('[data-nc-tooltip]')).toBeVisible();
});
test('scroll preserves the logical hover when the browser echoes an unchanged pointer position', async ({ page }) => {
  const tooltip = page.locator('[data-nc-tooltip]'), before = await tooltip.boundingBox(); expect(before).not.toBeNull();
  await page.evaluate(() => { document.getElementById('host')!.parentElement!.scrollTop = 20; });
  await expect.poll(async () => { const bounds = await tooltip.boundingBox(); return !!bounds && Math.abs(bounds.y - (before!.y - 20)) < 1; }).toBe(true);
  await echo(page); await expect(tooltip).toBeVisible(); await expect(tooltip).toContainText('A: 5');
  expect(await tooltip.evaluate(element => { const r = element.getBoundingClientRect(); return r.x >= 8 && r.x + r.width <= 508; })).toBe(true);
  const next = await point(page, 3); await page.mouse.move(next.x, next.y); await expect(tooltip).toContainText('B: 1');
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Escape'); await echo(page); await expect(tooltip).toHaveCount(0);
});
test('the same pointer coordinate can resolve a newly committed revision', async ({ page }) => {
  expect(await page.evaluate(spec => (Reflect.get(window, '__stationaryChart') as LineController).update({ ...spec, title: 'Updated stationary pointer' }).status, spec)).toBe('ok'); await settled(page); await echo(page);
  await expect(page.locator('[data-nc-tooltip]')).toBeVisible(); await expect(page.locator('[data-nc-tooltip]')).toContainText('A: 5');
});
