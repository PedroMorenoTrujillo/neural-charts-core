import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { reviewFixture } from '../../../../../apps/core-lab/review-fixtures.js';
import { duplicateCategoryFixture } from '../../../../../apps/core-lab/acceptance-fixtures.js';

async function ready(page: Page) { await page.waitForFunction(() => { const s = (globalThis as any).chart.getSnapshot(); return s.phase === 'active' && s.committedRevision > 0 && s.revision === s.committedRevision; }); }
async function mount(page: Page, spec: unknown, width=320, height=240, dock=true) {
  await page.setViewportSize({ width: Math.max(1400, width+40), height: 900 });
  await page.setContent(`<style>html,body{margin:0}#scroll{width:${width}px;height:${height}px;overflow:auto}#host{width:${width}px;height:${height}px}</style><div id="scroll"><div id="host"></div><div style="height:500px"></div></div><button id="outside">Outside</button>`);
  await page.addScriptTag({ path: path.resolve('artifacts/nc-01b/browser-harness.js') });
  await page.evaluate(({spec,dock}) => { const w=globalThis as any; document.body.style.transform=dock?'translate(0)':'';w.spec=spec;w.activations=[];const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'dock-acceptance',onPointActivate:(e:unknown)=>w.activations.push(e)});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value; }, {spec,dock});
  await ready(page);
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const pane=document.querySelector<HTMLElement>('[data-nc-detail]')!, halo=document.querySelector('[data-nc-layer="interaction"] circle')!;
    const p=rect(pane), a=rect(halo), body=rect(pane.parentElement!), plot=rect(document.querySelector('[data-nc-grid]')!);
    const selectedVisible=p.right<=a.x || p.x>=a.right || p.bottom<=a.y || p.y>=a.bottom;
    const area=Math.max(0,Math.min(p.right,plot.right)-Math.max(p.x,plot.x))*Math.max(0,Math.min(p.bottom,plot.bottom)-Math.max(p.y,plot.y));
    const ticks=[...document.querySelectorAll('[data-nc-layer="labels"] text')].filter(e=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Day'].includes(e.textContent!));
    return {pane:p,anchor:a,body,plot,selectedVisible,uncoveredPlot:1-area/(plot.width*plot.height),fits:p.x>=body.x-.1&&p.y>=body.y-.1&&p.right<=body.right+.1&&p.bottom<=body.bottom+.1,axisClear:ticks.every(e=>{const r=rect(e);return p.right<=r.x||p.x>=r.right||p.bottom<=r.y||p.y>=r.bottom;}),scrollable:pane.scrollHeight>pane.clientHeight,overflow:document.documentElement.scrollWidth>window.innerWidth||pane.scrollWidth>pane.clientWidth+1};
  });
}
async function safe(page: Page) {
  // Intent and measurement are separate coalesced interaction frames. Inspect
  // the completed presentation, including after a main resize clears overlay.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await expect(page.locator('[data-nc-detail]')).toBeVisible();
  await expect(page.locator('[data-nc-layer="interaction"] circle').first()).toBeVisible();
  const g=await geometry(page);expect(g.selectedVisible).toBe(true);expect(g.fits).toBe(true);expect(g.uncoveredPlot).toBeGreaterThan(.12);expect(g.overflow).toBe(false);return g;
}

