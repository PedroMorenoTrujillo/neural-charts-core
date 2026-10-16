import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { waitForLineDetail } from '../../../../../tooling/line-detail-wait.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';

const directory = 'artifacts/v1-radial';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use(); if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__);
  if (value) { const destination = path.resolve(directory, 'browser-coverage'); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, info.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(value)); }
}, { auto: true }] });
function specimen(family) {
  return { family, title: 'Allocation', description: 'Original observations and visible shares', theme: 'light',
    data: [{ id: 'a', label: 'January', value: 2, datum: { sku: 'a' } }, { id: 'b', label: 'January', value: 3, datum: { sku: 'b' } },
      { id: 'c', label: 'March', value: 5, datum: { sku: 'c' } }, { id: 'z', label: 'Zero', value: 0 }, { id: 'm', label: 'Missing', value: null }] };
}
async function mount(page, family, overrides = {}, width = 768) {
  await page.setViewportSize({ width: Math.max(width, 320), height: 800 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Radial acceptance</title><style>body{margin:0}h1{font:600 16px system-ui;margin:8px 0}</style></head><body><main><h1>Chart acceptance</h1><div id="host" style="width:${width}px;height:400px"></div><button id="outside">Outside chart</button></main></body></html>`);
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
  const result = await page.evaluate(spec => {
    window.radialSpec = spec; window.radialEvents = []; window.radialStates = []; window.radialDiagnostics = [];
    const factory = spec.family === 'pie' ? window.NCRadial.createPieChart : window.NCRadial.createDonutChart;
    const result = factory(document.querySelector('#host'), spec, { instanceId: 'radial-test', onPointActivate: event => window.radialEvents.push(event), onStateChange: event => window.radialStates.push(event), onDiagnostic: event => window.radialDiagnostics.push(event) });
    if (result.status === 'ok') window.radialChart = result.value;
    return result.status === 'ok' ? 'ok' : result;
  }, { ...specimen(family), ...overrides });
  expect(result).toBe('ok'); await ready(page);
}
async function ready(page) {
  await expect.poll(() => page.evaluate(() => { const s = window.radialChart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision && s.committedRevision > 0; })).toBe(true);
}
async function detail(page, id, header) {
  return page.evaluate(async ({ source, id, header }) => {
    const wait = (0, eval)('(' + source + ')'); return wait(window.radialChart, document.querySelector('#host'), { revision: window.radialChart.getSnapshot().committedRevision, seriesId: 'slices', pointId: id, header });
  }, { source: waitForLineDetail.toString(), id, header });
}
async function interior(page, index = 0) {
  return page.locator('[data-nc-layer="marks"] path').nth(index).evaluate(element => {
    const box = element.getBBox(), matrix = element.getScreenCTM();
    // Native SVG fill test, independent of the implementation's angular hit calculation.
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
      const point = new DOMPoint(box.x + box.width * x / 20, box.y + box.height * y / 20);
      // Firefox/WebKit quantize native pointer coordinates. Require a 3px
      // interior clearance rather than selecting the first radial boundary.
      if ([-3, 0, 3].every(dx => [-3, 0, 3].every(dy => element.isPointInFill(new DOMPoint(point.x + dx, point.y + dy))))) { const screen = point.matrixTransform(matrix); return { x: screen.x, y: screen.y }; }
    }
    throw Error('No interior sample in SVG mark');
  });
}
async function fixtureDetailOverlaps(page, index) {
  return page.evaluate(index => {
    const paths = [...document.querySelectorAll('[data-nc-layer="marks"] path')], boxes = paths.map(path => path.getBBox());
    const left = Math.min(...boxes.map(box => box.x)), right = Math.max(...boxes.map(box => box.x + box.width)), top = Math.min(...boxes.map(box => box.y)), bottom = Math.max(...boxes.map(box => box.y + box.height));
    // Independently calculated midpoints for the fixed 20% / 30% / 50% fixture.
    const angle = [.1, .35, .75][index] * Math.PI * 2, radius = (right - left) / 2 * (window.radialSpec.family === 'pie' ? .5 : .8);
    const point = new DOMPoint((left + right) / 2 + radius * Math.sin(angle), (top + bottom) / 2 - radius * Math.cos(angle)).matrixTransform(paths[0].getScreenCTM());
    return [...document.querySelectorAll('[data-nc-detail],[data-nc-tooltip]')].filter(element => !element.hidden && getComputedStyle(element).visibility === 'visible' && element.getBoundingClientRect().width > 0).map(element => { const box = element.getBoundingClientRect(); return { kind: element.hasAttribute('data-nc-tooltip') ? 'floating' : 'docked', overlap: point.x + 6 > box.left && point.x - 6 < box.right && point.y + 6 > box.top && point.y - 6 < box.bottom }; });
  }, index);
}

for (const family of ['pie', 'donut']) {
  test(family + ': native SVG hit and original identity/percentage exactly once', async ({ page }) => {
    await mount(page, family); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const point = await interior(page, i); await page.mouse.click(point.x, point.y);
      expect(await page.evaluate(() => window.radialEvents.length)).toBe(i + 1);
      const event = await page.evaluate(() => window.radialEvents.at(-1));
      if (event.point.id !== ['a', 'b', 'c'][i]) {
        const evidence = await page.locator('[data-nc-layer="marks"] path').evaluateAll((elements, point) => elements.map(element => {
          const matrix = element.getScreenCTM(), local = new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
          return { d: element.getAttribute('d'), local: { x: local.x, y: local.y }, contains: element.isPointInFill(local), box: element.getBoundingClientRect().toJSON() };
        }), point);
        fs.writeFileSync(`${directory}/hit-failure-${family}-${test.info().project.name}.json`, JSON.stringify({ point, event, evidence }, null, 2));
      }
      expect(event.point.id).toBe(['a', 'b', 'c'][i]); expect(event.point.datum.sku).toBe(event.point.id); expect(event.source).toBe('pointer');
      expect(event.percentage).toBeCloseTo([20, 30, 50][i], 12);
    }
    expect(await page.evaluate(() => window.radialDiagnostics)).toEqual([]);
  });
  test(family + ': logical keyboard order includes zero, skips missing and survives reconstructed data', async ({ page }) => {
    await mount(page, family); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await detail(page, 'a', 'January (a)');
    for (const [id, header] of [['b', 'January (b)'], ['c', 'March'], ['z', 'Zero']]) { await grid.press('ArrowRight'); await detail(page, id, header); }
    await grid.press('Enter'); expect(await page.evaluate(() => window.radialEvents.at(-1).point.id)).toBe('z'); expect(await page.evaluate(() => window.radialEvents.at(-1).percentage)).toBe(0);
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, theme: 'dark', data: window.radialSpec.data.map(point => ({ ...point })) })); await ready(page); await detail(page, 'z', 'Zero');
    await expect(grid).toBeFocused(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.radialEvents.at(-1).point.id)).toBe('a');
  });
  test(family + ': raw accessible slice table, duplicate labels and return focus', async ({ page }) => {
    await mount(page, family); await page.getByRole('button', { name: 'View data table', exact: true }).click();
    const table = page.getByRole('table');
    expect(await table.locator('thead th').allTextContents()).toEqual(['Slice', 'Value', 'Visible share', 'Visibility']);
    const rows = await table.locator('tbody tr').allTextContents();
    expect(rows).toHaveLength(5); expect(rows[0]).toContain('January (a)'); expect(rows[0]).toContain('20%'); expect(rows[3]).toContain('Zero'); expect(rows[3]).toContain('0%'); expect(rows[4]).toContain('Missing');
    await page.getByRole('button', { name: 'Close data table', exact: true }).click(); await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
  });
  test(family + ': independent slice visibility and controlled consumer rejection/acceptance', async ({ page }) => {
    await mount(page, family); await page.getByRole('button', { name: 'January (a)', exact: true }).click(); await ready(page);
    expect(await page.evaluate(() => window.radialChart.getState())).toEqual({ hiddenSliceIds: ['a'] }); expect(await page.evaluate(() => window.radialStates.at(-1).effect)).toBe('accepted');
    await mount(page, family, { state: { mode: 'controlled', value: { hiddenSliceIds: [] } } });
    await page.getByRole('button', { name: 'January (b)', exact: true }).click(); expect(await page.evaluate(() => window.radialStates)).toHaveLength(1);
    expect(await page.evaluate(() => window.radialStates[0].state)).toEqual({ hiddenSliceIds: ['b'] }); expect(await page.evaluate(() => window.radialStates[0].effect)).toBe('proposal');
    expect(await page.evaluate(() => window.radialChart.getState())).toEqual({ hiddenSliceIds: [] });
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, state: { mode: 'controlled', value: window.radialStates[0].state } })); await ready(page);
    expect(await page.evaluate(() => window.radialChart.getState())).toEqual({ hiddenSliceIds: ['b'] }); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(2);
  });
  test(family + ': invalid update rollback and honest zero/missing/status recovery', async ({ page }) => {
    await mount(page, family);
    const before = await page.evaluate(() => ({ snapshot: window.radialChart.getSnapshot(), svg: document.querySelector('[data-nc-layer="marks"]').outerHTML }));
    const result = await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, data: [{ id: 'bad', label: 'Bad', value: -1 }] })); expect(result.status).toBe('invalid');
    expect(await page.evaluate(() => ({ snapshot: window.radialChart.getSnapshot(), svg: document.querySelector('[data-nc-layer="marks"]').outerHTML }))).toEqual(before);
    for (const value of [0, null]) {
      await page.evaluate(value => window.radialChart.update({ ...window.radialSpec, data: [{ id: 'empty', label: 'Empty', value }] }), value); await ready(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
      expect(await page.evaluate(() => window.radialChart.getSnapshot().view)).toBe('empty');
    }
    for (const kind of ['loading', 'error', 'empty']) {
      await page.evaluate(kind => window.radialChart.update({ ...window.radialSpec, status: kind === 'error' ? { kind, message: 'Data unavailable' } : { kind } }), kind); await ready(page);
      expect(await page.evaluate(() => window.radialChart.getSnapshot().view)).toBe(kind); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
    }
    await page.evaluate(() => window.radialChart.update(window.radialSpec)); await ready(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(3);
  });
  test(family + ': @a11y light/dark RTL keyboard and data table', async ({ page }, info) => {
    await mount(page, family); await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const results = [];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') { await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, theme: 'dark', direction: 'rtl' })); await ready(page); }
      const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await detail(page, 'a', 'January (a)');
      const context = page.locator('[data-nc-tooltip-context]:visible'); await expect(context).toHaveAttribute('dir', 'auto'); await expect(context).toHaveCSS('direction', 'ltr');
      await expect(page.locator('[data-nc-tooltip-value]:visible')).toHaveAttribute('dir', 'ltr');
      if (theme === 'dark') {
        const order = await context.evaluate(element => { const text = element.firstChild, percent = document.createRange(), word = document.createRange(); percent.setStart(text, 0); percent.setEnd(text, 3); word.setStart(text, 4); word.setEnd(text, 6); return { percent: percent.getBoundingClientRect().toJSON(), word: word.getBoundingClientRect().toJSON() }; });
        expect(order.percent.right).toBeLessThanOrEqual(order.word.left + .5); expect(order.percent.top).toBe(order.word.top);
        const name = page.locator('[data-nc-tooltip-row]:visible').locator('span').nth(1); await expect(name).toHaveAttribute('dir', 'auto');
        const punctuation = await name.evaluate(element => { const text = element.firstChild, word = document.createRange(), colon = document.createRange(); word.setStart(text, 0); word.setEnd(text, 5); colon.setStart(text, 5); colon.setEnd(text, 6); return { word: word.getBoundingClientRect().toJSON(), colon: colon.getBoundingClientRect().toJSON() }; });
        // Native Range bounds can overlap at a shared glyph boundary. The
        // intended assertion is visual order, not a font-kerning constraint.
        expect(punctuation.word.x + punctuation.word.width / 2).toBeLessThan(punctuation.colon.x + punctuation.colon.width / 2);
      }
      for (const state of ['focus', 'table']) {
        if (state === 'table') await page.getByRole('button', { name: 'View data table', exact: true }).click();
        const result = await page.evaluate(async () => { const { violations, passes } = await window.axe.run(); return { violations, passes: passes.length }; });
        results.push({ theme, state, ...result }); expect(result.violations).toEqual([]);
      }
      await page.getByRole('button', { name: 'Close data table', exact: true }).click();
    }
    fs.writeFileSync(`${directory}/axe-${family}-${info.project.name}.json`, JSON.stringify(results, null, 2));
  });
  test(family + ': one full-turn sector has no artificial radial separator and donut hole is not selectable', async ({ page }) => {
    await mount(page, family, { data: [{ id: 'one', label: 'Only', value: 10 }] });
    const mark = page.locator('[data-nc-layer="marks"] path'); await expect(mark).toHaveCount(1); const d = await mark.getAttribute('d');
    expect(d).not.toMatch(/L/); expect(d.match(/A/g)).toHaveLength(family === 'pie' ? 2 : 4);
    const center = await mark.evaluate(element => { const b = element.getBBox(); const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(element.getScreenCTM()); return { x: p.x, y: p.y }; });
    await page.mouse.click(center.x, center.y); expect(await page.evaluate(() => window.radialEvents.length)).toBe(family === 'pie' ? 1 : 0);
  });
  test(family + ': visibility-empty, focus reconciliation, zero-size suspension and recovery', async ({ page }) => {
    await mount(page, family); const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await detail(page, 'z', 'Zero');
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, data: window.radialSpec.data.filter(point => point.id !== 'z') })); await ready(page); await detail(page, 'c', 'March');
    for (const name of ['January (a)', 'January (b)', 'March', 'Missing']) { await page.getByRole('button', { name, exact: true }).click(); await ready(page); }
    expect(await page.evaluate(() => window.radialChart.getSnapshot().view)).toBe('no-visible-slices'); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
    await page.getByRole('button', { name: 'March', exact: true }).click(); await ready(page); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1);
    await page.locator('#host').evaluate(element => { element.style.width = '0px'; }); await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().phase)).toBe('suspended');
    await page.locator('#host').evaluate(element => { element.style.width = '375px'; }); await ready(page); await grid.focus(); await grid.press('Home'); await grid.press('Enter'); expect(await page.evaluate(() => window.radialEvents.at(-1).point.id)).toBe('c');
  });
  test(family + ': 1000 slices retain original data, cap labels and paginate the accessible table', async ({ page }) => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: 'p' + i, label: 'Observation ' + i, value: i % 17 + 1, datum: { index: i } }));
    await mount(page, family, { data, legend: { position: 'none' } }); await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(1000);
    expect(await page.locator('[data-nc-layer="labels"] text').count()).toBeLessThanOrEqual(200);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('Enter');
    expect(await page.evaluate(() => window.radialEvents.at(-1).point.datum.index)).toBe(999);
    const description = await page.evaluate(() => (window.radialSpec.family === 'pie' ? window.NCRadial.describePie : window.NCRadial.describeDonut)(window.radialSpec)); expect(description.status).toBe('ok'); expect(description.value.table.rows).toHaveLength(1000);
    await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(100);
    expect(await page.locator('[data-nc-layer="marks"] path').evaluateAll(paths => paths.every(path => !/NaN|Infinity/.test(path.getAttribute('d'))))).toBe(true);
  });
  test(family + ': native touch at mobile width selects once and preserves the selected focus anchor outside the dock', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true, deviceScaleFactor: 1 }); const page = await context.newPage();
    try {
      await mount(page, family, { direction: 'rtl', theme: 'dark' }, 375); await page.evaluate(() => { document.body.style.transform = 'translate(0)'; }); const point = await interior(page, 1); await page.touchscreen.tap(point.x, point.y);
      expect(await page.evaluate(() => window.radialEvents)).toHaveLength(1); expect(await page.evaluate(() => window.radialEvents[0].point.id)).toBe('b'); expect(await page.evaluate(() => window.radialEvents[0].source)).toBe('touch');
      const placement = await detail(page, 'b', 'January (b)'); expect(placement.placement).toBe('docked');
      await expect(page.locator('[data-nc-layer="interaction"] path')).toHaveCount(1);
      const overlaps = await fixtureDetailOverlaps(page, 1); expect(overlaps.length).toBeGreaterThan(0); expect(overlaps.every(item => !item.overlap)).toBe(true);
      await page.locator('#outside').tap(); expect(await page.evaluate(() => window.radialEvents)).toHaveLength(1);
      for (const [index, id, header, count] of [[0, 'a', 'January (a)', 2], [2, 'c', 'March', 3]]) {
        const point = await interior(page, index); await page.touchscreen.tap(point.x, point.y);
        expect(await page.evaluate(() => window.radialEvents)).toHaveLength(count); expect(await page.evaluate(() => window.radialEvents.at(-1).point.id)).toBe(id);
        expect((await detail(page, id, header)).placement).toBe('docked');
        const edge = await fixtureDetailOverlaps(page, index); expect(edge.length).toBeGreaterThan(0); expect(edge.every(item => !item.overlap)).toBe(true);
      }
    } finally { await context.close(); }
  });
  test(family + ': 100 retained-controller cycles release resources and raw data', async ({ page }, info) => {
    await mount(page, family); await page.evaluate(() => window.radialChart.destroy()); await page.evaluate('globalThis.probeRadialResources=' + probeChartResources.toString());
    const result = await page.evaluate(({ template, family }) => window.probeRadialResources({ factoryPath: family === 'pie' ? 'NCRadial.createPieChart' : 'NCRadial.createDonutChart', template, datumPath: ['data', 0, 'datum'] }), { template: specimen(family), family });
    expect(result.cycles).toHaveLength(100);
    let collection = { status: 'NOT_AVAILABLE', reason: 'Forced GC only available through Chromium CDP; portable resources checked in every engine.' };
    if (info.project.name === 'chromium') { const session = await page.context().newCDPSession(page); await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage'); const alive = await page.evaluate(() => window.__ncResourceReferences.filter(reference => reference.deref()).length); expect(alive).toBe(0); collection = { status: 'PASS', collectibleReferences: 300, retainedControllers: 100, alive }; await session.detach(); }
    fs.writeFileSync(`${directory}/resources-${family}-${info.project.name}.json`, JSON.stringify({ ...result, collection }, null, 2));
  });
  test(family + ': overflow/underflow ratios remain honest and tooltip-off keeps accessible data', async ({ page }) => {
    await mount(page, family, { data: [{ id: 'large', label: 'Large', value: Number.MAX_VALUE }, { id: 'tiny', label: 'Tiny', value: Number.MIN_VALUE }, { id: 'other', label: 'Other', value: Number.MAX_VALUE }], tooltip: { mode: 'off' } });
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('Enter');
    expect(await page.evaluate(() => window.radialEvents.at(-1).point.id)).toBe('tiny'); expect(await page.evaluate(() => window.radialEvents.at(-1).percentage)).toBe(null);
    await expect(grid).toHaveAccessibleDescription(/<0.000001%/);
    await expect(page.locator('[data-nc-tooltip]:visible,[data-nc-detail]:visible')).toHaveCount(0);
    const result = await page.evaluate(() => (window.radialSpec.family === 'pie' ? window.NCRadial.describePie : window.NCRadial.describeDonut)(window.radialSpec)); expect(result.value.totalOverflow).toBe(true); expect(result.value.total).toBe(null);
    expect(await page.locator('[data-nc-layer="marks"] path').evaluateAll(paths => paths.every(path => !/NaN|Infinity/.test(path.getAttribute('d'))))).toBe(true);
  });
  test(family + ': reentrant destroy, ID reservation and failed mount release ownership', async ({ page }) => {
    await mount(page, family);
    const check = await page.evaluate(() => {
      const factory = window.radialSpec.family === 'pie' ? window.NCRadial.createPieChart : window.NCRadial.createDonutChart, host = document.querySelector('#host');
      const duplicate = factory(host, window.radialSpec, { instanceId: 'radial-test' });
      window.radialChart.destroy();
      const afterDestroy = [window.radialChart.update(window.radialSpec).status, window.radialChart.refresh().status, window.radialChart.getSnapshot().phase];
      const create = document.createElement;
      document.createElement = function(tag, options) { if (tag === 'button') throw Error('Injected owned DOM failure'); return create.call(this, tag, options); };
      let failed; try { failed = factory(host, window.radialSpec, { instanceId: 'radial-test' }); } finally { document.createElement = create; }
      const countAfterFailure = host.childElementCount;
      let reentrant; const result = factory(host, window.radialSpec, { instanceId: 'radial-test', onPointActivate() { reentrant.destroy(); } });
      if (result.status !== 'ok') throw Error(JSON.stringify(result)); reentrant = result.value; window.radialChart = reentrant;
      return { duplicate: duplicate.status, failed: failed.status, countAfterFailure, afterDestroy };
    });
    expect(check).toEqual({ duplicate: 'invalid', failed: 'invalid', countAfterFailure: 0, afterDestroy: ['invalid', 'invalid', 'destroyed'] }); await ready(page);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Enter'); await expect(page.locator('[data-nc-root]')).toHaveCount(0); expect(await page.evaluate(() => window.radialChart.getSnapshot().phase)).toBe('destroyed');
    await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  });
  test(family + ': terminal DOM write failure releases interaction and reports once', async ({ page }) => {
    await mount(page, family); await page.locator('[data-nc-grid]').focus();
    await page.evaluate(() => {
      const title = document.querySelector('#nc-radial-test-title');
      Object.defineProperty(title, 'textContent', { configurable: true, set() { throw Error('Injected platform write failure'); } });
      const result = window.radialChart.update({ ...window.radialSpec, title: 'Pending failure' }); if (result.status !== 'ok') throw Error(JSON.stringify(result));
    });
    await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().phase)).toBe('faulted');
    await expect(page.getByRole('region', { name: 'Chart unavailable', exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.radialDiagnostics.length)).toBe(1);
    expect(await page.evaluate(() => [window.radialChart.refresh().diagnostic.reason, window.radialChart.update(window.radialSpec).diagnostic.reason])).toEqual(['FAULTED', 'FAULTED']);
    await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0); await page.evaluate(() => window.radialChart.destroy()); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  });
  test(family + ': invalid mount ownership, state-mode changes and detached hosts fail without side effects', async ({ page }) => {
    await mount(page, family);
    const result = await page.evaluate(() => {
      const factory = window.radialSpec.family === 'pie' ? window.NCRadial.createPieChart : window.NCRadial.createDonutChart, host = document.querySelector('#host'), controlled = { ...window.radialSpec, state: { mode: 'controlled', value: { hiddenSliceIds: [] } } };
      const invalid = [factory(host, { ...window.radialSpec, family: 'invalid' }, { instanceId: 'invalid' }), factory(host, window.radialSpec, { instanceId: '' }), factory(host, controlled, { instanceId: 'invalid' }), factory(host, controlled, { instanceId: 'invalid', initialState: { hiddenSliceIds: [] }, onStateChange() {} }), factory(document.createElement('div'), window.radialSpec, { instanceId: 'detached' }), factory(null, window.radialSpec, { instanceId: 'null' })];
      const mode = window.radialChart.update(controlled), children = host.querySelectorAll('[data-nc-root]').length;
      return { statuses: invalid.map(result => result.status), mode: mode.status === 'invalid' ? mode.diagnostic.reason : mode.status, children };
    });
    expect(result).toEqual({ statuses: Array(6).fill('invalid'), mode: 'STATE_MODE_CHANGE', children: 1 });
  });
  test(family + ': auto theme, font invalidation and closed detail do not retain stale geometry', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' }); await mount(page, family, { theme: 'auto', legend: { position: 'end' } });
    const before = await page.locator('[data-nc-layer="marks"] path').first().getAttribute('fill');
    await page.emulateMedia({ colorScheme: 'dark' }); await expect.poll(() => page.locator('[data-nc-layer="marks"] path').first().getAttribute('fill')).not.toBe(before); await ready(page);
    const revision = await page.evaluate(() => window.radialChart.getSnapshot().revision);
    await page.evaluate(() => document.fonts.dispatchEvent(new Event('loadingerror'))); await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().revision)).toBeGreaterThan(revision); await ready(page);
    const point = await interior(page, 0); await page.mouse.move(point.x, point.y); await detail(page, 'a', 'January (a)');
    await page.mouse.move(0, 799); await expect(page.locator('[data-nc-tooltip]:visible,[data-nc-detail]:visible')).toHaveCount(0);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('ArrowLeft'); await grid.press('ArrowUp'); await grid.press('ArrowDown'); await detail(page, 'c', 'March');
    await grid.press('Escape'); await expect(page.locator('[data-nc-tooltip]:visible,[data-nc-detail]:visible')).toHaveCount(0);
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, theme: 'light' })); await ready(page); await expect(page.locator('[data-nc-layer="marks"] path').first()).toHaveAttribute('fill', before);
  });
  test(family + ': table pagination remains correct through data replacement and visibility pruning', async ({ page }) => {
    const data = Array.from({ length: 205 }, (_, i) => ({ id: 'p' + i, label: 'Observation ' + i, value: 1 })); await mount(page, family, { data, legend: { position: 'none' } });
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    const next = page.getByRole('button', { name: 'Next page', exact: true }); await next.click(); await expect(page.getByRole('table').locator('tbody')).toContainText('Observation 100');
    await next.click(); await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await expect(page.getByRole('table').locator('tbody')).toContainText('Observation 100');
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, data: window.radialSpec.data.slice(0, 4) })); await ready(page); await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(4);
    await page.getByRole('button', { name: 'Close data table', exact: true }).click();
    await mount(page, family); await page.getByRole('button', { name: 'January (a)', exact: true }).click(); await ready(page);
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, data: window.radialSpec.data.filter(point => point.id !== 'a') })); await ready(page);
    expect(await page.evaluate(() => window.radialChart.getState().hiddenSliceIds)).toEqual([]); expect(await page.evaluate(() => window.radialStates.at(-1).source)).toBe('update');
  });
  test(family + ': consumer unmount during focus recovery safely disposes the committing frame', async ({ page }) => {
    await mount(page, family); await page.getByRole('button', { name: 'January (a)', exact: true }).focus();
    await page.evaluate(() => {
      document.querySelector('#host').addEventListener('focusin', () => window.radialChart.destroy(), { once: true });
      const result = window.radialChart.update({ ...window.radialSpec, status: { kind: 'loading' } }); if (result.status !== 'ok') throw Error(JSON.stringify(result));
    });
    await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().phase)).toBe('destroyed'); await expect(page.locator('[data-nc-root],[data-nc-tooltip]')).toHaveCount(0);
  });
  test(family + ': loading from focused legend, too-small layout and suspended data updates recover safely', async ({ page }) => {
    await mount(page, family); await page.getByRole('button', { name: 'March', exact: true }).focus();
    await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, status: { kind: 'loading' } })); await ready(page); await expect(page.locator('[data-nc-grid]')).toBeFocused(); await expect(page.locator('[data-nc-grid]')).toHaveAccessibleName('Loading chart data.');
    await page.evaluate(() => window.radialChart.update(window.radialSpec)); await ready(page);
    await page.locator('#host').evaluate(element => { element.style.height = '80px'; }); await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().size.height)).toBe(80); await ready(page);
    await expect(page.locator('[data-nc-root]')).toContainText('too small');
    await page.locator('#host').evaluate(element => { element.style.width = '0px'; }); await expect.poll(() => page.evaluate(() => window.radialChart.getSnapshot().phase)).toBe('suspended');
    expect(await page.evaluate(() => window.radialChart.update({ ...window.radialSpec, title: 'Updated while suspended' }).status)).toBe('ok');
    await page.locator('#host').evaluate(element => { element.style.width = '768px'; element.style.height = '400px'; }); await ready(page); await expect(page.locator('[data-nc-root]')).toContainText('Updated while suspended');
  });
}

async function capture(page, info, family, width, theme, variant, state = 'default') {
  const data = variant === 'long' ? specimen(family).data.map((point, i) => ({ ...point, label: ['Northern Europe enterprise operations', 'Northern Europe enterprise operations', 'Asia Pacific emerging markets', 'Unallocated investment', 'Missing allocation'][i] }))
    : variant === 'dense' ? Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, label: 'Region ' + (i + 1), value: i % 9 + 1 }))
      : variant === 'single' ? [{ id: 'one', label: 'Only', value: 10 }] : specimen(family).data;
  const overrides = { theme, data, direction: state.includes('rtl') ? 'rtl' : 'ltr', ...(variant === 'inside' ? { labels: 'inside' } : {}), ...(variant === 'dense' ? { legend: { position: 'none' } } : {}), ...(['empty', 'loading', 'error'].includes(state) ? { status: state === 'error' ? { kind: state, message: 'Allocation unavailable. Try again later.' } : { kind: state } } : {}) };
  await mount(page, family, overrides, width);
  if (state === 'docked-rtl-focus') await page.evaluate(() => { document.body.style.transform = 'translate(0)'; });
  if (['rtl-focus', 'edge-tooltip', 'docked-rtl-focus'].includes(state)) { const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); const placement = await detail(page, 'b', 'January (b)'); if (state === 'docked-rtl-focus') expect(placement.placement).toBe('docked'); }
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const file = `${family}-${variant}-${state}-${width}x400-${theme}-${info.project.name}`; fs.mkdirSync(`${directory}/visual`, { recursive: true });
  const first = await page.locator('#host').screenshot({ path: `${directory}/visual/${file}.png`, animations: 'disabled' }), second = await page.locator('#host').screenshot({ animations: 'disabled' });
  const hash = createHash('sha256').update(first).digest('hex'); expect(hash).toBe(createHash('sha256').update(second).digest('hex'));
  fs.writeFileSync(`${directory}/visual/${file}.json`, JSON.stringify({ file: file + '.png', family, variant, state, width, height: 400, pixelWidth: first.readUInt32BE(16), pixelHeight: first.readUInt32BE(20), deviceScaleFactor: await page.evaluate(() => devicePixelRatio), theme, direction: overrides.direction, browser: info.project.name, sha256: hash, baseline: 'NEW FAMILY; HUMAN REVIEW PENDING', approval: 'HUMAN REVIEW PENDING' }, null, 2));
}
for (const family of ['pie', 'donut']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) {
  for (const variant of ['basic', 'long', 'dense', 'inside', 'single']) test(family + ': @visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, family, width, theme, variant));
  for (const state of ['rtl-focus', 'edge-tooltip']) test(family + ': @visual ' + state + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, family, width, theme, 'basic', state));
}
for (const family of ['pie', 'donut']) for (const theme of ['light', 'dark']) for (const state of ['empty', 'loading', 'error']) test(family + ': @visual ' + state + '/320/' + theme, async ({ page }, info) => capture(page, info, family, 320, theme, 'basic', state));
for (const family of ['pie', 'donut']) for (const theme of ['light', 'dark']) test(family + ': @visual docked-rtl-focus/320/' + theme, async ({ page }, info) => capture(page, info, family, 320, theme, 'basic', 'docked-rtl-focus'));
for (const family of ['pie', 'donut']) for (const theme of ['light', 'dark']) test(family + ': @cross-visual 768/' + theme, async ({ page }, info) => capture(page, info, family, 768, theme, 'basic'));
