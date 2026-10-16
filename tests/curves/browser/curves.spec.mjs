import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { waitForLineDetail } from '../../../../../tooling/line-detail-wait.mjs';

const directory = 'artifacts/v1-curves';
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => {
  await use();
  if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__);
  if (value) {
    const destination = path.resolve(directory, 'browser-coverage'); fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, info.testId.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(value));
  }
}, { auto: true }] });
async function setup(page, width = 768, height = 400, standards = true) {
  await page.setViewportSize({ width: Math.max(width, 320), height: 700 });
  await page.setContent(`${standards ? '<!doctype html>' : ''}<html lang="en"><head><title>Neural Charts acceptance</title><style>body{margin:0}h1{font:600 16px system-ui;margin:8px 0}</style></head><body><main><h1>Chart acceptance</h1><div id="host" style="width:${width}px;height:${height}px"></div><button id="outside">Outside chart</button></main></body></html>`);
  await page.addScriptTag({ path: path.resolve(directory, 'browser-harness.js') });
}
function specimen(family, variant = 'multi') {
  const labels = ['January', 'January', 'March', 'April', 'May', 'June', 'July', 'August'];
  const values = variant === 'gaps' ? [12, 18, 9, null, 15, 14, 22, null] : variant === 'negative' ? [-12, -18, -9, -24, -15, -14, -22, -16] : [12, -8, 0, 24, null, 14, 22, 16];
  const series = [{ id: 'actual', name: 'Actual', markers: 'on', data: values.map((y, i) => ({ id: 'p' + i, x: 'm' + i, y })) }];
  if (variant === 'multi') series.push({ id: 'plan', name: 'Planned', markers: 'on', data: [7, 10, null, 12, 6, 9, 14, 10].map((y, i) => ({ id: 'q' + i, x: 'm' + i, y })) });
  return { family, title: family === 'spline' ? 'Revenue trend' : 'Operating margin', description: 'Observed results and the quarterly plan.', axes: { x: { kind: 'category', values: labels.map((label, i) => ({ id: 'm' + i, label })) }, y: { kind: 'linear', title: 'EUR thousands' } }, series, references: [{ id: 'target', axis: 'y', value: 10, label: 'Target', dash: 'dashed' }] };
}
async function mount(page, family, variant = 'multi', overrides = {}) {
  const status = await page.evaluate(({ spec, family }) => {
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } };
    freeze(spec); window.curveSpec = spec; window.curveEvents = []; window.curveStates = []; window.curveDiagnostics = [];
    const factory = family === 'spline' ? window.NCCurves.createSplineChart : window.NCCurves.createAreaChart;
    const result = factory(document.getElementById('host'), spec, { instanceId: 'curve', onPointActivate: event => window.curveEvents.push(event), onStateChange: event => window.curveStates.push(event), onDiagnostic: event => window.curveDiagnostics.push(event) });
    if (result.status === 'ok') window.curveChart = result.value;
    return result.status === 'ok' ? 'ok' : result.diagnostic;
  }, { spec: { ...specimen(family, variant), ...overrides }, family });
  expect(status).toBe('ok'); await ready(page);
}
async function ready(page) {
  await page.waitForFunction(() => { const s = window.curveChart.getSnapshot(); return s.phase === 'active' && s.revision === s.committedRevision; });
  expect(await page.evaluate(() => window.curveDiagnostics)).toEqual([]);
}
async function marker(page, index) {
  return page.evaluate(index => {
    const svg = document.querySelector('[data-nc-root] svg'), points = document.querySelectorAll('[data-nc-layer="marks"] circle');
    const circle = points[index < 0 ? points.length + index : index], matrix = svg.getScreenCTM(), x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy'));
    return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
  }, index);
}
test.beforeEach(async ({ page }) => setup(page));

