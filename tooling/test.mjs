import {mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(new URL('../work/reports/', import.meta.url), {recursive: true});
const commands = [
  ['unit-property', ['node_modules/vitest/vitest.mjs', 'run']],
  ...readdirSync(new URL('../tests/plan/', import.meta.url)).filter(f => f.endsWith('.mjs')).sort().map(f => [f, ['tests/plan/' + f]]),
];
let failed = false;
for (const [name, args] of commands) {
  try {
    const output = execFileSync(process.execPath, args, {cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024});
    writeFileSync(new URL('../work/reports/' + name + '.log', import.meta.url), output);
    console.log('PASS ' + name);
  } catch (error) {
    failed = true;
    const output = String(error.stdout ?? '') + String(error.stderr ?? '') + '\n' + error.message;
    writeFileSync(new URL('../work/reports/' + name + '.log', import.meta.url), output);
    console.error('FAIL ' + name + '\n' + output.slice(-5000));
  }
}
if (failed) process.exitCode = 1;
