import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
export async function captureCoverage(page, info, owner, artifactDirectory = 'artifacts/v1-interaction') {
  if (process.env.NC_COVERAGE !== '1' || info.project.name !== 'chromium') return;
  const value = await page.evaluate(() => globalThis.__coverage__); if (value) { const directory = artifactDirectory + '/browser-coverage'; fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/' + info.testId.replace(/[^a-z0-9]/gi, '_') + '-' + owner + '.json', JSON.stringify(value)); }
}
export function coreFamily(family) { return family.startsWith('stacked') || family === 'percent' ? 'stacked' : family === 'bar' ? 'column' : family; }
export function fixture(family, selection) { const kind = coreFamily(family); return { family: kind, ...(family === 'bar' || family === 'stacked-bar' ? { orientation: 'horizontal' } : {}), ...(kind === 'stacked' ? { stacking: family === 'percent' ? 'percent' : 'sum' } : {}), title: 'Quarterly observations', selection, crosshair: 'xy', axes: { x: { kind: 'category', values: [{ id: 'a', label: 'January' }, { id: 'b', label: 'January' }, { id: 'c', label: 'March' }] }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'first', x: 'a', y: 4 }, { id: 'zero', x: 'b', y: 0 }, { id: 'missing', x: 'c', y: null }] }, { id: 'target', name: 'Target', data: [{ id: 'first', x: 'a', y: 2 }, { id: 'next', x: 'b', y: 3 }, { id: 'last', x: 'c', y: 5 }] }] }; }
export function familyFixture(family, selection) {
  if (family === 'pie' || family === 'donut') return { family, title: 'Radial observations', selection, data: [{ id: 'first', label: 'Actual', value: 4 }, { id: 'second', label: 'Actual', value: 2 }, { id: 'zero', label: 'Zero', value: 0 }, { id: 'missing', label: 'Missing', value: null }] };
  if (family === 'scatter') return { family, title: 'Unordered XY observations', selection, crosshair: 'xy', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'first', x: 3, y: -4 }, { id: 'second', x: -2, y: 5 }, { id: 'zero', x: 0, y: 0 }, { id: 'missing', x: null, y: 2 }] }] };
  return fixture(family, selection);
}
export async function mount(page, family, selection = { mode: 'internal', kind: 'multiple' }, overrides = {}, harness = process.env.NC_INTERACTION_HARNESS ?? 'artifacts/v1-interaction/browser-harness.js', beforeMount, waitForFrame = true) {
  await page.setContent('<!doctype html><html lang="en"><head><title>Interaction acceptance</title><style>body{margin:0}h1{font:600 16px/24px sans-serif;margin:8px 0}</style></head><body><main><h1>Interaction acceptance</h1><div id="host" style="width:768px;height:400px"></div><button id="outside">Outside</button></main></body></html>');
  await page.addScriptTag({ path: path.resolve(harness) });
  if (beforeMount) await beforeMount(page);
  const result = await page.evaluate(({ spec, family }) => {
    window.spec = spec; window.selections = []; window.activations = []; window.diagnostics = [];
    const result = window.NCExport['create' + family[0].toUpperCase() + family.slice(1) + 'Chart'](document.querySelector('#host'), spec, { instanceId: 'selection-test', onSelectionChange: value => window.selections.push(value), onPointActivate: value => window.activations.push(value), onDiagnostic: value => window.diagnostics.push(value) });
    if (result.status === 'ok') window.chart = result.value; return result.status === 'ok' ? 'ok' : result;
  }, { spec: { ...familyFixture(family, selection), ...overrides }, family: coreFamily(family) }); expect(result).toBe('ok'); if (waitForFrame) await ready(page);
}
export async function ready(page) { await expect.poll(() => page.evaluate(() => { const state = window.chart.getSnapshot(); return state.phase === 'active' && state.revision === state.committedRevision && state.committedRevision > 0; })).toBe(true); expect(await page.evaluate(() => window.diagnostics)).toEqual([]); }
