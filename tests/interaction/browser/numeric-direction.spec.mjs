import { test, expect } from '@playwright/test';
import { mount as mountChart, ready } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
const directory = process.env.NC_NUMERIC_DIRECTION_DIR ?? 'artifacts/v1-numeric-direction';
if (!path.resolve(directory).startsWith(path.resolve('artifacts') + path.sep)) throw Error('Project-local numeric-direction evidence');
const cases = [...['line', 'spline', 'area', 'column', 'bar', 'stacked-column', 'stacked-bar', 'scatter'].map(family => [family, 'auto']), ['line', 'off']];
for (const [family, labels] of cases) test(family + '/' + labels + ' negative axis signs and physical anchoring survive live/exported RTL', async ({ page }, info) => {
  const numeric = ['line', 'spline', 'area', 'scatter'].includes(family);
  await mountChart(page, family, false, { direction: 'rtl', theme: 'dark', labels, axes: { x: numeric ? { kind: 'linear', domain: [-4, 4] } : { kind: 'category', values: [{ id: 'a', label: 'January' }, { id: 'b', label: 'January' }, { id: 'c', label: 'March' }] }, y: { kind: 'linear', domain: [-4, 4] } }, series: [{ id: 'actual', name: 'Observed', data: [{ id: 'a', x: numeric ? -3 : 'a', y: -3 }, { id: 'b', x: numeric ? 0 : 'b', y: 0 }, { id: 'c', x: numeric ? 3 : 'c', y: 3 }] }] }, directory + '/browser-harness.js'); await ready(page);
  const report = await page.evaluate(() => {
    const inspect = parent => [...parent.querySelectorAll('text')].filter(node => !node.classList.contains('nc-owned-data-label') && /^[-−]\d/.test(node.textContent)).map(node => ({ text: node.textContent, minus: node.getExtentOfChar(0).x, digit: node.getExtentOfChar(1).x, advanceEnd: node.getEndPositionOfChar(node.textContent.length - 1).x, direction: getComputedStyle(node).direction, x: Number(node.getAttribute('x')), box: { x: node.getBBox().x, width: node.getBBox().width }, anchor: node.getAttribute('text-anchor') }));
    const live = inspect(document.getElementById('host')), result = window.NCExport.exportSvg(window.chart); if (result.status !== 'ok') throw Error(JSON.stringify(result));
    const holder = document.createElement('div'); holder.style.position = 'absolute'; holder.style.opacity = '0'; holder.style.pointerEvents = 'none'; document.body.append(holder);
    try { const xml = new DOMParser().parseFromString(result.value.svg, 'image/svg+xml'); holder.append(document.importNode(xml.documentElement, true)); return { live, exported: inspect(holder) }; } finally { holder.remove(); }
  });
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/axis-' + family + '-' + labels + '-' + info.project.name + '.json', JSON.stringify(report, null, 2));
  expect(report.live.length).toBeGreaterThan(0); expect(report.exported).toHaveLength(report.live.length);
  for (const drawing of [report.live, report.exported]) for (const label of drawing) {
    expect(label.minus, label.text).toBeLessThan(label.digit); expect(label.direction).toBe('ltr');
    if (label.anchor !== 'middle') { expect(label.anchor).toBe('end'); expect(label.advanceEnd).toBeCloseTo(label.x, 2); expect(label.box.x + label.box.width).toBeLessThan(label.x + 8); }
  }
});

test('numeric isolation preserves RTL category text and logical category order', async ({ page }) => {
  await mountChart(page, 'column', false, { direction: 'rtl', labels: 'off', axes: { x: { kind: 'category', values: [{ id: 'a', label: '-3' }, { id: 'b', label: 'يناير' }, { id: 'c', label: 'March' }] }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Observed', data: [{ id: 'a', x: 'a', y: 1 }, { id: 'b', x: 'b', y: 2 }, { id: 'c', x: 'c', y: 3 }] }] }, directory + '/browser-harness.js'); await ready(page);
  const category = await page.evaluate(() => { const node = [...document.querySelectorAll('[data-nc-layer="labels"] text')].find(node => node.textContent === '-3'); return { numeric: node.classList.contains('nc-owned-axis-number'), direction: getComputedStyle(node).direction }; });
  expect(category).toEqual({ numeric: false, direction: 'rtl' });
  const grid = page.locator('[data-nc-grid]'); await grid.focus(); await grid.press('Home'); await expect(grid.locator('[role="gridcell"]')).toContainText('-3 (a)'); await grid.press('ArrowRight'); await expect(grid.locator('[role="gridcell"]')).toContainText('يناير (b)');
});

test('UTC time ticks keep explicit numeric direction without changing raw dates', async ({ page }) => {
  await mountChart(page, 'line', false, { direction: 'rtl', labels: 'off', axes: { x: { kind: 'time' }, y: { kind: 'linear' } }, series: [{ id: 'actual', name: 'Observed', data: [{ id: 'a', x: 1700000000000, y: 1 }, { id: 'b', x: 1700003600000, y: 2 }, { id: 'c', x: 1700007200000, y: 3 }] }] }, directory + '/browser-harness.js'); await ready(page);
  const ticks = await page.locator('text.nc-owned-axis-number').evaluateAll(nodes => nodes.map(node => ({ anchor: node.getAttribute('text-anchor'), direction: getComputedStyle(node).direction })));
  expect(ticks.some(tick => tick.anchor === 'middle')).toBe(true); expect(ticks.every(tick => tick.direction === 'ltr')).toBe(true);
  const csv = await page.evaluate(() => window.NCExport.exportCsv(window.chart)); expect(csv.status).toBe('ok'); expect(csv.value).toContain('1700003600000');
});
