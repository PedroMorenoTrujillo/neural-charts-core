import {expect} from '@playwright/test';
import {test,setup,mount,ready,frame} from './helpers.js';
test.beforeEach(async({page})=>{await setup(page);});
test.afterEach(async({page})=>{await page.evaluate(()=>window.column?.destroy());});

test('zero size suspends interaction and preserves updates until a visible frame returns',async({page})=>{
  await mount(page);await page.locator('[data-nc-grid]').focus();
  await page.evaluate(()=>{document.getElementById('host')!.style.width='0px';});
  await page.waitForFunction(()=>window.column!.getSnapshot().phase==='suspended');
  await expect(page.locator('[data-nc-tooltip]:visible')).toHaveCount(0);
  expect(await page.evaluate(()=>[window.column!.refresh().status,window.column!.update({...window.columnSpec,title:'While suspended'}).status])).toEqual(['ok','ok']);
  await page.evaluate(()=>{document.getElementById('host')!.style.width='768px';});await ready(page);
  await expect(page.locator('#nc-column-title')).toHaveText('While suspended');await expect(page.locator('[data-nc-layer="marks"] rect')).toHaveCount(20);
});

test('DOM write failure faults once, closes resources and permits explicit remount after destroy',async({page})=>{
  await mount(page);await page.locator('[data-nc-grid]').focus();
  await page.evaluate(()=>{
    const original=SVGElement.prototype.setAttribute;let once=false;
    SVGElement.prototype.setAttribute=function(name,value){if(!once&&this.tagName.toLowerCase()==='rect'){once=true;SVGElement.prototype.setAttribute=original;throw Error('controlled SVG write failure');}return original.call(this,name,value);};
    window.column!.update({...window.columnSpec,orientation:'horizontal'});
  });
  await page.waitForFunction(()=>window.column!.getSnapshot().phase==='faulted');
  await expect(page.locator('[data-nc-root]')).toContainText('Chart unavailable');await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);
  expect(await page.evaluate(()=>[window.column!.refresh().status,window.column!.update(window.columnSpec).status,window.diagnostics.length])).toEqual(['invalid','invalid',1]);
  await page.evaluate(()=>window.column!.destroy());await expect(page.locator('[data-nc-root]')).toHaveCount(0);
  await page.evaluate(()=>{const r=window.NCColumn.createColumnChart(document.getElementById('host')!,window.columnSpec,{instanceId:'column'});if(r.status!=='ok')throw Error(JSON.stringify(r));window.column=r.value;});await ready(page);
});

test('font and automatic theme changes repaint; explicit theme stops media ownership',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});await mount(page,'grouped',{theme:'auto'});
  const initial=await page.evaluate(()=>window.column!.getSnapshot().committedRevision);
  await page.evaluate(()=>document.fonts.dispatchEvent(new Event('loadingdone')));
  await page.waitForFunction(n=>window.column!.getSnapshot().committedRevision>n,initial);await ready(page);
  const font=await page.evaluate(()=>window.column!.getSnapshot().committedRevision);
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(n=>window.column!.getSnapshot().committedRevision>n,font);await ready(page);
  await page.evaluate(()=>window.column!.update({...window.columnSpec,theme:'light'}));await ready(page);
  const explicit=await page.evaluate(()=>window.column!.getSnapshot().committedRevision);await page.emulateMedia({colorScheme:'light'});await frame(page);
  expect(await page.evaluate(()=>window.column!.getSnapshot().committedRevision)).toBe(explicit);
});

test('factory rejects incompatible state, hostile options and non-document hosts atomically',async({page})=>{
  await setup(page);const results=await page.evaluate(()=>{
    const f=window.NCColumn.createColumnChart,host=document.getElementById('host')!,spec=window.NCColumn.columnFixture(),controlled={...spec,state:{mode:'controlled',value:{hiddenSeriesIds:[]}}};
    const options={instanceId:'rejected'};
    const cases=[
      [host,{...spec,family:'line'},options], [host,spec,{...options,initialState:{hiddenSeriesIds:['unknown']}}],
      [host,controlled,options], [host,controlled,{...options,onStateChange(){},initialState:{hiddenSeriesIds:[]}}],
      [document.createElement('div'),spec,options], [host,spec,{...options,instanceId:''}],
      [host,new Proxy(spec,{getOwnPropertyDescriptor(){throw Error('hostile descriptor');}}),options]
    ];
    const shadowHost=document.createElement('div');document.body.append(shadowHost);const child=document.createElement('div');shadowHost.attachShadow({mode:'open'}).append(child);cases.push([child,spec,options]);
    return cases.map(args=>Reflect.apply(f,null,args).status);
  });expect(results).toEqual(Array(8).fill('invalid'));await expect(page.locator('[data-nc-root]')).toHaveCount(0);
});
