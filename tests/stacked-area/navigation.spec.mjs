import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { waitForLineDetail } from '../../../../tooling/line-detail-wait.mjs';
const directory = process.env.NC_STACKED_AREA_ARTIFACT_DIR ?? 'artifacts/v1-stacked-area';
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.committedRevision > 0 && s.revision === s.committedRevision; })).toBe(true); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); }
async function mount(page, kind = 'category') {
  await page.setContent('<!doctype html><html lang="en"><main><div id="host" style="width:768px;height:440px"></div></main></html>'); await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  await page.addScriptTag({ content: 'window.waitForStackedAreaDetail=' + waitForLineDetail.toString() });
  const result = await page.evaluate(kind => {
    const categories = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, label: i < 2 ? 'January' : 'Category ' + i })), base = kind === 'time' ? 1700000000000 : 0;
    window.spec = { family: 'stacked-area', stacking: 'sum', title: 'Stacked Area viewport', axes: { x: kind === 'category' ? { kind, values: categories } : { kind }, y: { kind: 'linear', reversed: kind !== 'category' } }, selection: { mode: 'internal', kind: 'multiple' }, crosshair: 'xy', viewport: { mode: 'internal', axes: kind === 'category' ? 'x' : 'xy', gesture: 'pan', wheel: true }, series: [0, 1].map(si => ({ id: 's' + si, name: si ? 'Closed' : 'Open', data: categories.map((category, i) => ({ id: 'p' + i, x: kind === 'category' ? category.id : base + i * i * 1000, y: (i + 1) * (si + 1) })) })) };
    window.events = []; window.diagnostics = []; const result = window.NCStackedArea.createStackedAreaChart(document.getElementById('host'), window.spec, { instanceId: 'stacked-area-viewport', onPointActivate: event => window.events.push(event), onViewportChange() {}, onSelectionChange() {}, onDiagnostic: value => window.diagnostics.push(value) }); if (result.status === 'ok') window.chart = result.value; return result.status;
  }, kind); expect(result).toBe('ok'); await ready(page);
}
async function plot(page) { return page.evaluate(() => { const svg = document.querySelector('#host svg'), rect = svg.querySelector('clipPath rect'), matrix = svg.getScreenCTM(), x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y')), width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height')), point = new DOMPoint(x + width / 2, y + height / 2).matrixTransform(matrix); return { x: point.x, y: point.y, width: width * matrix.a, height: height * matrix.d }; }); }
test('Stacked Area viewport uses actual wheel, pointer pan, logical selection and reset', async ({ page }, info) => {
  await mount(page); let box = await plot(page); await page.mouse.move(box.x, box.y); await page.mouse.wheel(0, -320);
  await expect.poll(() => page.evaluate(() => !!window.chart.getViewport().x)).toBe(true); await ready(page); const zoomed = await page.evaluate(() => window.chart.getViewport());
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.at(-1).point.id)).toBe('p' + zoomed.x.firstId.slice(1)); const selected = await page.evaluate(() => window.chart.getSelection());
  box = await plot(page); await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y, { steps: 4 }); await page.mouse.up(); await ready(page);
  await expect.poll(() => page.evaluate(() => window.chart.getViewport())).not.toEqual(zoomed); expect(await page.evaluate(() => window.chart.getSelection())).toEqual(selected);
  await grid.focus(); await grid.press('Home');
  await page.evaluate(() => { const index = Number(window.chart.getViewport().x.firstId.slice(1)); return window.waitForStackedAreaDetail(window.chart, document.getElementById('host'), { revision: window.chart.getSnapshot().committedRevision, seriesId: 's0', pointId: 'p' + index, header: window.spec.axes.x.values[index].label }); });
  const file = 'stacked-area-wheel-pan-768x440-light-' + info.project.name + '.png', bytes = await page.locator('#host').screenshot({ path: path.join(directory, 'visual', file), animations: 'disabled' });
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'stacked-area', stacking: 'sum', variant: 'category', state: 'wheel zoom, pointer pan, preserved selection', width: 768, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), theme: 'light', direction: 'ltr', browser: info.project.name, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click(); await ready(page); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({});
  await grid.focus(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.at(-1).point.id)).toBe('p0');
});
for (const kind of ['linear', 'time']) test('Stacked Area viewport preserves ' + kind + ' XY clipping and original identity after reconstructed data', async ({ page }) => {
  await mount(page, kind);
  const result = await page.evaluate(() => { const xs = window.spec.series[0].data.map(point => point.x); return window.chart.requestViewport({ x: [xs[2], xs[6]], y: [3, 20] }); }); expect(result.status).toBe('ok'); await ready(page);
  const windowBefore = await page.evaluate(() => window.chart.getViewport()), grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('Enter');
  expect(await page.evaluate(() => { const event = window.events.at(-1); return [event.seriesId, event.point.id, event.point.y, event.xKind]; })).toEqual(['s0', 'p2', 3, kind]); const selected = await page.evaluate(() => window.chart.getSelection());
  expect((await page.evaluate(() => window.chart.update(structuredClone(window.spec)))).status).toBe('ok'); await ready(page); expect(await page.evaluate(() => window.chart.getViewport())).toEqual(windowBefore); expect(await page.evaluate(() => window.chart.getSelection())).toEqual(selected);
  const svg = await page.evaluate(() => window.NCStackedArea.exportSvg(window.chart)); expect(svg.status).toBe('ok'); expect(svg.value.svg).not.toMatch(/NaN|Infinity/); expect(svg.value.svg).toContain('<clipPath');
});
