import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
import { waitForLineDetail } from '../../../../../tooling/line-detail-wait.mjs';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use(); await captureCoverage(page, info, 'fixture');
}, { auto: true }] });
async function captureCoverage(page, info, owner) {
  if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__); if (value) { const directory = 'artifacts/v1-interaction/browser-coverage'; fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/' + info.testId.replace(/[^a-z0-9]/gi, '_') + '-' + owner + '.json', JSON.stringify(value)); }
}
function coreFamily(family) { return family.startsWith('stacked') || family === 'percent' ? 'stacked' : family === 'bar' ? 'column' : family; }
function fixture(family, selection) { const kind = coreFamily(family); return { family: kind, ...(family === 'bar' || family === 'stacked-bar' ? { orientation: 'horizontal' } : {}), ...(kind === 'stacked' ? { stacking: family === 'percent' ? 'percent' : 'sum' } : {}), title: 'Quarterly observations', selection, crosshair: 'xy', axes: { x: { kind: 'category', values: [{ id: 'a', label: 'January' }, { id: 'b', label: 'January' }, { id: 'c', label: 'March' }] }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'first', x: 'a', y: 4 }, { id: 'zero', x: 'b', y: 0 }, { id: 'missing', x: 'c', y: null }] }, { id: 'target', name: 'Target', data: [{ id: 'first', x: 'a', y: 2 }, { id: 'next', x: 'b', y: 3 }, { id: 'last', x: 'c', y: 5 }] }] }; }
function familyFixture(family, selection) {
  if (family === 'pie' || family === 'donut') return { family, title: 'Radial observations', selection, data: [{ id: 'first', label: 'Actual', value: 4 }, { id: 'second', label: 'Actual', value: 2 }, { id: 'zero', label: 'Zero', value: 0 }, { id: 'missing', label: 'Missing', value: null }] };
  if (family === 'scatter') return { family, title: 'Unordered XY observations', selection, crosshair: 'xy', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'first', x: 3, y: -4 }, { id: 'second', x: -2, y: 5 }, { id: 'zero', x: 0, y: 0 }, { id: 'missing', x: null, y: 2 }] }] };
  return fixture(family, selection);
}

