import {rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
rmSync(new URL('../dist/',import.meta.url),{recursive:true,force:true});
execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url)),'-p','tsconfig.build.json'],{cwd:root,stdio:'inherit'});
// Bundle all public entries together to share implementations and caches.
// Private per-file output is available to this repository's tests.
await build({
  absWorkingDir: root,
  entryPoints: ['index', 'plan', 'cartesian', 'financial', 'drilldown'].map(entry => 'dist/' + entry + '.js'),
  outdir: 'dist/runtime',
  chunkNames: 'shared/[name]-[hash]',
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  bundle: true,
  splitting: true,
  minifySyntax: true,
});
console.log('Built ESM and declarations with ES2022 only; no DOM or framework types.');
