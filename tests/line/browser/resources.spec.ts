import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test('100 retained destroyed controllers release ownership, listeners, frames and observations',async({page},info)=>{
  await page.setContent('<div id="host" style="width:768px;height:400px"></div>');
  await page.addScriptTag({path:path.resolve('artifacts/nc-01b/browser-harness.js')});
  const result=await page.evaluate(async()=>{
    const w=globalThis as any,host=document.getElementById('host')!;
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    let listeners=0,observations=0;const tracked=new Map<EventTarget,Map<unknown,Set<string>>>();
    EventTarget.prototype.addEventListener=function(type,listener,options){if(listener){let m=tracked.get(this);if(!m)tracked.set(this,m=new Map());let s=m.get(listener);if(!s)m.set(listener,s=new Set());const key=type+':'+(typeof options==='boolean'?options:!!options?.capture);if(!s.has(key)){s.add(key);listeners++;}}return add.call(this,type,listener,options);};
    EventTarget.prototype.removeEventListener=function(type,listener,options){const key=type+':'+(typeof options==='boolean'?options:!!options?.capture);const m=tracked.get(this),s=m?.get(listener);if(s?.delete(key))listeners--;if(s?.size===0)m!.delete(listener);if(m?.size===0)tracked.delete(this);return remove.call(this,type,listener,options);};
    const RO=ResizeObserver;w.ResizeObserver=class extends RO{active=false;override observe(target:Element,options?:ResizeObserverOptions){if(!this.active){this.active=true;observations++;}super.observe(target,options);}override disconnect(){if(this.active){this.active=false;observations--;}super.disconnect();}};
    const raf=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),frames=new Set<number>();
    w.requestAnimationFrame=(callback:FrameRequestCallback)=>{const id=raf(t=>{frames.delete(id);callback(t);});frames.add(id);return id;};
    w.cancelAnimationFrame=(id:number)=>{frames.delete(id);cancel(id);};
    const tick=()=>new Promise<void>(resolve=>raf(()=>raf(()=>resolve())));
    w.retainedControllers=[];w.resourceRefs=[];const cycles=[];
    try{
      for(let i=0;i<100;i++){
        const docked=i%2===1;host.style.width=docked?'320px':'768px';host.style.height=docked?'240px':'400px';document.body.style.transform=docked?'translate(0)':'';
        const datum={cycle:i},spec={family:'line',title:'Resource cycle',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:2,datum},{id:'b',x:1,y:4}]}]};
        const diagnostics:unknown[]=[];const mounted=w.NCLine.createLineChart(host,spec,{instanceId:'resources',onDiagnostic:(d:unknown)=>diagnostics.push(d)});if(mounted.status!=='ok')throw Error('Mount '+i);const c=mounted.value;
        for(let n=0;n<120&&(!c.getSnapshot().committedRevision||c.getSnapshot().revision!==c.getSnapshot().committedRevision);n++)await tick();
        const owned=host.querySelector('[data-nc-root]')!,grid=host.querySelector('[role="grid"]') as HTMLElement;if(!grid)throw Error(JSON.stringify({snapshot:c.getSnapshot(),diagnostics}));grid.focus();await tick();
        if(docked){const pane=host.querySelector('[data-nc-detail]') as HTMLElement;for(let n=0;n<120&&pane.hidden;n++)await tick();if(pane.hidden)throw Error('Dock not exercised in cleanup cycle '+i);}
        const toggle=[...host.querySelectorAll('button')].find(b=>b.textContent==='View data table')!;toggle.click();await tick();
        w.resourceRefs.push(new WeakRef(datum),new WeakRef(spec),new WeakRef(owned));
        c.update({...spec,title:'Updated cycle'});c.refresh();c.destroy();c.destroy();w.retainedControllers.push(c);await tick();
        const row={cycle:i,docked,listeners,observations,frames:frames.size,owned:host.querySelectorAll('[data-nc-root]').length,portals:document.querySelectorAll('[data-nc-tooltip]').length};cycles.push(row);
        if(listeners||observations||frames.size||row.owned||row.portals)throw Error(JSON.stringify(row));
      }
      return {cycles,retained:w.retainedControllers.length,weakRefs:w.resourceRefs.length};
    }finally{EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;w.ResizeObserver=RO;w.requestAnimationFrame=raf;w.cancelAnimationFrame=cancel;tracked.clear();}
  });
  expect(result.cycles).toHaveLength(100);expect(result.retained).toBe(100);
  let collection:unknown={status:'NOT_AVAILABLE',reason:'Portable counters verified; deterministic forced GC evidence uses Chromium CDP.'};
  if(info.project.name==='chromium'){
    const session=await page.context().newCDPSession(page);await session.send('HeapProfiler.collectGarbage');await session.send('HeapProfiler.collectGarbage');
    const alive=await page.evaluate(()=>(globalThis as any).resourceRefs.filter((r:WeakRef<object>)=>r.deref()).length);expect(alive).toBe(0);collection={status:'PASS',alive,retainedControllers:100,collectibleReferences:300};await session.detach();
  }
  fs.mkdirSync('artifacts/nc-01b/resources',{recursive:true});fs.writeFileSync(`artifacts/nc-01b/resources/${info.project.name}.json`,JSON.stringify({...result,collection},null,2));
  if(process.env.NC_COVERAGE==='1'&&info.project.name==='chromium'){const coverage=await page.evaluate(()=>(globalThis as any).__coverage__);fs.mkdirSync('artifacts/nc-01b/browser-coverage',{recursive:true});fs.writeFileSync('artifacts/nc-01b/browser-coverage/resources.json',JSON.stringify(coverage));}
});
