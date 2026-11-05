import assert from 'node:assert/strict';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createDrilldownState,currentDrilldownNode,ownDrilldownGraph} from '../../dist/drilldown.js';

const file=fileURLToPath(new URL('../drilldown/consumer.ts',import.meta.url));
const program=ts.createProgram([file],{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,
  lib:['lib.es2022.d.ts'],types:[],strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,
  skipLibCheck:false,noEmit:true,
});
const diagnostics=ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));
const graph=ownDrilldownGraph({rootId:'root',nodes:[{id:'root',data:{type:'pie',data:[]}}],links:[]});
assert.equal(graph.status,'ok');
assert.equal(currentDrilldownNode(createDrilldownState(graph.value)),'root');
console.log('Drilldown ESM runtime and strict ES2022 consumer declarations verified without DOM/framework types.');
