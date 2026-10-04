import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {lineFixture} from '../../../../../apps/core-lab/fixtures.js';
const cases=['lines','gaps','steps','long labels','reference','legend','focus','tooltip edge','tooltip dock','statuses'];
for(const [width,height]of [[320,240],[768,400],[1280,600]])for(const theme of ['light','dark'])for(const name of cases){
  test(`@visual ${name} ${width}x${height} ${theme}`,async({page},info)=>{
    test.skip(info.project.name!=='chromium','Canonical visual evidence is Chromium DPR1 only.');
    await page.setViewportSize({width:width!+32,height:height!+32});
    await page.setContent(`<style>html,body{margin:0}#host{width:${width}px;height:${height}px}</style><div id="host"></div>`);
    await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});
    let spec=lineFixture(name==='gaps'?'null break':name==='reference'?'references':name==='statuses'?'loading':name==='lines'?'two series':name==='legend'?'two series':name==='steps'?'steps':'long labels');
    spec={...spec,title:name,description:'Canonical NC-01B visual candidate',theme:theme as 'light'|'dark'};
    await page.evaluate(spec=>{const w=globalThis as any;if(spec.title==='tooltip dock')document.body.style.transform='translate(0)';const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'visual'});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},spec);
    await page.waitForFunction(()=>{const s=(globalThis as any).chart.getSnapshot();return s.phase==='active'&&s.revision===s.committedRevision;});
    if(name==='focus'||name.startsWith('tooltip')){const grid=page.locator('[role="grid"]');await grid.focus();if(name==='tooltip edge')await grid.press('End');if(name!=='focus')await expect(page.locator(name==='tooltip dock'?'[data-nc-detail]':'[data-nc-tooltip]')).toBeVisible();}
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const first=await page.screenshot({animations:'disabled'}),second=await page.screenshot({animations:'disabled'});expect(second.equals(first),'Repeated capture must be byte-identical').toBe(true);
    const dir='artifacts/nc-01b/visual-candidates';fs.mkdirSync(dir,{recursive:true});const id=`${name.replaceAll(' ','-')}-${width}x${height}-${theme}`;
    fs.writeFileSync(path.join(dir,id+'.png'),first);
    const hash=crypto.createHash('sha256').update(first).digest('hex');
    fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,width,height,theme,sha256:hash,repeatCapture:'PASS',browser:info.project.use.browserName??'chromium',DPR:1,timezone:'UTC',font:{family:'monospace',size:12,weight:400},data:'apps/core-lab/fixtures.ts deterministic',motion:'none',baselineApproval:'HUMAN REVIEW PENDING',approvedRegressionComparison:'NOT RUN'},null,2));
    await page.evaluate(()=>(globalThis as any).chart.destroy());
  });
}
