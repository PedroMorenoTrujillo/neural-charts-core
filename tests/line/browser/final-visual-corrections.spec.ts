import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { reviewFixture } from '../../../../../apps/core-lab/review-fixtures.js';

async function ready(page: Page) { await page.waitForFunction(() => { const s=(globalThis as any).chart.getSnapshot();return s.phase==='active'&&s.committedRevision>0&&s.revision===s.committedRevision; }); }
async function mount(page: Page, spec: unknown, width=768, height=400, dock=false) {
  await page.setViewportSize({width:1400,height:900});
  await page.setContent(`<style>html,body{margin:0}#scroll{width:${width}px;height:${height}px;overflow:auto}#host{width:${width}px;height:${height}px}</style><button id="outside">Outside</button><div id="scroll"><div id="host"></div><div style="height:500px"></div></div>`);
  await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});
  await page.evaluate(({spec,dock}) => {const w=globalThis as any;if(dock)document.body.style.transform='translate(0)';w.spec=spec;w.activations=[];const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'final-visual',onPointActivate:(e:unknown)=>w.activations.push(e)});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},{spec,dock});
  await ready(page);
}
test('V01 @a11y unique Unicode labels display alone; semantic, shared, activation, table and references retain IDs', async ({page}) => {
  const base=reviewFixture('multi-series');
  const spec={...base,axes:{...base.axes,x:{kind:'category',title:'Day',values:[{id:'c0',label:'週末🌅'},{id:'c1',label:'Sun'}]}},series:[{id:'a',name:'Completed',data:[{id:'p',x:'c0',y:2},{id:'q',x:'c1',y:7}]},{id:'b',name:'Planned',data:[{id:'r',x:'c1',y:5}]}],references:[{id:'ref',axis:'x',value:'c0',label:'Reference'}]};
  await mount(page,spec);const grid=page.locator('[data-nc-grid]');await grid.focus();
  await expect(page.locator('[data-nc-tooltip-heading]')).toHaveText('週末🌅');await expect(page.locator('[data-nc-tooltip]')).toContainText('Planned: No sample');
  await expect(page.locator('[role="gridcell"]')).toContainText('週末🌅 (c0)');await expect(page.locator('#nc-final-visual-detail')).toContainText('週末🌅 (c0)');
  await grid.press('Enter');expect(await page.evaluate(()=>(globalThis as any).activations[0].point.x)).toBe('c0');
  await grid.press('ArrowRight');await expect(page.locator('[data-nc-tooltip-heading]')).toHaveText('Sun');await expect(page.locator('[data-nc-tooltip]')).toContainText('Planned: 5');
  await page.getByRole('button',{name:'View data table'}).click();await expect(page.locator('tbody')).toContainText('週末🌅 (c0)');await expect(page.locator('tbody')).toContainText('Sun (c1)');await expect(page.locator('[data-nc-table] ul')).toContainText('週末🌅 (c0)');
});
test('V01 @a11y duplicate display labels remain distinguishable in floating and docked keyboard detail', async ({page}) => {
  const base=reviewFixture('simple-line');const spec={...base,axes:{...base.axes,x:{kind:'category',values:[{id:'a',label:'Same😀'},{id:'b',label:'Same😀'}]}},series:[{id:'s',name:'S',data:[{id:'p',x:'a',y:2},{id:'q',x:'b',y:2}]}]};
  await mount(page,spec);const grid=page.locator('[data-nc-grid]');await grid.focus();await expect(page.locator('[data-nc-tooltip-heading]')).toHaveText('Same😀 (a)');await grid.press('ArrowRight');await expect(page.locator('[data-nc-tooltip-heading]')).toHaveText('Same😀 (b)');
  await page.evaluate(()=>{document.body.style.transform='translate(0)';window.dispatchEvent(new Event('resize'));});await expect(page.locator('[data-nc-detail]')).toBeVisible();await expect(page.locator('[data-nc-detail] [data-nc-tooltip-heading]')).toHaveText('Same😀 (b)');await expect(page.locator('[data-nc-detail]')).toHaveAttribute('data-nc-category','b');
});
test('V03 @a11y compact dock preserves chart context, bounded scroll, focus, Escape and destroy', async ({page}) => {
  await mount(page,reviewFixture('multi-series'),768,400,true);const grid=page.locator('[data-nc-grid]'),pane=page.locator('[data-nc-detail]');await grid.focus();await expect(pane).toBeVisible();await expect(pane.locator('[data-nc-tooltip-heading]')).toHaveText('Mon');
  const bounds=await pane.evaluate(e=>{const p=e.getBoundingClientRect(),b=e.parentElement!.getBoundingClientRect();return {area:p.width*p.height/bodyArea(b),fits:p.width<=b.width&&p.height<=b.height};function bodyArea(b:DOMRect){return b.width*b.height;}});
  expect(bounds.fits).toBe(true);expect(bounds.area).toBeLessThan(.5);await expect(page.locator('[data-nc-layer="marks"] path')).toHaveCount(2);
  await pane.focus();await page.locator('#scroll').evaluate(e=>{e.scrollTop=20;});await expect(pane).toBeFocused();
  await page.locator('#host').evaluate(e=>{e.style.width='650px';});await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().size.width===650);await ready(page);await expect(pane).toBeFocused();
  await pane.press('Escape');await expect(pane).toBeHidden();await expect(grid).toBeFocused();
  await grid.press('ArrowRight');await expect(pane).toBeVisible();await pane.focus();await page.evaluate(()=>(globalThis as any).chart.destroy());await expect(page.locator('[data-nc-root]')).toHaveCount(0);await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
});
test('V03 oversize detail retains every row and scrolls within the body', async ({page}) => {
  const base=reviewFixture('simple-line');const spec={...base,legend:{position:'none'},series:Array.from({length:35},(_,i)=>({id:'s'+i,name:'Long readable series '+i,data:[{id:'p',x:'c0',y:2}]}))};
  await mount(page,spec,320,240);await page.locator('[data-nc-grid]').focus();const pane=page.locator('[data-nc-detail]');await expect(pane).toBeVisible();await expect(pane.locator('[data-nc-tooltip-row]')).toHaveCount(35);
  expect(await pane.evaluate(e=>e.scrollHeight>e.clientHeight&&e.clientHeight<=e.parentElement!.clientHeight)).toBe(true);await pane.focus();await pane.press('PageDown');await expect.poll(()=>pane.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await pane.press('Escape');await expect(page.locator('[data-nc-grid]')).toBeFocused();
});
for(const theme of ['light','dark'] as const) test(`V02/V04 ${theme}: all review sizes distinguish long labels and separate tick/title ink`, async ({page}) => {
  for(const [width,height] of [[320,240],[390,300],[768,400],[1280,600]]) {
    await mount(page,{...reviewFixture('long-labels'),theme},width!,height!);const labels=page.locator('[data-nc-layer="labels"] text').filter({hasText:/…|A long/});
    const texts=await labels.allTextContents();expect(texts.some(t=>t.endsWith('0'))).toBe(true);expect(texts.some(t=>t.endsWith('6'))).toBe(true);expect(new Set(texts).size).toBe(texts.length);
    await page.evaluate(()=>(globalThis as any).chart.destroy());
    await mount(page,{...reviewFixture('simple-line'),theme},width!,height!);
    const boxes=await page.evaluate(()=>{const title=[...document.querySelectorAll('[data-nc-layer="labels"] text')].find(e=>e.textContent==='Day')!,ticks=[...document.querySelectorAll('[data-nc-layer="labels"] text')].filter(e=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(e.textContent!));const t=title.getBoundingClientRect(),body=title.closest('svg')!.getBoundingClientRect(),legend=document.querySelector('[data-nc-series]')!.parentElement!.getBoundingClientRect();return {gap:t.top-Math.max(...ticks.map(e=>e.getBoundingClientRect().bottom)),titleBottom:t.bottom,bodyBottom:body.bottom,legendTop:legend.top};});
    expect(boxes.gap).toBeGreaterThanOrEqual(width!<640?3:0);expect(boxes.titleBottom).toBeLessThanOrEqual(boxes.bodyBottom);expect(boxes.titleBottom).toBeLessThan(boxes.legendTop);
  }
});
