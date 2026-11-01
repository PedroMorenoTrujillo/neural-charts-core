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
assert.deepEqual(Object.keys(root).sort(), ['planChart', 'transformPlanViewport']);
assert.equal(root.planChart, seam.planChart);
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
await import('./compiled/example-0.js');
console.log('Isolated ESM runtime, public exports, owned inputs, DOM traps and README example passed.');
`);
console.log(run(process.execPath, ['runtime.mjs'], consumer).trim());
const receipt = {version: metadata.version, status: 'passed', runtimeModules: javascript.length,
  files: packed.files.length, unpackedBytes: packed.unpackedSize, sha512: packed.integrity,
  readmeExamples: examples.filter(source => source.includes('import ')).length,
  noDomTypes: true, noRuntimeDependencies: true};
writeFileSync(path.join(root, 'work/reports/package-current.json'), JSON.stringify(receipt, null, 2));
rmSync(consumer, {recursive: true, force: true});
console.log('Package boundary and isolated consumer passed: ' + JSON.stringify(receipt));
