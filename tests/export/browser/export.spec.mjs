import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
const directory = path.resolve('artifacts/v1-export');
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use(); if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__); if (value) { const destination = path.join(directory, 'browser-coverage'); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, info.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(value)); }
}, { auto: true }] });
const variants = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter'];
function fixture(type, extras = {}) {
  const common = { title: 'Revenue < & > “observed”', description: 'Original data, not consumer HTML.', ...extras };
  if (type === 'pie' || type === 'donut') return { ...common, family: type, labels: 'outside', data: [{ id: 'one', label: 'Repeated', value: 8, datum: { private: 'OPAQUE_DONT_EXPORT' } }, { id: 'two', label: 'Repeated', value: 4 }, { id: 'zero', label: 'Zero', value: 0 }, { id: 'missing', label: 'Missing', value: null }], ...(type === 'donut' ? { center: { label: 'Known total' } } : {}), ...extras };
  if (type === 'scatter') return { ...common, family: 'scatter', axes: { x: { kind: 'linear', domain: [-10, 10] }, y: { kind: 'linear', domain: [-10, 10] } }, series: [{ id: 'observed', name: 'Observed', marker: { shape: 'diamond', size: 10 }, data: [{ id: 'one', x: 3, y: -4, datum: { private: 'OPAQUE_DONT_EXPORT' } }, { id: 'two', x: -2, y: 5 }, { id: 'zero', x: 0, y: 0 }, { id: 'missing', x: null, y: 2 }] }] };
  const family = type.startsWith('stacked') || type === 'percent' ? 'stacked' : type === 'bar' ? 'column' : type;
  return { ...common, family, axes: { x: { kind: 'category', values: [{ id: 'a', label: 'January' }, { id: 'b', label: 'January' }, { id: 'c', label: 'March' }, { id: 'd', label: 'April' }] }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'one', x: 'a', y: 8, datum: { private: 'OPAQUE_DONT_EXPORT' } }, { id: 'two', x: 'b', y: type === 'percent' ? 4 : -4 }, { id: 'zero', x: 'c', y: 0 }, { id: 'missing', x: 'd', y: null }] }, { id: 'target', name: 'Target', data: [{ id: 'one', x: 'a', y: 4 }, { id: 'two', x: 'b', y: 6 }, { id: 'three', x: 'c', y: 5 }, { id: 'four', x: 'd', y: 7 }] }], ...(type === 'bar' || type === 'stacked-bar' ? { orientation: 'horizontal' } : {}), ...(family === 'stacked' ? { stacking: type === 'percent' ? 'percent' : 'sum' } : {}) };
}
function factory(type) { const family = type.startsWith('stacked') || type === 'percent' ? 'stacked' : type === 'bar' ? 'column' : type; return 'create' + family[0].toUpperCase() + family.slice(1) + 'Chart'; }
async function setup(page, csp = '') {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Export acceptance</title>${csp}<style>body{margin:0}#host{width:768px;height:400px}</style></head><body><main><h1>Export acceptance</h1><div id="host"></div></main></body></html>`);
  await page.addScriptTag({ path: path.join(directory, 'browser-harness.js') });
  await page.evaluate(() => {
    window.exportErrors = []; window.urls = new Set(); window.urlCounts = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.urls.add(url); window.urlCounts.created++; return url; };
    URL.revokeObjectURL = url => { window.urls.delete(url); window.urlCounts.revoked++; revoke(url); };
  });
}
async function mount(page, type, extras = {}, width = 768) {
  await setup(page);
  const result = await page.evaluate(({ spec, name, width }) => {
    document.querySelector('#host').style.width = width + 'px';
    window.spec = spec; const result = window.NCExport[name](document.querySelector('#host'), spec, { instanceId: 'export-test', onDiagnostic: value => window.exportErrors.push(value) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? 'ok' : result;
  }, { spec: fixture(type, extras), name: factory(type), width });
  expect(result).toBe('ok'); await ready(page);
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const s = window.chart.getSnapshot(); return s.phase === 'active' && s.committedRevision > 0 && s.committedRevision === s.revision; })).toBe(true); expect(await page.evaluate(() => window.exportErrors)).toEqual([]); }
function readCsv(input) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < input.length; i++) { const c = input[i]; if (quoted) { if (c === '"' && input[i + 1] === '"') { value += '"'; i++; } else if (c === '"') quoted = false; else value += c; } else if (c === '"') quoted = true; else if (c === ',') { row.push(value); value = ''; } else if (c === '\r' && input[i + 1] === '\n') { row.push(value); rows.push(row); row = []; value = ''; i++; } else value += c; }
  if (quoted || row.length || value) throw Error('Invalid CSV'); return rows;
}
for (const type of variants) test(type + ': final SVG geometry, raw CSV, real PNG and local resource cleanup', async ({ page }, info) => {
  const external = []; page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await mount(page, type, { theme: 'light' });
  await page.locator('[data-nc-grid]').focus();
  const result = await page.evaluate(async () => {
    const svg = window.NCExport.exportSvg(window.chart, { idPrefix: 'review-export' }), csv = window.NCExport.exportCsv(window.chart);
    if (svg.status !== 'ok' || csv.status !== 'ok') return { svg, csv };
    const parsed = new DOMParser().parseFromString(svg.value.svg, 'image/svg+xml'), root = parsed.documentElement, body = root.querySelector('svg'), original = document.querySelector('#host svg');
    const tags = node => [...node.querySelectorAll('path,rect,circle,line,text')].map(element => ({ tag: element.localName, d: element.getAttribute('d'), x: element.getAttribute('x'), y: element.getAttribute('y'), width: element.getAttribute('width'), height: element.getAttribute('height'), r: element.getAttribute('r'), text: element.localName === 'text' ? element.textContent : null }));
    const ids = [...root.querySelectorAll('[id]')].map(element => element.id), links = [...root.querySelectorAll('*')].flatMap(element => [...element.attributes].flatMap(attribute => [...attribute.value.matchAll(/url\(#([^)]*)\)/g)].map(match => match[1])));
    const png = await window.NCExport.exportPng(window.chart, { idPrefix: 'review-png', pixelRatio: 2 });
    if (png.status !== 'ok') return { svg, csv, png };
    const bitmap = await createImageBitmap(png.value.blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); const corner = [...context.getImageData(0, 0, 1, 1).data], headerPixels = context.getImageData(0, 0, Math.min(1000, canvas.width), 100).data; let headerInk = 0; for (let i = 0; i < headerPixels.length; i += 4) if (headerPixels[i] < 150 && headerPixels[i + 1] < 150 && headerPixels[i + 2] < 150) headerInk++; bitmap.close(); canvas.width = canvas.height = 0;
    const bytes = new Uint8Array(await png.value.blob.arrayBuffer()), encoded = btoa([...bytes].map(byte => String.fromCharCode(byte)).join(''));
    return { svg: svg.value, csv: csv.value, parseErrors: parsed.querySelectorAll('parsererror').length, title: root.querySelector('title')?.textContent, original: tags(original), exported: tags(body), ids, links, forbidden: root.querySelectorAll('script,foreignObject,image,img,use,a,[href],[src],[style]').length, debugAttributes: [...root.querySelectorAll('*')].flatMap(element => [...element.attributes]).filter(attribute => /^data-|^on/i.test(attribute.name)).length, png: { width: png.value.width, height: png.value.height, type: png.value.blob.type, signature: [...bytes.slice(0, 8)], corner, headerInk, encoded }, urls: window.urls.size, counts: window.urlCounts, revision: window.chart.getSnapshot().committedRevision };
  });
  expect(result.svg.status).toBeUndefined(); expect(result.png.type).toBe('image/png'); expect(result.parseErrors).toBe(0); expect(result.title).toBe('Revenue < & > “observed”');
  expect(result.exported).toEqual(result.original); expect(new Set(result.ids).size).toBe(result.ids.length); expect(result.links.every(id => result.ids.includes(id))).toBe(true);
  expect(result.forbidden).toBe(0); expect(result.debugAttributes).toBe(0); expect(result.svg.svg).not.toContain('OPAQUE_DONT_EXPORT'); expect(result.csv).not.toContain('OPAQUE_DONT_EXPORT'); expect(result.svg.svg).not.toContain('foreignObject');
  expect(result.png.width).toBe(Math.ceil(result.svg.width * 2)); expect(result.png.height).toBe(Math.ceil(result.svg.height * 2)); expect(result.png.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(result.png.corner).toEqual([255, 255, 255, 255]); expect(result.svg.revision).toBe(result.revision);
  expect(result.png.headerInk).toBeGreaterThan(500);
  const rows = readCsv(result.csv), rawCount = type === 'pie' || type === 'donut' || type === 'scatter' ? 4 : 8; expect(rows).toHaveLength(rawCount + 1); expect(rows.some(row => row.includes('0'))).toBe(true); expect(rows.some(row => row.includes('missing') && row.includes(''))).toBe(true);
  expect(result.urls).toBe(0); expect(result.counts.created).toBe(1); expect(result.counts.revoked).toBe(1); expect(external).toEqual([]);
  const folder = path.join(directory, 'images'); fs.mkdirSync(folder, { recursive: true }); const filename = type + '-' + info.project.name + '.png', bytes = Buffer.from(result.png.encoded, 'base64'); fs.writeFileSync(path.join(folder, filename), bytes); fs.writeFileSync(path.join(folder, type + '-' + info.project.name + '.svg'), result.svg.svg);
  fs.writeFileSync(path.join(folder, type + '-' + info.project.name + '.csv'), result.csv);
  const metadata = { file: filename, case: type, browser: info.project.name, width: result.png.width, height: result.png.height, theme: 'light', state: 'final geometry; transient focus excluded', sha256: createHash('sha256').update(bytes).digest('hex'), humanApproval: 'PENDING' }; fs.writeFileSync(path.join(folder, type + '-' + info.project.name + '.json'), JSON.stringify(metadata, null, 2));
});
test('dark, RTL, transparent and explicit dimensions preserve the final geometry', async ({ page }, info) => {
  await mount(page, 'donut', { theme: 'dark', direction: 'rtl', title: 'توزيع الإيرادات', legend: { position: 'end' } });
  const result = await page.evaluate(async () => {
    const output = window.NCExport.exportSvg(window.chart, { width: 1200, idPrefix: 'dark-review' }), transparent = await window.NCExport.exportPng(window.chart, { width: 400, height: 200, pixelRatio: 1.5, background: 'transparent' });
    if (transparent.status !== 'ok') return { output, transparent };
    const bitmap = await createImageBitmap(transparent.value.blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); const pixel = [...ctx.getImageData(0, 0, 1, 1).data]; bitmap.close(); canvas.width = canvas.height = 0;
    const bytes = new Uint8Array(await transparent.value.blob.arrayBuffer()), encoded = btoa([...bytes].map(byte => String.fromCharCode(byte)).join('')), vector = window.NCExport.exportSvg(window.chart, { width: 400, height: 200, background: 'transparent' }), csv = window.NCExport.exportCsv(window.chart);
    return { output, vector, csv, encoded, width: transparent.value.width, height: transparent.value.height, pixel, urls: window.urls.size };
  });
  expect(result.output.status).toBe('ok'); expect(result.output.value.width).toBe(1200); expect(result.output.value.svg).toContain('direction="rtl"'); expect(result.output.value.svg).toContain('توزيع الإيرادات'); expect(result.width).toBe(600); expect(result.height).toBe(300); expect(result.pixel[3]).toBe(0); expect(result.urls).toBe(0);
  const stem = 'donut-dark-rtl-' + info.project.name, folder = path.join(directory, 'images'), bytes = Buffer.from(result.encoded, 'base64'); fs.writeFileSync(path.join(folder, stem + '.png'), bytes); fs.writeFileSync(path.join(folder, stem + '.svg'), result.vector.value.svg); fs.writeFileSync(path.join(folder, stem + '.csv'), result.csv.value);
  fs.writeFileSync(path.join(folder, stem + '.json'), JSON.stringify({ file: stem + '.png', case: 'donut', browser: info.project.name, width: result.width, height: result.height, theme: 'dark', direction: 'rtl', pixelRatio: 1.5, sha256: createHash('sha256').update(bytes).digest('hex'), humanApproval: 'PENDING' }, null, 2));
});
test('hidden and reconstructed raw identities survive CSV export without a fake series or stale revision', async ({ page }) => {
  await mount(page, 'pie'); await page.locator('[data-nc-series="two"]').click(); await ready(page);
  const hidden = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(hidden.status).toBe('ok'); const hiddenRows = readCsv(hidden.value); expect(hiddenRows[0]).toEqual(['Slice ID', 'Label', 'Value', 'Visible share (fraction)', 'Visible']); expect(hiddenRows.find(row => row[0] === 'two')).toEqual(['two', 'Repeated', '4', '', 'false']);
  const update = await page.evaluate(() => { window.spec = { ...window.spec, title: 'Updated', data: window.spec.data.map(point => ({ ...point, value: point.id === 'one' ? 16 : point.value })) }; return window.chart.update(window.spec); }); expect(update.status).toBe('ok'); await ready(page);
  const result = await page.evaluate(() => ({ csv: window.NCExport.exportCsv(window.chart), svg: window.NCExport.exportSvg(window.chart), revision: window.chart.getSnapshot().committedRevision })); expect(readCsv(result.csv.value).find(row => row[0] === 'one')).toEqual(['one', 'Repeated', '16', '1', 'true']); expect(result.svg.value.revision).toBe(result.revision); expect(result.svg.value.svg).toContain('Updated');
});
test('static output retains all legend records even when the interactive legend scrolls', async ({ page }) => {
  await mount(page, 'pie', { data: Array.from({ length: 50 }, (_, index) => ({ id: 'slice-' + index, label: 'Slice with complete label ' + index, value: 1 })) }, 320);
  const result = await page.evaluate(() => { const result = window.NCExport.exportSvg(window.chart); if (result.status !== 'ok') return result; const doc = new DOMParser().parseFromString(result.value.svg, 'image/svg+xml'); return { height: result.value.height, labels: [...doc.querySelectorAll('g > title')].map(element => element.textContent), size: window.chart.getSnapshot().size.height }; });
  expect(result.labels).toHaveLength(50); expect(result.labels[49]).toBe('Slice with complete label 49'); expect(result.height).toBeGreaterThan(result.size);
});
test('invalid options, unknown handles, invalid XML and nonfinite sizes return diagnostics', async ({ page }) => {
  await mount(page, 'line');
  const results = await page.evaluate(async () => {
    let calls = 0; const getter = Object.defineProperty({}, 'width', { enumerable: true, get() { calls++; return 500; } });
    const values = [window.NCExport.exportSvg({}, {}), window.NCExport.exportSvg(window.chart, { width: Infinity }), window.NCExport.exportSvg(window.chart, { idPrefix: 'a" onload="bad' }), window.NCExport.exportSvg(window.chart, { background: 'url(https://invalid.example)' }), window.NCExport.exportSvg(window.chart, getter), await window.NCExport.exportPng(window.chart, { width: 16000, height: 16000 }), await window.NCExport.exportPng(window.chart, { pixelRatio: 0 }), await window.NCExport.exportPng(window.chart, { signal: {} })];
    return { values, calls, urls: window.urls.size };
  }); expect(results.values.every(value => value.status === 'invalid')).toBe(true); expect(results.calls).toBe(0); expect(results.urls).toBe(0);
  const update = await page.evaluate(() => window.chart.update({ ...window.spec, title: 'Unpaired \ud800' })); expect(update.status).toBe('ok'); await ready(page);
  const invalid = await page.evaluate(() => window.NCExport.exportSvg(window.chart)); expect(invalid.status).toBe('invalid'); expect(invalid.diagnostic.reason).toBe('UNREPRESENTABLE_XML_TEXT');
});
test('suspended, destroyed and pending updates have a coherent committed export boundary', async ({ page }) => {
  await mount(page, 'scatter');
  const before = await page.evaluate(() => { const old = window.NCExport.exportSvg(window.chart); window.chart.update({ ...window.spec, title: 'Next revision' }); const pending = window.NCExport.exportSvg(window.chart); return { old, pending }; }); expect(before.pending.value.revision).toBe(before.old.value.revision); expect(before.pending.value.svg).not.toContain('Next revision'); await ready(page);
  await page.locator('#host').evaluate(host => { host.style.width = '0px'; }); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().phase)).toBe('suspended'); expect((await page.evaluate(() => window.NCExport.exportSvg(window.chart))).status).toBe('invalid');
  await page.locator('#host').evaluate(host => { host.style.width = '768px'; }); await ready(page);
  const after = await page.evaluate(async () => { window.chart.destroy(); return { svg: window.NCExport.exportSvg(window.chart), csv: window.NCExport.exportCsv(window.chart), png: await window.NCExport.exportPng(window.chart) }; }); expect(Object.values(after).every(value => value.status === 'invalid')).toBe(true);
});
test('cancel and destroy during native image decode release every owned URL and finish once', async ({ page }) => {
  await mount(page, 'scatter');
  const result = await page.evaluate(async () => {
    const cancel = new AbortController(), first = window.NCExport.exportPng(window.chart, { signal: cancel.signal }); cancel.abort(); const canceled = await first;
    const second = window.NCExport.exportPng(window.chart); window.chart.destroy(); const destroyed = await second;
    return { canceled, destroyed, urls: window.urls.size, counts: window.urlCounts, roots: document.querySelectorAll('[data-nc-root]').length };
  }); expect(result.canceled.diagnostic.reason).toBe('EXPORT_ABORTED'); expect(result.destroyed.diagnostic.reason).toBe('EXPORT_ABORTED'); expect(result.urls).toBe(0); expect(result.counts.created).toBe(result.counts.revoked); expect(result.roots).toBe(0);
});
test('native encoder failures and late completion cannot leak jobs or revive a destroyed chart', async ({ page }) => {
  await mount(page, 'column');
  const result = await page.evaluate(async () => {
    const original = HTMLCanvasElement.prototype.toBlob; let callback, encodes = 0;
    HTMLCanvasElement.prototype.toBlob = function(next) { callback = next; encodes++; };
    try {
      const task = window.NCExport.exportPng(window.chart);
      for (let frame = 0; frame < 100 && !callback; frame++) await new Promise(requestAnimationFrame);
      if (!callback) throw Error('Native decode did not reach PNG encoding'); window.chart.destroy(); const canceled = await task; callback(new Blob(['late'], { type: 'image/png' }));
      return { canceled, encodes, urls: window.urls.size, counts: window.urlCounts };
    } finally { HTMLCanvasElement.prototype.toBlob = original; }
  }); expect(result.canceled.diagnostic.reason).toBe('EXPORT_ABORTED'); expect(result.encodes).toBe(1); expect(result.urls).toBe(0); expect(result.counts.created).toBe(result.counts.revoked);
});
test('decode blocked by CSP remains an explicit failure and revokes its Blob URL', async ({ page }) => {
  await setup(page, '<meta http-equiv="Content-Security-Policy" content="img-src \'none\'">');
  const result = await page.evaluate(async ({ spec, name }) => {
    const result = window.NCExport[name](document.querySelector('#host'), spec, { instanceId: 'export-csp' }); if (result.status !== 'ok') return result; const chart = result.value;
    for (let frame = 0; frame < 100 && !chart.getSnapshot().committedRevision; frame++) await new Promise(requestAnimationFrame);
    const png = await window.NCExport.exportPng(chart); chart.destroy(); return { png, urls: window.urls.size, counts: window.urlCounts };
  }, { spec: fixture('line'), name: factory('line') }); expect(result.png.status).toBe('invalid'); expect(result.png.diagnostic.reason).toBe('SVG_DECODE_FAILED'); expect(result.urls).toBe(0); expect(result.counts.created).toBe(result.counts.revoked);
});
test('canvas allocation, encoding and timeout failures settle diagnostically and release their leases', async ({ page }) => {
  await mount(page, 'line');
  const result = await page.evaluate(async () => {
    const encode = HTMLCanvasElement.prototype.toBlob, context = HTMLCanvasElement.prototype.getContext, timeout = window.setTimeout;
    const values = [];
    try {
      HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); }; values.push(await window.NCExport.exportPng(window.chart));
      HTMLCanvasElement.prototype.toBlob = function() { throw Error('Encoder allocation failed'); }; values.push(await window.NCExport.exportPng(window.chart));
      HTMLCanvasElement.prototype.toBlob = encode;
      HTMLCanvasElement.prototype.getContext = function(...args) { return this.width === 1536 ? null : context.apply(this, args); }; values.push(await window.NCExport.exportPng(window.chart, { pixelRatio: 2 })); HTMLCanvasElement.prototype.getContext = context;
      window.setTimeout = (callback, delay, ...args) => timeout(callback, delay === 25000 ? 0 : delay, ...args); values.push(await window.NCExport.exportPng(window.chart));
    } finally { HTMLCanvasElement.prototype.toBlob = encode; HTMLCanvasElement.prototype.getContext = context; window.setTimeout = timeout; }
    const recovery = await window.NCExport.exportPng(window.chart); return { values, recovered: recovery.status === 'ok', urls: window.urls.size, counts: window.urlCounts };
  });
  expect(result.values.map(value => value.diagnostic.reason)).toEqual(['PNG_ENCODE_FAILED', 'PNG_ENCODE_FAILED', 'CANVAS_UNAVAILABLE', 'EXPORT_TIMEOUT']); expect(result.recovered).toBe(true); expect(result.urls).toBe(0); expect(result.counts.created).toBe(result.counts.revoked);
});
test('concurrent export pressure is bounded and cancellation releases the document budget', async ({ page }) => {
  await mount(page, 'donut');
  const result = await page.evaluate(async () => {
    const pending = Array.from({ length: 4 }, () => window.NCExport.exportPng(window.chart)), busy = await window.NCExport.exportPng(window.chart);
    const results = await Promise.all(pending), recovered = await window.NCExport.exportPng(window.chart);
    return { busy, completed: results.filter(result => result.status === 'ok').length, recovered: recovered.status === 'ok', urls: window.urls.size };
  }); expect(result.busy.diagnostic.reason).toBe('EXPORT_BUSY'); expect(result.completed).toBe(4); expect(result.recovered).toBe(true); expect(result.urls).toBe(0);
});
test('50,000 XY records export in original order without discarding points or leaking consumer payloads', async ({ page }) => {
  await mount(page, 'scatter');
  const update = await page.evaluate(() => window.chart.update({ ...window.spec, axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 'large', name: 'Large', data: Array.from({ length: 50000 }, (_, index) => ({ id: 'p' + index, x: index * 37 % 50000, y: index % 997 === 0 ? null : Math.sin(index / 17) * 20, datum: { private: 'OPAQUE_DONT_EXPORT' } })) }] })); expect(update.status).toBe('ok'); await ready(page);
  const result = await page.evaluate(async () => {
    const csv = window.NCExport.exportCsv(window.chart), svg = window.NCExport.exportSvg(window.chart), png = await window.NCExport.exportPng(window.chart, { width: 800 });
    return { csv: csv.status === 'ok' ? csv.value : csv, svg: svg.status, glyphs: svg.status === 'ok' ? (svg.value.svg.match(/M /g) ?? []).length : 0, png: png.status, urls: window.urls.size };
  }); const rows = readCsv(result.csv); expect(rows).toHaveLength(50001); expect(rows[1]).toEqual(['large', 'Large', 'p0', '0', '', 'true']); expect(rows.at(-1)[2]).toBe('p49999'); expect(result.csv).not.toContain('OPAQUE_DONT_EXPORT'); expect(result.svg).toBe('ok'); expect(result.glyphs).toBe(50000 - Math.floor(49999 / 997) - 1); expect(result.png).toBe('ok'); expect(result.urls).toBe(0);
});
test('radial derived CSV shares distinguish zero, missing, hidden and positive underflow', async ({ page }) => {
  await mount(page, 'pie', { data: [{ id: 'large', label: 'Large', value: Number.MAX_VALUE }, { id: 'tiny', label: 'Tiny', value: Number.MIN_VALUE }, { id: 'zero', label: 'Zero', value: 0 }, { id: 'missing', label: 'Missing', value: null }] });
  const result = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(result.status).toBe('ok'); const rows = readCsv(result.value); expect(rows.find(row => row[0] === 'large')[3]).toBe('1'); expect(rows.find(row => row[0] === 'tiny')[3]).toBe(''); expect(rows.find(row => row[0] === 'zero')[3]).toBe('0'); expect(rows.find(row => row[0] === 'missing')[3]).toBe('');
});
test('110 export/create/destroy cycles preserve cleanup across every supported family', async ({ page }, info) => {
  await setup(page); await page.evaluate('globalThis.probeExportResources=' + probeChartResources.toString());
  const result = await page.evaluate(async cases => {
    const groups = [], references = [], handles = [];
    for (const { type, spec, name } of cases) {
      const result = await window.probeExportResources({ factoryPath: 'NCExport.' + name, template: spec, cycles: 10, datumPath: type === 'pie' || type === 'donut' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise: async (chart, index) => {
        const task = window.NCExport.exportPng(chart); if (index % 2) chart.destroy(); const png = await task;
        if (index % 2 ? png.status !== 'invalid' || png.diagnostic.reason !== 'EXPORT_ABORTED' : png.status !== 'ok') throw Error(JSON.stringify(png));
      } });
      groups.push({ type, result }); references.push(...window.__ncResourceReferences); handles.push(...window.__ncRetainedControllers);
    }
    window.retainedExportHandles = handles; window.exportWeakReferences = references;
    return { cycles: groups.reduce((count, group) => count + group.result.cycles.length, 0), groups, urls: window.urls.size, counts: window.urlCounts, roots: document.querySelectorAll('[data-nc-root]').length };
  }, variants.map(type => ({ type, spec: fixture(type), name: factory(type) })));
  expect(result.cycles).toBe(110); expect(result.urls).toBe(0); expect(result.counts.created).toBe(result.counts.revoked); expect(result.roots).toBe(0);
  if (info.project.name === 'chromium') { const session = await page.context().newCDPSession(page); await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage'); const alive = await page.evaluate(() => window.exportWeakReferences.filter(reference => reference.deref()).length); expect(alive).toBe(0); result.collection = { references: 330, retainedControllers: 110, alive }; await session.detach(); }
  fs.writeFileSync(path.join(directory, 'resources-' + info.project.name + '.json'), JSON.stringify(result, null, 2));
});
