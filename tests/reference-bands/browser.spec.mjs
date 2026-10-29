import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../tooling/browser-resource-probe.mjs';
const directory = path.resolve('artifacts/v1-reference-bands'), names = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'stacked-area', 'scatter', 'mixed', 'heatmap'];
function fixture(name, theme = 'light') {
  const categories = Array.from({ length: 4 }, (_, i) => ({ id: 'c' + i, label: i < 2 ? 'January' : ['Research and development', 'Operations'][i - 2] }));
  const family = name === 'bar' ? 'column' : name.startsWith('stacked-') && name !== 'stacked-area' ? 'stacked' : name;
  const numeric = family === 'scatter';
  const spec = { family, title: 'Operating ranges', description: 'Original ranges clipped to the displayed domain.', theme, direction: theme === 'dark' ? 'rtl' : 'ltr', axes: { x: numeric ? { kind: 'linear', domain: [0, 3], nice: false } : { kind: 'category', values: categories }, y: { kind: 'linear', domain: [-2, 8], nice: false } }, series: [0, 1].map(j => ({ id: 's' + j, name: ['Demand', 'Capacity'][j], ...(family === 'mixed' ? { kind: j ? 'line' : 'column' } : {}), data: categories.map((c, i) => ({ id: c.id, x: numeric ? i : c.id, y: [2, -1, 3, 6][i] + j, datum: { original: j + '-' + c.id } })) })), referenceBands: [{ id: 'window', axis: 'x', from: numeric ? .5 : 'c0', to: numeric ? 1.5 : 'c1', label: 'Review window' }, { id: 'range', axis: 'y', from: -100, to: 3, label: 'Target range' }], references: [{ id: 'target', axis: 'y', value: 4, label: 'Threshold' }], selection: { mode: 'internal', kind: 'multiple' }, viewport: { mode: 'internal', axes: 'xy' }, crosshair: 'xy' };
  if (name === 'bar' || name === 'stacked-bar') spec.orientation = 'horizontal';
  if (family === 'stacked' || family === 'stacked-area') spec.stacking = 'sum';
  if (family === 'heatmap') {
    delete spec.series; spec.axes.y = { kind: 'category', values: ['r0', 'r1', 'r2'].map(id => ({ id, label: id === 'r0' ? 'Support' : 'Operations' })) };
    spec.data = categories.flatMap(c => ['r0', 'r1', 'r2'].map((r, i) => ({ id: r + c.id, rowId: r, columnId: c.id, value: i * 3 + Number(c.id.slice(1)), datum: { original: r + c.id } })));
    spec.referenceBands[1] = { id: 'range', axis: 'y', from: 'r1', to: 'r2', label: 'Target rows' };
    spec.references = [{ id: 'row', axis: 'y', value: 'r1', label: 'Row center' }, { id: 'column', axis: 'x', value: 'c1', label: 'Column center' }];
  }
  return spec;
}
async function ready(page) {
  await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.committedRevision > 0 && s.revision === s.committedRevision; })).toBe(true);
  expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
}
async function mount(page, spec, width = 768) {
  await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Reference review</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>');
  await page.addScriptTag({ path: path.join(directory, 'browser-harness.js') });
  const result = await page.evaluate(spec => {
    window.spec = spec; window.events = []; window.diagnostics = [];
    const result = window.NCReferences.factories[spec.family](document.getElementById('host'), spec, { instanceId: 'ranges', onPointActivate: e => window.events.push(e), onDiagnostic: d => window.diagnostics.push(d) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? { status: 'ok' } : result;
  }, spec); expect(result).toEqual({ status: 'ok' }); await ready(page);
}
async function capture(page, info, name, theme, width, state = 'default', bytes) {
  fs.mkdirSync(path.join(directory, 'visual'), { recursive: true }); const file = name + '-' + width + 'x440-' + theme + '-' + state + '-' + info.project.name + '.png';
  const png = bytes ?? await page.locator('#host').screenshot({ animations: 'disabled' }); fs.writeFileSync(path.join(directory, 'visual', file), png);
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: name, width, height: 440, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state, sha256: createHash('sha256').update(png).digest('hex'), baseline: 'NEW CANDIDATE — HUMAN APPROVAL PENDING' }, null, 2));
}
for (const name of names) for (const theme of ['light', 'dark']) test(name + '/' + theme + '/desktop', async ({ page }, info) => {
  await mount(page, fixture(name, theme));
  const decoration = name === 'heatmap' ? page.locator('[data-nc-layer="reference-lines"] rect') : page.locator('[data-nc-layer="reference-bands"] rect'); await expect(decoration).toHaveCount(2);
  const valid = await decoration.evaluateAll(nodes => nodes.every(node => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(+node.getAttribute(key))) && +node.getAttribute('width') > 0 && +node.getAttribute('height') > 0)); expect(valid).toBe(true);
  await capture(page, info, name, theme, 768);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.length)).toBe(1); await grid.press('Escape');
  const exported = await page.evaluate(() => window.NCReferences.exportSvg(window.chart)); expect(exported.status).toBe('ok'); expect(exported.value.svg).not.toMatch(/NaN|Infinity|<script/); expect(exported.value.svg).toContain('Reference ranges:'); expect(exported.value.svg).toContain(name === 'heatmap' ? 'r2' : 'from -100 to 3');
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const axe = await page.evaluate(async () => { const r = await window.axe.run(document.querySelector('main')); return { violations: r.violations, passes: r.passes.length }; }); expect(axe.violations).toEqual([]); fs.writeFileSync(path.join(directory, 'axe-' + name + '-' + theme + '-' + info.project.name + '.json'), JSON.stringify(axe));
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table]')).toContainText('Reference ranges:'); await expect(page.locator('[data-nc-table]')).toContainText(name === 'heatmap' ? 'Operations (r2)' : 'from -100 to 3');
});
for (const name of names) test(name + '/mobile/real-hit-through-decoration', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, reducedMotion: 'reduce' }), page = await context.newPage(); try {
    await mount(page, fixture(name), 320); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); await grid.press('Escape');
    // One native touch uses a visible mark lying inside the range. Rectangles
    // have no listeners of their own and cannot steal the chart's domain hit.
    const marks = page.locator('[data-nc-layer="marks"]'), mark = marks.locator(name === 'heatmap' || name.includes('bar') || name.includes('column') || name === 'mixed' ? 'rect' : 'circle').first();
    if (await mark.count()) { const box = await mark.boundingBox(); expect(box).not.toBeNull(); const before = await page.evaluate(() => window.events.length); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await expect.poll(() => page.evaluate(() => window.events.length)).toBe(before + 1); }
    await capture(page, info, name, 'light', 320, 'touch');
    const detail = page.locator('[data-nc-tooltip]:visible,[data-nc-detail]:visible').first(); if (await detail.count()) { const host = await page.locator('#host').boundingBox(), panel = await detail.boundingBox(); expect(panel.x).toBeGreaterThanOrEqual(host.x - .5); expect(panel.x + panel.width).toBeLessThanOrEqual(host.x + host.width + .5); }
  } finally { await context.close(); }
});
for (const name of ['line', 'bar', 'mixed', 'heatmap']) test(name + '/viewport/update/invalid-preservation', async ({ page }) => {
  await mount(page, fixture(name)); expect(await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'c1', lastId: 'c2' } }).status)).toBe('ok'); await ready(page);
  const rows = name === 'heatmap' ? '[data-nc-layer="reference-lines"] rect' : '[data-nc-layer="reference-bands"] rect'; await expect(page.locator(rows)).toHaveCount(2);
  const before = await page.locator('#host svg').first().innerHTML(); const invalid = await page.evaluate(() => { let calls = 0; const band = Object.defineProperty({ id: 'bad', axis: 'x', to: 'c1' }, 'from', { enumerable: true, get() { calls++; return 'c0'; } }); const result = window.chart.update({ ...window.spec, referenceBands: [band] }); return { result, calls }; }); expect(invalid.result.status).toBe('invalid'); expect(invalid.calls).toBe(0); expect(await page.locator('#host svg').first().innerHTML()).toBe(before);
  expect(await page.evaluate(() => { window.spec = { ...window.spec, referenceBands: [] }; return window.chart.update(window.spec).status; })).toBe('ok'); await ready(page); await expect(page.locator(rows)).toHaveCount(0);
  const exported = await page.evaluate(() => window.NCReferences.exportSvg(window.chart)); expect(exported.status).toBe('ok'); expect(exported.value.svg).not.toContain('Reference ranges:');
});
test('real PNG export includes clipped decorations and releases all Blob URLs', async ({ page }, info) => {
  await mount(page, fixture('mixed', 'dark')); const result = await page.evaluate(async () => { const create = URL.createObjectURL, revoke = URL.revokeObjectURL, live = new Set(); let made = 0, released = 0; URL.createObjectURL = function(blob) { const url = create.call(this, blob); live.add(url); made++; return url; }; URL.revokeObjectURL = function(url) { live.delete(url); released++; return revoke.call(this, url); }; try { const result = await window.NCReferences.exportPng(window.chart, { pixelRatio: 2 }); if (result.status !== 'ok') throw Error(JSON.stringify(result)); const bytes = new Uint8Array(await result.value.blob.arrayBuffer()); return { width: result.value.width, height: result.value.height, base64: btoa([...bytes].map(b => String.fromCharCode(b)).join('')), made, released, live: live.size }; } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; } });
  expect([result.width, result.height]).toEqual([1536, 880]); expect(result.made).toBeGreaterThan(0); expect(result.released).toBe(result.made); expect(result.live).toBe(0); await capture(page, info, 'mixed', 'dark', 768, 'actual2x', Buffer.from(result.base64, 'base64'));
});
for (const name of ['mixed', 'heatmap']) test(name + '/100-owned-resource-cycles', async ({ page }, info) => {
  const spec = fixture(name); await mount(page, spec); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.resourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(spec => window.resourceProbe({ factoryPath: 'NCReferences.factories.' + spec.family, template: spec, cycles: 100, stateful: spec.family !== 'heatmap', datumPath: spec.family === 'heatmap' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise(chart) { const result = window.NCReferences.exportSvg(chart); if (result.status !== 'ok') throw Error(JSON.stringify(result)); } }), spec);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const remaining = await page.evaluate(() => window.__ncResourceReferences.filter(ref => ref.deref()).length); expect(remaining).toBe(0); report.collection = { method: 'CDP twice, destroyed controllers deliberately retained', remaining }; await cdp.detach(); }
  else report.collection = { status: 'NOT MEASURED', reason: 'No equivalent forced-GC port; counters are checked independently.' };
  fs.writeFileSync(path.join(directory, 'resources-' + name + '-' + info.project.name + '.json'), JSON.stringify(report, null, 2));
});
