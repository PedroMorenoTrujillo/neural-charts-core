import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { waitForLineDetail } from '../../../../../tooling/line-detail-wait.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';

const directory = 'artifacts/v1-stacked';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use(); if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__);
  if (value) { const destination = path.resolve(directory, 'browser-coverage'); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, info.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(value)); }
}, { auto: true }] });
async function setup(page, width = 768, height = 400) {
  await page.setViewportSize({ width: Math.max(width, 320), height: 800 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Neural Charts acceptance</title><style>body{margin:0}h1{font:600 16px system-ui;margin:8px 0}</style></head><body><main><h1>Chart acceptance</h1><div id="host" style="width:${width}px;height:${height}px"></div><button id="outside">Outside chart</button></main></body></html>`);
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
}

for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) {
  const prefix = orientation + '/' + stacking;
  test(prefix + ': @a11y keyboard, tooltip context and raw table in light/dark/RTL', async ({ page }, info) => {
    await mount(page, orientation, stacking);
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') }); const results = [];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') { await page.evaluate(() => window.stackChart.update({ ...window.stackSpec, theme: 'dark', direction: 'rtl' })); await ready(page); }
      const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+Home'); await grid.press('ArrowDown'); await detail(page, 'p1-0', 's1');
      await expect(grid).toHaveAccessibleDescription(new RegExp(stacking === 'percent' ? '30% of visible total' : 'Positive total: 7'));
      for (const state of ['focus', 'table']) {
        if (state === 'table') await page.getByRole('button', { name: 'View data table', exact: true }).click();
        const result = await page.evaluate(async () => { const { violations, passes } = await window.axe.run(); return { violations, passCount: passes.length }; });
        results.push({ theme, state, ...result }); expect(result.violations).toEqual([]);
      }
      await page.getByRole('button', { name: 'Close data table', exact: true }).click();
    }
    fs.writeFileSync(`${directory}/axe-${orientation}-${stacking}-${info.project.name}.json`, JSON.stringify(results, null, 2));
  });
  test(prefix + ': loading/empty/error/no-visible-series and recovery never invent observations', async ({ page }) => {
    await mount(page, orientation, stacking);
    for (const kind of ['loading', 'empty', 'error']) {
      await page.evaluate(kind => window.stackChart.update({ ...window.stackSpec, status: kind === 'error' ? { kind, message: 'Data unavailable' } : { kind } }), kind); await ready(page);
      expect(await page.evaluate(() => window.stackChart.getSnapshot().view)).toBe(kind); await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(0);
    }
    await page.evaluate(() => window.stackChart.update(window.stackSpec)); await ready(page);
    for (const name of ['North', 'South', 'East']) { await page.getByRole('button', { name, exact: true }).click(); await ready(page); }
    expect(await page.evaluate(() => window.stackChart.getSnapshot().view)).toBe('no-visible-series');
    await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(0);
    await page.getByRole('button', { name: 'North', exact: true }).click(); await ready(page);
    expect(await page.evaluate(() => window.stackChart.getSnapshot().view)).toBe('ready');
  });
  test(prefix + ': reversed scale, custom palette and narrow desktop containers preserve identity', async ({ page }) => {
    const source = specimen(orientation, stacking);
    await mount(page, orientation, stacking, 'basic', { theme: 'dark', direction: 'rtl', font: { family: 'monospace', size: 14, weight: 500 }, axes: { ...source.axes, y: { ...source.axes.y, reversed: true } }, series: source.series.map((series, i) => i ? series : { ...series, color: '#cc3344' }) });
    await expect(page.locator('[data-nc-layer="marks"] rect').first()).toHaveAttribute('fill', '#cc3344');
    for (const width of [320, 375, 430, 768]) {
      await page.locator('#host').evaluate((element, width) => { element.style.width = width + 'px'; }, width);
      await expect.poll(() => page.evaluate(() => window.stackChart.getSnapshot().size.width)).toBe(width); await ready(page);
      const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
      expect(await page.evaluate(() => window.stackEvents.at(-1).point.id)).toBe('p0-0');
      const dimensions = await page.locator('#host').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth })); expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    }
  });
  test(prefix + ': 10000 logical segments remain finite, keyboard-addressable and paginated', async ({ page }) => {
    const count = 5000, categories = Array.from({ length: count }, (_, i) => ({ id: 'c' + i, label: 'Category ' + i }));
    const series = [0, 1].map(si => ({ id: 's' + si, name: 'Series ' + si, data: categories.map((category, i) => { const value = (i * 7 + si) % 19 - 9; return { id: 'p' + si + '-' + i, x: category.id, y: stacking === 'percent' ? Math.abs(value) + 1 : value, datum: { logical: si * count + i } }; }) }));
    await mount(page, orientation, stacking, 'basic', { axes: { x: { kind: 'category', values: categories }, y: { kind: 'linear' } }, series });
    await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(10000);
    expect(await page.locator('svg').first().evaluate(element => /NaN|Infinity/.test(element.outerHTML))).toBe(false);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Control+End'); await grid.press('Enter');
    expect(await page.evaluate(() => window.stackEvents.at(-1).point.datum.logical)).toBe(9999);
    await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(100);
    expect(await page.evaluate(() => window.stackSpec.series.reduce((count, series) => count + series.data.length, 0))).toBe(10000);
  });
}

test.describe('Native touch', () => {
  test.use({ hasTouch: true });
  for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) test(orientation + '/' + stacking + ': native taps and mobile docks leave first/last selected segments uncovered', async ({ page }, info) => {
    for (const width of [320, 375, 430]) {
      await setup(page, width, 400);
      if (width !== 320) await page.evaluate(() => { document.body.style.transform = 'translate(0)'; });
      await mount(page, orientation, stacking, 'basic', { direction: width === 430 ? 'rtl' : 'ltr' });
      for (const [index, pointId] of [[0, 'p0-0'], [stacking === 'percent' ? 4 : 5, 'p0-6']]) {
        const point = await bodyCenter(page, index); await page.touchscreen.tap(point.x, point.y); await detail(page, pointId, 's0');
        const overlaps = await page.evaluate(index => {
          const selected = document.querySelectorAll('[data-nc-layer="marks"] rect')[index].getBoundingClientRect();
          return [...document.querySelectorAll('[data-nc-tooltip], [data-nc-detail]')].filter(node => !node.hidden && getComputedStyle(node).visibility === 'visible' && node.getBoundingClientRect().width > 0).map(node => {
            const box = node.getBoundingClientRect(); return { area: Math.max(0, Math.min(box.right, selected.right) - Math.max(box.left, selected.left)) * Math.max(0, Math.min(box.bottom, selected.bottom) - Math.max(box.top, selected.top)), selected: selected.toJSON(), box: box.toJSON(), kind: node.hasAttribute('data-nc-tooltip') ? 'tooltip' : 'dock' };
          });
        }, index);
        if (overlaps.some(item => item.area >= .01)) await page.screenshot({ path: info.outputPath(`overlap-${width}-${pointId}.png`) });
        expect(overlaps.length).toBeGreaterThan(0);
        expect(overlaps.every(item => item.area < .01), JSON.stringify({ width, pointId, overlaps })).toBe(true);
      }
      expect(await page.evaluate(() => window.stackEvents.map(event => [event.point.id, event.source]))).toEqual([['p0-0', 'touch'], ['p0-6', 'touch']]);
      await page.evaluate(() => { const spacer = document.createElement('div'); spacer.style.height = '1500px'; document.body.append(spacer); });
      await page.mouse.move(width / 2, 650); await page.mouse.wheel(0, 100); await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await page.evaluate(() => window.stackChart.destroy());
    }
  });
});

for (const orientation of ['vertical', 'horizontal']) test(orientation + '/percent: undefined shares have a quiet readable status and retain raw zero/missing values', async ({ page }) => {
  const source = specimen(orientation, 'percent');
  for (const theme of ['light', 'dark']) for (const missing of [false, true]) {
    await setup(page, 320, 400);
    const series = source.series.map((series, si) => ({ ...series, data: series.data.map(point => ({ ...point, y: missing ? si === 0 ? null : 2 : 0 })) }));
    await mount(page, orientation, 'percent', 'basic', { theme, series });
    const status = page.locator('[data-nc-status]'); await expect(status).toContainText('Percentages are undefined');
    expect(await status.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(await page.locator('[data-nc-root]').evaluate(node => getComputedStyle(node).backgroundColor));
    await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(0);
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    await expect(page.locator('[data-nc-table] tbody')).toContainText(missing ? 'Missing observation' : '0');
    await page.getByRole('button', { name: 'Close data table', exact: true }).click();
    await page.evaluate(spec => window.stackChart.update(spec), { ...source, theme }); await ready(page);
    await expect(status).toBeHidden(); expect(await status.evaluate(node => node.style.backgroundColor)).toBe('');
    await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(15);
    await page.evaluate(() => window.stackChart.destroy());
  }
});

async function capture(page, info, orientation, stacking, width, theme, variant, state, overrides = {}) {
  await setup(page, width, 400);
  if (width === 320 && ['rtl-focus', 'edge-tooltip'].includes(state)) await page.evaluate(() => { document.body.style.transform = 'translate(0)'; });
  await mount(page, orientation, stacking, variant, { theme, direction: state === 'rtl-focus' ? 'rtl' : 'ltr', ...overrides });
  if (['rtl-focus', 'edge-tooltip'].includes(state)) {
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await detail(page, 'p0-6', 's0');
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const file = `${orientation}-${stacking}-${variant}-${state}-${width}x400-${theme}-${info.project.name}`;
  fs.mkdirSync(`${directory}/visual`, { recursive: true });
  const first = await page.locator('#host').screenshot({ path: `${directory}/visual/${file}.png`, animations: 'disabled' }), second = await page.locator('#host').screenshot({ animations: 'disabled' });
  const hash = createHash('sha256').update(first).digest('hex'); expect(hash).toBe(createHash('sha256').update(second).digest('hex'));
  fs.writeFileSync(`${directory}/visual/${file}.json`, JSON.stringify({ file: file + '.png', family: orientation === 'horizontal' ? 'stacked-bar' : 'stacked-column', orientation, stacking, variant, state, width, height: 400, pixelWidth: first.readUInt32BE(16), pixelHeight: first.readUInt32BE(20), deviceScaleFactor: await page.evaluate(() => devicePixelRatio), theme, direction: state === 'rtl-focus' ? 'rtl' : 'ltr', browser: info.project.name, sha256: hash, baseline: 'NEW FAMILY; HUMAN REVIEW PENDING', approval: 'HUMAN REVIEW PENDING' }, null, 2));
}
for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) {
  for (const variant of ['basic', 'long']) test(orientation + '/' + stacking + ': @visual ' + variant + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, orientation, stacking, width, theme, variant, 'default'));
  for (const state of ['rtl-focus', 'edge-tooltip']) test(orientation + '/' + stacking + ': @visual ' + state + '/' + width + '/' + theme, async ({ page }, info) => capture(page, info, orientation, stacking, width, theme, 'basic', state));
}
for (const orientation of ['vertical', 'horizontal']) for (const width of [320, 768]) for (const theme of ['light', 'dark']) test(orientation + '/sum: @visual negative/' + width + '/' + theme, async ({ page }, info) => capture(page, info, orientation, 'sum', width, theme, 'negative', 'default'));
for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) for (const theme of ['light', 'dark']) for (const state of ['loading', 'empty', 'error']) test(orientation + '/' + stacking + ': @visual ' + state + '/320/' + theme, async ({ page }, info) => capture(page, info, orientation, stacking, 320, theme, 'basic', state, { status: state === 'error' ? { kind: state, message: 'Data unavailable. Try again later.' } : { kind: state }, ...(state === 'empty' ? { series: [] } : {}) }));
for (const orientation of ['vertical', 'horizontal']) for (const theme of ['light', 'dark']) test(orientation + '/percent: @visual undefined/320/' + theme, async ({ page }, info) => {
  const source = specimen(orientation, 'percent'); await capture(page, info, orientation, 'percent', 320, theme, 'basic', 'undefined-percent', { series: source.series.map(series => ({ ...series, data: series.data.map(point => ({ ...point, y: 0 })) })) });
});
for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) for (const theme of ['light', 'dark']) test(orientation + '/' + stacking + ': @cross-visual 768/' + theme, async ({ page }, info) => capture(page, info, orientation, stacking, 768, theme, 'basic', 'default'));
function specimen(orientation = 'vertical', stacking = 'sum', variant = 'basic') {
  const values = stacking === 'percent' ? [[2, 3, 0, null, 4, 6, 2], [3, 1, 0, 2, 4, 2, 3], [5, 6, 0, 3, 2, 2, 5]] : [[4, -3, 0, 6, null, 5, 2], [3, -2, 1, 2, 4, null, 5], [-2, 1, 2, -3, 1, 4, 0]];
  if (variant === 'negative') for (const row of values) for (let i = 0; i < row.length; i++) if (row[i] !== null) row[i] = -Math.abs(row[i]);
  const names = ['North', 'South', 'East'], labels = variant === 'long' ? ['Northern Europe enterprise operations', 'Northern Europe enterprise operations', 'The Americas and Caribbean', 'Asia Pacific emerging markets', 'Middle East and Africa', 'Unallocated investment', 'Consolidated operating result'] : ['January', 'January', 'March', 'April', 'May', 'June', 'July'];
  return { family: 'stacked', stacking, orientation, title: stacking === 'percent' ? 'Regional contribution' : 'Operating contribution', description: 'Observed results by region; table values are original.', axes: { x: { kind: 'category', values: labels.map((label, i) => ({ id: 'c' + i, label })) }, y: { kind: 'linear', title: stacking === 'percent' ? 'Share (%)' : 'EUR thousands' } }, series: values.map((row, si) => ({ id: 's' + si, name: names[si], data: row.map((y, ci) => ({ id: 'p' + si + '-' + ci, x: 'c' + ci, y, datum: { region: names[si], category: ci } })) })), references: [{ id: 'reference', axis: 'y', value: stacking === 'percent' ? 50 : 5, label: stacking === 'percent' ? '50% share' : 'Target', dash: 'dashed' }] };
}
async function mount(page, orientation = 'vertical', stacking = 'sum', variant = 'basic', overrides = {}) {
  const result = await page.evaluate(spec => {
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } };
    freeze(spec); window.stackSpec = spec; window.stackEvents = []; window.stackStates = []; window.stackDiagnostics = [];
    const result = window.NCStacked.createStackedChart(document.getElementById('host'), spec, { instanceId: 'stack', onPointActivate: event => window.stackEvents.push(event), onStateChange: event => window.stackStates.push(event), onDiagnostic: event => window.stackDiagnostics.push(event) });
    if (result.status === 'ok') window.stackChart = result.value;
    return result.status === 'ok' ? 'ok' : result.diagnostic;
  }, { ...specimen(orientation, stacking, variant), ...overrides });
  expect(result).toBe('ok'); await ready(page);
}
async function ready(page) {
  await page.waitForFunction(() => {
    if (window.stackDiagnostics.length) throw Error(JSON.stringify(window.stackDiagnostics));
    const s = window.stackChart.getSnapshot(); if (s.phase === 'faulted' || s.phase === 'destroyed') throw Error('Unexpected chart phase: ' + s.phase);
    return s.phase === 'active' && s.revision === s.committedRevision;
  });
  expect(await page.evaluate(() => window.stackDiagnostics)).toEqual([]);
}
async function bodyCenter(page, index = 0) {
  const box = await page.locator('[data-nc-layer="marks"] rect').nth(index).boundingBox(); expect(box).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function detail(page, pointId, seriesId) {
  await page.evaluate('globalThis.waitForStackDetail=' + waitForLineDetail.toString());
  await page.evaluate(({ pointId, seriesId }) => {
    const point = window.stackSpec.series.find(series => series.id === seriesId).data.find(point => point.id === pointId), categories = window.stackSpec.axes.x.values;
    const category = categories.find(category => category.id === point.x), label = category.label ?? category.id;
    const duplicate = categories.filter(category => (category.label ?? category.id) === label).length > 1;
    const header = duplicate && label !== category.id ? label + ' (' + category.id + ')' : label;
    return window.waitForStackDetail(window.stackChart, document.getElementById('host'), { revision: window.stackChart.getSnapshot().revision, pointId, seriesId, header });
  }, { pointId, seriesId });
}
test.beforeEach(async ({ page }) => setup(page));

for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) {
  const prefix = orientation + '/' + stacking;
  test(prefix + ': real packed SVG, separate signs or percentages and immutable original activation', async ({ page }) => {
    await mount(page, orientation, stacking);
    const rects = page.locator('[data-nc-layer="marks"] rect'); expect(await rects.count()).toBe(stacking === 'sum' ? 19 : 15);
    expect(await page.locator('svg').first().evaluate(element => /NaN|Infinity/.test(element.outerHTML))).toBe(false);
    const point = await bodyCenter(page); await page.mouse.click(point.x, point.y); await detail(page, 'p0-0', 's0');
    expect(await page.evaluate(() => window.stackEvents.map(e => [e.seriesId, e.point.id, e.point.y, e.point.datum, e.source]))).toEqual([['s0', 'p0-0', stacking === 'sum' ? 4 : 2, { region: 'North', category: 0 }, 'pointer']]);
    const context = page.locator('[data-nc-tooltip-context]:visible').first();
    await expect(context).toContainText(stacking === 'percent' ? '20% of visible total' : 'Positive total: 7');
    if (stacking === 'sum') await expect(context).toContainText('Negative total: -2');
    expect(await page.evaluate(() => Object.isFrozen(window.stackSpec.series[0].data))).toBe(true);
  });
  test(prefix + ': keyboard preserves duplicate category and series identity through reconstruction', async ({ page }) => {
    await mount(page, orientation, stacking);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('ArrowRight'); await grid.press('ArrowDown'); await grid.press('Enter');
    expect(await page.evaluate(() => window.stackEvents.map(e => [e.seriesId, e.point.id, e.point.x, e.source]))).toEqual([['s1', 'p1-1', 'c1', 'keyboard']]);
    await page.evaluate(() => window.stackChart.update(JSON.parse(JSON.stringify(window.stackSpec)))); await ready(page); await expect(grid).toBeFocused(); await grid.press('Enter');
    expect(await page.evaluate(() => window.stackEvents.at(-1).point.id)).toBe('p1-1');
    await grid.press('Escape'); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  });
  test(prefix + ': internal and controlled legend ownership recomputes stack totals', async ({ page }) => {
    await mount(page, orientation, stacking); const button = page.getByRole('button', { name: 'East', exact: true });
    await button.click(); await ready(page); await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.stackChart.getState().hiddenSeriesIds)).toEqual(['s2']);
    const point = await bodyCenter(page); await page.mouse.move(point.x, point.y); await detail(page, 'p0-0', 's0');
    await expect(page.locator('[data-nc-tooltip-context]:visible').first()).toContainText(stacking === 'percent' ? '40% of visible total' : 'Negative total: 0');
    await page.evaluate(() => window.stackChart.destroy());
    await mount(page, orientation, stacking, 'basic', { state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } });
    await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.stackStates.map(e => e.effect))).toEqual(['proposal']);
    await page.evaluate(() => window.stackChart.update({ ...window.stackSpec, state: { mode: 'controlled', value: window.stackStates[0].state } })); await ready(page); await expect(button).toHaveAttribute('aria-pressed', 'false');
  });
  test(prefix + ': accessible table contains raw values, gaps and transformation context', async ({ page }) => {
    await mount(page, orientation, stacking); await page.getByRole('button', { name: 'View data table', exact: true }).click();
    const table = page.locator('[data-nc-table]'); await expect(table).toBeVisible(); await expect(table).toContainText(stacking === 'percent' ? 'Table values are original' : 'Positive and negative stacks accumulate separately');
    await expect(table.locator('td').first()).toBeVisible(); expect(await table.textContent()).not.toContain('Infinity');
    await page.getByRole('button', { name: 'Close data table', exact: true }).click(); await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
  });
  test(prefix + ': rejection retains the last committed SVG before dynamic update and mode switch', async ({ page }) => {
    await mount(page, orientation, stacking); const before = await page.locator('svg').first().evaluate(element => element.outerHTML), revision = await page.evaluate(() => window.stackChart.getSnapshot().revision);
    expect(await page.evaluate(() => window.stackChart.update({ ...window.stackSpec, series: [{ ...window.stackSpec.series[0], data: [{ id: 'bad', x: 'c0', y: Infinity }] }] }).status)).toBe('invalid');
    expect(await page.locator('svg').first().evaluate(element => element.outerHTML)).toBe(before); expect(await page.evaluate(() => window.stackChart.getSnapshot().revision)).toBe(revision);
    await page.evaluate(() => { window.stackSpec = { ...window.stackSpec, theme: 'dark', direction: 'rtl', stacking: 'sum', series: window.stackSpec.series.map(s => ({ ...s, data: s.data.map(p => ({ ...p, y: p.y === null ? null : p.y + 1 })) })) }; return window.stackChart.update(window.stackSpec); }); await ready(page);
    await expect(page.locator('[data-nc-root]')).toHaveAttribute('dir', 'rtl');
    await page.evaluate(() => window.stackChart.destroy()); await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  });
}

for (const orientation of ['vertical', 'horizontal']) for (const stacking of ['sum', 'percent']) test(orientation + '/' + stacking + ': 100 retained-controller resource cycles release listeners/observers/frames/timers and raw data', async ({ page }, info) => {
  await page.evaluate('globalThis.probeStackResources=' + probeChartResources.toString());
  const template = { family: 'stacked', stacking, orientation, title: 'Lifecycle', axes: { x: { kind: 'category', values: ['a', 'b', 'c'].map(id => ({ id })) }, y: { kind: 'linear' } }, series: [[2, 4, 1], [1, 3, 2]].map((row, i) => ({ id: 's' + i, name: 'Series ' + i, data: row.map((y, j) => ({ id: 'p' + i + '-' + j, x: ['a', 'b', 'c'][j], y })) })) };
  const result = await page.evaluate(template => window.probeStackResources({ factoryPath: 'NCStacked.createStackedChart', template }), template);
  expect(result.cycles).toHaveLength(100);
  let collection = { status: 'NOT_AVAILABLE', reason: 'Portable resource counters checked; forced GC uses Chromium CDP only.' };
  if (info.project.name === 'chromium') {
    const session = await page.context().newCDPSession(page); await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage');
    const alive = await page.evaluate(() => window.__ncResourceReferences.filter(reference => reference.deref()).length); expect(alive).toBe(0);
    collection = { status: 'PASS', collectibleReferences: 300, retainedDestroyedControllers: 100, alive }; await session.detach();
  }
  fs.writeFileSync(`${directory}/resources-${orientation}-${stacking}-${info.project.name}.json`, JSON.stringify({ ...result, collection }, null, 2));
});
