import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test.beforeEach(async({page})=>{await page.setContent('<div id="host" style="width:768px;height:400px"></div>');await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});});
test.afterEach(async({page},info)=>{if(process.env.NC_COVERAGE==='1'&&info.project.name==='chromium'){const c=await page.evaluate(()=>(globalThis as any).__coverage__);fs.mkdirSync('artifacts/nc-01b/browser-coverage',{recursive:true});fs.writeFileSync(`artifacts/nc-01b/browser-coverage/failure-${info.testId.replace(/[^a-z0-9]/gi,'_')}.json`,JSON.stringify(c));}});
const spec={family:'line',title:'Failure routes',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:2},{id:'b',x:1,y:4}]}]};

test('permanent error matrix preserves DOM, accepted state and both revisions on every synchronous rejection',async({page})=>{
  await page.evaluate(spec=>{const w=globalThis as any;w.diagnostics=[];const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'matrix',onDiagnostic:(d:unknown)=>w.diagnostics.push(d)});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},spec);
  await page.waitForFunction(()=>{const s=(globalThis as any).chart.getSnapshot();return s.committedRevision>0&&s.committedRevision===s.revision;});
  const rows=await page.evaluate(base=>{
    const w=globalThis as any,host=document.getElementById('host')!,snapshot=JSON.stringify(w.chart.getSnapshot()),state=JSON.stringify(w.chart.getState()),html=host.innerHTML;let getterCalls=0;
    const point=(changes:object)=>({...base,series:[{...base.series[0]!,data:[{...base.series[0]!.data[0]!,...changes}]}]});
    const category={...base,axes:{x:{kind:'category',values:[{id:'a'},{id:'b'}]},y:{kind:'linear'}},series:[{id:'s',name:'S',data:[{id:'a',x:'a',y:1}]}]};
    const cases:[string,unknown][]=[
      ['duplicate series',{...base,series:[...base.series,...base.series]}],['duplicate point',{...base,series:[{...base.series[0]!,data:[{id:'a',x:0,y:1},{id:'a',x:1,y:2}]}]}],
      ['duplicate canonical X including null and signed zero',{...base,series:[{...base.series[0]!,data:[{id:'a',x:-0,y:null},{id:'b',x:0,y:2}]}]}],
      ['unsorted X',{...base,series:[{...base.series[0]!,data:[{id:'a',x:2,y:1},{id:'b',x:1,y:2}]}]}],
      ['unknown category',{...category,series:[{id:'s',name:'S',data:[{id:'a',x:'unknown',y:1}]}]}],['mixed X',point({x:'0'})],['nonfinite Y',point({y:Infinity})],['wrong Y',point({y:'2'})],['nonfinite X',point({x:NaN})],
      ['fractional time',{...point({x:.5}),axes:{x:{kind:'time'},y:{kind:'linear'}}}],['out of Date range',{...point({x:8640000000000001}),axes:{x:{kind:'time'},y:{kind:'linear'}}}],
      ...['curve','gaps','markers','color'].map(field=>[field,{...base,series:[{...base.series[0]!,[field]:'unsupported'}]}] as [string,unknown]),
      ['bad status',{...base,status:{kind:'error'}}],['constant domain',{...base,axes:{...base.axes,y:{kind:'linear',domain:[1,1]}}}],['reversed domain',{...base,axes:{...base.axes,x:{kind:'linear',domain:[2,1]}}}],
      ['domain options',{...base,axes:{...base.axes,y:{kind:'linear',domain:[0,10],includeZero:true}}}],['bad target',{...base,axes:{...base.axes,x:{kind:'linear',ticks:{targetCount:1}}}}],['manual ticks',{...base,axes:{...base.axes,x:{kind:'linear',ticks:{values:[1,2]}}}}],
      ['duplicate hidden IDs',{...base,state:{mode:'controlled',value:{hiddenSeriesIds:['s','s']}}}],['unknown hidden ID',{...base,state:{mode:'controlled',value:{hiddenSeriesIds:['unknown']}}}],['mode change',{...base,state:{mode:'controlled',value:{hiddenSeriesIds:[]}}}],
      ['duplicate reference',{...base,references:[{id:'r',axis:'y',value:1},{id:'r',axis:'y',value:2}]}],['wrong reference',{...base,references:[{id:'r',axis:'x',value:'x'}]}],
      ['unsupported field',{...base,rawSvg:'<path/>'}],['nonplain container',Object.assign(Object.create({}),base)],['undefined optional',{...base,description:undefined}],
      ['series cap',{...base,series:Array.from({length:65},(_,i)=>({...base.series[0]!,id:'s'+i}))}],['point cap',{...base,series:[{id:'s',name:'S',data:Array.from({length:100001},(_,i)=>({id:'p'+i,x:i,y:1}))}]}],
      ['reference cap',{...base,references:Array.from({length:17},(_,i)=>({id:'r'+i,axis:'y',value:i}))}],['on marker cap',{...base,series:[{id:'s',name:'S',markers:'on',data:Array.from({length:5001},(_,i)=>({id:'p'+i,x:i,y:1}))}]}],
      ['unrepresentable geometry',{...base,axes:{x:{kind:'linear',domain:[0,Number.MIN_VALUE]},y:{kind:'linear'}},series:[{id:'s',name:'S',data:[{id:'a',x:Number.MAX_VALUE,y:1}]}]}]
    ];
    const accessor={...base};Object.defineProperty(accessor,'description',{enumerable:true,get(){getterCalls++;return 'unsafe';}});cases.push(['accessor',accessor]);
    const results=cases.map(([name,input])=>{const r=w.chart.update(input);if(r.status!=='invalid'||host.innerHTML!==html||JSON.stringify(w.chart.getSnapshot())!==snapshot||JSON.stringify(w.chart.getState())!==state)throw Error('Atomic rejection '+name);return {name,reason:r.diagnostic.reason,path:r.diagnostic.path};});
    if(getterCalls||w.diagnostics.length)throw Error('Synchronous invalid callbacks/accessors');return results;
  },spec);
  expect(rows.length).toBeGreaterThanOrEqual(35);await page.evaluate(()=>(globalThis as any).chart.destroy());
});

