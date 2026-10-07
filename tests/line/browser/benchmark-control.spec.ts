import {test,expect} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
test('F10 measurement rejects missing/wrong detail and waits for the actual identity/revision',async({page})=>{
  await page.setContent('<div id="host" style="width:768px;height:400px"></div>');await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});await page.addScriptTag({content:fs.readFileSync('tooling/line-detail-wait.mjs','utf8').replace('export async function waitForLineDetail','globalThis.waitForLineDetail = async function waitForLineDetail')});
  const result=await page.evaluate(async()=>{
    const w=globalThis as any,host=document.getElementById('host')!,spec={family:'line',title:'Benchmark control',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'S',data:[{id:'p',x:1,y:2}]}]};const outcomes=[];
    for(const mode of ['off','point']){const r=w.NCLine.createLineChart(host,{...spec,tooltip:{mode}},{instanceId:'benchmark-control'});if(r.status!=='ok')throw Error('Mount');const chart=r.value;for(let i=0;i<120&&chart.getSnapshot().committedRevision===0;i++)await new Promise<void>(r=>requestAnimationFrame(()=>r()));(host.querySelector('[data-nc-grid]') as HTMLElement).focus();const expected={revision:chart.getSnapshot().committedRevision,seriesId:'s',pointId:'p',header:'1'};
      if(mode==='off'){try{await w.waitForLineDetail(chart,host,expected,4);outcomes.push('WRONG SAMPLE');}catch(e){outcomes.push(String(e).includes('did not become visible')?'missing rejected':'wrong error');}}
      else{outcomes.push((await w.waitForLineDetail(chart,host,expected)).pointId);try{await w.waitForLineDetail(chart,host,{...expected,pointId:'wrong'},4);outcomes.push('WRONG ID SAMPLE');}catch(e){outcomes.push(String(e).includes('did not become visible')?'identity rejected':'wrong error');}}
      chart.destroy();
    }return outcomes;
  });expect(result).toEqual(['missing rejected','p','identity rejected']);
});