for (const family of ['spline', 'area']) {
  test(`${family}: real packed renderer, immutable data, separate gap paths and finite SVG`, async ({ page }) => {
    await mount(page, family, 'gaps');
    const paths = page.locator('[data-nc-layer="marks"] path');
    expect(await paths.count()).toBeGreaterThan(0);
    const result = await paths.evaluateAll(elements => elements.map(element => ({ d: element.getAttribute('d'), fill: element.getAttribute('fill'), opacity: element.getAttribute('fill-opacity') })));
    for (const item of result) expect(item.d).not.toMatch(/NaN|Infinity/);
    const contour = result.find(item => item.fill === 'none');
    expect(contour.d.match(/M /g)).toHaveLength(2);
    if (family === 'area') expect(result.filter(item => item.opacity === '0.18')).toHaveLength(2);
    else expect(contour.d.split('L ').length).toBeGreaterThan(4);
    expect(await page.evaluate(() => ({ frozen: Object.isFrozen(window.curveSpec.series[0].data), nullValue: window.curveSpec.series[0].data[3].y }))).toEqual({ frozen: true, nullValue: null });
  });

  test(`${family}: original identity drives hover/keyboard without regenerating marks`, async ({ page }) => {
    await mount(page, family);
    await page.evaluate(() => { window.curvePath = document.querySelector('[data-nc-layer="marks"] path'); });
    const point = await marker(page, 1); await page.mouse.move(point.x, point.y);
    await expect(page.locator('[data-nc-tooltip]')).toBeVisible(); await expect(page.locator('[data-nc-tooltip]')).toContainText('January');
    await expect(page.locator('[data-nc-tooltip]')).toContainText('-8');
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('ArrowRight'); await grid.press('Enter');
    expect(await page.evaluate(() => window.curveEvents.map(event => [event.seriesId, event.point.id, event.point.y, event.source]))).toEqual([['actual', 'p1', -8, 'keyboard']]);
    expect(await page.evaluate(() => window.curvePath === document.querySelector('[data-nc-layer="marks"] path'))).toBe(true);
    await grid.press('Escape'); await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
    await page.evaluate(() => window.curveChart.update(JSON.parse(JSON.stringify(window.curveSpec))));
    await ready(page); await expect(grid).toBeFocused(); await grid.press('Enter');
    expect(await page.evaluate(() => window.curveEvents.map(event => event.point.id))).toEqual(['p1', 'p1']);
  });

  test(`${family}: full updates, invalid rollback and lifecycle retain exact contracts`, async ({ page }) => {
    await mount(page, family);
    const rejected = await page.evaluate(() => {
      const before = document.getElementById('host').innerHTML, snapshot = window.curveChart.getSnapshot();
      const result = window.curveChart.update({ ...window.curveSpec, series: [{ ...window.curveSpec.series[0], data: [{ id: 'bad', x: 'm0', y: NaN }] }] });
      return { status: result.status, unchanged: before === document.getElementById('host').innerHTML, revision: snapshot.revision === window.curveChart.getSnapshot().revision };
    });
    expect(rejected).toEqual({ status: 'invalid', unchanged: true, revision: true });
    expect(await page.evaluate(() => window.curveChart.update({ ...window.curveSpec, title: 'Updated data', theme: 'dark', direction: 'rtl' }).status)).toBe('ok');
    await ready(page); await expect(page.locator('[data-nc-root]')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('[data-nc-root]')).toContainText('Updated data');
    const destroyed = await page.evaluate(() => { window.curveChart.destroy(); window.curveChart.destroy(); return [window.curveChart.getSnapshot().phase, window.curveChart.update(window.curveSpec).diagnostic.reason, window.curveChart.refresh().diagnostic.reason]; });
    expect(destroyed).toEqual(['destroyed', 'DESTROYED', 'DESTROYED']);
    await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  });

  test(`${family}: irregular numeric and UTC X retain their actual distance and original values`, async ({ page }) => {
    for (const kind of ['linear', 'time']) {
      if (kind === 'time') await page.evaluate(() => window.curveChart.destroy());
      const start = kind === 'time' ? Date.UTC(2024, 0, 1) : 0, unit = kind === 'time' ? 3600000 : 1;
      const data = [0, 1, 720].map((x, i) => ({ id: 'p' + i, x: start + x * unit, y: [2, 9, 4][i] }));
      await mount(page, family, 'gaps', { axes: { x: { kind }, y: { kind: 'linear' } }, series: [{ id: 'irregular', name: 'Irregular', markers: 'on', data }] });
      const xs = await page.locator('[data-nc-layer="marks"] circle').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('cx'))));
      expect((xs[1] - xs[0]) / (xs[2] - xs[1])).toBeCloseTo(1 / 719, 9);
      const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('Enter');
      expect(await page.evaluate(() => window.curveEvents[0].point.x)).toBe(start + 720 * unit);
    }
  });

  test(`${family}: extreme finite X spans retain coincident projected positions and exact point identity`, async ({ page }) => {
    await mount(page, family, 'gaps', { axes: { x: { kind: 'linear', nice: false }, y: { kind: 'linear' } }, series: [{ id: 'extreme', name: 'Extreme range', markers: 'on', data: [{ id: 'near-a', x: 0, y: 2 }, { id: 'near-b', x: 1, y: 9 }, { id: 'far', x: 1e300, y: 4 }] }] });
    // Markers are exactly on the left clip boundary; stay inside it after
    // native cross-browser pointer coordinate quantization.
    for (const index of [0, 1]) { const point = await marker(page, index); await page.mouse.click(point.x + 2, point.y); }
    expect(await page.evaluate(() => window.curveEvents.map(event => event.point.id))).toEqual(['near-a', 'near-b']);
  });

  test(`${family}: internal and controlled legend proposals keep visibility ownership`, async ({ page }) => {
    await mount(page, family);
    const actual = page.getByRole('button', { name: 'Actual', exact: true });
    await actual.click(); await expect(actual).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.curveChart.getState().hiddenSeriesIds)).toEqual(['actual']);
    await page.evaluate(() => window.curveChart.destroy());
    await mount(page, family, 'multi', { state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } });
    await actual.click(); await expect(actual).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.curveStates.map(event => event.effect))).toEqual(['proposal']);
    await page.evaluate(() => window.curveChart.update({ ...window.curveSpec, state: { mode: 'controlled', value: window.curveStates[0].state } }));
    await ready(page); await expect(actual).toHaveAttribute('aria-pressed', 'false');
  });

  test(`${family}: loading/empty/error/recovery and an actual zero remain distinct`, async ({ page }) => {
    await mount(page, family);
    for (const status of [{ kind: 'loading' }, { kind: 'empty' }, { kind: 'error', message: 'Unavailable' }]) {
      await page.evaluate(status => window.curveChart.update({ ...window.curveSpec, status }), status); await ready(page);
      await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Actual', exact: true })).toBeDisabled();
    }
    await page.evaluate(() => window.curveChart.update(window.curveSpec)); await ready(page);
    expect(await page.locator('[data-nc-layer="marks"] path').count()).toBeGreaterThan(0);
    await page.evaluate(() => window.curveChart.update({ ...window.curveSpec, series: [{ id: 'zero', name: 'Zero', markers: 'on', data: [{ id: 'zero', x: 'm0', y: 0 }] }] }));
    await ready(page); await expect(page.locator('[data-nc-layer="marks"] circle')).toHaveCount(1);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Enter');
    expect(await page.evaluate(() => window.curveEvents[0].point.y)).toBe(0);
  });

  test(`${family}: custom theme tokens and an explicit palette reach the real SVG and table`, async ({ page }) => {
    await page.locator('#host').evaluate(element => { element.style.setProperty('--nc-surface', '#f2f4f8'); element.style.setProperty('--nc-text', '#142536'); });
    const source = specimen(family); source.font = { family: 'monospace', size: 14 }; source.series = source.series.map(series => ({ ...series, color: '#006655' }));
    await mount(page, family, 'multi', source);
    expect(await page.locator('[data-nc-root]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(242, 244, 248)');
    await expect(page.locator('[data-nc-layer="marks"] circle').first()).toHaveAttribute('fill', '#006655');
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    await expect(page.locator('[data-nc-table] table')).toHaveCSS('font-size', '14px');
    await expect(page.locator('[data-nc-table] table')).toHaveCSS('color', 'rgb(20, 37, 54)');
  });

  test(`${family}: @a11y keyboard, data table and axe across light/dark/RTL`, async ({ page }, info) => {
    const reports = [];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.evaluate(() => window.curveChart.destroy());
      await mount(page, family, 'multi', { theme, direction: theme === 'dark' ? 'rtl' : 'ltr' });
      await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
      const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End');
      await expect(grid).toHaveAttribute('aria-activedescendant', /.+/);
      await page.getByRole('button', { name: 'View data table', exact: true }).click();
      await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
      await expect(page.locator('tbody')).toContainText('Missing observation');
      await expect(page.locator('tbody')).toContainText('-8');
      const result = await page.evaluate(async () => { const r = await window.axe.run(); return { violations: r.violations, passCount: r.passes.length }; });
      reports.push({ theme, ...result }); expect(result.violations).toEqual([]);
      await page.getByRole('button', { name: 'Close data table', exact: true }).click();
      await expect(page.getByRole('button', { name: 'View data table', exact: true })).toBeFocused();
    }
    fs.writeFileSync(`${directory}/axe-${family}-${info.project.name}.json`, JSON.stringify(reports, null, 2));
  });

  test(`${family}: @a11y dark table inherits chart font and color even in quirks documents`, async ({ page }) => {
    await setup(page, 768, 400, false); await mount(page, family, 'multi', { theme: 'dark' });
    expect(await page.evaluate(() => document.compatMode)).toBe('BackCompat');
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    const styles = await page.evaluate(() => {
      const root = getComputedStyle(document.querySelector('[data-nc-root]')), table = getComputedStyle(document.querySelector('[data-nc-table] table'));
      return { root: { color: root.color, font: root.font }, table: { color: table.color, font: table.font } };
    });
    expect(styles.table).toEqual(styles.root);
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
    expect(await page.evaluate(async () => (await window.axe.run()).violations)).toEqual([]);
  });

  test(`${family}: touch dock keeps the selected first and last original point visible`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 600 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await setup(page, 296, 300); await page.evaluate(() => { document.body.style.margin = '12px'; document.body.style.transform = 'translate(0)'; });
      await mount(page, family);
      for (const index of [0, -1]) {
        const point = await marker(page, index); await page.touchscreen.tap(point.x, point.y);
        await expect(page.locator('[data-nc-detail]')).toBeVisible();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const current = await marker(page, index), box = await page.locator('[data-nc-detail]').boundingBox();
        expect(current.x >= box.x && current.x <= box.x + box.width && current.y >= box.y && current.y <= box.y + box.height).toBe(false);
      }
      expect(await page.evaluate(() => window.curveEvents.map(event => event.point.id))).toEqual(['p0', 'q7']);
    } finally { await context.close(); }
  });

  test(`${family}: 50000 originals stay finite, keyboard-addressable and bounded in SVG nodes`, async ({ page }) => {
    const status = await page.evaluate(family => {
      window.curveEvents = []; window.curveDiagnostics = [];
      const spec = { family, title: '50000 observations', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Large series', markers: 'off', data: Array.from({ length: 50000 }, (_, x) => ({ id: 'p' + x, x, y: Math.sin(x / 300) * 20 + x / 5000 })) }] };
      const factory = family === 'spline' ? window.NCCurves.createSplineChart : window.NCCurves.createAreaChart;
      const result = factory(document.getElementById('host'), spec, { instanceId: 'large', onPointActivate: event => window.curveEvents.push(event), onDiagnostic: event => window.curveDiagnostics.push(event) });
      if (result.status === 'ok') window.curveChart = result.value; return result.status;
    }, family);
    expect(status).toBe('ok'); await ready(page);
    expect(await page.locator('svg *').count()).toBeLessThan(500);
    expect(await page.locator('[data-nc-layer="marks"] path').first().getAttribute('d')).not.toMatch(/NaN|Infinity/);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('Enter');
    expect(await page.evaluate(() => window.curveEvents[0].point.id)).toBe('p49999');
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(100);
    await expect(page.locator('[data-nc-table]')).toContainText('50000 provided observations');
  });

  test(`${family}: explicit numeric cropping keeps every raw datum and original identity`, async ({ page }) => {
    const spec = { family, title: 'Cropped noisy observations', axes: { x: { kind: 'linear', domain: [1000, 1010], nice: false }, y: { kind: 'linear' } }, series: [{ id: 'noise', name: 'Noise', markers: 'off', data: Array.from({ length: 50000 }, (_, x) => ({ id: 'p' + x, x, y: x % 2 ? 20 : -20 })) }] };
    await mount(page, family, 'multi', spec);
    const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('End'); await grid.press('Enter');
    expect(await page.evaluate(() => window.curveEvents[0].point.id)).toBe('p1010');
    if (family === 'spline') expect((await page.locator('[data-nc-layer="marks"] path').first().getAttribute('d')).length).toBeLessThan(100000);
    await page.getByRole('button', { name: 'View data table', exact: true }).click();
    await expect(page.locator('[data-nc-table]')).toContainText('50000 provided observations');
  });

  test(`${family}: 100 retained destroyed controllers release data, listeners, frames and observers`, async ({ page }, info) => {
    const result = await page.evaluate(async family => {
      const host = document.getElementById('host'), factory = family === 'spline' ? window.NCCurves.createSplineChart : window.NCCurves.createAreaChart;
      const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener, Native = ResizeObserver;
      const raf = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window), frames = new Set(), tracked = new Map();
      let listeners = 0, observations = 0, outputs = 0;
      EventTarget.prototype.addEventListener = function(type, listener, options) { if (listener) { let map = tracked.get(this); if (!map) tracked.set(this, map = new Map()); let set = map.get(listener); if (!set) map.set(listener, set = new Set()); const key = type + ':' + (typeof options === 'boolean' ? options : !!options?.capture); if (!set.has(key)) { set.add(key); listeners++; } } return add.call(this, type, listener, options); };
      EventTarget.prototype.removeEventListener = function(type, listener, options) { const key = type + ':' + (typeof options === 'boolean' ? options : !!options?.capture), map = tracked.get(this), set = map?.get(listener); if (set?.delete(key)) listeners--; if (set?.size === 0) map.delete(listener); if (map?.size === 0) tracked.delete(this); return remove.call(this, type, listener, options); };
      window.ResizeObserver = class extends Native { active = false; observe(target, options) { if (!this.active) { this.active = true; observations++; } super.observe(target, options); } disconnect() { if (this.active) { observations--; this.active = false; } super.disconnect(); } };
      window.requestAnimationFrame = callback => { const id = raf(time => { frames.delete(id); callback(time); }); frames.add(id); return id; };
      window.cancelAnimationFrame = id => { frames.delete(id); cancel(id); };
      const tick = () => new Promise(resolve => raf(() => raf(resolve))), cycles = [];
      window.retainedCurveControllers = []; window.curveResourceRefs = [];
      try {
        for (let cycle = 0; cycle < 100; cycle++) {
          host.style.width = cycle % 2 ? '320px' : '768px'; host.style.height = '400px';
          const datum = { cycle }, spec = { family, title: 'Lifecycle', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Series', data: [{ id: 'a', x: 0, y: 2, datum }, { id: 'b', x: 1, y: 4 }, { id: 'c', x: 2, y: 1 }] }] };
          const mounted = factory(host, spec, { instanceId: 'resources', onPointActivate: () => outputs++ });
          if (mounted.status !== 'ok') throw Error(JSON.stringify(mounted));
          const chart = mounted.value;
          for (let n = 0; n < 120 && (!chart.getSnapshot().committedRevision || chart.getSnapshot().revision !== chart.getSnapshot().committedRevision); n++) await tick();
          const owned = host.querySelector('[data-nc-root]'), grid = host.querySelector('[data-nc-grid]');
          grid.focus(); grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await tick();
          host.querySelector('[data-nc-table-toggle]').click(); await tick();
          window.curveResourceRefs.push(new WeakRef(datum), new WeakRef(spec), new WeakRef(owned));
          chart.update({ ...spec, title: 'Pending frame' }); chart.refresh(); chart.destroy(); chart.destroy();
          window.retainedCurveControllers.push(chart); await tick();
          const state = { cycle, listeners, observations, frames: frames.size, owned: host.querySelectorAll('[data-nc-root]').length, portals: document.querySelectorAll('[data-nc-tooltip]').length, outputs };
          cycles.push(state);
          if (listeners || observations || frames.size || state.owned || state.portals || outputs) throw Error(JSON.stringify(state));
        }
        return { cycles, retained: window.retainedCurveControllers.length, weakRefs: window.curveResourceRefs.length };
      } finally { EventTarget.prototype.addEventListener = add; EventTarget.prototype.removeEventListener = remove; window.ResizeObserver = Native; window.requestAnimationFrame = raf; window.cancelAnimationFrame = cancel; tracked.clear(); }
    }, family);
    expect(result.cycles).toHaveLength(100);
    let collection = { status: 'NOT_AVAILABLE', reason: 'Portable resource counters checked; forced GC uses Chromium CDP only.' };
    if (info.project.name === 'chromium') {
      const session = await page.context().newCDPSession(page); await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage');
      const alive = await page.evaluate(() => window.curveResourceRefs.filter(reference => reference.deref()).length);
      expect(alive).toBe(0); collection = { status: 'PASS', collectibleReferences: 300, retainedDestroyedControllers: 100, alive }; await session.detach();
    }
    fs.writeFileSync(`${directory}/resources-${family}-${info.project.name}.json`, JSON.stringify({ ...result, collection }, null, 2));
  });

  for (const width of [320, 768]) for (const theme of ['light', 'dark']) for (const variant of ['multi', 'gaps', 'negative']) {
    test(`${family}: @visual ${width} ${theme} ${variant}`, async ({ page }, info) => {
      await setup(page, width, 400); await mount(page, family, variant, { theme });
      const host = page.locator('#host'), file = `${family}-${variant}-${width}x400-${theme}-${info.project.name}`;
      fs.mkdirSync(`${directory}/visual`, { recursive: true });
      const first = await host.screenshot({ path: `${directory}/visual/${file}.png`, animations: 'disabled' });
      const second = await host.screenshot({ animations: 'disabled' });
      expect(createHash('sha256').update(first).digest('hex')).toBe(createHash('sha256').update(second).digest('hex'));
      fs.writeFileSync(`${directory}/visual/${file}.json`, JSON.stringify({ file: file + '.png', family, variant, width, height: 400, theme, browser: info.project.name, sha256: createHash('sha256').update(first).digest('hex'), approval: 'HUMAN REVIEW PENDING' }, null, 2));
    });
  }
  for (const width of [320, 768]) for (const theme of ['light', 'dark']) for (const state of ['rtl-focus', 'edge-tooltip']) {
    test(`${family}: @visual ${width} ${theme} ${state}`, async ({ page }, info) => {
      await setup(page, width, 400);
      if (width === 320) await page.evaluate(() => { document.body.style.transform = 'translate(0)'; });
      await mount(page, family, 'multi', { theme, direction: state === 'rtl-focus' ? 'rtl' : 'ltr' });
      await page.addScriptTag({ content: 'globalThis.waitForCurveDetail=' + waitForLineDetail.toString() });
      const grid = page.locator('[data-nc-grid]'); await grid.focus();
      if (state === 'rtl-focus') { await grid.press('Home'); await grid.press('ArrowRight'); } else await grid.press('End');
      await page.evaluate(async state => {
        await window.waitForCurveDetail(window.curveChart, document.getElementById('host'), { revision: window.curveChart.getSnapshot().revision, seriesId: 'actual', pointId: state === 'rtl-focus' ? 'p1' : 'p7', header: state === 'rtl-focus' ? 'January' : 'August' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, state);
      const file = `${family}-${state}-${width}x400-${theme}-${info.project.name}`;
      fs.mkdirSync(`${directory}/visual`, { recursive: true });
      const first = await page.locator('#host').screenshot({ path: `${directory}/visual/${file}.png`, animations: 'disabled' });
      const second = await page.locator('#host').screenshot({ animations: 'disabled' });
      const hash = createHash('sha256').update(first).digest('hex');
      expect(hash).toBe(createHash('sha256').update(second).digest('hex'));
      fs.writeFileSync(`${directory}/visual/${file}.json`, JSON.stringify({ file: file + '.png', family, variant: 'multi', width, height: 400, theme, state, direction: state === 'rtl-focus' ? 'rtl' : 'ltr', browser: info.project.name, sha256: hash, approval: 'HUMAN REVIEW PENDING' }, null, 2));
    });
  }
}
