import { test as base, expect } from '@playwright/test';
import { mount as mountChart, ready, coreFamily, familyFixture, captureCoverage } from './helpers.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const directory = process.env.NC_LABEL_ARTIFACT_DIR ?? 'artifacts/v1-labels';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local label evidence required');
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => { await use(); await captureCoverage(page, info, 'labels', directory); }, { auto: true }] });
const families = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent'];
const labels = page => page.locator('.nc-owned-data-label');
const mount = (page, family, overrides = {}) => mountChart(page, family, false, { labels: 'auto', ...overrides }, directory + '/browser-harness.js');
async function bounds(page) {
  return page.evaluate(() => {
    const clip = document.querySelector('[data-nc-layer="marks"]').ownerSVGElement.querySelector('clipPath rect'), plot = { x: Number(clip.getAttribute('x')), y: Number(clip.getAttribute('y')), width: Number(clip.getAttribute('width')), height: Number(clip.getAttribute('height')) };
    const boxes = [...document.querySelectorAll('.nc-owned-data-label')].map(element => { const b = element.getBBox(); return { text: element.textContent, x: b.x, y: b.y, width: b.width, height: b.height }; });
    return { plot, boxes };
  });
}
for (const family of families) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test(family + ' @visual labels/' + width + '/' + theme, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 650 }); await mount(page, family, { theme, direction: theme === 'dark' ? 'rtl' : 'ltr' });
  await page.evaluate(width => { document.querySelector('#host').style.width = width + 'px'; }, width); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(width); await ready(page);
  expect(await labels(page).count()).toBeGreaterThan(0); expect(await labels(page).count()).toBeLessThanOrEqual(200);
  const { plot, boxes } = await bounds(page);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]; expect([b.x, b.y, b.width, b.height].every(Number.isFinite)).toBe(true); expect(b.x).toBeGreaterThanOrEqual(plot.x - 1); expect(b.y).toBeGreaterThanOrEqual(plot.y - 1); expect(b.x + b.width).toBeLessThanOrEqual(plot.x + plot.width + 1); expect(b.y + b.height).toBeLessThanOrEqual(plot.y + plot.height + 1);
    for (const other of boxes.slice(i + 1)) expect(b.x < other.x + other.width && b.x + b.width > other.x && b.y < other.y + other.height && b.y + b.height > other.y).toBe(false);
    expect(b.text).not.toMatch(/null|NaN|Infinity/);
  }
  if (family === 'percent') expect(boxes.every(b => b.text.endsWith('%'))).toBe(true);
  else expect(boxes.every(b => Number.isFinite(Number(b.text)))).toBe(true);
  if (family === 'area') await expect(page.locator('.nc-owned-data-label-background')).toHaveCount(boxes.length);
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' }); expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([]);
  await page.evaluate(() => document.fonts.ready); await page.locator('#host').screenshot({ animations: 'disabled' });
  const file = `${family}-labels-${width}x400-${theme}-${info.project.name}.png`; fs.mkdirSync(directory + '/visual', { recursive: true });
  const png = await page.locator('#host').screenshot({ path: directory + '/visual/' + file, animations: 'disabled' });
  fs.writeFileSync(directory + '/visual/' + file.replace('.png', '.json'), JSON.stringify({ file, family, width, height: 400, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), theme, direction: theme === 'dark' ? 'rtl' : 'ltr', browser: info.project.name, state: 'auto-labels', labels: boxes, sha256: createHash('sha256').update(png).digest('hex'), baseline: 'NEW LABELS; HUMAN REVIEW PENDING' }, null, 2));
});

