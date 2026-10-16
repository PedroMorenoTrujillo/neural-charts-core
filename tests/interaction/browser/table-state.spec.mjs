import { test as base, expect } from '@playwright/test';
import { mount, ready, coreFamily, familyFixture, captureCoverage } from './helpers.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const directory = 'artifacts/v1-table-state';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => { await use(); await captureCoverage(page, info, 'table', directory); }, { auto: true }] });

const families = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter'];
const identity = family => family === 'pie' || family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
async function open(page) { await page.getByRole('button', { name: 'View data table', exact: true }).click(); }

for (const family of families) test(family + ' live table derives selection without replacing focus or geometry', async ({ page }) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' });
  await open(page);
  await expect(page.getByRole('columnheader', { name: 'Selected', exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    window.tableNode = document.querySelector('#host table'); window.focusNode = document.activeElement;
    window.markNode = document.querySelector('[data-nc-layer="marks"]'); return window.chart.getSnapshot().committedRevision;
  });
  expect((await page.evaluate(id => window.chart.requestSelection([id]), identity(family))).status).toBe('ok');
  await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('true');
  if (!['pie', 'donut', 'scatter'].includes(family)) await expect(page.locator('#host tbody tr').nth(3).locator('td').last()).toHaveText('false');
  expect(await page.evaluate(() => ({ table: window.tableNode === document.querySelector('#host table'), focus: window.focusNode === document.activeElement, marks: window.markNode === document.querySelector('[data-nc-layer="marks"]'), revision: window.chart.getSnapshot().committedRevision }))).toEqual({ table: true, focus: true, marks: true, revision: before });
  expect((await page.evaluate(() => window.chart.requestSelection([]))).status).toBe('ok');
  await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('false');
  expect(await page.evaluate(() => window.selections.length)).toBe(2);
});

for (const family of ['line', 'column', 'pie', 'scatter']) test(family + ' failed table cell write faults and cleans up without selection output', async ({ page }) => {
  await mount(page, family); await open(page);
  const result = await page.evaluate(id => {
    const cell = document.querySelector('#host tbody tr').lastElementChild;
    Object.defineProperty(cell, 'textContent', { configurable: true, set() { throw Error('Simulated owned table write failure'); } });
    const result = window.chart.requestSelection([id]), snapshot = window.chart.getSnapshot(); window.chart.destroy(); window.chart.destroy();
    return { result, snapshot, events: window.selections, diagnostics: window.diagnostics, roots: document.querySelectorAll('[data-nc-root]').length };
  }, identity(family));
  expect(result.result.diagnostic.reason).toBe('DOM_WRITE_FAILED'); expect(result.snapshot.phase).toBe('faulted'); expect(result.events).toEqual([]); expect(result.diagnostics).toHaveLength(1); expect(result.roots).toBe(0);
});

test('110 table-selection create/destroy cycles release cells, raw records and owners', async ({ page }, info) => {
  await mount(page, 'line'); await page.evaluate(() => window.chart.destroy());
  await page.evaluate('globalThis.tableResourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async cases => {
    const groups = [], references = [], handles = [];
    for (const { family, spec, name } of cases) {
      const result = await window.tableResourceProbe({ factoryPath: 'NCExport.' + name, template: spec, cycles: 10, datumPath: family === 'pie' || family === 'donut' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise(chart) {
        const id = spec.family === 'pie' || spec.family === 'donut' ? { pointId: 'first' } : { seriesId: 'actual', pointId: 'first' };
        const cell = document.querySelector('#host tbody tr').lastElementChild;
        window.__ncResourceReferences.push(new WeakRef(cell));
        if (chart.requestSelection([id]).status !== 'ok' || cell.textContent !== 'true') throw Error('Live table selection not applied');
      } });
      groups.push({ family, result }); references.push(...window.__ncResourceReferences); handles.push(...window.__ncRetainedControllers);
    }
    window.tableReferences = references; window.tableHandles = handles;
    return { cycles: groups.reduce((sum, item) => sum + item.result.cycles.length, 0), groups, roots: document.querySelectorAll('[data-nc-root]').length };
  }, families.map(family => { const name = coreFamily(family); return { family, name: 'create' + name[0].toUpperCase() + name.slice(1) + 'Chart', spec: familyFixture(family, { mode: 'internal', kind: 'multiple' }) }; }));
  expect(report.cycles).toBe(110); expect(report.roots).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.tableReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/resources-' + info.project.name + '.json', JSON.stringify(report, null, 2));
});

