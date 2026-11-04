import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {packedMetadata} from './pack-metadata.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const staging = path.join(root, 'work/package-check');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  env: {...process.env, npm_config_audit: 'false', npm_config_fund: 'false'},
});
const walk = directory => readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});

rmSync(staging, {recursive: true, force: true});
mkdirSync(staging, {recursive: true});
const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  assert.equal(Object.keys(metadata[field] ?? {}).length, 0, field + ' must remain empty');
}
assert.equal(metadata.license, 'MIT');
assert.equal(metadata.sideEffects, false);
const javascript = walk(path.join(root, 'dist')).filter(f => f.endsWith('.js'));
const sourceFiles = walk(path.join(root, 'src')).filter(f => f.endsWith('.ts'));
const config = ts.parseJsonConfigFileContent(JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')), ts.sys, root);
const program = ts.createProgram(sourceFiles, config.options);
const checker = program.getTypeChecker();
const platformNames = new Set(['window', 'document', 'HTMLElement', 'SVGElement', 'navigator', 'requestAnimationFrame', 'setInterval', 'setTimeout', 'require', 'process']);
for (const file of program.getSourceFiles().filter(file => sourceFiles.includes(file.fileName))) {
  const inspect = node => {
    if (ts.isIdentifier(node) && platformNames.has(node.text)) {
      const declarations = checker.getSymbolAtLocation(node)?.declarations;
      // A local domain window is valid; unresolved globals and host declarations are not.
      assert(declarations?.length && declarations.every(declaration => sourceFiles.includes(declaration.getSourceFile().fileName)), 'Platform identifier in ' + file.fileName + ': ' + node.text);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(file);
}
for (const file of javascript) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    assert(match[1].startsWith('.'), 'Non-relative runtime dependency in ' + file);
  }
}

const packed = packedMetadata(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', staging]), metadata.name, metadata.version);
for (const file of packed.files) {
  assert(/^(?:package\.json|README\.md|LICENSE|dist\/.+\.(?:js|d\.ts))$/.test(file.path), 'Unexpected published file: ' + file.path);
  assert(!file.path.includes('..'), 'Invalid archive path');
}
assert(packed.files.some(file => file.path === 'README.md'));
const consumer = path.join(staging, 'consumer');
mkdirSync(consumer);
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
run(npm, ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--cache', path.join(staging, 'cache'), path.join(staging, packed.filename)], consumer);

const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
const examples = [...readme.matchAll(/```ts\n([\s\S]*?)\n```/g)].map(match => match[1]);
// The union-shape excerpt explains a return type; the other examples must compile.
examples.filter(source => source.includes('import ')).forEach((source, index) => writeFileSync(path.join(consumer, 'example-' + index + '.ts'), source));
writeFileSync(path.join(consumer, 'example-pictorial-api.ts'), `
import {planChart, type PlanPictorialSpec, type PlanPictorialGlyphId, type PlanCompoundPolygonHit, type PlanHitRegion} from '@neural-charts/core';
const source: PlanPictorialSpec = {family: 'pictorial', title: 'Capacity', axes: {x: {kind: 'category', values: [{id: 'a', label: 'A'}]}, y: {kind: 'linear', domain: [0, 100]}}, series: [{id: 's', name: 'Original', data: [{id: 'p', x: 'a', y: 60}]}]};
const result = planChart(source, {width: 390, height: 320});
if (result.status !== 'invalid') {
  const id: PlanPictorialGlyphId | undefined = result.frame.pictorialGlyphs?.[0]?.id;
  const hit: PlanHitRegion | undefined = result.frame.observations[0]?.hit;
  const compound: PlanCompoundPolygonHit | undefined = hit?.kind === 'compoundPolygon' ? hit : undefined;
  if (id?.kind === 'grouped') { const seriesId: string = id.seriesId; void seriesId; }
  void compound;
}
`);
writeFileSync(path.join(consumer, 'example-tilemap-api.ts'), `
import {planChart, type PlanTilemapSpec, type PlanColorAxisSpec, type PlanCellPaint} from '@neural-charts/core';
const colorAxis: PlanColorAxisSpec = {kind: 'continuous', stops: [{at: 0, color: '#000000'}, {at: 1, color: '#FFFFFF'}], missingColor: '#EEEEEE'};
const source: PlanTilemapSpec = {family: 'tilemap', title: 'Cells', series: [{id: 's', name: 'Source', data: [{id: 'zero', x: 0, y: 0, value: 0}, {id: 'unknown', x: 1, y: 0, value: null}]}], tileShape: 'hexagon', colorAxis};
const result = planChart(source, {width: 390, height: 320});
if (result.status !== 'invalid') {
  const cell: PlanCellPaint | undefined = result.frame.series[0]?.cells?.[0];
  if (cell?.geometry.kind === 'polygon') { const x: number | undefined = cell.geometry.vertices[0]?.x; void x; }
  const missing = result.frame.tilemapData?.find(point => point.value === null);
  void missing;
}
`);
writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
  target: 'ES2022', lib: ['ES2022'], types: [], module: 'NodeNext', moduleResolution: 'NodeNext',
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, skipLibCheck: false,
  noEmitOnError: true, outDir: 'compiled',
}, include: ['example-*.ts']}, null, 2));
run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer);