test('unavailable auto media and a late rejected font promise remain contained after destroy',async({page})=>{
  await page.evaluate(spec=>{
    const w=globalThis as any;w.originalMedia=window.matchMedia;window.matchMedia=()=>{throw Error('Media unavailable');};
    const descriptor=Object.getOwnPropertyDescriptor(document,'fonts');w.fontDescriptor=descriptor;
    const listeners=new Map<string,()=>void>();let reject:((e:Error)=>void)|undefined;
    Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise((_,r)=>reject=r),addEventListener:(t:string,h:()=>void)=>listeners.set(t,h),removeEventListener:(t:string)=>listeners.delete(t)}});
    w.lateFont=()=>reject!(Error('Font failed'));w.fontEvent=()=>listeners.get('loadingerror')?.();w.fontListeners=listeners;
    const r=w.NCLine.createLineChart(document.getElementById('host'),{...spec,theme:'auto'},{instanceId:'media'});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;
  },spec);
  await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);
  expect(await page.locator('[data-nc-root]').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.evaluate(()=>{const w=globalThis as any;w.fontEvent();w.chart.refresh();w.chart.destroy();w.lateFont();window.matchMedia=w.originalMedia;if(w.fontDescriptor)Object.defineProperty(document,'fonts',w.fontDescriptor);else delete w.document.fonts;});
  await expect(page.locator('[data-nc-root]')).toHaveCount(0);expect(await page.evaluate(()=>(globalThis as any).fontListeners.size)).toBe(0);
});
test('observer acquisition failure releases ownership and permits a clean retry',async({page})=>{
  const result=await page.evaluate(spec=>{const w=globalThis as any,original=ResizeObserver;w.ResizeObserver=class{observe(){throw Error('Observer failed');}disconnect(){}};const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'retry'});w.ResizeObserver=original;const next=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'retry'});if(next.status==='ok')w.chart=next.value;return {first:r.status,reason:r.diagnostic?.reason,next:next.status};},spec);
  expect(result).toEqual({first:'invalid',reason:'PLATFORM_UNAVAILABLE',next:'ok'});await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);await page.evaluate(()=>(globalThis as any).chart.destroy());
});
test('@a11y dark native controls inherit a readable surface and multi-series table retains raw hidden observations',async({page})=>{
  await page.evaluate(spec=>{const w=globalThis as any;w.tableSpec={...spec,theme:'dark',references:[{id:'r',axis:'y',value:10,label:'Target'}],series:[{id:'empty',name:'Empty',data:[]},{id:'first',name:'First',data:Array.from({length:100},(_,i)=>({id:'p'+i,x:i,y:i%2?null:i}))},{id:'last',name:'Last',data:Array.from({length:30},(_,i)=>({id:'q'+i,x:i,y:i}))}]};const r=w.NCLine.createLineChart(document.getElementById('host'),w.tableSpec,{instanceId:'table',initialState:{hiddenSeriesIds:['last']}});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},spec);
  await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);
  const colors=await page.getByRole('button',{name:'View data table'}).evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));expect(colors).toEqual({color:'rgb(237, 242, 250)',bg:'rgba(0, 0, 0, 0)'});
  await page.getByRole('button',{name:'View data table'}).click();await expect(page.locator('tbody tr')).toHaveCount(100);await expect(page.locator('[data-nc-table] ul')).toContainText('Target');
  await page.locator('h3').focus();await page.evaluate(()=>{const w=globalThis as any;w.chart.update({...w.tableSpec,title:'Updated table'});});await expect(page.locator('h3')).toContainText('Updated table');await expect(page.locator('h3')).toBeFocused();
  await page.getByRole('button',{name:'View data table'}).click();await expect(page.locator('[data-nc-table]')).toBeHidden();await page.getByRole('button',{name:'View data table'}).click();
  await page.getByRole('button',{name:'Next page'}).click();await expect(page.locator('tbody tr')).toHaveCount(30);await expect(page.locator('tbody')).toContainText('Series hidden');await expect(page.locator('tbody')).toContainText('Last');
  await page.getByRole('button',{name:'Previous page'}).click();await expect(page.locator('tbody')).toContainText('Missing observation');await page.locator('[data-nc-table]').press('Escape');await expect(page.getByRole('button',{name:'View data table'})).toBeFocused();await page.evaluate(()=>(globalThis as any).chart.destroy());
});
test('unsupported keys and touch misses preserve current intent without activating absent handlers',async({page})=>{
  await page.evaluate(spec=>{const w=globalThis as any;const r=w.NCLine.createLineChart(document.getElementById('host'),{...spec,tooltip:{mode:'off'}},{instanceId:'keys'});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},spec);
  await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);const grid=page.locator('[data-nc-grid]');await grid.focus();
  const result=await grid.evaluate(e=>{const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}),letter=new KeyboardEvent('keydown',{key:'x',bubbles:true,cancelable:true}),space=new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});e.dispatchEvent(enter);e.dispatchEvent(letter);e.dispatchEvent(space);return {enter:enter.defaultPrevented,letter:letter.defaultPrevented,space:space.defaultPrevented};});expect(result).toEqual({enter:false,letter:false,space:true});
  await expect(page.locator('[data-nc-tooltip]')).toHaveCount(0);await page.evaluate(()=>{const body=document.querySelector('[data-nc-grid]')!.parentElement!;body.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:9,clientX:-100,clientY:-100,bubbles:true}));body.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:9,clientX:-100,clientY:-100,bubbles:true}));});await expect(page.locator('[role="gridcell"]')).toContainText('X 0');await page.evaluate(()=>(globalThis as any).chart.destroy());
});
test('interaction writer faults contain a reentrant diagnostic destroy while focus is owned',async({page})=>{
  await page.evaluate(spec=>{const w=globalThis as any;const r=w.NCLine.createLineChart(document.getElementById('host'),spec,{instanceId:'fault',onDiagnostic:()=>w.chart.destroy()});if(r.status!=='ok')throw Error(JSON.stringify(r));w.chart=r.value;},spec);
  await page.waitForFunction(()=>(globalThis as any).chart.getSnapshot().committedRevision>0);
  await page.evaluate(()=>{const w=globalThis as any,original=SVGElement.prototype.setAttribute;w.restore=()=>SVGElement.prototype.setAttribute=original;SVGElement.prototype.setAttribute=function(name,value){if(this.tagName.toLowerCase()==='circle')throw Error('Interaction DOM failure');return original.call(this,name,value);};});
  await page.locator('[data-nc-grid]').focus();await expect.poll(()=>page.evaluate(()=>(globalThis as any).chart.getSnapshot().phase)).toBe('destroyed');await expect(page.locator('[data-nc-root]')).toHaveCount(0);await page.evaluate(()=>(globalThis as any).restore());
});
