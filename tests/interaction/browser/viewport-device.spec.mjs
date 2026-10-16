import { test, expect } from '@playwright/test';
import { mount, ready, captureCoverage } from './helpers.mjs';
import path from 'node:path';
const directory = process.env.NC_VIEWPORT_ARTIFACT_DIR ?? 'artifacts/v1-viewport';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local viewport evidence required');
test.afterEach(async ({ page }, info) => { await captureCoverage(page, info, 'viewport-device', directory); });
test('native wheel zoom changes the applied domain while a disabled wheel leaves page scrolling available', async ({ page }) => {
  await mount(page, 'scatter', false, { viewport: { mode: 'internal', axes: 'xy', wheel: true, controls: false, initial: { x: [-1, 1], y: [-1, 1] } } }, directory + '/browser-harness.js');
  const surface = await page.locator('[data-nc-viewport-surface]').boundingBox();
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => window.chart.getViewport().x[1] - window.chart.getViewport().x[0])).toBeLessThan(2); await ready(page);
  await page.evaluate(() => { window.spec = { ...window.spec, viewport: { ...window.spec.viewport, wheel: false } }; return window.chart.update(window.spec); }); await ready(page);
  const before = await page.evaluate(() => { document.body.style.minHeight = '2000px'; return window.chart.getViewport(); });
  // The new page scroll region must reach the compositor before real input.
  // The retained plain-DOM control reproduces WebKit's zero-scroll race too.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.wheel(0, 150); await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual(before);
});
test('native touchscreen tap on an opted-in drag surface activates the logical datum once without moving its viewport', async ({ browser }, info) => {
  const context = await browser.newContext({ hasTouch: true }); const page = await context.newPage();
  try {
    await mount(page, 'scatter', false, { viewport: { mode: 'internal', axes: 'xy', gesture: 'pan', initial: { x: [-1, 1], y: [-1, 1] } } }, directory + '/browser-harness.js');
    const point = await page.locator('[data-nc-layer="marks"]').first().locator(':scope > *').first().evaluate(element => { const box = element.getBBox(), point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; });
    await page.touchscreen.tap(point.x, point.y);
    expect(await page.evaluate(() => window.activations.map(event => [event.point.id, event.source]))).toEqual([['zero', 'touch']]);
    expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [-1, 1], y: [-1, 1] });
  } finally { try { await captureCoverage(page, info, 'viewport-touch-context', directory); } finally { await context.close(); } }
});