writeFileSync(path.join(consumer, 'runtime.mjs'), `
import assert from 'node:assert/strict';
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'navigator']) {
  Object.defineProperty(globalThis, name, {configurable: true, get() {throw new Error('Platform access: ' + name);}});
}
const root = await import('@neural-charts/core');
const seam = await import('@neural-charts/core/plan');
assert.deepEqual(Object.keys(root).sort(), ['containsPlanHit', 'financialFamilies', 'financialParameterKeys', 'hitTestPlanRegion', 'planChart', 'planFinancialChart', 'preparePlanRegionHit', 'prepareWordCloudMeasurements', 'transformPlanViewport']);
assert.equal(root.planChart, seam.planChart);
assert.equal(root.prepareWordCloudMeasurements, seam.prepareWordCloudMeasurements);
const input = {family: 'line', title: 'Source', axes: {x: {kind: 'linear'}, y: {kind: 'linear'}}, series: [{id: 's', name: 'Series', data: [{id: 'a', x: 0, y: 0}, {id: 'gap', x: 1, y: null}, {id: 'b', x: 2, y: 8}]}]};
const first = root.planChart(input, {width: 390, height: 300, viewport: {axes: 'x'}});
assert.equal(first.status, 'ok');
assert(Object.isFrozen(first.frame));
assert.deepEqual(first.frame.observations.map(p => p.value), [0, 8]);
input.series[0].data[0].y = 99;
assert.equal(first.frame.observations[0].value, 0);
const transformed = root.transformPlanViewport(first.frame.viewport, {kind: 'zoom', factor: 2});
assert.equal(transformed.status, 'ok');
assert.equal(root.planChart(input, {width: 0, height: 300}).status, 'invalid');
assert.equal(root.planChart(input, {width: 390, height: 300, hiddenSeriesIds: ['s']}).status, 'empty');
const wordSource = {family: 'wordcloud', title: 'Supplied box fixture', words: [{id: 'word', text: 'Literal <text>', weight: 3}]};
const wordOptions = {width: 390, height: 300, fontKey: 'opaque-fixture-key'};
const preparation = root.prepareWordCloudMeasurements(wordSource, wordOptions);
assert.equal(preparation.status, 'ok');
assert(Object.isFrozen(preparation.preparation.requests));
assert.equal(root.planChart(wordSource, {width: 390, height: 300}).diagnostic.reason, 'TEXT_MEASUREMENTS_REQUIRED');
// Pre-supplied rectangles exercise the port; they do not approximate any font.
const measurements = preparation.preparation.requests.map(request => ({...request, width: 80, height: 20}));
const cloud = root.planChart(wordSource, {width: 390, height: 300, wordcloudText: {fontKey: wordOptions.fontKey, measurements}});
assert.equal(cloud.status, 'ok');
assert.equal(cloud.frame.series[0].textGlyphs[0].text, 'Literal <text>');
assert.equal(cloud.frame.wordcloudData[0].weight, 3);
const pictorialSource = {family: 'pictorial', title: 'Capacity', axes: {x: {kind: 'category', values: [{id: 'a', label: 'A'}]}, y: {kind: 'linear', domain: [0, 100]}}, series: [{id: 's', name: 'Original', data: [{id: 'p', x: 'a', y: 60}]}]};
const pictorial = root.planChart(pictorialSource, {width: 390, height: 320});
assert.equal(pictorial.status, 'ok');
assert.equal(pictorial.frame.observations[0].hit.kind, 'compoundPolygon');
assert.equal(pictorial.frame.pictorialData[0].y, 60);
assert.equal(pictorial.frame.series[0].pictorialFills[0].glyphId, pictorial.frame.pictorialGlyphs[0].id);
assert(Object.isFrozen(pictorial.frame.pictorialGlyphs[0].id));
for (const stacking of ['sum', 'percent']) {
  const source = stacking === 'sum' ? pictorialSource : {...pictorialSource, axes: {...pictorialSource.axes, y: {kind: 'linear'}}};
  const stacked = root.planChart(source, {width: 390, height: 320, stacking});
  assert.equal(stacked.status, 'ok');
  assert.equal(stacked.frame.pictorialLayout.mode, stacking);
  assert.equal(stacked.frame.observations[0].value, 60);
}
assert.equal(root.planChart(pictorialSource, {width: 390, height: 320, stacking: 'percent'}).diagnostic.reason, 'PERCENT_DOMAIN_UNSUPPORTED');
pictorialSource.series[0].data[0].y = 99;
assert.equal(pictorial.frame.observations[0].value, 60);
const tileSource = {family: 'tilemap', title: 'Cells', series: [{id: 's', name: 'Source', data: [{id: 'zero', x: 0, y: 0, value: 0}, {id: 'unknown', x: 1, y: 0, value: null}]}]};
const tiles = root.planChart(tileSource, {width: 390, height: 320});
assert.equal(tiles.status, 'ok');
assert.equal(tiles.frame.series.length, 1);
assert.equal(tiles.frame.series[0].cells.length, 2);
assert.deepEqual(tiles.frame.observations.map(point => point.value), [0]);
assert.equal(tiles.frame.tilemapData[1].value, null);
assert.equal(tiles.frame.tilemapData[1].observed, false);
assert.equal(tiles.frame.colorAxis.domain[0], 0);
assert(Object.isFrozen(tiles.frame.series[0].cells[0].geometry));
wordSource.words[0].text = 'Changed'; measurements[0].width = 1000;
assert.equal(cloud.frame.series[0].textGlyphs[0].bounds.width, 80);
assert.equal(cloud.frame.series[0].textGlyphs[0].text, 'Literal <text>');
for (let index = 0; index < ${examples.filter(source => source.includes('import ')).length}; index++) await import('./compiled/example-' + index + '.js');
console.log('Isolated ESM runtime, public exports, owned inputs, DOM traps and README modules passed.');
`);
console.log(run(process.execPath, ['runtime.mjs'], consumer).trim());
const receipt = {version: metadata.version, status: 'passed', runtimeModules: javascript.length,
  files: packed.files.length, unpackedBytes: packed.unpackedSize, sha512: packed.integrity,
  readmeExamples: examples.filter(source => source.includes('import ')).length,
  noDomTypes: true, noRuntimeDependencies: true};
writeFileSync(path.join(root, 'work/reports/package-current.json'), JSON.stringify(receipt, null, 2));
rmSync(consumer, {recursive: true, force: true});
console.log('Package boundary and isolated consumer passed: ' + JSON.stringify(receipt));
