import {test,expect}from'@playwright/test';
import fs from'node:fs';
import path from'node:path';
test.beforeEach(async({page})=>{await page.setContent('<div id="host" style="width:100px;height:100px"></div><div id="other" style="width:100px;height:100px"></div>');await page.addScriptTag({path:path.resolve('artifacts/nc-01a/browser-harness.js')});});
test.afterEach(async({page},info)=>{if(process.env.NC_COVERAGE==='1'&&info.project.name==='chromium'){const coverage=await page.evaluate(()=> (globalThis as any).__coverage__);fs.mkdirSync('artifacts/nc-01a/browser-coverage',{recursive:true});fs.writeFileSync(`artifacts/nc-01a/browser-coverage/${info.testId.replace(/[^a-z0-9]/gi,'_')}.json`,JSON.stringify(coverage));}});
test('writer attributes, identities, ordering, clips and validation atomicity',async({page})=>{
  const result=await page.evaluate(()=>{
    const N=(globalThis as any).NC,host=document.getElementById('host')!;N.reserveInstance(host,'writer');const w=N.createSvgWriter(host,'writer').value;
    const rect={key:'r',kind:'rect',x:1,y:2,width:10,height:10,rx:2,presentation:{fill:{kind:'solid',value:'#ABC'},stroke:{kind:'solid',value:'#1234'},strokeWidth:2,dash:[1,2],lineCap:'round',lineJoin:'bevel',opacity:.5,fillOpacity:.4,strokeOpacity:.3},classes:['nc-test','nc-test'],clipKey:'c',translate:{x:0,y:2},semantic:{targetId:'data'}};
    const marks=[rect,{key:'t',kind:'text',x:1,y:1,text:'<script>literal</script>',anchor:'middle',baseline:'alphabetic',fontSize:12,fontFamily:'serif',fontWeight:600},{key:'p',kind:'path',commands:[{kind:'M',x:0,y:0},{kind:'L',x:10,y:0}]},{key:'l',kind:'line',x1:0,y1:0,x2:10,y2:10},{key:'c',kind:'circle',cx:1,cy:1,r:2}];
    const defs=[{key:'c',kind:'clip-rect',x:0,y:0,width:50,height:50},{key:'unused',kind:'clip-rect',x:0,y:0,width:1,height:1}];
    const apply=(f:any)=>{const p=w.prepare(f,new Map());return p.status==='ok'?w.apply(p.value):p;};
    const first=apply(N.frame(1,marks,defs));const group=host.querySelector('[data-nc-layer="marks"]')!,nodes=[...group.children],before=host.innerHTML;
    const invalid=apply(N.frame(2,[{...rect,x:NaN}],defs)),atomic=host.innerHTML===before;
    const next=[marks[4],{key:'r',kind:'rect',x:5,y:2,width:10,height:10}, {...marks[1],text:'changed'},marks[2],marks[3]];
    const second=apply(N.frame(2,next)),same=group.children[1]===nodes[0],removed=!nodes[0]!.hasAttribute('rx')&&!nodes[0]!.hasAttribute('fill')&&!nodes[0]!.hasAttribute('clip-path'),noDefs=host.querySelectorAll('clipPath').length===0;
    const stale=apply(N.frame(2,next));const replace=apply(N.frame(3,[{key:'r',kind:'circle',cx:0,cy:0,r:2}])),replaced=group.children[0]!==nodes[0];
    const namespace=group.children[0]!.namespaceURI;w.clear();const cleared=group.children.length===0;const prepared=w.prepare(N.frame(4,[]),new Map()).value;w.clear();const clearedToken=w.apply(prepared).status;w.dispose();w.dispose();
    return{first:first.status,second:second.status,invalid:invalid.status,atomic,same,removed,noDefs,stale:stale.status,replace:replace.status,replaced,namespace,cleared,clearedToken,remaining:host.querySelectorAll('svg').length};
  });
  expect(result).toEqual({first:'ok',second:'ok',invalid:'invalid',atomic:true,same:true,removed:true,noDefs:true,stale:'invalid',replace:'ok',replaced:true,namespace:'http://www.w3.org/2000/svg',cleared:true,clearedToken:'invalid',remaining:0});
});
test('ID isolation, collisions and unsupported hosts',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!,o=document.getElementById('other')!;
    const a=N.reserveInstance(h,'a');const dup=N.reserveInstance(o,'a'),same=N.reserveInstance(h,'b'),bad=N.reserveInstance(o,'1bad');
    const b=N.reserveInstance(o,'b'),wa=N.createSvgWriter(h,'a').value,wb=N.createSvgWriter(o,'b').value,mark={key:'r',kind:'rect',x:0,y:0,width:1,height:1,clipKey:'😀'},def={key:'😀',kind:'clip-rect',x:0,y:0,width:1,height:1};
    for(const w of[wa,wb])w.apply(w.prepare(N.frame(1,[mark],[def]),new Map()).value);
    const ids=[...document.querySelectorAll('clipPath')].map(x=>x.id),encoding=N.clipId('a','😀');wa.dispose();a.value.release();a.value.release();wb.dispose();b.value.release();
    const detached=N.reserveInstance(document.createElement('div'),'d');const shadow=document.createElement('div');document.body.append(shadow);const sh=shadow.attachShadow({mode:'open'}),shost=document.createElement('div');sh.append(shost);const unsupported=N.reserveInstance(shost,'s');
    const fake=document.createElement('span');fake.id='nc-c-owner';document.body.append(fake);const foreign=N.reserveInstance(h,'c');
    return{a:a.status,b:b.status,dup:dup.status,same:same.status,bad:bad.status,unique:new Set(ids).size===2,encoding,detached:detached.status,unsupported:unsupported.status,foreign:foreign.status};});
  expect(result).toEqual({a:'ok',b:'ok',dup:'invalid',same:'invalid',bad:'invalid',unique:true,encoding:'nc-a-clip-d83dde00',detached:'invalid',unsupported:'invalid',foreign:'invalid'});
});
test('lifecycle coalescing, token paint, suspension, validation and cleanup',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!,clock=new N.FakeClock();let sizeCallback:any,disconnects=0;const diagnostics:any[]=[];
    h.style.setProperty('--nc-color','#ABC');const mount=N.mountFoundation(h,{instancePrefix:'life',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>{sizeCallback=cb;return{disconnect:()=>disconnects++};}},validateAndCopy:(x:any)=>typeof x==='number'&&Number.isFinite(x)?N.ok(x):N.invalid('INVALID_NUMBER','WRONG_TYPE'),compute:(x:any,size:any,r:any)=>N.ok({...N.frame(r,[{key:'r',kind:'rect',x,y:0,width:1,height:1,presentation:{fill:{kind:'token',name:'--nc-color',fallback:{kind:'solid',value:'#000'}}}}]),...size}),onDiagnostic:(d:any)=>diagnostics.push(d)});
    const c=mount.value;const initial=c.getSnapshot();sizeCallback({width:100,height:100});c.update(2);c.update(3);clock.flush();let rect=h.querySelector('rect')!;const firstX=rect.getAttribute('x'),firstPaint=rect.getAttribute('fill'),committed=c.getSnapshot().committedRevision;
    c.update('bad');h.style.setProperty('--nc-color','#1234');c.invalidatePaint();clock.flush();const paint=rect.getAttribute('fill');h.style.setProperty('--nc-color','url(https://invalid.example)');c.invalidatePaint();clock.flush();const fallback=rect.getAttribute('fill');
    sizeCallback({width:0,height:100});c.update(8);const suspended=c.getSnapshot(),cleared=h.querySelectorAll('rect').length===0;sizeCallback({width:100,height:100});clock.flush();const resumed=h.querySelector('rect')!.getAttribute('x');sizeCallback({width:NaN,height:100});
    c.destroy();c.destroy();sizeCallback({width:100,height:100});for(const cb of clock.cancelled.values())cb(0);return{initial:initial.phase,initialRevision:initial.revision,firstX,firstPaint,paint,fallback,committed,suspended:suspended.phase,cleared,resumed,pending:clock.pendingCount,disconnects,dom:h.children.length,after:c.update(1).status,paintAfter:c.invalidatePaint().status,phase:c.getSnapshot().phase,diagnostics:diagnostics.map(x=>x.reason)};});
  expect(result).toMatchObject({initial:'suspended',initialRevision:1,firstX:'3',firstPaint:'#abc',paint:'#1234',fallback:'#000',committed:4,suspended:'suspended',cleared:true,resumed:'8',pending:0,disconnects:1,dom:0,after:'invalid',paintAfter:'invalid',phase:'destroyed',diagnostics:['BAD_SIZE']});
});
test('focus reorder and fallback; reentrant destroy cannot recursively patch',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!,clock=new N.FakeClock();let sizeCb:any;
    const c=N.mountFoundation(h,{instancePrefix:'focus',initialSnapshot:0,clock,sizeObserver:{observe:(_:any,cb:any)=>{sizeCb=cb;return{disconnect:()=>{}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(x:any,size:any,r:any)=>N.ok({...N.frame(r,x===2?[]:x===1?[{key:'b',kind:'rect',x:0,y:0,width:1,height:1},{key:'a',kind:'rect',x:1,y:0,width:1,height:1}]:[{key:'a',kind:'rect',x:1,y:0,width:1,height:1},{key:'b',kind:'rect',x:0,y:0,width:1,height:1}]),...size})}).value;
    sizeCb({width:100,height:100});clock.flush();const a=h.querySelector('rect')as SVGElement;a.setAttribute('tabindex','0');a.focus();c.update(1);clock.flush();const preserved=document.activeElement===a;
    a.addEventListener('blur',()=>c.destroy(),{once:true});c.update(2);clock.flush();return{preserved,phase:c.getSnapshot().phase,dom:h.children.length,pending:clock.pendingCount};});
  expect(result).toEqual({preserved:true,phase:'destroyed',dom:0,pending:0});
});
test('fault policy, normal compute failure and mount cleanup',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!,clock=new N.FakeClock();let sizeCb:any;const diags:any[]=[];
    const c=N.mountFoundation(h,{instancePrefix:'fault',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>{sizeCb=cb;return{disconnect:()=>{}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(x:any,size:any,r:any)=>x===0?N.invalid('INVALID_CONFIG','BAD_INPUT'):N.ok({...N.frame(r,[{key:'r',kind:'rect',x,y:0,width:1,height:1}]),...size}),onDiagnostic:(d:any)=>diags.push(d)}).value;
    sizeCb({width:100,height:100});clock.flush();c.update(0);clock.flush();const preserved=h.querySelector('rect')!.getAttribute('x')==='1';const rect=h.querySelector('rect')!;rect.setAttribute=()=>{throw Error('platform');};c.update(2);clock.flush();const fault=c.getSnapshot().phase,after=c.update(3).status,empty=h.querySelectorAll('svg').length===0;c.destroy();
    const failed=N.mountFoundation(h,{instancePrefix:'badmount',initialSnapshot:1,clock,sizeObserver:{observe:()=>{throw Error('observe');}},validateAndCopy:(x:any)=>N.ok(x),compute:()=>N.ok(N.frame())});const invalid=N.mountFoundation(h,{instancePrefix:'invalid',initialSnapshot:0,validateAndCopy:()=>N.invalid('INVALID_CONFIG','BAD'),compute:()=>N.ok(N.frame())});
    return{preserved,fault,after,empty,failed:failed.status,invalid:invalid.status,children:h.children.length,reasons:diags.map(x=>x.reason)};});
  expect(result).toEqual({preserved:true,fault:'faulted',after:'invalid',empty:true,failed:'invalid',invalid:'invalid',children:0,reasons:['BAD_INPUT','DOM_COMMIT_FAILED']});
});
test('100 mount/destroy cycles and native observer',async({page})=>{
  const result=await page.evaluate(async()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!;let subscriptions=0,pending=0;
    for(let i=0;i<100;i++){const clock=new N.FakeClock();let cb:any;const c=N.mountFoundation(h,{instancePrefix:'cycle',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,f:any)=>{subscriptions++;cb=f;return{disconnect:()=>subscriptions--};}},validateAndCopy:(x:any)=>N.ok(x),compute:(x:any,size:any,r:any)=>N.ok({...N.frame(r,[{key:'r',kind:'rect',x,y:0,width:1,height:1}]),...size})}).value;cb({width:100,height:100});clock.flush();c.update(2);c.destroy();pending+=clock.pendingCount;}
    const native=N.mountFoundation(h,{instancePrefix:'native',initialSnapshot:1,validateAndCopy:(x:any)=>N.ok(x),compute:(x:any,size:any,r:any)=>N.ok({...N.frame(r),...size})}).value;await new Promise(resolve=>setTimeout(resolve,100));const active=native.getSnapshot().phase;native.update(2);native.destroy();return{subscriptions,pending,children:h.children.length,active};});
  expect(result).toEqual({subscriptions:0,pending:0,children:0,active:'active'});
});
test('writer and mount failure edges retain foreign DOM',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!,clock=new N.FakeClock(),results:string[]=[];
    const detached=document.implementation.createHTMLDocument().createElement('div');results.push(N.createBrowserPorts(detached).status);results.push(N.createBrowserPorts(detached,{clock}).status);
    const throwing=document.createElement('div');document.body.append(throwing);throwing.appendChild=()=>{throw Error('append');};results.push(N.reserveInstance(throwing,'throws').status);results.push(N.createSvgWriter(throwing,'throws').status);
    const mountOptions={instancePrefix:'edges',initialSnapshot:1,clock,sizeObserver:{observe:(_:any,cb:any)=>({disconnect:()=>{}})},validateAndCopy:(x:any)=>N.ok(x),compute:()=>N.ok(N.frame())};
    results.push(N.mountFoundation(h,{...mountOptions,validateAndCopy:()=>{throw Error('validator');}}).status);
    const own=N.reserveInstance(h,'direct').value,w=N.createSvgWriter(h,'direct').value;
    const foreign=document.createElement('span');foreign.id=N.clipId('direct','c');document.body.append(foreign);
    results.push(w.prepare(N.frame(1,[{key:'r',kind:'rect',x:0,y:0,width:1,height:1,clipKey:'c'}],[{key:'c',kind:'clip-rect',x:0,y:0,width:1,height:1}]),new Map()).status);foreign.remove();
    const apply=(f:any,tokens=new Map())=>{const p=w.prepare(f,tokens);return p.status==='ok'?w.apply(p.value):p;};
    const def={key:'c',kind:'clip-rect',x:0,y:0,width:1,height:1};apply(N.frame(1,[{key:'r',kind:'rect',x:0,y:0,width:1,height:1,clipKey:'c',presentation:{fill:{kind:'none'}}}],[def]));apply(N.frame(2,[{key:'r',kind:'rect',x:0,y:0,width:1,height:1,clipKey:'c',presentation:{fill:{kind:'token',name:'--nc-direct',fallback:{kind:'solid',value:'#000'}}}}],[{...def,width:2}]),new Map([['--nc-direct','#FFF']]));
    const paint=h.querySelector('[data-nc-layer="marks"] rect')!.getAttribute('fill');const saved=w.prepare(N.frame(3,[]),new Map()).value;results.push(w.apply({revision:3}).status);h.querySelector('[data-nc-layer="grid"]')!.remove();results.push(w.apply(saved).status);results.push(w.prepare(N.frame(4,[]),new Map()).status);results.push(w.apply(saved).status);w.clear();w.dispose();own.release();
    const foreignChild=document.createElement('span');h.append(foreignChild);let cb:any;const diags:any[]=[];
    const c=N.mountFoundation(h,{...mountOptions,sizeObserver:{observe:(_:any,f:any)=>{cb=f;return{disconnect:()=>{}};}},compute:(_:any,size:any,r:any)=>N.ok({...N.frame(r+1),...size}),onDiagnostic:(d:any)=>diags.push(d)}).value;cb({width:100,height:100});clock.flush();const mismatch=c.getSnapshot().phase;c.destroy();
    let disconnected=0;
    const sync=N.mountFoundation(h,{...mountOptions,clock:{request:()=>{throw Error('clock');},cancel:()=>{}},sizeObserver:{observe:(_:any,f:any)=>{f({width:100,height:100});return{disconnect:()=>{disconnected++;}};}}}).value;
    const syncPhase=sync.getSnapshot().phase;sync.destroy();
    return{results,paint,mismatch,foreignPreserved:h.firstChild===foreignChild,reason:diags[0].reason,syncPhase,disconnected};});
  expect(result).toEqual({results:Array(10).fill('invalid'),paint:'#fff',mismatch:'faulted',foreignPreserved:true,reason:'FRAME_MISMATCH',syncPhase:'faulted',disconnected:1});
});
test('native focus reenters with update or zero size',async({page})=>{
  const result=await page.evaluate(()=>{const N=(globalThis as any).NC,h=document.getElementById('host')!;const outcomes:any[]=[];
    for(const action of ['update','zero']){const clock=new N.FakeClock();let cb:any;const c=N.mountFoundation(h,{instancePrefix:action,initialSnapshot:1,clock,sizeObserver:{observe:(_:any,f:any)=>{cb=f;return{disconnect:()=>{}};}},validateAndCopy:(x:any)=>N.ok(x),compute:(x:any,size:any,r:any)=>N.ok({...N.frame(r,x===2?[]:[{key:'r',kind:'rect',x,y:0,width:1,height:1}]),...size})}).value;cb({width:100,height:100});clock.flush();const r=h.querySelector('rect')as SVGElement;r.setAttribute('tabindex','0');r.focus();r.addEventListener('blur',()=>action==='update'?c.update(3):cb({width:0,height:100}),{once:true});c.update(2);clock.flush();if(action==='update')clock.flush();outcomes.push({phase:c.getSnapshot().phase,x:h.querySelector('rect')?.getAttribute('x')??null,pending:clock.pendingCount});c.destroy();}
    return outcomes;});
  expect(result).toEqual([{phase:'active',x:'3',pending:0},{phase:'suspended',x:null,pending:0}]);
});