for (const family of families) test(family + ' label updates preserve raw records and default-off presentation', async ({ page }) => {
  await mount(page, family); await expect(labels(page).first()).toBeVisible();
  const raw = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(raw.status).toBe('ok'); expect(raw.value).toContain('missing');
  expect((await page.evaluate(() => { window.spec = { ...window.spec, labels: 'off' }; return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page); await expect(labels(page)).toHaveCount(0); await expect(page.locator('.nc-owned-data-label-background')).toHaveCount(0);
  expect((await page.evaluate(() => window.NCExport.exportCsv(window.chart))).value).toBe(raw.value);
  expect((await page.evaluate(() => { window.spec = structuredClone({ ...window.spec, labels: 'auto' }); return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page); await expect(labels(page).first()).toBeVisible();
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  const stable = await page.evaluate(() => { window.labelNode = document.querySelector('.nc-owned-data-label'); return window.chart.getSnapshot().committedRevision; }); await grid.press('ArrowRight');
  expect(await page.evaluate(() => ({ revision: window.chart.getSnapshot().committedRevision, node: window.labelNode === document.querySelector('.nc-owned-data-label') }))).toEqual({ revision: stable, node: true });
});

for (const family of ['line', 'column', 'spline', 'area', 'stacked-column']) test(family + ' label config rejects synonyms and accessors before DOM allocation', async ({ page }) => {
  await mount(page, family); await page.evaluate(() => window.chart.destroy());
  const result = await page.evaluate(name => {
    const create = window.NCExport['create' + name[0].toUpperCase() + name.slice(1) + 'Chart'], host = document.querySelector('#host'), invalid = [false, true, 'outside', {}, null].map(labels => create(host, { ...window.spec, labels }, { instanceId: 'invalid' }).status);
    let touched = 0; const spec = { ...window.spec }; Object.defineProperty(spec, 'labels', { get() { touched++; return 'auto'; } }); const getter = create(host, spec, { instanceId: 'invalid' }); return { invalid, getter: getter.status, touched, nodes: host.childElementCount };
  }, coreFamily(family)); expect(result).toEqual({ invalid: ['invalid', 'invalid', 'invalid', 'invalid', 'invalid'], getter: 'invalid', touched: 0, nodes: 0 });
});

for (const family of ['line', 'area', 'column', 'bar', 'stacked-column']) test(family + ' labels retain negative and zero numeric meaning with duplicate categories', async ({ page }) => {
  await mount(page, family, { axes: { x: { kind: 'category', values: [{ id: 'a', label: 'Repeated' }, { id: 'b', label: 'Repeated' }, { id: 'c', label: 'Third' }] }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Observed', color: '#ffffff', data: [{ id: 'first', x: 'a', y: -3 }, { id: 'zero', x: 'b', y: 0 }, { id: 'last', x: 'c', y: 4 }] }], theme: 'dark', references: [{ id: 'limit', axis: 'y', value: 2, label: 'Limit' }] });
  const text = await labels(page).allTextContents(); expect(text).toContain('-3'); expect(text).toContain('0'); expect(text).toContain('4');
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('#host tbody')).toContainText('-3'); await expect(page.locator('#host tbody')).toContainText('Repeated');
});

for (const family of families) test(family + ' viewport recomputes labels and retains original CSV records', async ({ page }) => {
  await mount(page, family, { viewport: { mode: 'internal', axes: 'xy', controls: false } });
  const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart).value);
  expect((await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'b', lastId: 'c' } }))).status).toBe('ok'); await ready(page);
  const text = await labels(page).allTextContents(); expect(text).not.toContain(family === 'percent' ? '66.6667%' : '4');
  expect(await page.evaluate(() => window.NCExport.exportCsv(window.chart).value)).toBe(csv);
  expect((await page.evaluate(() => window.chart.requestViewport({}))).status).toBe('ok'); await ready(page); await expect(labels(page).first()).toBeVisible();
});

test('percent labels use normalized extreme-value shares rather than overflowing raw totals', async ({ page }) => {
  await mount(page, 'percent', { series: ['actual', 'target'].map(id => ({ id, name: id, data: [{ id: 'first', x: 'a', y: Number.MAX_VALUE }, { id: 'zero', x: 'b', y: 0 }] })) });
  expect(await labels(page).allTextContents()).toEqual(['50%', '50%']);
  expect((await page.evaluate(() => window.NCExport.exportSvg(window.chart))).value.svg).not.toMatch(/NaN|Infinity/);
});

for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'percent']) test(family + ' 5000 logical observations keep bounded labels and complete raw data', async ({ page }) => {
  const categories = Array.from({ length: 5000 }, (_, i) => ({ id: 'p' + i, label: 'Category ' + i })), data = categories.map((c, i) => ({ id: c.id, x: c.id, y: Math.sin(i / 17) * 10 + 20 }));
  await mount(page, family, { axes: { x: { kind: 'category', values: categories }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Observed', data }] });
  expect(await labels(page).count()).toBeLessThanOrEqual(200);
  const result = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(result.status).toBe('ok'); expect(result.value.split('\r\n').filter(Boolean)).toHaveLength(5001);
  await page.evaluate(() => window.chart.destroy()); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
});

test('110 label create/table/export/destroy cycles release records and SVG ownership', async ({ page }, info) => {
  await mount(page, 'line'); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.labelResourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async cases => {
    const groups = [], references = [], handles = [];
    for (const { family, name, spec } of cases) {
      const result = await window.labelResourceProbe({ factoryPath: 'NCExport.' + name, template: spec, cycles: 10, datumPath: family === 'pie' || family === 'donut' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise(chart) {
        const result = window.NCExport.exportSvg(chart); if (result.status !== 'ok' || /NaN|Infinity/.test(result.value.svg)) throw Error('Labelled SVG export failed');
      } });
      groups.push({ family, result }); references.push(...window.__ncResourceReferences); handles.push(...window.__ncRetainedControllers);
    }
    window.labelReferences = references; window.labelHandles = handles; return { cycles: groups.reduce((n, g) => n + g.result.cycles.length, 0), groups, roots: document.querySelectorAll('[data-nc-root]').length };
  }, [...families, 'pie', 'donut', 'scatter'].map(family => { const name = coreFamily(family); return { family, name: 'create' + name[0].toUpperCase() + name.slice(1) + 'Chart', spec: { ...familyFixture(family, false), labels: family === 'pie' || family === 'donut' ? 'outside' : 'auto' } }; }));
  expect(report.cycles).toBe(110); expect(report.roots).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.labelReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/resources-' + info.project.name + '.json', JSON.stringify(report, null, 2));
});

for (const family of ['line', 'spline', 'area']) test(family + ' edge labels use clear space beside zero and maximum observations', async ({ page }, info) => {
  await page.setViewportSize({ width: 352, height: 650 }); await mount(page, family, { theme: 'dark', direction: 'rtl' });
  await page.evaluate(() => { document.querySelector('#host').style.width = '320px'; }); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(320); await ready(page);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+End');
  await expect(grid.locator('[role="gridcell"]')).toContainText('Target. X March (c). Y 5.');
  const probe = await page.evaluate(() => {
    const grid = document.querySelector('[data-nc-grid]'), active = document.getElementById(grid.getAttribute('aria-activedescendant'));
    return { active: active?.textContent, column: active?.getAttribute('aria-colindex'), row: active?.parentElement?.getAttribute('aria-rowindex'), labels: [...document.querySelectorAll('.nc-owned-data-label')].map(node => node.textContent), markers: [...document.querySelectorAll('[data-nc-layer="marks"] circle')].map(node => ({ cx: node.getAttribute('cx'), cy: node.getAttribute('cy') })), snapshot: window.chart.getSnapshot() };
  });
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/edge-probe-' + family + '-' + info.project.name + '.json', JSON.stringify(probe, null, 2));
  expect(probe.row).toBe('2'); expect(probe.column).toBe('3'); expect(probe.active).toContain('Y 5.'); expect(probe.labels).toContain('0'); expect(probe.labels).toContain('5');
});

for (const family of ['line', 'column', 'area', 'scatter']) test(family + ' RTL negative labels preserve mathematical sign order in live and exported SVG', async ({ page }, info) => {
  await mount(page, family, { direction: 'rtl', theme: 'dark', series: [{ id: 'actual', name: 'Observed', data: [{ id: 'first', x: family === 'scatter' ? -1 : 'a', y: -3 }, { id: 'zero', x: family === 'scatter' ? 0 : 'b', y: 0 }, { id: 'last', x: family === 'scatter' ? 1 : 'c', y: 4 }] }] });
  const result = await page.evaluate(() => {
    const measure = parent => { const node = [...parent.querySelectorAll('.nc-owned-data-label')].find(node => node.textContent === '-3'); if (!node) throw Error('Missing negative label'); return { minus: node.getExtentOfChar(0).x, digit: node.getExtentOfChar(1).x, text: node.textContent }; };
    const live = measure(document.querySelector('#host')), exported = window.NCExport.exportSvg(window.chart); if (exported.status !== 'ok') throw Error(JSON.stringify(exported));
    const holder = document.createElement('div'); holder.style.position = 'absolute'; holder.style.opacity = '0'; holder.style.pointerEvents = 'none'; document.body.append(holder);
    try { const xml = new DOMParser().parseFromString(exported.value.svg, 'image/svg+xml'); holder.append(document.importNode(xml.documentElement, true)); return { live, exported: measure(holder) }; } finally { holder.remove(); }
  });
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/bidi-' + family + '-' + info.project.name + '.json', JSON.stringify(result, null, 2));
  expect(result.live.minus).toBeLessThan(result.live.digit); expect(result.exported.minus).toBeLessThan(result.exported.digit);
});

for (const family of ['line', 'spline', 'area']) for (const kind of ['linear', 'time']) test(family + ' labels follow irregular ' + kind + ' X domains without inventing categories', async ({ page }) => {
  const xs = [0, 11, 101].map(value => kind === 'time' ? 1700000000000 + value * 1000 : value);
  await mount(page, family, { axes: { x: { kind }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Observed', data: xs.map((x, i) => ({ id: 'p' + i, x, y: [4, 0, 5][i] })) }], viewport: { mode: 'internal', axes: 'xy', controls: false } });
  expect(await labels(page).count()).toBeGreaterThan(0); const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart).value);
  expect((await page.evaluate(xs => window.chart.requestViewport({ x: [xs[1], xs[2]] }), xs)).status).toBe('ok'); await ready(page);
  const geometry = await bounds(page); expect(geometry.boxes.every(b => [b.x, b.y, b.width, b.height].every(Number.isFinite))).toBe(true);
  expect(await page.evaluate(() => window.NCExport.exportCsv(window.chart).value)).toBe(csv);
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('#host tbody tr')).toHaveCount(3);
});

for (const family of ['line', 'area', 'stacked-bar']) test(family + ' labelled PNG rasterization preserves an actual dark RTL drawing', async ({ page }, info) => {
  await mount(page, family, { direction: 'rtl', theme: 'dark', series: [{ id: 'actual', name: 'Observed', data: [{ id: 'first', x: 'a', y: -3 }, { id: 'zero', x: 'b', y: 0 }, { id: 'last', x: 'c', y: 4 }] }] });
  await expect(labels(page).filter({ hasText: /^-3$/ })).toHaveCount(1);
  const result = await page.evaluate(async () => {
    const vector = window.NCExport.exportSvg(window.chart), raster = await window.NCExport.exportPng(window.chart, { pixelRatio: 2 });
    if (vector.status !== 'ok' || raster.status !== 'ok') throw Error(JSON.stringify({ vector, raster }));
    const xml = new DOMParser().parseFromString(vector.value.svg, 'image/svg+xml'), texts = [...xml.querySelectorAll('.nc-owned-data-label')];
    const bytes = new Uint8Array(await raster.value.blob.arrayBuffer()), bitmap = await createImageBitmap(raster.value.blob), canvas = document.createElement('canvas');
    try {
      canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; let lightInk = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] > 180 && pixels[i + 3] > 0) lightInk++;
      return { width: bitmap.width, height: bitmap.height, logicalWidth: vector.value.width, logicalHeight: vector.value.height, type: raster.value.blob.type, signature: [...bytes.slice(0, 8)], lightInk, isolated: texts.length > 0 && texts.every(node => node.getAttribute('direction') === 'ltr' && node.getAttribute('unicode-bidi') === 'isolate'), encoded: btoa([...bytes].map(byte => String.fromCharCode(byte)).join('')) };
    } finally { bitmap.close(); canvas.width = canvas.height = 0; }
  });
  expect(result.type).toBe('image/png'); expect(result.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(result.width).toBe(result.logicalWidth * 2); expect(result.height).toBe(result.logicalHeight * 2); expect(result.isolated).toBe(true); expect(result.lightInk).toBeGreaterThan(200);
  fs.mkdirSync(directory + '/visual', { recursive: true }); const file = family + '-labelled-png-dark-rtl-' + info.project.name + '.png', bytes = Buffer.from(result.encoded, 'base64');
  fs.writeFileSync(directory + '/visual/' + file, bytes); fs.writeFileSync(directory + '/visual/' + file.replace('.png', '.json'), JSON.stringify({ file, family, width: result.logicalWidth, height: result.logicalHeight, pixelWidth: result.width, pixelHeight: result.height, browser: info.project.name, theme: 'dark', direction: 'rtl', variant: 'labels', state: 'PNG export at 2x pixel ratio', sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
});
