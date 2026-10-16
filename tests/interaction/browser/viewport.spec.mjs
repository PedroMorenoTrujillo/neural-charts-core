import { test, expect } from '@playwright/test';
import { familyFixture, coreFamily, ready, captureCoverage } from './helpers.mjs';
import fs from 'node:fs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
const directory = 'artifacts/v1-viewport';
async function mount(page, family, viewport = { mode: 'internal', axes: 'xy', controls: false }, overrides = {}) {
  await page.setContent('<!doctype html><html lang="en"><title>Viewport acceptance</title><main><h1>Applied viewport</h1><div id="host" style="width:768px;height:400px"></div><button id="outside">Outside</button></main></html>');
  await page.addScriptTag({ path: directory + '/browser-harness.js' });
  const result = await page.evaluate(({ family, spec, viewport, overrides }) => {
    window.spec = { ...spec, viewport, ...overrides }; window.viewports = []; window.activations = []; window.diagnostics = [];
    const result = window.NCExport['create' + family[0].toUpperCase() + family.slice(1) + 'Chart'](document.querySelector('#host'), window.spec, { instanceId: 'viewport-test', onViewportChange: event => window.viewports.push(event), onPointActivate: event => window.activations.push(event), onDiagnostic: diagnostic => window.diagnostics.push(diagnostic) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? 'ok' : result;
  }, { family: coreFamily(family), spec: familyFixture(family, false), viewport, overrides });
  expect(result).toBe('ok'); await ready(page);
}
test.afterEach(async ({ page }, info) => { await captureCoverage(page, info, 'viewport', directory); });
for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'scatter']) {
  test(family + ': native viewport buttons zoom, pan and reset with exactly one accepted domain event per action', async ({ page }) => {
    await mount(page, family, { mode: 'internal', axes: 'xy' });
    const zoom = page.getByRole('button', { name: 'Zoom in', exact: true }), reset = page.getByRole('button', { name: 'Reset zoom', exact: true });
    await expect(zoom).toBeVisible(); await expect(reset).toBeDisabled();
    const group = await page.getByRole('group', { name: 'Chart viewport' }).boundingBox(), plot = await page.locator('[data-nc-grid]').boundingBox();
    expect(group.y).toBeGreaterThanOrEqual(plot.y + plot.height);
    await zoom.focus(); await zoom.press('Enter'); await ready(page);
    const first = await page.evaluate(() => window.chart.getViewport()); expect(Object.keys(first)).toEqual(['x', 'y']);
    expect(await page.evaluate(() => window.viewports.map(event => [event.source, event.effect]))).toEqual([['controls', 'accepted']]);
    await page.getByRole('button', { name: 'Pan to later X values', exact: true }).click(); await ready(page);
    expect(await page.evaluate(() => window.chart.getViewport())).not.toEqual(first);
    await reset.focus(); await reset.press('Space'); await ready(page); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({});
    expect(await page.evaluate(() => window.viewports)).toHaveLength(3); expect(await page.evaluate(() => window.activations)).toEqual([]);
    await expect(reset).toBeDisabled(); await expect(zoom).toBeFocused();
  });
}
test('native controlled viewport buttons emit proposals and never paint a rejected window', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'controlled', axes: 'xy', value: {} });
  const before = await page.locator('[data-nc-layer="marks"]').first().innerHTML();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await ready(page);
  expect(await page.evaluate(() => window.viewports.map(event => event.effect))).toEqual(['proposal']);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({}); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).toBe(before);
});
test('native Scatter pointer pan claims a drag, proposes once at release, and never activates a point', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'internal', axes: 'xy', gesture: 'pan', initial: { x: [-1, 1], y: [-1, 1] } });
  const surface = await page.locator('[data-nc-viewport-surface]').boundingBox(); const x = surface.x + surface.width / 2, y = surface.y + surface.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + surface.width / 4, y, { steps: 4 });
  expect(await page.evaluate(() => window.viewports)).toHaveLength(0); await page.mouse.up(); await ready(page);
  const events = await page.evaluate(() => window.viewports); expect(events).toHaveLength(1); expect(events[0].source).toBe('pointer'); expect(events[0].viewport.x[0]).toBeCloseTo(-1.5); expect(events[0].viewport.y).toEqual([-1, 1]);
  expect(await page.evaluate(() => window.activations)).toEqual([]);
});
test('native Scatter box zoom uses XY coordinates and wheel is opt-in, bounded and coalesced', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'internal', axes: 'xy', gesture: 'zoom', wheel: true, initial: { x: [-1, 1], y: [-1, 1] } });
  const surface = await page.locator('[data-nc-viewport-surface]').boundingBox();
  await page.mouse.move(surface.x + surface.width / 4, surface.y + surface.height / 4); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .75, surface.y + surface.height * .75, { steps: 4 }); await page.mouse.up(); await ready(page);
  const box = await page.evaluate(() => window.chart.getViewport()); expect(box.x[0]).toBeCloseTo(-.5, 1); expect(box.x[1]).toBeCloseTo(.5, 1); expect(box.y[0]).toBeCloseTo(-.5, 1); expect(box.y[1]).toBeCloseTo(.5, 1);
  const consumed = await page.locator('[data-nc-viewport-surface]').evaluate(element => [1, 2, 3].map(() => { const r = element.getBoundingClientRect(); return !element.dispatchEvent(new WheelEvent('wheel', { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, deltaY: -100, bubbles: true, cancelable: true })); }));
  expect(consumed).toEqual([true, true, true]); await expect.poll(() => page.evaluate(() => window.viewports.length)).toBe(2); await ready(page);
  expect(await page.evaluate(() => window.viewports[1].source)).toBe('wheel'); expect(await page.evaluate(() => window.chart.getViewport().x[1])).toBeLessThan(box.x[1]);
  await page.evaluate(() => window.chart.destroy()); await page.waitForTimeout(40); expect(await page.evaluate(() => window.viewports.length)).toBe(2); await expect(page.locator('[data-nc-viewport]')).toHaveCount(0);
});
test('bounded full-window pan is a no-op, an abandoned drag cannot block another and resize cancels the claimed gesture', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'internal', axes: 'xy', gesture: 'pan' });
  let surface = await page.locator('[data-nc-viewport-surface]').boundingBox();
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .75, surface.y + surface.height / 2, { steps: 3 }); await page.mouse.up();
  expect(await page.evaluate(() => window.viewports)).toEqual([]); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({});
  await page.mouse.move(surface.x + 1, surface.y + 1); await page.mouse.down(); await page.mouse.move(surface.x - 2, surface.y - 2); await page.mouse.up();
  expect((await page.evaluate(() => window.chart.requestViewport({ x: [-1, 1], y: [-1, 1] }))).status).toBe('ok'); await ready(page);
  surface = await page.locator('[data-nc-viewport-surface]').boundingBox();
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .75, surface.y + surface.height / 2, { steps: 3 });
  await page.locator('#host').evaluate(element => { element.style.width = '375px'; }); await ready(page);
  await expect(page.locator('[data-nc-root]')).toHaveCSS('width', '375px'); await page.mouse.up();
  expect(await page.evaluate(() => window.viewports)).toHaveLength(1); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [-1, 1], y: [-1, 1] });
});
test('opt-in surface preserves a real tap activation, wheel-disabled page scrolling, and reset after an empty zoom', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'internal', axes: 'xy', gesture: 'pan', wheel: false });
  const mark = page.locator('[data-nc-layer="marks"]').first().locator(':scope > *').nth(2);
  const position = await mark.evaluate(element => { const box = element.getBBox(), point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; });
  await page.mouse.click(position.x, position.y); expect(await page.evaluate(() => window.activations.map(event => event.point.id))).toEqual(['zero']);
  const consumed = await page.locator('[data-nc-viewport-surface]').evaluate(element => !element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true }))); expect(consumed).toBe(false);
  expect((await page.evaluate(() => window.chart.requestViewport({ x: [1, 2], y: [1, 2] }))).status).toBe('ok'); await ready(page);
  await expect(page.locator('[data-nc-layer="marks"] :is(circle,rect,path)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click(); await ready(page); expect(await page.evaluate(() => window.chart.getViewport())).toEqual({});
});
test('100 viewport create/destroy cycles release controls, delegated listeners, queued wheel frames and consumer data', async ({ page }, info) => {
  await mount(page, 'scatter'); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.viewportResourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async cases => {
    const groups = [], references = [];
    for (const { family, spec } of cases) {
      const result = await window.viewportResourceProbe({ factoryPath: 'NCExport.create' + family[0].toUpperCase() + family.slice(1) + 'Chart', template: spec, cycles: 25, exercise: chart => {
        document.querySelector('[data-nc-table-close]')?.click();
        const request = chart.requestViewport(family === 'scatter' ? { x: [-1, 1] } : { x: { firstId: 'a', lastId: 'b' } }); if (request.status !== 'ok') throw Error(JSON.stringify(request));
        const surface = document.querySelector('[data-nc-viewport-surface]'); if (surface) surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      } });
      groups.push({ family, result }); references.push(...window.__ncResourceReferences);
    }
    window.viewportReferences = references; return { groups, cycles: groups.reduce((n, group) => n + group.result.cycles.length, 0) };
  }, ['line', 'column', 'stacked', 'scatter'].map(family => ({ family, spec: { ...familyFixture(family === 'stacked' ? 'stacked-column' : family, false), viewport: { mode: 'internal', axes: 'xy', gesture: 'pan', wheel: true } } })));
  expect(report.cycles).toBe(100);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.viewportReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/resources-' + info.project.name + '.json', JSON.stringify(report, null, 2));
});
test('stacked viewport bounds include positive and negative totals revealed by hiding an incomplete series', async ({ page }) => {
  await mount(page, 'stacked-column', { mode: 'internal', axes: 'xy' }, { series: [
    { id: 'one', name: 'One', data: [{ id: 'a1', x: 'a', y: 5 }, { id: 'b1', x: 'b', y: -5 }, { id: 'c1', x: 'c', y: 2 }] },
    { id: 'two', name: 'Two', data: [{ id: 'a2', x: 'a', y: 6 }, { id: 'b2', x: 'b', y: -6 }, { id: 'c2', x: 'c', y: 2 }] },
    { id: 'gap', name: 'Incomplete', data: [{ id: 'a3', x: 'a', y: null }, { id: 'b3', x: 'b', y: null }, { id: 'c3', x: 'c', y: 1 }] }
  ] });
  await page.getByRole('button', { name: 'Incomplete', exact: true }).click(); await ready(page);
  expect(await page.evaluate(() => window.chart.getState().hiddenSeriesIds)).toEqual(['gap']);
  expect((await page.evaluate(() => window.chart.requestViewport({ y: [-11, 11] }))).status).toBe('ok'); await ready(page);
});
test('initial numeric box zoom follows the actual nice-axis scale rather than the raw data extent', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'internal', axes: 'xy', gesture: 'zoom' }, { axes: { x: { kind: 'linear', nice: true }, y: { kind: 'linear', nice: true } } });
  const positions = await page.evaluate(() => {
    const marks = [...document.querySelector('[data-nc-layer="marks"]').children], center = element => { const b = element.getBBox(); return new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(element.getScreenCTM()); };
    const second = center(marks[1]), zero = center(marks[2]), plot = document.querySelector('[data-nc-viewport-surface]').getBoundingClientRect(), scale = 5 / (zero.y - second.y);
    return { x: plot.x, y: plot.y, width: plot.width, height: plot.height, low: (zero.y - (plot.y + plot.height * .75)) * scale, high: (zero.y - (plot.y + plot.height * .25)) * scale };
  });
  await page.mouse.move(positions.x + positions.width / 4, positions.y + positions.height / 4); await page.mouse.down(); await page.mouse.move(positions.x + positions.width * .75, positions.y + positions.height * .75, { steps: 4 }); await page.mouse.up(); await ready(page);
  const window = await page.evaluate(() => window.chart.getViewport()); expect(window.y[0]).toBeCloseTo(Math.max(-4, positions.low), 1); expect(window.y[1]).toBeCloseTo(Math.min(5, positions.high), 1);
});
test('a claimed drag returning near its origin cannot activate data when a scaled controlled viewport rejects it', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'controlled', axes: 'xy', controls: false, gesture: 'pan', value: { x: [-1, 1], y: [-1, 1] } });
  await page.locator('#host').evaluate(element => { element.style.transform = 'scale(.5)'; element.style.transformOrigin = 'top left'; });
  const position = await page.locator('[data-nc-layer="marks"]').first().locator(':scope > *').first().evaluate(element => { const box = element.getBBox(); const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(element.getScreenCTM()); return { x: point.x, y: point.y }; });
  await page.mouse.move(position.x, position.y); await page.mouse.down(); await page.mouse.move(position.x + 40, position.y, { steps: 4 }); await page.mouse.move(position.x + 2, position.y, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await page.evaluate(() => window.viewports.map(event => event.effect))).toEqual(['proposal']);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [-1, 1], y: [-1, 1] }); expect(await page.evaluate(() => window.activations)).toEqual([]);
});
test('a zoomed viewport tooltip remains inside the drawing body and cannot cover the chart header', async ({ page }) => {
  await mount(page, 'area', { mode: 'internal', axes: 'xy' });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await ready(page);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home');
  await expect(page.locator('[data-nc-tooltip]')).toBeVisible();
  const boxes = await page.evaluate(() => {
    const root = document.querySelector('[data-nc-root]'), title = document.getElementById(root.getAttribute('aria-labelledby')), header = title.parentElement.getBoundingClientRect(), tip = document.querySelector('[data-nc-tooltip]').getBoundingClientRect();
    return { overlap: Math.max(0, Math.min(header.right, tip.right) - Math.max(header.left, tip.left)) * Math.max(0, Math.min(header.bottom, tip.bottom) - Math.max(header.top, tip.top)), headerBottom: header.bottom, tipTop: tip.top };
  });
  expect(boxes.overlap).toBe(0); expect(boxes.tipTop).toBeGreaterThanOrEqual(boxes.headerBottom);
});
test('category box zoom follows explicit zero edge spacing and exposes a visible single-axis preview', async ({ page }) => {
  const values = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: 'Category ' + id }));
  await mount(page, 'line', { mode: 'internal', axes: 'x', gesture: 'zoom' }, { axes: { x: { kind: 'category', values, edgeSpacing: 0 }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Observed', data: values.map((point, i) => ({ id: point.id, x: point.id, y: i })) }] });
  const surface = await page.locator('[data-nc-viewport-surface]').boundingBox();
  await page.mouse.move(surface.x + surface.width * .2, surface.y + surface.height / 2); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .8, surface.y + surface.height / 2, { steps: 4 });
  const preview = await page.locator('[data-nc-viewport-surface] + div').boundingBox(); await page.mouse.up(); await ready(page);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: { firstId: 'b', lastId: 'd' } });
  expect(preview.height).toBeGreaterThanOrEqual(surface.height - 1);
});
test('native one-millisecond time pan preserves duration and ignores an unrepresentable quarter-millisecond translation', async ({ page }) => {
  await mount(page, 'line', { mode: 'internal', axes: 'x', gesture: 'pan', controls: false, initial: { x: [1, 2] } }, { axes: { x: { kind: 'time', domain: [0, 10] }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Observed', data: Array.from({ length: 11 }, (_, i) => ({ id: 'p' + i, x: i, y: i % 3 })) }] });
  const surface = await page.locator('[data-nc-viewport-surface]').boundingBox(), y = surface.y + surface.height / 2;
  await page.mouse.move(surface.x + surface.width * .75, y); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .5, y, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [1, 2] }); expect(await page.evaluate(() => window.viewports)).toEqual([]);
  await page.mouse.move(surface.x + surface.width * .9, y); await page.mouse.down(); await page.mouse.move(surface.x + surface.width * .15, y, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [2, 3] }); expect(await page.evaluate(() => window.viewports.map(event => event.source))).toEqual(['pointer']);
  expect(await page.evaluate(() => window.activations)).toEqual([]);
});
// Real installed engines, including both rectangle orientations and percent.
for (const family of ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent']) {
  test(family + ': category viewport uses stable IDs, changes real SVG and keeps every raw exported/table record', async ({ page }) => {
    await mount(page, family); const original = await page.locator('[data-nc-layer="marks"]').first().innerHTML();
    const result = await page.evaluate(() => window.chart.requestViewport({ x: { firstId: 'b', lastId: 'c' } }));
    expect(result.status).toBe('ok'); await ready(page);
    expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: { firstId: 'b', lastId: 'c' } });
    expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).not.toBe(original);
    const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(csv.status).toBe('ok');
    // Raw input order and outside-window records are preserved, not filtered.
    expect(csv.value).toContain('first');
    await page.getByRole('button', { name: 'View data table', exact: true }).click(); expect(await page.locator('[data-nc-table] tbody tr').count()).toBe(6);
    await page.getByRole('button', { name: 'Close data table', exact: true }).click();
    expect((await page.evaluate(() => window.chart.requestViewport({}))).status).toBe('ok'); await ready(page);
    expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).toBe(original);
    expect(await page.evaluate(() => window.viewports.map(event => event.effect))).toEqual(['accepted', 'accepted']);
  });
  test(family + ': controlled requests do not paint rejected proposals, accepted full updates do not echo', async ({ page }) => {
    await mount(page, family, { mode: 'controlled', axes: 'xy', value: {}, controls: false });
    const original = await page.locator('[data-nc-layer="marks"]').first().innerHTML();
    expect((await page.evaluate(() => window.chart.requestViewport({ y: [0, 3] }))).status).toBe('ok');
    expect(await page.evaluate(() => window.chart.getViewport())).toEqual({}); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).toBe(original);
    expect(await page.evaluate(() => window.viewports)).toHaveLength(1);
    expect((await page.evaluate(() => { window.spec = { ...window.spec, viewport: { ...window.spec.viewport, value: window.viewports[0].viewport } }; return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page);
    expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ y: [0, 3] }); expect(await page.evaluate(() => window.viewports)).toHaveLength(1);
    expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).not.toBe(original);
  });
  test(family + ': malformed/outside/disabled requests reject atomically and destroy cannot emit late viewport outputs', async ({ page }) => {
    await mount(page, family, { mode: 'internal', axes: 'x', controls: false });
    const result = await page.evaluate(() => ({ bad: [{ x: [0, 1] }, { x: { firstId: 'unknown', lastId: 'c' } }, { y: [0, 1] }].map(value => window.chart.requestViewport(value)), current: window.chart.getViewport(), events: window.viewports.length }));
    expect(result.bad.every(value => value.status === 'invalid')).toBe(true); expect(result.current).toEqual({}); expect(result.events).toBe(0);
    expect(await page.evaluate(() => { window.chart.destroy(); return window.chart.requestViewport({}).status; })).toBe('invalid');
    expect(await page.evaluate(() => window.chart.getViewport())).toBe(null); expect(await page.evaluate(() => window.viewports)).toEqual([]);
  });
}
test('Scatter applies true numeric XY clipping, retains raw records and navigates the surviving logical point', async ({ page }) => {
  await mount(page, 'scatter');
  expect((await page.evaluate(() => window.chart.requestViewport({ x: [-1, 1], y: [-1, 1] }))).status).toBe('ok'); await ready(page);
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({ x: [-1, 1], y: [-1, 1] });
  await expect(page.locator('[data-nc-layer="marks"] :is(circle,rect,path)')).toHaveCount(1);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.activations.map(event => event.point.id))).toEqual(['zero']);
  const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value).toContain('missing'); expect(csv.value).toContain('first');
  await page.getByRole('button', { name: 'View data table', exact: true }).click(); await expect(page.locator('[data-nc-table] tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Close data table', exact: true }).click();
  expect((await page.evaluate(() => window.chart.requestViewport({}))).status).toBe('ok'); await ready(page); await expect(page.locator('[data-nc-layer="marks"] :is(circle,rect,path)')).toHaveCount(3);
  expect(await page.evaluate(() => window.viewports.map(event => event.effect))).toEqual(['accepted', 'accepted']);
});
test('Scatter controlled XY requests preserve rejected geometry, accept once and reject missing callbacks before DOM ownership', async ({ page }) => {
  await mount(page, 'scatter', { mode: 'controlled', axes: 'xy', value: {}, controls: false });
  const before = await page.locator('[data-nc-layer="marks"]').first().innerHTML();
  expect((await page.evaluate(() => window.chart.requestViewport({ x: [-1, 1], y: [-1, 1] }))).status).toBe('ok');
  expect(await page.evaluate(() => window.chart.getViewport())).toEqual({}); expect(await page.locator('[data-nc-layer="marks"]').first().innerHTML()).toBe(before);
  expect((await page.evaluate(() => { window.spec = { ...window.spec, viewport: { ...window.spec.viewport, value: window.viewports[0].viewport } }; return window.chart.update(window.spec); })).status).toBe('ok'); await ready(page);
  expect(await page.evaluate(() => window.viewports)).toHaveLength(1); await expect(page.locator('[data-nc-layer="marks"] :is(circle,rect,path)')).toHaveCount(1);
  const result = await page.evaluate(() => { window.chart.destroy(); const result = window.NCExport.createScatterChart(document.querySelector('#host'), window.spec, { instanceId: 'missing-vp' }); return { result, owned: document.querySelector('#host').childElementCount }; });
  expect(result.result.status).toBe('invalid'); expect(result.result.diagnostic.reason).toBe('MISSING_VIEWPORT_HANDLER'); expect(result.owned).toBe(0);
});
for (const family of ['pie', 'donut']) test(family + ': radial API has no fictitious Cartesian viewport methods or accepted viewport config', async ({ page }) => {
  await page.setContent('<!doctype html><div id="host" style="width:768px;height:400px"></div><div id="invalid"></div>'); await page.addScriptTag({ path: directory + '/browser-harness.js' });
  const result = await page.evaluate(({ family, spec }) => {
    const create = window.NCExport['create' + family[0].toUpperCase() + family.slice(1) + 'Chart'], first = create(document.querySelector('#host'), spec, { instanceId: 'radial-no-viewport' });
    if (first.status !== 'ok') return first;
    const methods = [typeof first.value.getViewport, typeof first.value.requestViewport];
    const invalid = create(document.querySelector('#invalid'), { ...spec, viewport: { mode: 'internal', axes: 'xy' } }, { instanceId: 'bad-radial-viewport' });
    first.value.destroy(); return { methods, invalid, owned: document.querySelector('#invalid').childElementCount };
  }, { family, spec: familyFixture(family, false) });
  expect(result.methods).toEqual(['undefined', 'undefined']); expect(result.invalid.status).toBe('invalid'); expect(result.owned).toBe(0);
});
for (const family of ['line', 'spline', 'area']) for (const kind of ['linear', 'time']) test(family + ': irregular ' + kind + ' windows retain off-window boundary neighbors and raw point identity', async ({ page }) => {
  const unit = kind === 'time' ? 86400000 : 1, origin = kind === 'time' ? Date.UTC(2026, 0, 1) : 0;
  await mount(page, family, { mode: 'internal', axes: 'xy', controls: false }, { axes: { x: { kind }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Measured', markers: 'on', data: [0, 5, 20, 35].map((x, index) => ({ id: 'p' + index, x: origin + x * unit, y: [0, 10, -5, 5][index] })) }] });
  expect((await page.evaluate(value => window.chart.requestViewport({ x: value }), [origin + 4 * unit, origin + 25 * unit])).status).toBe('ok'); await ready(page);
  const bounds = await page.evaluate(() => { const path = document.querySelector('[data-nc-layer="marks"] path'), svg = document.querySelector('[data-nc-layer="marks"]').ownerSVGElement, grid = document.querySelector('[data-nc-grid]'), box = path.getBBox(), plot = grid.getBoundingClientRect(), root = svg.getBoundingClientRect(); return { pathLeft: box.x, pathRight: box.x + box.width, plotLeft: plot.left - root.left, plotRight: plot.right - root.left }; });
  // Stroke paths may be geometrically clipped; Area may retain its full closed
  // polygon under the SVG clip. Both must reach both window boundaries.
  expect(bounds.pathLeft).toBeLessThanOrEqual(bounds.plotLeft + .01); expect(bounds.pathRight).toBeGreaterThanOrEqual(bounds.plotRight - .01);
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await grid.press('Enter');
  expect(await page.evaluate(() => window.activations[0].point.id)).toBe('p1');
});