async function firstNativePoint(page, family) {
  if (family === 'pie' || family === 'donut') return page.locator('[data-nc-layer="marks"] path').first().evaluate(element => {
    const box = element.getBBox(), matrix = element.getScreenCTM();
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
      const point = new DOMPoint(box.x + box.width * x / 20, box.y + box.height * y / 20);
      if ([-3, 0, 3].every(dx => [-3, 0, 3].every(dy => element.isPointInFill(new DOMPoint(point.x + dx, point.y + dy))))) { const screen = point.matrixTransform(matrix); return { x: screen.x, y: screen.y }; }
    }
    throw Error('No native slice interior');
  });
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  const mark = page.locator('[data-nc-layer="interaction"] circle:not([stroke-dasharray]),[data-nc-layer="interaction"] rect:not([stroke-dasharray])').last(); await expect(mark).toBeVisible();
  const point = await mark.evaluate(element => { const box = element.getBBox(), p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(element.getScreenCTM()); return { x: p.x, y: p.y }; });
  await page.locator('#outside').focus(); return point;
}
const allFamilies = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter'];
for (const family of allFamilies) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test(family + ' @visual selected keyboard/' + width + '/' + theme, async ({ page }, info) => {
  const id = family === 'pie' || family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
  await mount(page, family, { mode: 'internal', initial: [id] });
  const update = await page.evaluate(({ width, theme }) => { document.querySelector('#host').style.width = width + 'px'; window.spec = { ...window.spec, theme, direction: theme === 'dark' ? 'rtl' : 'ltr' }; return window.chart.update(window.spec); }, { width, theme }); expect(update.status).toBe('ok');
  await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(width); await ready(page);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await expect(selected(page)).toHaveCount(1);
  await page.evaluate(async ({ source, family }) => { const wait = (0, eval)('(' + source + ')'); return wait(window.chart, document.querySelector('#host'), { revision: window.chart.getSnapshot().committedRevision, seriesId: family === 'pie' || family === 'donut' ? 'slices' : 'actual', pointId: family === 'pie' || family === 'donut' || family === 'scatter' ? 'second' : 'zero', header: '' }); }, { source: waitForLineDetail.toString(), family });
  if (['column', 'bar', 'stacked-column', 'stacked-bar', 'percent'].includes(family)) {
    const overlaps = await page.evaluate(() => {
      const focus = document.querySelector('[data-nc-layer="interaction"] rect[stroke]:not([stroke-dasharray])'), box = focus.getBBox(), point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(focus.getScreenCTM());
      return [...document.querySelectorAll('[data-nc-detail],[data-nc-tooltip]')].filter(element => !element.hidden && getComputedStyle(element).visibility === 'visible' && element.getBoundingClientRect().width > 0).some(element => { const r = element.getBoundingClientRect(); return point.x + 2 > r.left && point.x - 2 < r.right && point.y + 2 > r.top && point.y - 2 < r.bottom; });
    }); expect(overlaps).toBe(false);
  }
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const directory = 'artifacts/v1-interaction/visual', filename = `${family}-selected-keyboard-${width}x400-${theme}-${info.project.name}.png`; fs.mkdirSync(directory, { recursive: true });
  // Native Chromium may settle SVG edge antialiasing on the first readback.
  // Diagnostics proved identical DOM/bounds/DPR and exact second/third rasters.
  // Warm the raster once, then require byte-identical captures (no tolerance).
  await page.locator('#host').screenshot({ animations: 'disabled' });
  const png = await page.locator('#host').screenshot({ path: directory + '/' + filename, animations: 'disabled' }), second = await page.locator('#host').screenshot({ animations: 'disabled' }); const hash = createHash('sha256').update(png).digest('hex'); expect(createHash('sha256').update(second).digest('hex')).toBe(hash);
  fs.writeFileSync(directory + '/' + filename.replace(/\.png$/, '.json'), JSON.stringify({ file: filename, family, variant: 'selection-crosshair', state: 'keyboard', width, height: 400, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), deviceScaleFactor: await page.evaluate(() => devicePixelRatio), theme, direction: theme === 'dark' ? 'rtl' : 'ltr', browser: info.project.name, sha256: hash, rasterWarmup: 1, baseline: 'NEW INTERACTION; HUMAN REVIEW PENDING', approval: 'HUMAN REVIEW PENDING' }, null, 2));
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const a11y = await page.evaluate(() => window.axe.run(document)); expect(a11y.violations).toEqual([]);
});
for (const family of allFamilies) {
  test(family + ' selection guards reject missing handlers and unknown initial identities before allocating DOM', async ({ page }) => {
    await mount(page, family); await page.evaluate(() => window.chart.destroy());
    const result = await page.evaluate(({ family, spec, identity }) => {
      const create = window.NCExport['create' + family[0].toUpperCase() + family.slice(1) + 'Chart'], host = document.querySelector('#host');
      const missing = create(host, { ...spec, selection: { mode: 'controlled', value: [] } }, { instanceId: 'guarded' });
      const unknown = create(host, { ...spec, selection: { mode: 'internal', initial: [identity] } }, { instanceId: 'guarded' });
      const callback = create(host, spec, { instanceId: 'guarded', onSelectionChange: 42 });
      const mounted = create(host, { ...spec, selection: { mode: 'internal' } }, { instanceId: 'guarded' }); if (mounted.status !== 'ok') return mounted;
      const update = mounted.value.update({ ...spec, selection: { mode: 'controlled', value: [] } }); const state = mounted.value.getSelection(); mounted.value.destroy();
      return { missing, unknown, callback, update, state, roots: host.querySelectorAll('[data-nc-root]').length };
    }, { family: coreFamily(family), spec: familyFixture(family, { mode: 'internal' }), identity: family === 'pie' || family === 'donut' ? { pointId: 'missing' } : { seriesId: 'actual', pointId: 'missing' } });
    expect(result.missing.diagnostic.reason).toBe('MISSING_SELECTION_HANDLER'); expect(result.unknown.diagnostic.reason).toBe('UNKNOWN_SELECTION'); expect(result.callback.status).toBe('invalid'); expect(result.update.diagnostic.reason).toBe('MISSING_SELECTION_HANDLER'); expect(result.state).toEqual([]); expect(result.roots).toBe(0);
  });
  test(family + ' selection lifecycle rejects a pending/suspended request and preserves the table focus and applied owner', async ({ page }) => {
    const id = family === 'pie' || family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
    await mount(page, family, { mode: 'internal', initial: [id] });
    const unchanged = await page.evaluate(value => window.chart.requestSelection(value), [id]); expect(unchanged.status).toBe('ok'); expect(await page.evaluate(() => window.selections)).toEqual([]);
    const pending = await page.evaluate(() => { const accepted = window.chart.update({ ...window.spec, title: 'Immutable full update' }); return { accepted, selection: window.chart.requestSelection([]), value: window.chart.getSelection() }; }); expect(pending.accepted.status).toBe('ok'); expect(pending.selection.diagnostic.reason).toBe('UPDATE_PENDING'); expect(pending.value).toEqual([id]); await ready(page);
    await page.getByRole('button', { name: /data table/i }).click(); const grid = page.locator('[data-nc-grid]'); await expect(grid).toBeHidden(); await page.evaluate(() => { window.tableFocus = document.activeElement; });
    expect((await page.evaluate(() => window.chart.requestSelection([]))).status).toBe('ok'); await expect(grid).toBeHidden(); await expect(page.locator('[data-nc-table]')).toBeVisible(); expect(await page.evaluate(() => document.activeElement === window.tableFocus && document.querySelector('[data-nc-table]').contains(document.activeElement))).toBe(true);
    await page.getByRole('button', { name: /close.*table/i }).click();
    await page.evaluate(() => { document.querySelector('#host').style.height = '0px'; }); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().phase)).toBe('suspended'); expect((await page.evaluate(value => window.chart.requestSelection(value), [id])).diagnostic.reason).toBe('SELECTION_UNAVAILABLE');
    await page.evaluate(() => { document.querySelector('#host').style.height = '400px'; }); await ready(page); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]);
    await page.evaluate(() => window.chart.destroy()); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); expect((await page.evaluate(() => window.chart.refresh())).diagnostic.reason).toBe('DESTROYED'); expect((await page.evaluate(() => window.chart.update(window.spec))).diagnostic.reason).toBe('DESTROYED');
  });
  test(family + ' a failed semantic write faults once and releases selection without late outputs', async ({ page }) => {
    await mount(page, family); const id = family === 'pie' || family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
    const result = await page.evaluate(value => {
      const cell = document.querySelector('[data-nc-grid] [role="gridcell"]'), native = cell.setAttribute.bind(cell); cell.setAttribute = (name, content) => { if (name === 'aria-selected') throw Error('Simulated failed owned semantic write'); native(name, content); };
      const selected = window.chart.requestSelection(value), snapshot = window.chart.getSnapshot(), state = window.chart.getSelection(), refresh = window.chart.refresh(), update = window.chart.update(window.spec); window.chart.destroy(); window.chart.destroy();
      return { selected, snapshot, state, refresh, update, events: window.selections, diagnostics: window.diagnostics, roots: document.querySelectorAll('[data-nc-root]').length };
    }, [id]);
    expect(result.selected.diagnostic.reason).toBe('DOM_WRITE_FAILED'); expect(result.snapshot.phase).toBe('faulted'); expect(result.state).toEqual([]); expect(result.refresh.status).toBe('invalid'); expect(result.update.status).toBe('invalid'); expect(result.events).toEqual([]); expect(result.diagnostics).toHaveLength(1); expect(result.roots).toBe(0);
  });
  test(family + ' native pointer and touch select exactly once and CSV reports the applied owner', async ({ browser }, info) => {
    const context = await browser.newContext({ hasTouch: true }); const page = await context.newPage();
    try {
      await mount(page, family); const point = await firstNativePoint(page, family), id = family === 'pie' || family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
      await page.mouse.click(point.x, point.y); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([id]); expect(await page.evaluate(() => window.selections)).toMatchObject([{ effect: 'accepted', source: 'pointer', selection: [id] }]);
      const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value.split('\r\n')[0]).toContain('Selected'); expect(csv.value.split('\r\n')[1]).toMatch(/true$/);
      await page.touchscreen.tap(point.x, point.y); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); expect(await page.evaluate(() => window.selections)).toMatchObject([{ source: 'pointer' }, { source: 'touch', selection: [] }]); expect(await page.evaluate(() => window.activations.length)).toBe(2);
      const rejected = await page.evaluate(() => window.chart.requestSelection([{ pointId: 'unknown' }])); expect(rejected.status).toBe('invalid'); expect(await page.evaluate(() => window.selections.length)).toBe(2);
      expect((await page.evaluate(() => window.chart.update({ ...window.spec, selection: false }))).status).toBe('ok'); await ready(page); await expect(selected(page)).toHaveCount(0); await expect(page.locator('[data-nc-grid]')).not.toHaveAttribute('aria-multiselectable');
      const unavailable = await page.evaluate(value => window.chart.requestSelection(value), [id]); expect(unavailable.status).toBe('invalid');
      await page.evaluate(() => window.chart.destroy()); expect((await page.evaluate(value => window.chart.requestSelection(value), [id])).diagnostic.reason).toBe('DESTROYED');
    } finally { try { await captureCoverage(page, info, 'touch-context'); } finally { await context.close(); } }
  });
}

