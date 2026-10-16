import { expect, test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { createColumnChart } from '../../../src/column.js';
import type { ColumnChartSpec, ColumnController, ColumnPointActivation } from '../../../src/public/column-types.js';
import type { ChartDiagnostic, ChartStateChange } from '../../../src/public/chart-types.js';
import type { columnFixture } from '../fixtures.js';
export const test=base.extend<{coverageEvidence:void}>({coverageEvidence:[async({page},use,info)=>{await use();if(process.env.NC_COVERAGE==='1'&&info.project.name==='chromium'){const value=await page.evaluate(()=>(globalThis as typeof globalThis&{__coverage__?:Record<string,unknown>}).__coverage__);if(value){const dir=path.resolve('artifacts/nc-01c/browser-coverage');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,info.testId.replace(/[^a-z0-9]/gi,'_')+'.json'),JSON.stringify(value));}}},{auto:true}]});
declare global {
  interface Window {
    NCColumn:{createColumnChart:typeof createColumnChart;columnFixture:typeof columnFixture};
    column:ColumnController|undefined;columnSpec:ColumnChartSpec;
    activations:ColumnPointActivation[];states:ChartStateChange[];diagnostics:ChartDiagnostic[];
  }
}
export async function setup(page:Page,width=768,height=400):Promise<void>{
  await page.setContent(`<style>body{margin:0}</style><div id="host" style="width:${width}px;height:${height}px"><span id="foreign" hidden>Application content</span></div><button id="outside">Outside</button>`);
  await page.addScriptTag({path:path.resolve('artifacts/nc-01c/browser-harness.js')});
}
export async function ready(page:Page):Promise<void>{await page.waitForFunction(()=>{const s=window.column?.getSnapshot();return s?.phase==='active'&&s.revision===s.committedRevision;});}
export async function mount(page:Page,name='grouped',extra:Partial<ColumnChartSpec>={}):Promise<void>{
  expect(await page.evaluate(({name,extra})=>{window.columnSpec={...window.NCColumn.columnFixture(name),...extra};window.activations=[];window.states=[];window.diagnostics=[];const result=window.NCColumn.createColumnChart(document.getElementById('host')!,window.columnSpec,{instanceId:'column',onPointActivate:e=>window.activations.push(e),onStateChange:e=>window.states.push(e),onDiagnostic:e=>window.diagnostics.push(e)});if(result.status==='ok')window.column=result.value;return result;},{name,extra})).toMatchObject({status:'ok'});
  await ready(page);
}
export async function frame(page:Page):Promise<void>{await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
