import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { waitForLineDetail } from '../../../../../tooling/line-detail-wait.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
const directory = 'artifacts/v1-scatter';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use(); if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__); if (value) { const destination = path.resolve(directory, 'browser-coverage'); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, info.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(value)); }
}, { auto: true }] });
function specimen() {
  return { family: 'scatter', title: 'Measured response', description: 'Original observations, without interpolation.', axes: { x: { kind: 'linear', title: 'Input', domain: [-10, 10] }, y: { kind: 'linear', title: 'Response', domain: [-10, 10] } }, series: [
    { id: 'observed', name: 'Observed', marker: { shape: 'circle', size: 8 }, data: [{ id: 'a', x: 4, y: -2, datum: { raw: 'a' } }, { id: 'b', x: -5, y: 6 }, { id: 'coincident', x: 4, y: -2 }, { id: 'zero', x: 0, y: 0 }, { id: 'missing-x', x: null, y: 7 }, { id: 'missing-y', x: 8, y: null }] },
    { id: 'model', name: 'Model', marker: { shape: 'square', size: 8 }, data: [{ id: 'q0', x: 3, y: -1 }, { id: 'q1', x: -4, y: 5 }, { id: 'q2', x: -7, y: -6 }] },
  ], references: [{ id: 'target', axis: 'y', value: 3, label: 'Reference', dash: 'dashed' }] };
}
async function mount(page, overrides = {}, width = 768) {
  await page.setViewportSize({ width: Math.max(width, 320), height: 800 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Scatter acceptance</title><style>body{margin:0}h1{font:600 16px system-ui;margin:8px 0}</style></head><body><main><h1>Chart acceptance</h1><div id="host" style="width:${width}px;height:400px"></div><button id="outside">Outside chart</button></main></body></html>`);
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  const status = await page.evaluate(spec => {
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } }; freeze(spec);
    window.scatterSpec = spec; window.scatterEvents = []; window.scatterStates = []; window.scatterDiagnostics = [];
    const result = window.NCScatter.createScatterChart(document.querySelector('#host'), spec, { instanceId: 'scatter-test', onPointActivate: event => window.scatterEvents.push(event), onStateChange: event => window.scatterStates.push(event), onDiagnostic: event => window.scatterDiagnostics.push(event) });
    if (result.status === 'ok') window.scatterChart = result.value; return result.status === 'ok' ? 'ok' : result;
  }, { ...specimen(), ...overrides }); expect(status).toBe('ok'); await ready(page);
}
async function ready(page) {
  await expect.poll(() => page.evaluate(() => { const s = window.scatterChart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true);
  expect(await page.evaluate(() => window.scatterDiagnostics)).toEqual([]);
}
async function detail(page, seriesId, pointId, header) {
  return page.evaluate(async ({ source, seriesId, pointId, header }) => { const wait = (0, eval)('(' + source + ')'); return wait(window.scatterChart, document.querySelector('#host'), { revision: window.scatterChart.getSnapshot().committedRevision, seriesId, pointId, header }); }, { source: waitForLineDetail.toString(), seriesId, pointId, header });
}
async function center(page, index) {
  return page.locator('[data-nc-layer="marks"]').locator(':scope > *').nth(index).evaluate(element => { const b = element.getBBox(), p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2), screen = p.matrixTransform(element.getScreenCTM()); return { x: screen.x, y: screen.y, nativeFill: element.isPointInFill(p) }; });
}
test('native XY markers, unordered input, coincident pointer tie and exactly-once activation', async ({ page }) => {
  await mount(page); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(7);
  await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(4); await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(3);
  for (const [index, id] of [[0, 'a'], [1, 'b'], [2, 'a'], [3, 'zero'], [4, 'q0']]) { const p = await center(page, index); expect(p.nativeFill).toBe(true); const before = await page.evaluate(() => window.scatterEvents.length); await page.mouse.click(p.x, p.y); expect(await page.evaluate(() => window.scatterEvents.length)).toBe(before + 1); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe(id); }
  expect(await page.evaluate(() => Object.isFrozen(window.scatterSpec.series[0].data))).toBe(true);
});
test('keyboard retains every duplicate, original order and nearest XY series navigation', async ({ page }) => {
  await mount(page); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await detail(page, 'observed', 'a', 'Observed · a');
  await grid.press('ArrowRight'); await detail(page, 'observed', 'b', 'Observed · b'); await grid.press('ArrowDown'); await detail(page, 'model', 'q1', 'Model · q1');
  await grid.press('ArrowUp'); await detail(page, 'observed', 'b', 'Observed · b'); await grid.press('ArrowRight'); await detail(page, 'observed', 'coincident', 'Observed · coincident');
  await expect(grid).toHaveAccessibleDescription(/2 observations share this plotted position/); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe('coincident');
  await grid.press('End'); await detail(page, 'observed', 'zero', 'Observed · zero'); await grid.press('Control+End'); await detail(page, 'model', 'q2', 'Model · q2'); await grid.press('Control+Home'); await detail(page, 'observed', 'a', 'Observed · a');
});
test('hover/focus updates overlay without regenerating geometry and reconstructs domain identity', async ({ page }) => {
  await mount(page); const p = await center(page, 1); await page.mouse.move(p.x, p.y); await detail(page, 'observed', 'b', 'Observed · b');
  await page.evaluate(() => window.markNode = document.querySelector('[data-nc-layer="marks"] > *')); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('ArrowRight'); await grid.press('ArrowLeft');
  expect(await page.evaluate(() => window.markNode === document.querySelector('[data-nc-layer="marks"] > *'))).toBe(true);
  await grid.press('End'); await page.evaluate(() => window.scatterChart.update(JSON.parse(JSON.stringify({ ...window.scatterSpec, theme: 'dark' })))); await ready(page); await expect(grid).toBeFocused(); await detail(page, 'observed', 'zero', 'Observed · zero');
  await grid.press('Escape'); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
});
test('raw table distinguishes identical XY observations and missing coordinates', async ({ page }) => {
  await mount(page); await page.getByRole('button', { name: 'View data table', exact: true }).click(); const table = page.getByRole('table');
  expect(await table.locator('thead th').allTextContents()).toEqual(['Series', 'Observation', 'X', 'Y', 'Visibility']); await expect(table.locator('tbody tr')).toHaveCount(9);
  expect(await table.locator('tbody tr').nth(2).locator('th,td').allTextContents()).toEqual(['Observed', 'coincident', '4', '-2', 'Series visible']); await expect(table).toContainText('Missing observation');
  await page.getByRole('button', { name: 'Close data table', exact: true }).click(); await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
});
test('controlled visibility proposes once, consumer rejection preserves state and acceptance recomputes targets', async ({ page }) => {
  await mount(page, { state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } }); await page.getByRole('button', { name: 'Observed', exact: true }).click();
  expect(await page.evaluate(() => window.scatterStates.map(e => [e.effect, e.state.hiddenSeriesIds]))).toEqual([['proposal', ['observed']]]); expect(await page.evaluate(() => window.scatterChart.getState().hiddenSeriesIds)).toEqual([]);
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, state: { mode: 'controlled', value: window.scatterStates[0].state } })); await ready(page); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(3);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).seriesId)).toBe('model');
});
test('invalid updates preserve committed DOM, state and revision', async ({ page }) => {
  await mount(page); const result = await page.evaluate(() => { const before = document.querySelector('#host').innerHTML, revision = window.scatterChart.getSnapshot().revision; const failures = [NaN, Infinity, undefined].map(x => window.scatterChart.update({ ...window.scatterSpec, series: [{ id: 's', name: 'S', data: [{ id: 'a', x, y: 2 }] }] }).status); return { failures, same: before === document.querySelector('#host').innerHTML, sameRevision: revision === window.scatterChart.getSnapshot().revision }; }); expect(result).toEqual({ failures: ['invalid', 'invalid', 'invalid'], same: true, sameRevision: true });
});
test('reversed XY axes map correctly, clipping preserves raw data and no connector path appears', async ({ page }) => {
  await mount(page); const a = await center(page, 0), b = await center(page, 1);
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, axes: { x: { ...window.scatterSpec.axes.x, reversed: true }, y: { ...window.scatterSpec.axes.y, reversed: true } } })); await ready(page); const ra = await center(page, 0), rb = await center(page, 1);
  expect(a.x).toBeGreaterThan(b.x); expect(ra.x).toBeLessThan(rb.x); expect(a.y).toBeGreaterThan(b.y); expect(ra.y).toBeLessThan(rb.y);
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, axes: { x: { kind: 'linear', domain: [0, 5] }, y: { kind: 'linear', domain: [-3, 1] } } })); await ready(page); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(4); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(9);
});
test('empty/missing/loading/error recover without stale markers or tooltip', async ({ page }) => {
  await mount(page); await page.locator('[data-nc-grid]').focus();
  for (const kind of ['loading', 'error', 'empty']) { await page.evaluate(kind => window.scatterChart.update({ ...window.scatterSpec, status: kind === 'error' ? { kind, message: 'Measurements unavailable' } : { kind } }), kind); await ready(page); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(0); expect(await page.evaluate(() => window.scatterChart.getSnapshot().view)).toBe(kind); }
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, series: [] })); await ready(page); expect(await page.evaluate(() => window.scatterChart.getSnapshot().view)).toBe('empty');
  await page.evaluate(() => window.scatterChart.update(window.scatterSpec)); await ready(page); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(7);
  await page.locator('#host').evaluate(host => { host.style.width = '0px'; }); await expect.poll(() => page.evaluate(() => window.scatterChart.getSnapshot().phase)).toBe('suspended'); await page.locator('#host').evaluate(host => { host.style.width = '375px'; }); await ready(page);
});
test('1000 true XY points retain all markers and bounded labels with paginated raw table', async ({ page }) => {
  const points = Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, x: (i * 37) % 1000, y: Math.sin(i / 17) * 20 }));
  await mount(page, { axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, labels: 'auto', series: [{ id: 'large', name: 'Large set', data: points }] }); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(1000);
  expect(await page.locator('[data-nc-layer="labels"] [data-nc-key^="scatter-label-"]').count()).toBeLessThanOrEqual(200);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(100); for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page.getByRole('table')).toContainText('p999');
});
test('native mobile touch keeps selected first/last anchors clear and pins one activation', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 800 } });
  try {
    const page = await context.newPage(); await mount(page, { series: [{ id: 'observed', name: 'Observed', marker: { shape: 'circle', size: 8 }, data: [{ id: 'first', x: -9, y: -9 }, { id: 'last', x: 9, y: 9 }] }] }, 320);
    for (const [index, id] of [[0, 'first'], [1, 'last']]) {
      const p = await center(page, index); await page.touchscreen.tap(p.x, p.y); await detail(page, 'observed', id, 'Observed · ' + id);
      expect(await page.evaluate(() => window.scatterEvents.length)).toBe(index + 1); expect(await page.evaluate(() => window.scatterEvents.at(-1).source)).toBe('touch');
      const overlaps = await page.locator('[data-nc-tooltip]:visible,[data-nc-detail]:visible').evaluateAll((elements, p) => elements.some(element => { const b = element.getBoundingClientRect(); return p.x + 6 > b.left && p.x - 6 < b.right && p.y + 6 > b.top && p.y - 6 < b.bottom; }), p); expect(overlaps).toBe(false);
    }
    await page.getByRole('button', { name: 'Outside chart', exact: true }).tap(); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  } finally { await context.close(); }
});
test('RTL changes presentation without reversing semantic observations; tooltip-off retains keyboard data', async ({ page }) => {
  await mount(page, { direction: 'rtl', tooltip: { mode: 'off' } }, 320); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe('b'); await expect(grid).toHaveAccessibleDescription(/X: -5.*Y: 6/); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
});
test('100 retained-controller cycles release all owned resources and raw payload references', async ({ page }, info) => {
  await mount(page); await page.evaluate(() => window.scatterChart.destroy()); await page.evaluate('globalThis.probeScatterResources=' + probeChartResources.toString()); const result = await page.evaluate(template => window.probeScatterResources({ factoryPath: 'NCScatter.createScatterChart', template }), specimen()); expect(result.cycles).toHaveLength(100);
  let collection = { status: 'NOT_AVAILABLE', reason: 'Portable ownership checks pass in each engine; forced GC available only through Chromium CDP.' };
  if (info.project.name === 'chromium') { const session = await page.context().newCDPSession(page); await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage'); const alive = await page.evaluate(() => window.__ncResourceReferences.filter(reference => reference.deref()).length); expect(alive).toBe(0); collection = { status: 'PASS', references: 300, retainedControllers: 100, alive }; await session.detach(); }
  fs.writeFileSync(`${directory}/resources-${info.project.name}.json`, JSON.stringify({ ...result, collection }, null, 2));
});
test('@a11y real XY focus and raw table in light/dark/RTL', async ({ page }, info) => {
  await mount(page); await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const results = [];
  for (const theme of ['light', 'dark']) { await page.evaluate(theme => window.scatterChart.update({ ...window.scatterSpec, theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }), theme); await ready(page); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await detail(page, 'observed', 'a', 'Observed · a');
    for (const state of ['focus', 'table']) { if (state === 'table') await page.getByRole('button', { name: 'View data table', exact: true }).click(); const result = await page.evaluate(async () => { const { violations, passes } = await window.axe.run(); return { violations, passes: passes.length }; }); results.push({ theme, state, ...result }); expect(result.violations).toEqual([]); } await page.getByRole('button', { name: 'Close data table', exact: true }).click(); }
  fs.writeFileSync(`${directory}/axe-${info.project.name}.json`, JSON.stringify(results, null, 2));
});

test('50000 logical observations retain every exact SVG glyph, original data and keyboard endpoints', async ({ page }, info) => {
  const points = Array.from({ length: 50000 }, (_, i) => ({ id: 'p' + i, x: (i * 997) % 50000, y: Math.sin(i / 127) * 20 }));
  await mount(page, { axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, legend: { position: 'none' }, series: [{ id: 'stress', name: 'Stress set', marker: { shape: 'circle', size: 4 }, data: points }] });
  await expect(page.locator('[data-nc-layer="marks"] > path')).toHaveCount(Math.ceil(50000 / 256));
  const contours = await page.locator('[data-nc-layer="marks"] > path').evaluateAll(paths => paths.reduce((count, path) => { const d = path.getAttribute('d'); count.starts += (d.match(/M /g) ?? []).length; count.ends += (d.match(/Z/g) ?? []).length; count.arcs += (d.match(/A /g) ?? []).length; count.connectors += (d.match(/L /g) ?? []).length; return count; }, { starts: 0, ends: 0, arcs: 0, connectors: 0 }));
  expect(contours).toEqual({ starts: 50000, ends: 50000, arcs: 100000, connectors: 0 });
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe('p49999');
  const result = await page.evaluate(() => ({ rawRecords: window.scatterSpec.series[0].data.length, svgNodes: document.querySelector('#host').querySelectorAll('svg *').length, nodes: document.querySelector('#host').querySelectorAll('*').length, serializedChars: document.querySelector('#host svg').outerHTML.length, invalidSvg: /NaN|Infinity/.test(document.querySelector('#host svg').outerHTML), originalFrozen: Object.isFrozen(window.scatterSpec.series[0].data) }));
  expect(result.invalidSvg).toBe(false); expect(result.originalFrozen).toBe(true); expect(result.svgNodes).toBeLessThan(300); fs.writeFileSync(`${directory}/large-${info.project.name}.json`, JSON.stringify({ ...result, contours, policy: 'All original glyphs drawn as independent closed SVG contours in bounded paths; no data reduction or Line connectors.' }, null, 2));
  await page.evaluate(() => window.scatterChart.destroy()); await expect(page.locator('[data-nc-root],[data-nc-tooltip]')).toHaveCount(0);
});

test('batched circle/square/diamond match native SVG fill and preserve coincident domain IDs', async ({ page }) => {
  const shapes = ['circle', 'square', 'diamond'], series = shapes.map((shape, index) => ({ id: shape, name: shape, marker: { shape, size: 10 }, data: Array.from({ length: 700 }, (_, i) => ({ id: 'p' + i, x: [-5, 0, 5][index], y: [5, 0, -5][index] })) }));
  await mount(page, { series }); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(9);
  for (let index = 0; index < shapes.length; index++) {
    const path = page.locator('[data-nc-layer="marks"] path').nth(index * 3), native = await path.evaluate(element => { const b = element.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.width / 2, p = new DOMPoint(cx, cy).matrixTransform(element.getScreenCTM()); return { center: element.isPointInFill(new DOMPoint(cx, cy)), inner: element.isPointInFill(new DOMPoint(cx + r * .8, cy)), corner: element.isPointInFill(new DOMPoint(cx + r * .9, cy + r * .9)), x: p.x, y: p.y }; });
    expect(native.center).toBe(true); expect(native.inner).toBe(true); expect(native.corner).toBe(shapes[index] === 'square');
    await page.mouse.click(native.x, native.y); expect(await page.evaluate(() => [window.scatterEvents.at(-1).seriesId, window.scatterEvents.at(-1).point.id])).toEqual([shapes[index], 'p0']);
    await page.locator('[data-nc-grid]').press('ArrowRight'); await page.locator('[data-nc-grid]').press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe('p1');
    await expect(page.getByRole('button', { name: shapes[index], exact: true }).locator('[data-nc-swatch]')).toHaveAttribute('data-nc-swatch', shapes[index]);
  }
});

test('acquisition failures release canvas, host reservations and partial SVG ownership before retry', async ({ page }) => {
  await mount(page); await page.evaluate(() => window.scatterChart.destroy());
  const results = await page.evaluate(() => {
    const host = document.querySelector('#host'), factory = window.NCScatter.createScatterChart, records = [];
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => null;
    try { records.push({ fault: 'canvas', status: factory(host, window.scatterSpec, { instanceId: 'scatter-test' }).status, children: host.childElementCount }); } finally { HTMLCanvasElement.prototype.getContext = context; }
    for (const id of ['nc-scatter-test-owner', 'nc-scatter-test-v-owner', 'nc-scatter-test-i-owner']) { const sentinel = document.createElement('span'); sentinel.id = id; document.body.append(sentinel); try { records.push({ fault: id, status: factory(host, window.scatterSpec, { instanceId: 'scatter-test' }).status, children: host.childElementCount }); } finally { sentinel.remove(); } }
    const create = document.createElementNS; document.createElementNS = function(namespace, name, options) { if (name === 'svg') throw Error('Injected SVG acquisition failure'); return create.call(this, namespace, name, options); };
    try { records.push({ fault: 'svg', status: factory(host, window.scatterSpec, { instanceId: 'scatter-test' }).status, children: host.childElementCount }); } finally { document.createElementNS = create; }
    const proxy = new Proxy(host, { get(target, key) { if (key === 'ownerDocument') throw Error('Invalid host document'); return Reflect.get(target, key, target); } });
    records.push({ fault: 'host', status: factory(proxy, window.scatterSpec, { instanceId: 'scatter-test' }).status, children: host.childElementCount });
    const recovered = factory(host, window.scatterSpec, { instanceId: 'scatter-test' }); if (recovered.status !== 'ok') throw Error(JSON.stringify(recovered)); window.scatterChart = recovered.value; return records;
  });
  expect(results).toHaveLength(6); for (const result of results) { expect(result.status).toBe('invalid'); expect(result.children).toBe(0); } await ready(page);
});

test('initial visibility, unchanged internal membership and removed series reconcile without stale state', async ({ page }) => {
  await mount(page, { state: { mode: 'controlled', value: { hiddenSeriesIds: ['model'] } } }); expect(await page.evaluate(() => window.scatterChart.getState().hiddenSeriesIds)).toEqual(['model']); await expect(page.locator('[data-nc-layer="marks"] > *')).toHaveCount(4);
  await mount(page); await page.getByRole('button', { name: 'Model', exact: true }).click(); await ready(page);
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, title: 'Unchanged membership' })); await ready(page); expect(await page.evaluate(() => window.scatterChart.getState().hiddenSeriesIds)).toEqual(['model']);
  await page.evaluate(() => window.scatterChart.update({ ...window.scatterSpec, series: window.scatterSpec.series.filter(series => series.id !== 'model') })); await ready(page); expect(await page.evaluate(() => window.scatterChart.getState().hiddenSeriesIds)).toEqual([]); expect(await page.evaluate(() => window.scatterStates.at(-1).source)).toBe('update');
  await page.evaluate(() => window.scatterChart.destroy()); expect(await page.evaluate(() => window.scatterChart.getState())).toEqual({ hiddenSeriesIds: [] });
});

test('failed text measurement rejects the proposed update while the previous frame remains usable', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const context = CanvasRenderingContext2D.prototype.measureText, before = document.querySelector('#host').innerHTML, revision = window.scatterChart.getSnapshot().revision;
    CanvasRenderingContext2D.prototype.measureText = function() { return { width: NaN }; };
    try { const result = window.scatterChart.update({ ...window.scatterSpec, series: [{ ...window.scatterSpec.series[0], name: 'Uncached proposed series name' }] }); return { status: result.status, unchanged: before === document.querySelector('#host').innerHTML, revision: revision === window.scatterChart.getSnapshot().revision }; } finally { CanvasRenderingContext2D.prototype.measureText = context; }
  }); expect(result).toEqual({ status: 'invalid', unchanged: true, revision: true }); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.id)).toBe('a');
});

test('a failed theme subscription faults once, releases pending work and supports safe destroy', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => { const match = window.matchMedia; window.matchMedia = function(query) { const media = match.call(window, query); Object.defineProperty(media, 'addEventListener', { value() { throw Error('Injected media subscription failure'); } }); return media; }; try { return window.scatterChart.update({ ...window.scatterSpec, theme: 'auto' }); } finally { window.matchMedia = match; } });
  expect(result).toMatchObject({ status: 'invalid', diagnostic: { reason: 'FAULTED' } }); expect(await page.evaluate(() => window.scatterChart.getSnapshot().phase)).toBe('faulted'); expect(await page.evaluate(() => window.scatterDiagnostics.length)).toBe(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); expect(await page.evaluate(() => window.scatterDiagnostics.length)).toBe(1); await expect(page.locator('[data-nc-root]')).toContainText('Chart unavailable');
  await page.evaluate(() => window.scatterChart.destroy()); await expect(page.locator('[data-nc-root],[data-nc-tooltip]')).toHaveCount(0);
});

test('changing marker shape resets legend geometry without losing stable series button identity', async ({ page }) => {
  await mount(page); const button = page.getByRole('button', { name: 'Observed', exact: true }); await button.evaluate(element => window.observedLegend = element);
  for (const shape of ['diamond', 'square', 'circle']) {
    await page.evaluate(shape => window.scatterChart.update({ ...window.scatterSpec, series: window.scatterSpec.series.map((series, index) => index ? series : { ...series, marker: { shape, size: 8 } }) }), shape); await ready(page);
    const swatch = button.locator('[data-nc-swatch]'); await expect(swatch).toHaveAttribute('data-nc-swatch', shape); expect(await button.evaluate(element => element === window.observedLegend)).toBe(true);
    const styles = await swatch.evaluate(element => ({ radius: element.style.borderRadius, transform: element.style.transform })); expect(styles.radius).toBe(shape === 'circle' ? '50%' : ''); expect(styles.transform).toBe(shape === 'diamond' ? 'rotate(45deg) scale(0.8)' : '');
  }
});

test('focused dock survives real owner scroll and resize then Escape returns to the semantic grid', async ({ page }) => {
  await mount(page, {}, 320); await page.evaluate(() => { document.body.style.transform = 'translate(0)'; const spacer = document.createElement('div'); spacer.style.height = '1000px'; document.body.append(spacer); }); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await detail(page, 'observed', 'b', 'Observed · b');
  const dock = page.locator('[data-nc-detail]:visible'); await dock.focus(); await page.evaluate(() => window.scrollTo(0, 30)); await page.setViewportSize({ width: 320, height: 900 });
  await expect(dock).toBeFocused(); await expect(dock).toContainText('Observed · b'); await dock.press('Escape'); await expect(grid).toBeFocused(); await expect(page.locator('[data-nc-detail]:visible,[data-nc-tooltip]')).toHaveCount(0);
});

test('pixel-coincident extreme coordinates retain distinct raw values and honest tooltip context', async ({ page }) => {
  await mount(page, { axes: { x: { kind: 'linear', domain: [-Number.MAX_VALUE, Number.MAX_VALUE] }, y: { kind: 'linear', domain: [-Number.MAX_VALUE, Number.MAX_VALUE] } }, series: [{ id: 'observed', name: 'Observed', data: [{ id: 'low', x: -Number.MAX_VALUE, y: -Number.MAX_VALUE }, { id: 'zero', x: 0, y: 0 }, { id: 'tiny', x: Number.MIN_VALUE, y: 0 }, { id: 'high', x: Number.MAX_VALUE, y: Number.MAX_VALUE }] }] });
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('ArrowRight'); await detail(page, 'observed', 'tiny', 'Observed · tiny');
  await expect(grid).toHaveAccessibleDescription(/X: 5e-324/); await expect(grid).toHaveAccessibleDescription(/2 observations share this plotted position/); await grid.press('Enter'); expect(await page.evaluate(() => window.scatterEvents.at(-1).point.x)).toBe(Number.MIN_VALUE);
});

async function capture(page, info, width, theme, variant, state = 'default') {
  const basic = specimen(), overrides = { theme, direction: state.includes('rtl') ? 'rtl' : 'ltr' };
  if (variant === 'long') overrides.series = basic.series.map(series => ({ ...series, name: 'Northern Europe experimental response observations — ' + series.name }));
  if (variant === 'dense') { overrides.axes = { x: { kind: 'linear' }, y: { kind: 'linear' } }; overrides.series = [{ id: 'dense', name: 'Observed response', marker: { shape: 'circle', size: 4 }, data: Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, x: (i * 37) % 1000, y: Math.sin(i / 17) * 20 + Math.cos(i / 7) * 5 })) }]; }
  if (variant === 'batch') { overrides.axes = { x: { kind: 'linear' }, y: { kind: 'linear' } }; overrides.series = ['circle', 'diamond'].map((shape, index) => ({ id: 'batch-' + index, name: index ? 'Model response' : 'Observed response', marker: { shape, size: 4 }, data: Array.from({ length: 2500 }, (_, i) => ({ id: 'p' + i, x: (i * 37) % 2500, y: Math.sin(i / 41) * 20 + index * 20 })) })); }
  if (variant === 'labels') overrides.labels = 'auto';
  if (variant === 'negative') overrides.series = basic.series.map(series => ({ ...series, data: series.data.map(point => ({ ...point, x: point.x === null ? null : -Math.abs(point.x), y: point.y === null ? null : -Math.abs(point.y) })) }));
  if (variant === 'single') { overrides.axes = { x: { kind: 'linear' }, y: { kind: 'linear' } }; overrides.series = [{ id: 'one', name: 'One observation', data: [{ id: 'only', x: 7, y: 0 }] }]; }
  if (variant === 'clipped') overrides.axes = { x: { kind: 'linear', domain: [0, 5] }, y: { kind: 'linear', domain: [-3, 1] } };
  if (['empty', 'loading', 'error'].includes(state)) overrides.status = state === 'error' ? { kind: state, message: 'Measurements unavailable. Try again later.' } : { kind: state };
  await mount(page, overrides, width);
  if (state === 'docked-rtl-focus') await page.evaluate(() => { document.body.style.transform = 'translate(0)'; });
  if (['rtl-focus', 'edge-tooltip', 'docked-rtl-focus'].includes(state)) { const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); const placement = await detail(page, 'observed', 'b', 'Observed · b'); if (state === 'docked-rtl-focus') expect(placement.placement).toBe('docked'); }
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const file = `scatter-${variant}-${state}-${width}x400-${theme}-${info.project.name}`; fs.mkdirSync(`${directory}/visual`, { recursive: true });
  const first = await page.locator('#host').screenshot({ path: `${directory}/visual/${file}.png`, animations: 'disabled' }), second = await page.locator('#host').screenshot({ animations: 'disabled' });
  const hash = createHash('sha256').update(first).digest('hex'); expect(hash).toBe(createHash('sha256').update(second).digest('hex'));
  fs.writeFileSync(`${directory}/visual/${file}.json`, JSON.stringify({ file: file + '.png', family: 'scatter', variant, state, width, height: 400, pixelWidth: first.readUInt32BE(16), pixelHeight: first.readUInt32BE(20), deviceScaleFactor: await page.evaluate(() => devicePixelRatio), theme, direction: overrides.direction, browser: info.project.name, sha256: hash, baseline: 'NEW FAMILY; HUMAN REVIEW PENDING', approval: 'HUMAN REVIEW PENDING' }, null, 2));
}
for (const width of [320, 768]) for (const theme of ['light', 'dark']) {
  for (const variant of ['basic', 'long', 'dense', 'batch', 'labels', 'negative', 'single', 'clipped']) test('@visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, width, theme, variant));
  for (const state of ['rtl-focus', 'edge-tooltip']) test('@visual ' + state + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, width, theme, 'basic', state));
}
for (const theme of ['light', 'dark']) for (const state of ['empty', 'loading', 'error', 'docked-rtl-focus']) test('@visual ' + state + '/320/' + theme, async ({ page }, info) => capture(page, info, 320, theme, 'basic', state));
for (const width of [375, 430]) test('@visual responsive/' + width, async ({ page }, info) => capture(page, info, width, 'light', 'basic', 'edge-tooltip'));
for (const theme of ['light', 'dark']) test('@cross-visual 768/' + theme, async ({ page }, info) => capture(page, info, 768, theme, 'basic'));