for (const family of families) for (const width of [320, 768]) test(family + ' @visual accessible selected table/' + width, async ({ page }, info) => {
  await page.setViewportSize({ width: width + 32, height: 650 });
  await mount(page, family, { mode: 'internal', initial: [identity(family)] }, { theme: width === 320 ? 'dark' : 'light', direction: width === 320 ? 'rtl' : 'ltr' });
  await page.evaluate(width => { document.querySelector('#host').style.width = width + 'px'; }, width); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(width); await ready(page); await open(page);
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' }); expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([]);
  await page.evaluate(() => document.fonts.ready); const file = `${family}-${width}-${info.project.name}.png`; fs.mkdirSync(directory + '/visual', { recursive: true });
  if (width === 320) {
    const pane = page.locator('[data-nc-table]');
    await expect(pane).toHaveAttribute('tabindex', '0'); await expect(pane).toHaveAttribute('role', 'region');
    expect(await pane.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.locator('#host tbody tr').first().locator('th,td').first().evaluate(cell => { const range = document.createRange(); range.selectNodeContents(cell); return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size; })).toBe(1);
    await pane.focus(); await pane.press('ArrowLeft'); await expect.poll(() => pane.evaluate(element => Math.abs(element.scrollLeft))).toBeGreaterThan(0);
    expect(await pane.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    const offset = await pane.evaluate(element => Math.abs(element.scrollLeft)); await pane.press('ArrowRight'); await expect.poll(() => pane.evaluate(element => Math.abs(element.scrollLeft))).toBeLessThan(offset);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pane.evaluate(element => { element.scrollLeft = 0; });
  }
  const png = await page.locator('#host').screenshot({ path: directory + '/visual/' + file, animations: 'disabled' });
  fs.writeFileSync(directory + '/visual/' + file.replace('.png', '.json'), JSON.stringify({ file, family, width, height: 400, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), browser: info.project.name, theme: width === 320 ? 'dark' : 'light', direction: width === 320 ? 'rtl' : 'ltr', state: 'selected-table', sha256: createHash('sha256').update(png).digest('hex'), baseline: 'NEW TABLE STATE; HUMAN REVIEW PENDING' }, null, 2));
});

