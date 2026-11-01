import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {availableParallelism, cpus, platform, arch} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

// Single-process diagnostic, never a mobile FPS assertion or an absolute CI gate.
// Build first. Example: node --expose-gc tooling/benchmark-plan.mjs --output work/performance/current.json
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const sampleCount = Number(arg('--samples', '48'));
const warmups = Number(arg('--warmups', '12'));
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 8 && sampleCount <= 500);
assert.ok(Number.isInteger(warmups) && warmups >= 0 && warmups <= 100);
const modulePath = resolve(root, arg('--module', 'dist/plan.js'));
const output = resolve(root, arg('--output', 'work/performance/current.json'));
const {planChart} = await import(pathToFileURL(modulePath));
const comparePath = arg('--compare', null);
const modules = [{name: 'candidate', planChart, modulePath}];
if (comparePath) {
  const baselinePath = resolve(root, comparePath);
  modules.push({name: 'baseline', planChart: (await import(pathToFileURL(baselinePath))).planChart, modulePath: baselinePath});
}
for (const module of modules) module.ownPlanInput = (await import(pathToFileURL(resolve(dirname(module.modulePath), 'plan/input.js')))).ownPlanInput;
const axes = {x: {kind: 'linear', domain: [0, 2048]}, y: {kind: 'linear'}};
const series = (count, length) => Array.from({length: count}, (_, s) => ({
  id: `s${s}`, name: `Series ${s}`, data: Array.from({length}, (_, p) => ({
    id: `p${p}`, x: p, y: p % 17 === 0 ? null : Math.sin(p * .07 + s) * 40 + s * 10,
  })),
}));
const options = (i, extra = {}) => ({width: i % 2 ? 390 : 768, height: 320, ...extra});
const numeric = (family, count, length) => ({family, title: 'Measured signal', axes, series: series(count, length)});
const cases = [
  {name: 'line-small-64', spec: numeric('line', 2, 32), options: i => options(i)},
  {name: 'line-large-8192', spec: numeric('line', 4, 2048), options: i => options(i)},
  {name: 'line-large-zoom-visibility', spec: numeric('line', 4, 2048), options: i => options(i, {viewport: {axes: 'x', value: {x: [100 + i % 32, 700 + i % 32]}}, hiddenSeriesIds: i % 2 ? ['s1'] : []})},
  {name: 'scatter-large-4096', spec: numeric('scatter', 2, 2048), options: i => options(i)},
  {name: 'area-stacked-256', spec: {...numeric('area', 4, 64), axes: {x: {kind: 'category', values: Array.from({length: 64}, (_, i) => ({id: `c${i}`}))}, y: {kind: 'linear'}}, series: series(4, 64).map(s => ({...s, data: s.data.map((p, i) => ({...p, x: `c${i}`}))}))}, options: i => options(i, {stacking: 'sum'})},
  {name: 'sankey-128-nodes-448-links', spec: {family: 'sankey', title: 'Flow', nodes: Array.from({length: 128}, (_, i) => ({id: `n${i}`, label: `Node ${i}`})), links: Array.from({length: 7}, (_, layer) => Array.from({length: 64}, (_, offset) => ({id: `l${layer}-${offset}`, from: `n${layer * 16 + offset % 16}`, to: `n${(layer + 1) * 16 + (offset * 7) % 16}`, value: 1 + offset % 5}))).flat()}, options: i => options(i)},
  {name: 'xrange-2048-zoom-updates', spec: {family: 'xrange', title: 'Intervals', axes: {x: {kind: 'linear', domain: [0, 2048]}, y: {kind: 'category', values: Array.from({length: 32}, (_, i) => ({id: `row${i}`, label: `Row ${i}`}))}}, series: [{id: 's0', name: 'Measured', data: Array.from({length: 2048}, (_, i) => ({id: `p${i}`, rowId: `row${i % 32}`, start: i % 31 === 0 ? null : i, end: i % 31 === 0 ? null : i + 10, completed: i % 7 === 0 ? null : (i % 5) / 4}))}]}, options: i => options(i, {viewport: {axes: 'x', value: {x: [100 + i % 32, 700 + i % 32]}}})},
  {name: 'timeline-2048-zoom-updates', spec: {family: 'timeline', title: 'Events', axes: {x: {kind: 'linear', domain: [0, 2048]}}, series: [{id: 's0', name: 'Events', data: Array.from({length: 2048}, (_, i) => ({id: `p${i}`, x: i % 31 === 0 ? null : i, title: `Observation ${i}`, description: 'The complete original event description.'}))}]}, options: i => options(i, {viewport: {axes: 'x', value: {x: [100 + i % 32, 700 + i % 32]}}})},
];
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const results = [];
for (const item of cases) {
  const before = JSON.stringify(item.spec);
  const run = (module, i) => {
    const result = module.planChart(item.spec, item.options(i));
    assert.notEqual(result.status, 'invalid', `${item.name}: ${JSON.stringify(result)}`);
    assert.ok(Object.isFrozen(result.frame), 'Frame must remain immutable');
    return result;
  };
  for (let i = 0; i < warmups; i++) for (const module of modules) run(module, i);
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  // Keep frames inside a completed scope before measuring retained heap.
  const measured = (() => {
    const records = new Map(modules.map(m => [m.name, {times: [], checksum: createHash('sha256'), observations: 0, geometryItems: 0}]));
    for (let i = 0; i < sampleCount; i++) {
      // Alternating order reduces temperature, background load and GC-order bias.
      for (const module of i % 2 ? [...modules].reverse() : modules) {
        const record = records.get(module.name);
        const start = performance.now();
        const result = run(module, i);
        record.times.push(performance.now() - start);
        // Hashing is outside the measurement and detects geometry/data drift.
        record.checksum.update(JSON.stringify(result));
        record.observations = Math.max(record.observations, result.frame.observations.length);
        record.geometryItems = Math.max(record.geometryItems, result.frame.series.reduce((n, s) => n + (s.commands?.length ?? 0) + (s.areaCommands?.length ?? 0) + (s.bars?.length ?? 0) + (s.circles?.length ?? 0), 0));
      }
    }
    return [...records].map(([name, record]) => {
      record.times.sort((a, b) => a - b);
      return {module: name, sampleCount, medianMs: percentile(record.times, .5), p95Ms: percentile(record.times, .95), minMs: record.times[0], maxMs: record.times.at(-1), observations: record.observations, geometryItems: record.geometryItems, checksum: record.checksum.digest('hex')};
    });
  })();
  globalThis.gc?.();
  const sampleBatchRetainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
  assert.equal(JSON.stringify(item.spec), before, 'Planner must not mutate the source');
  if (measured.length > 1) assert.equal(measured[0].checksum, measured[1].checksum, `${item.name}: result must match baseline byte-for-byte`);
  results.push({name: item.name, sampleBatchRetainedHeapBytes, measurements: measured});
}
const snapshotResults = [];
for (const item of cases.filter(c => ['line-small-64', 'line-large-8192', 'xrange-2048-zoom-updates', 'timeline-2048-zoom-updates'].includes(c.name))) {
  const expected = JSON.stringify(item.spec);
  for (let i = 0; i < warmups; i++) for (const module of modules) module.ownPlanInput(item.spec);
  const times = new Map(modules.map(m => [m.name, []]));
  for (let i = 0; i < sampleCount; i++) for (const module of i % 2 ? [...modules].reverse() : modules) {
    const start = performance.now();
    const value = module.ownPlanInput(item.spec);
    times.get(module.name).push(performance.now() - start);
    if (i === 0) assert.equal(JSON.stringify(value), expected);
  }
  snapshotResults.push({name: item.name, measurements: [...times].map(([module, values]) => {
    values.sort((a, b) => a - b);
    return {module, medianMs: percentile(values, .5), p95Ms: percentile(values, .95)};
  })});
}
const report = {generatedAt: new Date().toISOString(), node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, availableParallelism: availableParallelism(), processWorkers: 1, modulePath, warmups, sampleCount, gcExposed: typeof globalThis.gc === 'function', caveat: 'Node diagnostic only; not native frame rate, gesture latency or physical-device memory acceptance. Heap deltas include runtime caches and do not establish a leak.', results, snapshotResults};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output, cases: results.map(({name, sampleBatchRetainedHeapBytes, measurements}) => ({name, sampleBatchRetainedHeapBytes, measurements: measurements.map(({module, medianMs, p95Ms}) => ({module, medianMs: +medianMs.toFixed(3), p95Ms: +p95Ms.toFixed(3)}))}))}));