for(const direction of ['ltr','rtl'] as const) for(const theme of ['light','dark'] as const) test(`@a11y F01/F04 dock actual rectangles ${direction} ${theme}`,async({page},info)=>{
  const evidence=[];
  for(const [width,height] of [[320,240],[390,300],[768,400],[1280,600]]) {
    await mount(page,{...reviewFixture('tooltip-dock'),direction,theme},width,height);
    const grid=page.locator('[data-nc-grid]'),pane=page.locator('[data-nc-detail]');await grid.focus();await expect(pane).toBeVisible();
    await expect(pane.locator('[data-nc-tooltip-heading]')).toHaveText('Mon');await expect(pane).toContainText('Completed: 2');await expect(pane).toContainText('Planned: 8');
    evidence.push({width,height,initial:await safe(page)});expect((await geometry(page)).axisClear).toBe(true);
    for(const key of ['ArrowRight','ArrowRight','End','Home','ArrowDown','ArrowUp']) {await grid.press(key);await safe(page);}
    await pane.focus();await pane.press('Escape');await expect(pane).toBeHidden();await expect(grid).toBeFocused();
    await grid.press('ArrowRight');await expect(pane).toBeVisible();await safe(page);
    await pane.focus();await pane.press('Tab');await expect(pane).not.toBeFocused();
    await page.evaluate(()=>(globalThis as any).chart.destroy());await expect(page.locator('[data-nc-root],[data-nc-tooltip]')).toHaveCount(0);
  }
  const dir=path.resolve('artifacts/nc-01b/final-acceptance/rectangles');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${info.project.name}-${direction}-${theme}.json`),JSON.stringify(evidence,null,2));
});
test('F01 negative control rejects the previous point-covering bottom dock',async({page})=>{
  await mount(page,reviewFixture('tooltip-dock'));await page.locator('[data-nc-grid]').focus();await expect(page.locator('[data-nc-detail]')).toBeVisible();await safe(page);
  await page.locator('[data-nc-detail]').evaluate(e=>Object.assign((e as HTMLElement).style,{left:'auto',top:'auto',insetInlineEnd:'0',insetBlockEnd:'0',width:'280px',maxHeight:'100%'}));
  expect((await geometry(page)).selectedVisible,'The exact acceptance guard must reject restored old positioning').toBe(false);
});
for(const direction of ['ltr','rtl'] as const) test(`@a11y F04 ${direction} scroll resize focus stale cancellation touch and oversize`,async({page})=>{
  await mount(page,{...reviewFixture('tooltip-dock'),direction});const grid=page.locator('[data-nc-grid]'),pane=page.locator('[data-nc-detail]');await grid.focus();await expect(pane).toBeVisible();await safe(page);await pane.focus();
  await page.locator('#scroll').evaluate(e=>e.scrollTop=12);await expect.poll(async()=> (await geometry(page)).selectedVisible).toBe(true);await expect(pane).toBeFocused();
  await page.locator('#host').evaluate(e=>{e.style.width='390px';e.style.height='300px';e.parentElement!.style.width='390px';e.parentElement!.style.height='300px';});await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().size.width===390);await ready(page);await expect(pane).toBeFocused();await safe(page);
  await page.evaluate(()=>{document.body.style.transform='';window.dispatchEvent(new Event('resize'));});await expect(pane).toBeFocused();await safe(page);
  await pane.press('Escape');await expect(grid).toBeFocused();
  await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));document.dispatchEvent(new Event('scroll'));});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await expect(pane).toBeHidden();await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  await page.evaluate(()=>{document.body.style.transform='translate(0)';});await grid.press('ArrowRight');await expect(pane).toBeVisible();await safe(page);
  await page.locator('#outside').focus();await page.evaluate(()=>{const g=document.querySelector('[data-nc-grid]')!,c=document.querySelector('svg [data-nc-layer="marks"] circle')!.getBoundingClientRect();for(const type of ['pointerdown','pointerup'])g.dispatchEvent(new PointerEvent(type,{pointerId:71,pointerType:'touch',clientX:c.x+c.width/2,clientY:c.y+c.height/2,button:0,bubbles:true,cancelable:true}));});
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).activations.length)).toBe(1);await expect(pane).toBeVisible();await safe(page);
  await page.evaluate(()=>{const w=globalThis as any;w.chart.update({...w.spec,legend:{position:'none'},series:Array.from({length:35},(_,i)=>({id:'s'+i,name:'A long readable series name '+i,data:[{id:'p',x:'c0',y:2}]}))});});await ready(page);await page.locator('#outside').focus();await grid.focus();await expect(pane).toBeVisible();await safe(page);await expect(pane.locator('[data-nc-tooltip-row]')).toHaveCount(35);expect((await geometry(page)).scrollable).toBe(true);
  await pane.focus();await pane.press('End');await expect.poll(()=>pane.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await pane.press('Escape');await expect(grid).toBeFocused();
  await page.locator('#outside').focus();await grid.focus();await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));(globalThis as any).chart.destroy();});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await expect(page.locator('[data-nc-root],[data-nc-tooltip]')).toHaveCount(0);
});
for(const theme of ['light','dark'] as const) test(`@a11y F04 ${theme} forced colors and reduced motion preserve dock geometry`,async({page})=>{
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await mount(page,{...reviewFixture('tooltip-dock'),theme});await page.locator('[data-nc-grid]').focus();const pane=page.locator('[data-nc-detail]');await expect(pane).toBeVisible();await safe(page);await pane.focus();expect(await pane.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');await pane.press('Escape');await expect(page.locator('[data-nc-grid]')).toBeFocused();
});
test('@a11y F03 duplicate categories exact shared matching, grid, dock, table and reference identity',async({page})=>{
  await mount(page,duplicateCategoryFixture(),768,400,false);const grid=page.locator('[data-nc-grid]');await grid.focus();
  for(const [key,id,heading,values] of [['Home','week-1','Mon (week-1)',['2','No sample']],['ArrowRight','week-2','Mon (week-2)',['7','9']],['ArrowRight','unique','Tue',['4','5']]] as const){await grid.press(key);const tooltip=page.locator('[data-nc-tooltip]');await expect(tooltip.locator('[data-nc-tooltip-heading]')).toHaveText(heading);await expect(tooltip).toHaveAttribute('data-nc-category',id);await expect(tooltip.locator('[data-nc-tooltip-value]')).toHaveText([...values]);await expect(page.locator('[role="gridcell"]')).toContainText(id==='unique'?'Tue (unique)':heading);await expect(page.locator('#nc-dock-acceptance-detail')).toContainText(id);}
  await grid.press('Home');await page.evaluate(()=>{document.body.style.transform='translate(0)';window.dispatchEvent(new Event('resize'));});const pane=page.locator('[data-nc-detail]');await expect(pane).toBeVisible();await expect(pane).toHaveAttribute('data-nc-category','week-1');await expect(pane.locator('[data-nc-tooltip-heading]')).toHaveText('Mon (week-1)');await safe(page);
  await grid.press('ArrowRight');await expect(pane).toHaveAttribute('data-nc-category','week-2');await expect(pane.locator('[data-nc-tooltip-heading]')).toHaveText('Mon (week-2)');await safe(page);
  await page.getByRole('button',{name:'View data table'}).click();await expect(page.locator('tbody')).toContainText('Mon (week-1)');await expect(page.locator('tbody')).toContainText('Mon (week-2)');await expect(page.locator('[data-nc-table] ul')).toContainText('Mon (week-1)');await expect(page.locator('[data-nc-table] ul')).toContainText('Mon (week-2)');
});
test('F02 floating tooltip occupied rectangles retain the selected observation',async({page},info)=>{
  const evidence=[];
  for(const [width,height] of [[320,240],[390,300],[768,400],[1280,600]]) for(const theme of ['light','dark'] as const) for(const name of ['tooltip','tooltip-edge'] as const) {
    await mount(page,{...reviewFixture(name),theme},width,height,false);const grid=page.locator('[data-nc-grid]');await grid.focus();if(name==='tooltip-edge')await grid.press('Control+End');
    await expect(page.locator('[data-nc-tooltip]')).toBeVisible();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const g=await page.evaluate(()=>{const t=document.querySelector('[data-nc-tooltip]')!.getBoundingClientRect(),a=document.querySelector('[data-nc-layer="interaction"] circle')!.getBoundingClientRect();const overlaps=(r:DOMRect)=>t.left<r.right&&t.right>r.left&&t.top<r.bottom&&t.bottom>r.top;return {selectedCovered:overlaps(a),tooltip:{x:t.x,y:t.y,width:t.width,height:t.height},anchor:{x:a.x,y:a.y,width:a.width,height:a.height},overlappedLabels:[...document.querySelectorAll('[data-nc-layer="labels"] text')].filter(e=>overlaps(e.getBoundingClientRect())).map(e=>e.textContent)};});
    evidence.push({width,height,theme,name,...g});expect(g.selectedCovered).toBe(false);await page.evaluate(()=>(globalThis as any).chart.destroy());
  }
  const dir=path.resolve('artifacts/nc-01b/final-acceptance/rectangles');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${info.project.name}-floating.json`),JSON.stringify(evidence,null,2));
});
