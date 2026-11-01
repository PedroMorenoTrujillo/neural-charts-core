import {rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
rmSync(new URL('../dist/',import.meta.url),{recursive:true,force:true});
execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url)),'-p','tsconfig.build.json'],{cwd:root,stdio:'inherit'});
console.log('Built ESM and declarations with ES2022 only; no DOM or framework types.');
