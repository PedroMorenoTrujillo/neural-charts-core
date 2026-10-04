import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {waitForActive} from './wait-for-active.js';
test.beforeEach(async({page})=>{await page.setContent('<div id="host" style="width:100px;height:100px"><b id="foreign">foreign</b></div>');await page.addScriptTag({path:path.resolve('artifacts/nc-01a/browser-harness.js')});});
test.afterEach(async({page},info)=>{if(process.env.NC_COVERAGE==='1'&&info.project.name==='chromium'){const coverage=await page.evaluate(()=> (globalThis as any).__coverage__);fs.mkdirSync('artifacts/nc-01a/browser-coverage',{recursive:true});fs.writeFileSync(`artifacts/nc-01a/browser-coverage/${info.testId.replace(/[^a-z0-9]/gi,'_')}.json`,JSON.stringify(coverage));}});

test('F01 malformed scene discriminants preserve committed scene and controller revision',async({page})=>{
  const result=await page.evaluate(()=>{
    const N=(globalThis as any).NC,h=document.getElementById('host')!,clock=new N.FakeClock();let size:any;
    const controller=N.mountFoundation(h,{instancePrefix:'kinds',initialSnapshot:'rect',clock,sizeObserver:{observe:(_:any,cb:any)=>{size=cb;return{disconnect(){}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(kind:any,s:any,r:any)=>N.ok({...N.frame(r,[{kind,key:'a',x:0,y:0,width:10,height:10}]),...s})}).value;
    size({width:100,height:100});clock.flush();const before=h.innerHTML,revision=controller.getSnapshot().committedRevision;
    const kinds:any[]=[['path'],['rect'],{toString:()=> 'rect'},null,0,'constructor','toString','__proto__','unknown'];
    const rejected=kinds.map(kind=>{controller.update(kind);clock.flush();return h.innerHTML===before&&controller.getSnapshot().committedRevision===revision&&controller.getSnapshot().phase==='active';});
    controller.destroy();return{rejected,remaining:h.innerHTML};
  });
  expect(result.rejected).toEqual(Array(9).fill(true));expect(result.remaining).toBe('<b id="foreign">foreign</b>');
});

test('F02 transactional acquisition rolls back failures and tolerates throwing cleanup',async({page})=>{
  const results=await page.evaluate(()=>{
    const N=(globalThis as any).NC,h=document.getElementById('host')!,foreign=document.getElementById('foreign')!,observations:any[]=[];
    for(const stage of ['svg','attributes','append','append-after','observer','cleanup']){
      const create=document.createElementNS,attribute=Element.prototype.setAttribute,append=Node.prototype.appendChild,remove=Element.prototype.remove;
      const clock=new N.FakeClock();let disconnected=0;
      const options={instancePrefix:'acquire',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>{if(stage==='observer'||stage==='cleanup'){cb({width:100,height:100});throw Error('observe');}return{disconnect:()=>disconnected++};}},validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>N.ok({...N.frame(r),...s})};
      try{
        document.createElementNS=function(ns:any,name:any,...rest:any[]):any{if(stage==='svg'&&name==='svg')throw Error('create');return (create as any).call(this,ns,name,...rest);};
        Element.prototype.setAttribute=function(k:string,v:string){if(stage==='attributes'&&this.tagName.toLowerCase()==='svg')throw Error('attribute');return attribute.call(this,k,v);};
        Node.prototype.appendChild=function<T extends Node>(node:T):T{if((stage==='append'||stage==='append-after')&&node.nodeName.toLowerCase()==='svg'){if(stage==='append-after')append.call(this,node);throw Error('append');}return append.call(this,node) as T;};
        Element.prototype.remove=function(){if(stage==='cleanup')throw Error('remove');return remove.call(this);};
        const first=N.mountFoundation(h,options);observations.push({stage,status:first.status,pending:clock.pendingCount,foreign:foreign.parentNode===h,owned:h.children.length-1});
      }finally{document.createElementNS=create;Element.prototype.setAttribute=attribute;Node.prototype.appendChild=append;Element.prototype.remove=remove;}
      const retry=N.mountFoundation(h,{...options,sizeObserver:{observe:()=>({disconnect:()=>disconnected++})}});if(retry.status==='ok')retry.value.destroy();observations[observations.length-1].retry=retry.status;observations[observations.length-1].disconnect=disconnected;
    }
    return observations;
  });
  for(const r of results)expect(r).toEqual({stage:r.stage,status:'invalid',pending:0,foreign:true,owned:0,retry:'ok',disconnect:1});
});

test('F02 native observer acquisition disconnects when observe throws',async({page})=>{
  const result=await page.evaluate(()=>{
    const N=(globalThis as any).NC,h=document.getElementById('host')!,original=window.ResizeObserver;let subscriptions=0;
    (window as any).ResizeObserver=class{observe(){subscriptions++;throw Error('native observe');}disconnect(){subscriptions--;}};
    let first:any;try{first=N.mountFoundation(h,{instancePrefix:'observe',initialSnapshot:1,clock:new N.FakeClock(),validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>N.ok({...N.frame(r),...s})});}finally{window.ResizeObserver=original;}
    const reservation=N.reserveInstance(h,'observe');if(reservation.status==='ok')reservation.value.release();return{status:first.status,subscriptions,retry:reservation.status,children:h.children.length};
  });expect(result).toEqual({status:'invalid',subscriptions:0,retry:'ok',children:1});
});

test('F03 outstanding plans rebase attributes, identity, clipping and order',async({page})=>{
  const result=await page.evaluate(()=>{
    const N=(globalThis as any).NC,h=document.getElementById('host')!,w=N.createSvgWriter(h,'plans').value;
    const rect={key:'a',kind:'rect',x:0,y:0,width:10,height:10,presentation:{fill:{kind:'solid',value:'#f00'},stroke:{kind:'solid',value:'#000'},opacity:.5},translate:{x:1,y:2},clipKey:'c',semantic:{targetId:'old'}};
    const other={key:'b',kind:'rect',x:20,y:0,width:2,height:2},clip={key:'c',kind:'clip-rect',x:0,y:0,width:100,height:100};
    w.apply(w.prepare(N.frame(1,[rect,other],[clip]),new Map()).value);
    const a=h.querySelector('[data-nc-layer="marks"]')!.children[0],b=h.querySelector('[data-nc-layer="marks"]')!.children[1];
    const p2=w.prepare(N.frame(2,[other,{key:'a',kind:'text',x:0,y:0,text:'text'}]),new Map()).value;
    const p3=w.prepare(N.frame(3,[other,{key:'a',kind:'rect',x:2,y:3,width:10,height:10}]),new Map()).value;
    const statuses=[w.apply(p2).status,w.apply(p3).status],group=h.querySelector('[data-nc-layer="marks"]')!;
    const identity=group.children[0]===b&&group.children[1]===a,removed=['fill','stroke','opacity','transform','clip-path'].every(k=>!a!.hasAttribute(k));
    w.apply(w.prepare(N.frame(4,[other,{key:'a',kind:'rect',x:0,y:0,width:10,height:10,presentation:rect.presentation,semantic:rect.semantic}]),new Map()).value);
    const p5=w.prepare(N.frame(5,[{...other,x:30}]),new Map()).value,p6=w.prepare(N.frame(6,[{...other,x:40},{key:'a',kind:'rect',x:2,y:3,width:10,height:10}]),new Map()).value;
    statuses.push(w.apply(p5).status);const deletion=group.children.length===1&&group.children[0]===b;
    statuses.push(w.apply(p6).status);const restored=group.children[1]===a&&!a!.hasAttribute('fill')&&!a!.hasAttribute('stroke')&&!a!.hasAttribute('opacity')&&b!.getAttribute('x')==='40';
    const p7=w.prepare(N.frame(7,[other]),new Map()).value;w.clear();const clear=w.apply(p7).status;
    const p8=w.prepare(N.frame(8,[other]),new Map()).value;w.dispose();const disposed=w.apply(p8).status;
    return{statuses,identity,removed,noClips:h.querySelectorAll('clipPath').length===0,deletion,restored,clear,disposed,remaining:h.children.length};
  });expect(result).toEqual({statuses:['ok','ok','ok','ok'],identity:true,removed:true,noClips:true,deletion:true,restored:true,clear:'invalid',disposed:'invalid',remaining:1});
});

test('F07 destroy and fault-destroy release resources even if disconnect throws',async({page})=>{
  const result=await page.evaluate(()=>{
    const N=(globalThis as any).NC,h=document.getElementById('host')!,results:any[]=[];
    for(const fault of [false,true]){const clock=new N.FakeClock();let size:any,disconnects=0;
      const c=N.mountFoundation(h,{instancePrefix:'resources',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>{size=cb;return{disconnect(){disconnects++;throw Error('disconnect');}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>{if(fault)throw Error('compute');return N.ok({...N.frame(r),...s});}}).value;
      size({width:100,height:100});if(fault)clock.flush();const phase=c.getSnapshot().phase;c.destroy();c.destroy();for(const cb of clock.cancelled.values())cb(0);const retry=N.reserveInstance(h,'resources');if(retry.status==='ok')retry.value.release();results.push({phase,disconnects,pending:clock.pendingCount,remaining:h.children.length,retry:retry.status,update:c.update(2).status,destroyed:c.getSnapshot().phase});
    }return results;
  });expect(result).toEqual([{phase:'active',disconnects:1,pending:0,remaining:1,retry:'ok',update:'invalid',destroyed:'destroyed'},{phase:'faulted',disconnects:1,pending:0,remaining:1,retry:'ok',update:'invalid',destroyed:'destroyed'}]);
});

test('F07 retained destroyed controllers do not retain detached documents or callbacks',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Explicit CDP GC proof is Chromium-only; deterministic cleanup runs on all engines.');
  const cdp=await page.context().newCDPSession(page);
  for(const fault of [false,true]){
    await page.evaluate(fault=>{const N=(globalThis as any).NC;
      const options={instancePrefix:'memory',initialSnapshot:1,clock:new N.FakeClock(),sizeObserver:{observe:(_:any,cb:any)=>{(globalThis as any).memorySize=cb;return{disconnect(){delete(globalThis as any).memorySize;}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>{if(fault)throw Error('fault');return N.ok({...N.frame(r),...s});},onDiagnostic:()=>{}};
      (globalThis as any).memoryOptions=options;(globalThis as any).weakCallbacks=[new WeakRef(options.validateAndCopy),new WeakRef(options.compute),new WeakRef(options.onDiagnostic)];
    },fault);
    await page.evaluate(fault=>{
      const G=globalThis as any,iframe=document.createElement('iframe');document.body.append(iframe);const doc=iframe.contentDocument!,h=doc.createElement('div');doc.body.append(h);
      const c=G.NC.mountFoundation(h,G.memoryOptions).value;if(fault){G.memorySize({width:100,height:100});G.memoryOptions.clock.flush();}c.destroy();
      G.retainedWriter=G.NC.createSvgWriter(h,'memory-direct').value;G.retainedReservation=G.NC.reserveInstance(h,'memory-direct').value;G.retainedWriter.dispose();G.retainedReservation.release();
      G.retainedController=c;G.weakHost=new WeakRef(h);G.weakDoc=new WeakRef(doc);G.memoryOptions=null;h.remove();iframe.remove();
    },fault);
    await cdp.send('HeapProfiler.collectGarbage');
    const result=await page.evaluate(()=>{const G=globalThis as any;return{host:!!G.weakHost.deref(),doc:!!G.weakDoc.deref(),callbacks:G.weakCallbacks.map((r:any)=>!!r.deref()),state:G.retainedController.getSnapshot().phase};});
    expect(result).toEqual({host:false,doc:false,callbacks:[false,false,false],state:'destroyed'});
    await page.evaluate(()=>{delete(globalThis as any).retainedController;delete(globalThis as any).retainedWriter;delete(globalThis as any).retainedReservation;});
  }
});

test('F10 bounded observer wait fails when delivery never occurs',async({page})=>{
  await page.evaluate(()=>{const N=(globalThis as any).NC;(globalThis as any).nativeController=N.mountFoundation(document.getElementById('host'),{instancePrefix:'silent',initialSnapshot:1,clock:new N.FakeClock(),sizeObserver:{observe:()=>({disconnect(){}})},validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>N.ok({...N.frame(r),...s})}).value;});
  await expect(waitForActive(page,100)).rejects.toThrow();
  await page.evaluate(()=>{(globalThis as any).nativeController.destroy();delete(globalThis as any).nativeController;});
});

test('F10 bounded observer wait accepts asynchronous delivery and commit',async({page})=>{
  await page.evaluate(()=>{const N=(globalThis as any).NC,clock=new N.FakeClock();(globalThis as any).nativeController=N.mountFoundation(document.getElementById('host'),{instancePrefix:'delayed',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>{const handle=setTimeout(()=>{cb({width:100,height:100});clock.flush();},50);return{disconnect(){clearTimeout(handle);}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(_:any,s:any,r:any)=>N.ok({...N.frame(r),...s})}).value;});
  await waitForActive(page);
  await page.evaluate(()=>{(globalThis as any).nativeController.destroy();delete(globalThis as any).nativeController;});
});
