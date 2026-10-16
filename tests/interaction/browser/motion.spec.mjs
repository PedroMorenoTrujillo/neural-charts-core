import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import { mount, ready, coreFamily, familyFixture, captureCoverage } from './helpers.mjs';
import { probeChartResources } from '../../../../../tooling/browser-resource-probe.mjs';
const directory = 'artifacts/v1-motion', families = ['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'percent', 'pie', 'donut', 'scatter'];
const test = base.extend({ coverageEvidence: [async ({ page }, use, info) => { await use(); await captureCoverage(page, info, 'motion', directory); }, { auto: true }] });
// Browser-native frame sampling observes the actual rendered layer. This probe
// is test-owned and is stopped before any Core resource accounting.
function observeMotion({ capture = false, activate = false } = {}) {
  window.motionFrames = []; window.motionQueries = 0; window.motionCaptured = false; let handle = null, stopped = false, fired = false; const start = performance.now(), original = window.matchMedia;
  window.matchMedia = function(query) { if (query === '(prefers-reduced-motion: reduce)') window.motionQueries++; return original.call(window, query); };
  const frame = time => {
    if (stopped) return; const layer = document.querySelector('[data-nc-layer="marks"]'), opacity = layer?.style.opacity ?? '', value = opacity === '' ? 1 : Number(opacity), revision = window.chart?.getSnapshot().committedRevision ?? 0;
    window.motionFrames.push({ time, opacity, revision });
    if (layer && value > 0 && value < 1 && revision && capture && !window.motionCaptured) { window.motionCaptured = true; window.duringSvg = window.NCExport.exportSvg(window.chart); window.duringPng = window.NCExport.exportPng(window.chart, { width: 400 }); }
    if (layer && value > 0 && value < 1 && revision && activate && !fired) { fired = true; const grid = document.querySelector('[data-nc-grid]'); grid.focus(); grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    if (time - start < 5000) handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  window.stopMotionProbe = () => { stopped = true; if (handle !== null) cancelAnimationFrame(handle); window.matchMedia = original; };
}
async function mounted(page, family, mode, options = {}) { await mount(page, family, false, mode === undefined ? {} : { motion: mode }, directory + '/browser-harness.js', page => page.evaluate(observeMotion, options)); }
const opacity = page => page.evaluate(() => document.querySelector('[data-nc-layer="marks"]')?.style.opacity ?? '');
async function settle(page) { await expect.poll(() => opacity(page)).toBe(''); await ready(page); }
async function replaceData(page) { return page.evaluate(() => { const spec = window.spec; window.spec = { ...spec, ...(spec.data ? { data: spec.data.map((point, index) => ({ ...point, value: index === 0 ? point.value + 1 : point.value })) } : { series: spec.series.map((series, seriesIndex) => ({ ...series, data: series.data.map((point, index) => ({ ...point, y: seriesIndex === 0 && index === 0 ? point.y + 1 : point.y })) })) }) }; return window.chart.update(window.spec); }); }
for (const family of families) {
  test(family + ': default none has no preference subscription or hidden layer; invalid modes reject atomically', async ({ page }) => {
    await mounted(page, family, undefined); await settle(page);
    expect(await page.evaluate(() => window.motionQueries)).toBe(0); expect(await page.evaluate(() => window.motionFrames.every(frame => frame.opacity === ''))).toBe(true);
    const result = await page.evaluate(() => { const revision = window.chart.getSnapshot().committedRevision; return { bad: window.chart.update({ ...window.spec, motion: 'morph' }), revision, after: window.chart.getSnapshot().committedRevision }; }); expect(result.bad.status).toBe('invalid'); expect(result.after).toBe(result.revision); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); await page.evaluate(() => window.stopMotionProbe());
  });
  test(family + ': subtle uses real frames while domain activation and exported SVG already describe final geometry', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message)); await mounted(page, family, 'subtle', { capture: true, activate: true }); await settle(page);
    const result = await page.evaluate(() => ({ frames: window.motionFrames, queries: window.motionQueries, captured: window.motionCaptured, during: window.duringSvg, after: window.NCExport.exportSvg(window.chart), activations: window.activations, diagnostics: window.diagnostics }));
    expect(result.frames.some(frame => frame.opacity !== '' && Number(frame.opacity) < 1)).toBe(true); expect(result.frames.some(frame => Number(frame.opacity) > 0 && Number(frame.opacity) < 1)).toBe(true); expect(result.queries).toBe(1); expect(result.captured).toBe(true); expect(result.during.status).toBe('ok'); expect(result.after.status).toBe('ok'); expect(result.during.value.svg).toBe(result.after.value.svg); expect(result.after.value.svg).not.toMatch(/style="[^"]*opacity:/); expect(result.activations).toHaveLength(1); expect(result.activations[0].point.id).toBe('first'); expect(result.activations[0].source).toBe('keyboard'); expect(result.diagnostics).toEqual([]); expect(errors).toEqual([]);
    const png = await page.evaluate(async () => { const before = await window.duringPng, after = await window.NCExport.exportPng(window.chart, { width: 400 }); if (before.status !== 'ok' || after.status !== 'ok') return { before, after }; const a = new Uint8Array(await before.value.blob.arrayBuffer()), b = new Uint8Array(await after.value.blob.arrayBuffer()); return { before: before.status, after: after.status, equal: a.length === b.length && a.every((value, index) => value === b[index]) }; }); expect(png).toEqual({ before: 'ok', after: 'ok', equal: true }); await page.evaluate(() => window.stopMotionProbe());
  });
  test(family + ': reduced motion is immediate and a live preference change cancels an updating transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await mounted(page, family, 'subtle'); await settle(page); expect(await page.evaluate(() => window.motionFrames.every(frame => frame.opacity === ''))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); expect((await replaceData(page)).status).toBe('ok'); await ready(page); await expect.poll(() => page.evaluate(() => window.motionFrames.some(frame => frame.revision > 1 && Number(frame.opacity) > 0 && Number(frame.opacity) < 1))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await settle(page); expect(await page.evaluate(() => window.motionQueries)).toBe(1); expect((await replaceData(page)).status).toBe('ok'); await ready(page); expect(await opacity(page)).toBe(''); expect(await page.evaluate(() => window.activations)).toEqual([]); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); await page.evaluate(() => window.stopMotionProbe());
  });
  test(family + ': update, resize and destroy cancel obsolete presentation without late domain outputs', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message)); await mounted(page, family, 'subtle'); expect((await replaceData(page)).status).toBe('ok'); await ready(page);
    await page.evaluate(() => { document.querySelector('#host').style.width = '430px'; }); await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().size.width)).toBe(430); await ready(page); expect(await opacity(page)).toBe('');
    expect((await replaceData(page)).status).toBe('ok'); await ready(page); const exportResult = await page.evaluate(async () => { const png = window.NCExport.exportPng(window.chart); window.chart.destroy(); return png; }); expect(exportResult.diagnostic.reason).toBe('EXPORT_ABORTED'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); expect(await page.locator('[data-nc-root]').count()).toBe(0); expect(await page.evaluate(() => window.activations)).toEqual([]); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); expect(errors).toEqual([]); await page.evaluate(() => window.stopMotionProbe());
  });
  test(family + ': font metrics repaint preserves the active presentation deadline', async ({ page }) => {
    await mounted(page, family, 'subtle'); await settle(page);
    expect((await replaceData(page)).status).toBe('ok'); await ready(page);
    const result = await page.evaluate(async () => {
      const layer = () => document.querySelector('[data-nc-layer="marks"]');
      const before = layer().style.opacity, start = performance.now();
      document.fonts.dispatchEvent(new Event('loadingdone'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = layer().style.opacity;
      while (layer().style.opacity !== '' && performance.now() - start < 1000) await new Promise(requestAnimationFrame);
      return { before, after, elapsed: performance.now() - start, final: layer().style.opacity };
    });
    expect(Number(result.before)).toBeGreaterThan(0); expect(Number(result.before)).toBeLessThan(1);
    expect(result.after).not.toBe(''); expect(Number(result.after)).toBeGreaterThanOrEqual(Number(result.before));
    expect(result.final).toBe(''); expect(result.elapsed).toBeLessThan(500); await page.evaluate(() => window.stopMotionProbe());
  });
  test(family + ': an asynchronous presentation write failure faults once without escaping or retaining work', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await mount(page, family, false, { motion: 'subtle' }, directory + '/browser-harness.js', page => page.evaluate(() => {
      const observer = new MutationObserver(() => { const layer = document.querySelector('[data-nc-layer="marks"]'); if (!layer) return; const style = layer.style, native = style.setProperty.bind(style); Object.defineProperty(style, 'setProperty', { configurable: true, value(name, value, priority) { if (name === 'opacity' && Number(value) > 0) throw Error('Simulated asynchronous layer failure'); native(name, value, priority); } }); observer.disconnect(); }); observer.observe(document.querySelector('#host'), { childList: true, subtree: true });
    }), false);
    await expect.poll(() => page.evaluate(() => window.chart.getSnapshot().phase)).toBe('faulted'); expect(await page.evaluate(() => window.diagnostics)).toMatchObject([{ reason: 'DOM_WRITE_FAILED', path: 'motion' }]); expect(await page.evaluate(() => window.activations)).toEqual([]); expect(errors).toEqual([]); await page.evaluate(() => window.chart.destroy()); expect(await page.locator('[data-nc-root]').count()).toBe(0);
  });
}
test('110 subtle-motion lifecycle cycles across all families release every frame and media listener', async ({ page }, info) => {
  await mount(page, 'line', false, { motion: 'none' }, directory + '/browser-harness.js'); await page.evaluate(() => window.chart.destroy()); await page.evaluate('globalThis.motionResourceProbe=' + probeChartResources.toString());
  const report = await page.evaluate(async cases => {
    const groups = [], references = [], handles = [];
    for (const { family, spec, name } of cases) {
      const result = await window.motionResourceProbe({ factoryPath: 'NCExport.' + name, template: spec, cycles: 10, datumPath: family === 'pie' || family === 'donut' ? ['data', 0, 'datum'] : ['series', 0, 'data', 0, 'datum'], exercise: async chart => { const result = window.NCExport.exportSvg(chart); if (result.status !== 'ok') throw Error(JSON.stringify(result)); } });
      groups.push({ family, result }); references.push(...window.__ncResourceReferences); handles.push(...window.__ncRetainedControllers);
    }
    window.motionReferences = references; window.motionHandles = handles; return { cycles: groups.reduce((count, group) => count + group.result.cycles.length, 0), groups, roots: document.querySelectorAll('[data-nc-root]').length };
  }, families.map(family => ({ family, spec: { ...familyFixture(family, false), motion: 'subtle' }, name: 'create' + coreFamily(family)[0].toUpperCase() + coreFamily(family).slice(1) + 'Chart' })));
  expect(report.cycles).toBe(110); expect(report.roots).toBe(0);
  if (info.project.name === 'chromium') { const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); expect(await page.evaluate(() => window.motionReferences.filter(ref => ref.deref()).length)).toBe(0); await cdp.detach(); }
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/resources-' + info.project.name + '.json', JSON.stringify(report, null, 2));
});
