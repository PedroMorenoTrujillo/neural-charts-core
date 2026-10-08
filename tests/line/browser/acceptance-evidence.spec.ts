import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {reviewFixture} from '../../../../../apps/core-lab/review-fixtures.js';
import {duplicateCategoryFixture} from '../../../../../apps/core-lab/acceptance-fixtures.js';

for(const [width,height] of [[320,240],[390,300],[768,400],[1280,600]] as const) for(const theme of ['light','dark'] as const) {
  const scenarios=width===320||width===768?['rtl-dock','duplicate-first-floating','duplicate-second-floating','duplicate-first-dock','duplicate-second-dock']:['rtl-dock'];
  for(const scenario of scenarios) test(`@visual @acceptance-evidence ${scenario} ${width}x${height} ${theme}`,async({page},info)=>{
    test.skip(info.project.name!=='chromium','Additional review captures use Chromium DPR1.');
    await page.setViewportSize({width:width+32,height:height+32});
    await page.setContent(`<style>html,body{margin:0}#host{width:${width}px;height:${height}px}</style><div id="host"></div>`);
    await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});
    const dock=scenario.endsWith('dock'),spec={...(scenario==='rtl-dock'?{...reviewFixture('tooltip-dock'),direction:'rtl'}:duplicateCategoryFixture()),theme};
    await page.evaluate(({spec,dock})=>{if(dock)document.body.style.transform='translate(0)';const w=globalThis as any,r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'acceptance-evidence'});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},{spec,dock});
    await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);
    const grid=page.locator('[data-nc-grid]');await grid.focus();if(scenario.includes('second'))await grid.press('ArrowRight');
    const detail=page.locator(dock?'[data-nc-detail]':'[data-nc-tooltip]');await expect(detail).toBeVisible();
    if(scenario.startsWith('duplicate')) await expect(detail.locator('[data-nc-tooltip-heading]')).toHaveText(scenario.includes('second')?'Mon (week-2)':'Mon (week-1)');
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const png=await page.screenshot({animations:'disabled',clip:{x:0,y:0,width,height}});expect((await page.screenshot({animations:'disabled',clip:{x:0,y:0,width,height}})).equals(png)).toBe(true);
    const dir=path.resolve('artifacts/nc-01b/final-acceptance/targeted'),id=`${scenario}-${width}x${height}-${theme}`;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.png'),png);fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,width,height,theme,scenario,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha256:crypto.createHash('sha256').update(png).digest('hex'),humanApproval:'PENDING',canonicalMatrix:'additional evidence, unchanged IDs'},null,2));
    await page.evaluate(()=>(globalThis as any).chart.destroy());
  });
}
