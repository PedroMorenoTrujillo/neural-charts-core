import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../tooling/browser-resource-probe.mjs';
const directory = process.env.NC_STACKED_AREA_ARTIFACT_DIR ?? 'artifacts/v1-stacked-area';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local evidence required');
const categories = Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, label: ['January', 'January', 'March', 'April', 'May', 'June'][i] }));
function fixture(variant = 'mixed') {
  const numeric = variant === 'linear' || variant === 'time', percent = variant === 'percent' || variant === 'extreme';
  const values = variant === 'empty' ? [[], [], []] : variant === 'extreme' ? [[Number.MAX_VALUE, 0, 4, 8, 1, 3], [Number.MAX_VALUE, 0, 1, 2, 4, 6]] : percent || numeric || variant === 'positive' ? [[3, 2, 0, 4, 1, 6], [4, 2, 0, 1, 3, 2], [2, 1, 0, 2, 1, 3]] : [[3, -2, 0, 4, -1, 6], [-4, 2, -2, 0, 3, -2], [2, 1, 0, 2, -1, 3]];
  const spec = { family: 'stacked-area', stacking: percent ? 'percent' : 'sum', labels: 'auto', title: 'Stacked workload', description: 'Original observations and separate signed totals.', axes: { x: numeric ? { kind: variant } : { kind: 'category', values: categories }, y: { kind: 'linear' } }, series: values.map((row, si) => ({ id: 's' + si, name: ['Open', 'Closed', 'Deferred'][si], data: row.map((y, i) => ({ id: 'p' + i, x: numeric ? (variant === 'time' ? 1700000000000 : 0) + i * i * 1000 : 'x' + i, y: variant === 'gaps' && si === 1 && i === 2 ? null : y })) })), selection: { mode: 'internal', kind: 'multiple' }, crosshair: 'xy', viewport: { mode: 'internal', axes: 'xy' } };
  return spec;
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.committedRevision > 0 && s.revision === s.committedRevision; })).toBe(true); }
async function mount(page, spec = fixture(), width = 768) {
  await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Stacked Area acceptance</title><main><div id="host" style="width:' + width + 'px;height:440px"></div></main></html>');
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  const result = await page.evaluate(spec => {
    window.spec = spec; window.events = []; window.diagnostics = [];
    const result = window.NCStackedArea.createStackedAreaChart(document.getElementById('host'), spec, { instanceId: 'stacked-area-native', onPointActivate: event => window.events.push({ kind: 'activate', ...event }), onSelectionChange: event => window.events.push({ kind: 'selection', ...event }), onStateChange: event => window.events.push({ kind: 'state', ...event }), onViewportChange: event => window.events.push({ kind: 'viewport', ...event }), onDiagnostic: event => window.diagnostics.push(event) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? { status: 'ok' } : result;
  }, spec);
  expect(result).toEqual({ status: 'ok' }); await ready(page); expect(await page.evaluate(() => window.diagnostics)).toEqual([]);
}
for (const variant of ['positive', 'mixed', 'gaps', 'percent', 'extreme', 'linear', 'time', 'empty']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('@visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => {
  const spec = { ...fixture(variant), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }; await page.setViewportSize({ width: width + 32, height: 680 }); await mount(page, spec, width);
  if (variant === 'empty') await expect(page.locator('#host')).toContainText('No complete visible stack');
  else { expect(await page.locator('svg').first().getAttribute('viewBox')).toBeTruthy(); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).not.toMatch(/NaN|Infinity/); }
  expect(await page.locator('.nc-owned-data-label').count()).toBeLessThanOrEqual(200);
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
  expect(await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'))).violations)).toEqual([]);
  fs.mkdirSync(path.join(directory, 'visual'), { recursive: true });
  const file = 'stacked-area-' + variant + '-' + width + 'x440-' + theme + '-' + info.project.name + '.png', bytes = await page.locator('#host').screenshot({ path: path.join(directory, 'visual', file), animations: 'disabled' });
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'stacked-area', variant, stacking: spec.stacking, width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction: spec.direction, state: 'default', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
});
test('keyboard targets original IDs and skips an incomplete row across every series', async ({ page }) => {
  await mount(page, fixture('gaps')); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('ArrowRight'); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').map(e => [e.seriesId, e.point.id, e.point.y]))).toEqual([['s0', 'p3', 4]]);
  await expect(grid.locator('[role="gridcell"]')).toContainText('Y 4');
  await grid.press('ArrowDown'); await grid.press('Enter'); expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).seriesId)).toBe('s1');
  await grid.press('Escape'); await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(18); await expect(page.locator('[data-nc-table] tbody')).toContainText('Missing observation');
});
test('percentage tooltip and CSV preserve original values and undefined totals', async ({ page }) => {
  await mount(page, fixture('extreme')); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  await expect(grid.locator('[role="gridcell"]')).toContainText('Visible share: 50%'); await grid.press('ArrowRight'); await grid.press('Enter');
  const event = await page.evaluate(() => window.events.find(e => e.kind === 'activate')); expect(event.point.id).toBe('p2'); expect(event.point.y).toBe(4);
  const csv = await page.evaluate(() => window.NCStackedArea.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value).toContain(String(Number.MAX_VALUE)); expect(csv.value.split('\r\n').filter(Boolean)).toHaveLength(13);
  const svg = await page.evaluate(() => window.NCStackedArea.exportSvg(window.chart)); expect(svg.status).toBe('ok'); expect(svg.value.svg).not.toMatch(/NaN|Infinity/);
});
for (const kind of ['linear', 'time']) test(kind + ' activation preserves X semantics through viewport and cloned updates', async ({ page }) => {
  await mount(page, fixture(kind)); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('Enter');
  const first = await page.evaluate(() => window.events.find(e => e.kind === 'activate')); expect(first.xKind).toBe(kind); expect(first.point.id).toBe('p1');
  const result = await page.evaluate(() => { const xs = window.spec.series[0].data.map(p => p.x); return window.chart.requestViewport({ x: [xs[1], xs[4]] }); }); expect(result.status).toBe('ok'); await ready(page);
  expect((await page.evaluate(() => window.chart.update(structuredClone(window.spec)))).status).toBe('ok'); await ready(page); await grid.focus(); await grid.press('Enter');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'activate').at(-1).point.id)).toBe('p1');
});
test('legend updates stack geometry, while selection/table and full raw records remain coherent', async ({ page }) => {
  await mount(page); const before = await page.locator('[data-nc-layer="marks"]').first().innerHTML();
  await page.getByRole('button', { name: 'Closed', exact: true }).click(); await ready(page); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).not.toBe(before);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.events.filter(e => e.kind === 'selection').length)).toBe(1);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(18); await expect(page.locator('[data-nc-table]')).toContainText('Series hidden');
});
test('controlled proposals do not repaint rejected state or viewport', async ({ page }) => {
  const spec = fixture(); spec.selection = { mode: 'controlled', kind: 'multiple', value: [] }; spec.state = { mode: 'controlled', value: { hiddenSeriesIds: [] } }; spec.viewport = { mode: 'controlled', axes: 'xy', value: {} }; await mount(page, spec);
  const marks = page.locator('[data-nc-layer="marks"]').first(), before = await marks.innerHTML();
  await page.getByRole('button', { name: 'Closed', exact: true }).click(); expect(await marks.innerHTML()).toBe(before);
  expect((await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'x1', lastId: 'x4' } }))).status).toBe('ok'); expect(await marks.innerHTML()).toBe(before);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false');
  const proposals = await page.evaluate(() => window.events.filter(e => e.kind !== 'activate')); expect(proposals.map(e => e.effect)).toEqual(['proposal', 'proposal', 'proposal']);
});
test('invalid accessors do not execute or mount owned resources', async ({ page }) => {
  await mount(page); await page.evaluate(() => window.chart.destroy()); const result = await page.evaluate(() => { let calls = 0; const spec = { ...window.spec }; Object.defineProperty(spec, 'stacking', { enumerable: true, get() { calls++; return 'sum'; } }); const result = window.NCStackedArea.createStackedAreaChart(document.getElementById('host'), spec, { instanceId: 'invalid-stack' }); return { status: result.status, calls, roots: document.querySelectorAll('[data-nc-root]').length }; }); expect(result).toEqual({ status: 'invalid', calls: 0, roots: 0 });
});
test('wholly incomplete stacks keep the raw accessible table available', async ({ page }) => {
  const spec = fixture(); spec.series[1].data = spec.series[1].data.map(point => ({ ...point, y: null })); await mount(page, spec);
  expect(await page.evaluate(() => window.chart.getSnapshot().view)).toBe('empty'); await expect(page.locator('.nc-owned-data-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(18); await expect(page.locator('[data-nc-table] tbody')).toContainText('Incomplete stack');
});
test('hiding a missing component reveals the complete subtotal without invalidating viewport bounds', async ({ page }) => {
  const spec = fixture('positive'); spec.series = [[10, 1], [20, 1], [null, 1]].map((values, si) => ({ id: 's' + si, name: ['Open', 'Closed', 'Deferred'][si], data: values.map((y, i) => ({ id: 'p' + i, x: 'x' + i, y })) })); await mount(page, spec);
  await page.getByRole('button', { name: 'Deferred', exact: true }).click(); await ready(page);
  expect(await page.evaluate(() => window.diagnostics)).toEqual([]); expect(await page.evaluate(() => window.chart.getState().hiddenSeriesIds)).toEqual(['s2']);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await expect(grid.locator('[role="gridcell"]')).toContainText('Y 10');
});
for (const width of [320, 768]) for (const theme of ['light', 'dark']) test('touch and keyboard detail stay off the active original observation/' + width + '/' + theme, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: width + 32, height: 680 }, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); await mount(page, { ...fixture('positive'), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }, width);
    const circles = page.locator('[data-nc-layer="marks"] circle'); expect(await circles.count()).toBeGreaterThan(0);
    for (const [circle, seriesId, pointId] of [[circles.first(), 's0', 'p0'], [circles.last(), 's2', 'p5']]) {
      const activations = await page.evaluate(() => window.events.filter(event => event.kind === 'activate').length);
      const box = await circle.boundingBox(); expect(box).not.toBeNull(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => page.evaluate(() => window.events.filter(event => event.kind === 'activate').length)).toBe(activations + 1);
      expect(await page.evaluate(() => { const event = window.events.filter(event => event.kind === 'activate').at(-1); return [event.source, event.seriesId, event.point.id]; })).toEqual(['touch', seriesId, pointId]);
      const detail = page.locator('[data-nc-tooltip]'); await expect(detail).toBeVisible();
      const rect = await detail.boundingBox(); expect(rect).not.toBeNull();
      expect(rect.x < box.x + box.width && rect.x + rect.width > box.x && rect.y < box.y + box.height && rect.y + rect.height > box.y).toBe(false);
    }
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('ArrowDown'); await grid.press('Enter');
    await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.events.filter(event => event.kind === 'activate').at(-1).seriesId)).toBe('s1');
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); expect(await page.evaluate(async () => (await window.axe.run(document.getElementById('host'))).violations)).toEqual([]);
    const file = 'stacked-area-selected-tooltip-' + width + 'x440-' + theme + '-' + info.project.name + '.png';
    const bytes = await page.locator('#host').screenshot({ path: path.join(directory, 'visual', file), animations: 'disabled' });
    fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'stacked-area', variant: 'positive', stacking: 'sum', width, height: 440, pixelWidth: bytes.readUInt32BE(16), pixelHeight: bytes.readUInt32BE(20), browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state: 'selected-tooltip', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  } finally { await context.close(); }
});
test('100 create/table/update/destroy cycles release records and resources', async ({ page }, info) => {
  await mount(page); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.resourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async template => window.resourceProbe({ factoryPath: 'NCStackedArea.createStackedAreaChart', template, cycles: 100, datumPath: ['series', 0, 'data', 0, 'datum'], exercise(chart) { const svg = window.NCStackedArea.exportSvg(chart); if (svg.status !== 'ok') throw Error(JSON.stringify(svg)); } }), fixture());
  expect(report.cycles).toHaveLength(100); expect(await page.locator('[data-nc-root]').count()).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.__ncResourceReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'resources-' + info.project.name + '.json'), JSON.stringify(report, null, 2));
});
for (const variant of ['mixed', 'percent']) test('standalone SVG and actual PNG preserve accumulated geometry/' + variant, async ({ page }, info) => {
  const theme = variant === 'percent' ? 'dark' : 'light'; await mount(page, { ...fixture(variant), theme, direction: theme === 'dark' ? 'rtl' : 'ltr' });
  const result = await page.evaluate(async () => {
    const svg = window.NCStackedArea.exportSvg(window.chart), csv = window.NCStackedArea.exportCsv(window.chart);
    if (svg.status !== 'ok' || csv.status !== 'ok') throw Error(JSON.stringify({ svg, csv }));
    const parsed = new DOMParser().parseFromString(svg.value.svg, 'image/svg+xml'), drawing = parsed.documentElement.querySelector('svg');
    const paths = node => [...node.querySelectorAll('path')].map(path => path.getAttribute('d'));
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL, active = new Set(); let created = 0, revoked = 0;
    URL.createObjectURL = function(blob) { const value = create.call(this, blob); active.add(value); created++; return value; };
    URL.revokeObjectURL = function(value) { active.delete(value); revoked++; return revoke.call(this, value); };
    try {
      const png = await window.NCStackedArea.exportPng(window.chart, { pixelRatio: 2 }); if (png.status !== 'ok') throw Error(JSON.stringify(png));
      const bytes = new Uint8Array(await png.value.blob.arrayBuffer());
      return { original: paths(document.querySelector('#host svg')), exported: paths(drawing), svg: svg.value.svg, parseErrors: parsed.querySelectorAll('parsererror').length, csvRows: csv.value.split('\r\n').filter(Boolean).length, width: png.value.width, height: png.value.height, signature: [...bytes.slice(0, 8)], base64: btoa([...bytes].map(value => String.fromCharCode(value)).join('')), created, revoked, active: active.size };
    } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
  });
  expect(result.parseErrors).toBe(0); expect(result.original.length).toBeGreaterThan(0); expect(result.exported).toEqual(result.original); expect(result.svg).not.toMatch(/NaN|Infinity/); expect(result.csvRows).toBe(19);
  expect(result.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect([result.width, result.height]).toEqual([1536, 880]); expect([result.created, result.revoked, result.active]).toEqual([1, 1, 0]);
  const file = 'stacked-area-' + variant + '-png-768x440-' + theme + '-' + info.project.name + '.png', bytes = Buffer.from(result.base64, 'base64');
  fs.mkdirSync(path.join(directory, 'visual'), { recursive: true }); fs.writeFileSync(path.join(directory, 'visual', file), bytes);
  fs.writeFileSync(path.join(directory, 'visual', file.replace('.png', '.json')), JSON.stringify({ file, family: 'stacked-area', variant, stacking: variant === 'percent' ? 'percent' : 'sum', width: 768, height: 440, pixelWidth: result.width, pixelHeight: result.height, browser: info.project.name, theme, direction: theme === 'dark' ? 'rtl' : 'ltr', state: 'actual PNG export at2x', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
});