test('LTR table scroll keys preserve domain selection and stay inside the owned pane', async ({ page }) => {
  await page.setViewportSize({ width: 352, height: 650 }); await mount(page, 'scatter');
  await page.evaluate(() => { document.querySelector('#host').style.width = '320px'; }); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(320); await ready(page); await open(page);
  const pane = page.locator('[data-nc-table]'); await pane.focus(); await pane.press('ArrowRight'); await expect.poll(() => pane.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const offset = await pane.evaluate(element => element.scrollLeft); await pane.press('ArrowLeft'); await expect.poll(() => pane.evaluate(element => element.scrollLeft)).toBeLessThan(offset);
  expect(await page.evaluate(() => ({ events: window.selections, selection: window.chart.getSelection() }))).toEqual({ events: [], selection: [] });
  await pane.press('Escape'); await expect(pane).toBeHidden(); await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
});

for (const family of families) test(family + ' controlled table keeps rejected proposals and applies accepted raw identities', async ({ page }) => {
  await mount(page, family, { mode: 'controlled', kind: 'multiple', value: [] }); await open(page);
  expect((await page.evaluate(id => window.chart.requestSelection([id]), identity(family))).status).toBe('ok');
  await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('false');
  expect(await page.evaluate(() => window.selections.map(event => event.effect))).toEqual(['proposal']);
  expect((await page.evaluate(id => { window.spec = { ...window.spec, selection: { mode: 'controlled', kind: 'multiple', value: [id] } }; return window.chart.update(window.spec); }, identity(family))).status).toBe('ok'); await ready(page);
  await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('true');
  expect(await page.evaluate(() => window.selections.length)).toBe(1);
  expect((await page.evaluate(() => { window.spec = { ...window.spec, selection: false }; return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page);
  await expect(page.getByRole('columnheader', { name: 'Selected', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-nc-table]')).not.toHaveAttribute('tabindex', '0');
  await expect(page.locator('[data-nc-table]')).not.toHaveAttribute('role', 'region');
});

for (const family of ['line', 'column', 'stacked-column', 'scatter', 'pie']) test(family + ' table keeps zero, missing, hidden and rebuilt identity distinct', async ({ page }) => {
  await mount(page, family, { mode: 'internal', kind: 'multiple' });
  const radial = family === 'pie', zero = radial ? { pointId: 'zero' } : { seriesId: 'actual', pointId: 'zero' };
  expect((await page.evaluate(id => window.chart.requestSelection([id]), zero)).status).toBe('ok');
  expect((await page.evaluate(() => { window.spec = structuredClone(window.spec); return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page);
  await page.getByRole('button', { name: radial ? 'Zero' : 'Actual', exact: true }).click(); await ready(page);
  await open(page);
  const values = await page.locator('#host tbody tr').allTextContents(), zeroRow = radial || family === 'scatter' ? 2 : 1;
  expect(values[zeroRow]).toContain('true'); expect(values[zeroRow]).toContain('hidden'); expect(values.at(-1)).toContain('false');
  if (!radial && family !== 'scatter') { expect(values[3]).toContain('false'); expect(values[0]).toContain('false'); }
  expect((await page.evaluate(radial => window.chart.requestSelection([radial ? { pointId: 'missing' } : { seriesId: 'actual', pointId: 'missing' }]), radial)).status).toBe('invalid');
  await expect(page.locator('#host tbody tr').nth(zeroRow).locator('td').last()).toHaveText('true');
});

test('pagination updates at most visible rows, preserves page controls and raw duplicate IDs', async ({ page }) => {
  const data = Array.from({ length: 205 }, (_, i) => ({ id: 'p' + i, x: i, y: i % 2 ? -i : i }));
  await mount(page, 'scatter', { mode: 'internal', kind: 'multiple' }, { series: [{ id: 'actual', name: 'Duplicate', data }, { id: 'other', name: 'Duplicate', data }] });
  await open(page); const next = page.getByRole('button', { name: 'Next page', exact: true }); await next.click();
  await expect(page.locator('#host tbody tr')).toHaveCount(100);
  const before = await page.evaluate(() => { window.pageTable = document.querySelector('#host table'); window.pageFocus = document.activeElement; let writes = 0; window.tableObserver = new MutationObserver(records => { writes += records.length; window.tableWrites = writes; }); window.tableObserver.observe(window.pageTable, { subtree: true, childList: true, characterData: true }); return window.chart.getSnapshot().committedRevision; });
  expect((await page.evaluate(() => window.chart.requestSelection([{ seriesId: 'actual', pointId: 'p100' }, { seriesId: 'other', pointId: 'p100' }, { seriesId: 'actual', pointId: 'p200' }]))).status).toBe('ok');
  await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('true');
  expect(await page.evaluate(() => ({ table: window.pageTable === document.querySelector('#host table'), focus: window.pageFocus === document.activeElement, writes: window.tableWrites, revision: window.chart.getSnapshot().committedRevision }))).toEqual({ table: true, focus: true, writes: 1, revision: before });
  await next.click(); await expect(page.locator('#host tbody tr').first().locator('td').last()).toHaveText('true');
  expect(await page.locator('#host tbody tr').evaluateAll(rows => rows.filter(row => row.lastElementChild.textContent === 'true').length)).toBe(1);
  await next.click(); await expect(page.locator('#host tbody tr').nth(5).locator('td').last()).toHaveText('true');
  await page.evaluate(() => window.tableObserver.disconnect());
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' }); expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([]);
});
