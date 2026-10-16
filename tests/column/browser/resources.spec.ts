import {expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {test,setup} from './helpers.js';
import type {ColumnController} from '../../../src/column.js';
declare global { interface Window { retainedColumns:ColumnController[];columnResourceRefs:WeakRef<object>[]; } }
test.setTimeout(120000);
test('partial acquisition failures release ownership and permit the same instance to retry',async({page})=>{
  await setup(page);const rows=await page.evaluate(()=>{
    const rows:object[]=[],host=document.getElementById('host')!,spec={...window.NCColumn.columnFixture(),theme:'auto' as const};
    for(const stage of ['font','media','pointer','writer','overlay','observer']){
      const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,append=Element.prototype.append,appendChild=Node.prototype.appendChild,RO=window.ResizeObserver;
      const tracked=new Map<EventTarget,Map<unknown,Set<string>>>();let listeners=0,observations=0,fired=false,svgCount=0;
      const fail=(yes:boolean)=>{if(yes&&!fired){fired=true;throw Error('acquisition control '+stage);}};
      EventTarget.prototype.addEventListener=function(type,listener,options){add.call(this,type,listener,options);if(listener){let map=tracked.get(this);if(!map)tracked.set(this,map=new Map());let kinds=map.get(listener);if(!kinds)map.set(listener,kinds=new Set());const key=type+':'+(typeof options==='boolean'?options:!!options?.capture);if(!kinds.has(key)){kinds.add(key);listeners++;}}fail(stage==='font'&&type==='loadingdone'||stage==='media'&&type==='change'&&'matches'in this||stage==='pointer'&&type==='pointermove');};
      EventTarget.prototype.removeEventListener=function(type,listener,options){remove.call(this,type,listener,options);const key=type+':'+(typeof options==='boolean'?options:!!options?.capture),map=tracked.get(this),kinds=map?.get(listener);if(kinds?.delete(key))listeners--;if(kinds?.size===0)map!.delete(listener);if(map?.size===0)tracked.delete(this);};
      const inserted=(parent:Node,nodes:readonly (Node|string)[])=>{for(const node of nodes)if(typeof node!=='string'&&node instanceof Element&&node.localName==='svg'&&parent instanceof HTMLElement&&parent.parentElement?.parentElement?.hasAttribute('data-nc-root')){svgCount++;fail(stage==='writer'&&svgCount===1||stage==='overlay'&&svgCount===2);}};
      Element.prototype.append=function(...nodes){append.apply(this,nodes);inserted(this,nodes);};Node.prototype.appendChild=function<T extends Node>(node:T):T{const result=appendChild.call(this,node) as T;inserted(this,[node]);return result;};
      window.ResizeObserver=class extends RO{active=false;override observe(target:Element,options?:ResizeObserverOptions){super.observe(target,options);if(!this.active){this.active=true;observations++;}fail(stage==='observer');}override disconnect(){super.disconnect();if(this.active){this.active=false;observations--;}}};
      try{const result=window.NCColumn.createColumnChart(host,spec,{instanceId:'acquire'});rows.push({stage,fired,status:result.status,listeners,observations,roots:host.querySelectorAll('[data-nc-root]').length});if(result.status==='ok')result.value.destroy();}
      finally{EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;Element.prototype.append=append;Node.prototype.appendChild=appendChild;window.ResizeObserver=RO;tracked.clear();}
      const retry=window.NCColumn.createColumnChart(host,spec,{instanceId:'acquire'});if(retry.status!=='ok')throw Error('Failed retry '+stage);retry.value.destroy();
    }return rows;
  });for(const row of rows)expect(row).toMatchObject({fired:true,status:'invalid',listeners:0,observations:0,roots:0});
});
test('100 retained Column/Bar controllers release listeners, observers, frames, timers and portals',async({page},info)=>{
  await setup(page);const result=await page.evaluate(async()=>{
    const w=window;
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,RO=window.ResizeObserver,raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),timeout=window.setTimeout.bind(window),clearTimeout=window.clearTimeout.bind(window);
    const tracked=new Map<EventTarget,Map<unknown,Set<string>>>(),frames=new Set<number>(),timers=new Set<number>();let listeners=0,observations=0;
    EventTarget.prototype.addEventListener=function(type,listener,options){if(listener){let m=tracked.get(this);if(!m)tracked.set(this,m=new Map());let s=m.get(listener);if(!s)m.set(listener,s=new Set());const key=type+':'+(typeof options==='boolean'?options:!!options?.capture);if(!s.has(key)){s.add(key);listeners++;}}return add.call(this,type,listener,options);};
    EventTarget.prototype.removeEventListener=function(type,listener,options){const key=type+':'+(typeof options==='boolean'?options:!!options?.capture),m=tracked.get(this),s=m?.get(listener);if(s?.delete(key))listeners--;if(s?.size===0)m!.delete(listener);if(m?.size===0)tracked.delete(this);return remove.call(this,type,listener,options);};
    window.ResizeObserver=class extends RO{active=false;override observe(target:Element,options?:ResizeObserverOptions){if(!this.active){this.active=true;observations++;}super.observe(target,options);}override disconnect(){if(this.active){this.active=false;observations--;}super.disconnect();}};
    window.requestAnimationFrame=callback=>{const id=raf(t=>{frames.delete(id);callback(t);});frames.add(id);return id;};window.cancelAnimationFrame=id=>{frames.delete(id);cancel(id);};
    window.setTimeout=((handler:TimerHandler,delay?:number,...args:unknown[])=>{const id=timeout(()=>{timers.delete(id);if(typeof handler==='function')handler(...args);},delay);timers.add(id);return id;}) as typeof window.setTimeout;window.clearTimeout=id=>{if(typeof id==='number')timers.delete(id);clearTimeout(id);};
    const tick=()=>new Promise<void>(r=>raf(()=>raf(()=>r()))),host=document.getElementById('host')!,cycles:object[]=[];w.retainedColumns=[];w.columnResourceRefs=[];
    try{
      for(let i=0;i<100;i++){
        const mobile=i%2===0;host.style.width=mobile?'320px':'768px';host.style.height=mobile?'300px':'400px';document.body.style.transform=mobile?'translateZ(0)':'';
        const spec={...w.NCColumn.columnFixture(i%3===0?'negative':'grouped'),orientation:i%2===0?'horizontal' as const:'vertical' as const,theme:'auto' as const},r=w.NCColumn.createColumnChart(host,spec,{instanceId:'cycle'});if(r.status!=='ok')throw Error(JSON.stringify(r));const c=r.value;
        for(let n=0;n<120&&c.getSnapshot().committedRevision!==c.getSnapshot().revision;n++)await tick();
        const grid=host.querySelector<HTMLElement>('[data-nc-grid]')!;grid.focus();grid.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));for(let n=0;n<8&&!document.querySelector('[data-nc-tooltip]:not([hidden]),[data-nc-detail]:not([hidden])');n++)await tick();
        host.querySelector<HTMLButtonElement>('[data-nc-table-toggle]')!.click();host.querySelector<HTMLButtonElement>('[data-nc-table-action="close"]')!.click();
        const root=host.querySelector('[data-nc-root]')!,datum=spec.series[0]!.data[0]!.datum!;w.columnResourceRefs.push(new WeakRef(spec),new WeakRef(datum),new WeakRef(root));
        c.update({...spec,title:'Updated retained cycle'});c.refresh();c.destroy();c.destroy();w.retainedColumns.push(c);await tick();
        const row={cycle:i,mobile,listeners,observations,frames:frames.size,timers:timers.size,roots:host.querySelectorAll('[data-nc-root]').length,portals:document.querySelectorAll('[data-nc-tooltip]').length};cycles.push(row);if(listeners||observations||frames.size||timers.size||row.roots||row.portals)throw Error(JSON.stringify(row));
      }
      return{cycles,retained:w.retainedColumns.length,weakRefs:w.columnResourceRefs.length};
    }finally{EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;window.ResizeObserver=RO;window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;window.setTimeout=timeout;window.clearTimeout=clearTimeout;tracked.clear();}
  });expect(result.cycles).toHaveLength(100);expect(result.retained).toBe(100);
  let collection:object={status:'NOT MEASURED',reason:'Explicit GC is available only through Chromium CDP in this harness.'};
  if(info.project.name==='chromium'){const session=await page.context().newCDPSession(page);for(let n=0;n<3;n++)await session.send('HeapProfiler.collectGarbage');const alive=await page.evaluate(()=>window.columnResourceRefs.filter(r=>r.deref()).length);expect(alive).toBe(0);collection={status:'PASS',alive,retainedControllers:100,collectibleReferences:300};await session.detach();}
  const dir=path.resolve('artifacts/nc-01c/resources');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,info.project.name+'.json'),JSON.stringify({...result,browser:info.project.name,collection},null,2)+'\n');
});