test('selection create/update/destroy stress releases retained raw data across every family', async ({ page }, info) => {
  await mount(page, 'line'); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.selectionResourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async cases => {
    const groups = [], references = [], handles = [];
    for (const { family, spec, name } of cases) {
      const result = await window.selectionResourceProbe({ factoryPath: 'NCExport.' + name, template: spec, cycles: 10, datumPath: family === 'pie' || family === 'donut' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise: async chart => {
        const id = spec.family === 'pie' || spec.family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
        const selected = chart.requestSelection([id]); if (selected.status !== 'ok') throw Error(JSON.stringify(selected));
        const exported = window.NCExport.exportSvg(chart); if (exported.status !== 'ok' || !exported.value.svg.includes('3 2')) throw Error('Applied selection export failed');
      } });
      groups.push({ family, result }); references.push(...window.__ncResourceReferences); handles.push(...window.__ncRetainedControllers);
    }
    window.selectionReferences = references; window.selectionHandles = handles; return { cycles: groups.reduce((count, group) => count + group.result.cycles.length, 0), groups, roots: document.querySelectorAll('[data-nc-root]').length };
  }, allFamilies.map(family => ({ family, spec: familyFixture(family, { mode: 'internal', kind: 'multiple' }), name: 'create' + coreFamily(family)[0].toUpperCase() + coreFamily(family).slice(1) + 'Chart' })));
  expect(report.cycles).toBe(110); expect(report.roots).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.selectionReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync('artifacts/v1-interaction', { recursive: true }); fs.writeFileSync('artifacts/v1-interaction/resources-' + info.project.name + '.json', JSON.stringify(report, null, 2));
});
async function mount(page, family, selection = { mode: 'internal', kind: 'multiple' }) {
  await page.setContent('<!doctype html><html lang="en"><head><title>Interaction acceptance</title><style>body{margin:0}h1{font:600 16px/24px sans-serif;margin:8px 0}</style></head><body><main><h1>Interaction acceptance</h1><div id="host" style="width:768px;height:400px"></div><button id="outside">Outside</button></main></body></html>');
  await page.addScriptTag({ path: path.resolve(process.env.NC_INTERACTION_HARNESS ?? 'artifacts/v1-interaction/browser-harness.js') });
  const result = await page.evaluate(({ spec, family }) => {
    window.spec = spec; window.selections = []; window.activations = []; window.diagnostics = [];
    const result = window.NCExport['create' + family[0].toUpperCase() + family.slice(1) + 'Chart'](document.querySelector('#host'), spec, { instanceId: 'selection-test', onSelectionChange: value => window.selections.push(value), onPointActivate: value => window.activations.push(value), onDiagnostic: value => window.diagnostics.push(value) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? 'ok' : result;
  }, { spec: familyFixture(family, selection), family: coreFamily(family) }); expect(result).toBe('ok'); await ready(page);
}
async function ready(page) { await expect.poll(() => page.evaluate(() => { const state = window.chart.getSnapshot(); return state.phase === 'active' && state.revision === state.committedRevision && state.committedRevision > 0; })).toBe(true); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); }
const selected = page => page.locator('[data-nc-layer="interaction"] [stroke-dasharray="3 2"]');
for (const family of ['pie', 'donut', 'scatter']) {
  const id = pointId => family === 'scatter' ? { seriesId: 'actual', pointId } : { pointId };
  test(family + ' logical selection survives reconstruction and zero remains selectable', async ({ page }) => {
    await mount(page, family); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
    expect(await page.evaluate(() => window.chart.getSelection())).toEqual([id('first')]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true'); await expect(selected(page)).toHaveCount(1);
    const update = await page.evaluate(() => { window.spec = { ...window.spec, ...(window.spec.series ? { series: window.spec.series.map(series => ({ ...series, data: series.data.map(point => ({ ...point })) })) } : { data: window.spec.data.map(point => ({ ...point })) }) }; return window.chart.update(window.spec); }); expect(update.status).toBe('ok'); await ready(page); await expect(selected(page)).toHaveCount(1);
    await grid.press('End'); await grid.press('Space'); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([id('first'), id('zero')]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.selections.length)).toBe(2); expect(await page.evaluate(() => window.activations.length)).toBe(2);
    const output = await page.evaluate(() => window.NCExport.exportSvg(window.chart)); expect(output.status).toBe('ok'); expect(output.value.svg).toContain('3 2');
  });
  test(family + ' controlled selection proposes once and applies only the consumer value', async ({ page }) => {
    await mount(page, family, { mode: 'controlled', value: [] }); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
    expect(await page.evaluate(() => window.selections)).toMatchObject([{ effect: 'proposal', source: 'keyboard', selection: [id('first')] }]); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(selected(page)).toHaveCount(0);
    expect((await page.evaluate(() => { window.spec = { ...window.spec, selection: { mode: 'controlled', value: window.selections[0].selection } }; return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page); await expect(selected(page)).toHaveCount(1); expect(await page.evaluate(() => window.selections.length)).toBe(1);
    const rejected = await page.evaluate(value => window.chart.requestSelection(value), [id('missing')]); expect(rejected.status).toBe('invalid'); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([id('first')]);
  });
  test(family + ' hiding preserves the domain selection and removing it prunes once', async ({ page }) => {
    await mount(page, family, { mode: 'internal', initial: [id('first')] }); await expect(selected(page)).toHaveCount(1);
    const button = page.getByRole('button', { name: family === 'scatter' ? 'Actual' : 'Actual (first)', exact: true }); await button.click(); await ready(page); await expect(selected(page)).toHaveCount(0); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([id('first')]); await button.click(); await ready(page); await expect(selected(page)).toHaveCount(1);
    const result = await page.evaluate(() => { window.spec = { ...window.spec, ...(window.spec.series ? { series: window.spec.series.map(series => ({ ...series, data: series.data.filter(point => point.id !== 'first') })) } : { data: window.spec.data.filter(point => point.id !== 'first') }) }; return window.chart.update(window.spec); }); expect(result.status).toBe('ok'); await ready(page); await expect(selected(page)).toHaveCount(0); expect(await page.evaluate(() => window.selections)).toMatchObject([{ effect: 'accepted', source: 'update', selection: [] }]);
  });
}
for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent']) {
  test(family + ' keyboard selection has exact domain identity, persistent cues and accessible state', async ({ page }) => {
    await mount(page, family); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
    await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false'); await grid.press('Enter');
    expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ seriesId: 'actual', pointId: 'first' }]); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true'); await expect(selected(page)).toHaveCount(1); await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
    await grid.press('ArrowRight'); await grid.press('Space'); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ seriesId: 'actual', pointId: 'first' }, { seriesId: 'actual', pointId: 'zero' }]); await expect(selected(page)).toHaveCount(2);
    await page.locator('#outside').focus(); await expect(selected(page)).toHaveCount(2); expect(await page.evaluate(() => window.activations.length)).toBe(2); expect(await page.evaluate(() => window.selections.length)).toBe(2);
    expect(await page.evaluate(() => window.chart.getState())).toEqual({ hiddenSeriesIds: [] }); const strokes = await selected(page).evaluateAll(elements => elements.map(element => element.getAttribute('stroke-dasharray'))); expect(strokes.every(value => value?.trim().split(/[,\s]+/).join(',') === '3,2')).toBe(true);
  });
  test(family + ' controlled rejection leaves SVG and owner unchanged, acceptance does not echo', async ({ page }) => {
    await mount(page, family, { mode: 'controlled', kind: 'single', value: [] }); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
    const proposal = await page.evaluate(() => window.selections[0]); expect(proposal).toMatchObject({ effect: 'proposal', source: 'keyboard', selection: [{ seriesId: 'actual', pointId: 'first' }] }); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); await expect(selected(page)).toHaveCount(0); await expect(grid.locator('[role="gridcell"]')).toHaveAttribute('aria-selected', 'false');
    const update = await page.evaluate(() => { window.spec = { ...window.spec, selection: { ...window.spec.selection, value: window.selections[0].selection }, series: window.spec.series.map(series => ({ ...series, data: series.data.map(point => ({ ...point })) })) }; return window.chart.update(window.spec); }); expect(update.status).toBe('ok'); await ready(page);
    await expect(selected(page)).toHaveCount(1); expect(await page.evaluate(() => window.selections.length)).toBe(1); expect(await page.evaluate(() => window.chart.getSelection())).toEqual(proposal.selection);
    const invalid = await page.evaluate(() => window.chart.update({ ...window.spec, selection: { ...window.spec.selection, value: [{ seriesId: 'actual', pointId: 'missing' }] } })); expect(invalid.status).toBe('invalid'); await expect(selected(page)).toHaveCount(1); expect(await page.evaluate(() => window.chart.getSelection())).toEqual(proposal.selection);
  });
  test(family + ' hiding retains a real selected ID without stale geometry; removal prunes once', async ({ page }) => {
    await mount(page, family, { mode: 'internal', kind: 'single', initial: [{ seriesId: 'actual', pointId: 'first' }] }); await expect(selected(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Actual', exact: true }).click(); await ready(page); await expect(selected(page)).toHaveCount(0); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([{ seriesId: 'actual', pointId: 'first' }]);
    await page.getByRole('button', { name: 'Actual', exact: true }).click(); await ready(page); await expect(selected(page)).toHaveCount(1);
    const update = await page.evaluate(() => window.chart.update({ ...window.spec, series: window.spec.series.map(series => ({ ...series, data: series.data.filter(point => series.id !== 'actual' || point.id !== 'first') })) })); expect(update.status).toBe('ok'); await ready(page); await expect(selected(page)).toHaveCount(0); expect(await page.evaluate(() => window.chart.getSelection())).toEqual([]); expect(await page.evaluate(() => window.selections)).toMatchObject([{ effect: 'accepted', source: 'update', selection: [] }]);
  });
  test(family + ' crosshair follows the current scaled observation and export excludes transient focus', async ({ page }) => {
    await mount(page, family, { mode: 'internal', initial: [{ seriesId: 'actual', pointId: 'first' }] }); const grid = page.locator('[data-nc-grid]'); await grid.focus();
    const horizontal = family === 'bar' || family === 'stacked-bar', coordinate = horizontal ? 'y1' : 'x1', crosshairs = page.locator('[data-nc-layer="interaction"] line[stroke-dasharray="3 3"]'); await expect(crosshairs).toHaveCount(2); const oldPosition = await crosshairs.first().getAttribute(coordinate); await grid.press('ArrowRight');
    await expect.poll(() => crosshairs.first().getAttribute(coordinate)).not.toBe(oldPosition);
    const mapping = await page.evaluate(() => { const group = [...document.querySelectorAll('[data-nc-layer="interaction"]')].find(group => group.querySelector('circle[r="4"],rect[stroke]:not([stroke-dasharray])')), ring = group.querySelector('circle[r="4"],rect[stroke]:not([stroke-dasharray])'), lines = [...group.querySelectorAll('line[stroke-dasharray="3 3"]')], horizontal = window.spec.orientation === 'horizontal', rect = ring.localName === 'rect'; const x = Number(ring.getAttribute(rect ? 'x' : 'cx')), y = Number(ring.getAttribute(rect ? 'y' : 'cy')), w = Number(ring.getAttribute('width')), h = Number(ring.getAttribute('height')); return { category: horizontal ? y + h / 2 : rect ? x + w / 2 : x, value: horizontal ? x : y, crossCategory: Number(lines[0].getAttribute(horizontal ? 'y1' : 'x1')), crossValue: Number(lines[1].getAttribute(horizontal ? 'x1' : 'y1')) }; }); expect(mapping.category).toBe(mapping.crossCategory); expect(mapping.value).toBe(mapping.crossValue);
    const result = await page.evaluate(() => { const output = window.NCExport.exportSvg(window.chart); if (output.status !== 'ok') return output; const svg = new DOMParser().parseFromString(output.value.svg, 'image/svg+xml'), dashed = [...svg.querySelectorAll('[stroke-dasharray]')].filter(element => element.getAttribute('stroke-dasharray')?.trim().split(/[,\s]+/).join(',') === '3,2'); return { selected: dashed.length, crosshairs: [...svg.querySelectorAll('line')].filter(element => element.getAttribute('stroke-dasharray')?.trim().split(/[,\s]+/).join(',') === '3,3').length }; }); expect(result).toEqual({ selected: 1, crosshairs: 0 });
  });
}
