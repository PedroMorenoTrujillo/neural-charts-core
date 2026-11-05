import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'../..');
for(const name of ['window','document','HTMLElement','ResizeObserver','requestAnimationFrame'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('Unexpected host access: '+name);}});
const {planChart,transformPlanViewport}=await import(pathToFileURL(path.join(root,'dist/plan.js')).href);
const results=[];
function check(name,run){run();results.push(name);console.log('PASS '+name);}
function planned(spec,options={}){const result=planChart(spec,{width:390,height:260,...options});assert.notEqual(result.status,'invalid',JSON.stringify(result.diagnostic));return result.frame;}
function changed(frame,intent){assert(frame.viewport);const result=transformPlanViewport(frame.viewport,intent);assert.equal(result.status,'ok',JSON.stringify(result.diagnostic));return result.value;}
const categories=Array.from({length:7},(_,index)=>({id:'c'+index,label:'Category '+index}));
const line={family:'line',title:'Viewport',axes:{x:{type:'category',values:categories},y:{type:'linear'}},series:[{id:'a',name:'First',data:categories.map((c,i)=>({id:c.id,x:c.id,y:i===3?null:10+i}))},{id:'b',name:'Second',data:categories.map((c,i)=>({id:c.id,x:c.id,y:20+i}))}]};
const column={family:'column',title:'Stacks',axes:{x:{type:'category',values:categories.slice(0,3)},y:{type:'linear'}},series:[{id:'a',name:'First',data:[{id:'c0',x:'c0',y:10},{id:'c1',x:'c1',y:-4},{id:'c2',x:'c2',y:0}]},{id:'b',name:'Second',data:[{id:'c0',x:'c0',y:20},{id:'c1',x:'c1',y:-6},{id:'c2',x:'c2',y:null}]}]};
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

check('category line zoom keeps semantic IDs and raw values',()=>{
  const original=planned(line,{viewport:{axes:'x'}}),value=changed(original,{type:'zoom',factor:2});
  assert(value.x&&'firstId' in value.x);assert.notDeepEqual(value.x,{firstId:'c0',lastId:'c6'});
  const zoomed=planned(line,{viewport:{axes:'x',value}});assert(zoomed.labels.length<original.labels.length);
  for(const point of zoomed.observations){const previous=original.observations.find(p=>p.id.seriesId===point.id.seriesId&&p.id.pointId===point.id.pointId);assert(previous);assert.equal(point.value,previous.value);}
  assert(!zoomed.observations.some(p=>p.id.seriesId==='a'&&p.id.pointId==='c3'));assert(Object.isFrozen(zoomed.viewport.value));
});
check('reset restores identical projected category geometry',()=>{
  const initial=planned(line,{viewport:{axes:'x'}}),value=changed(initial,{type:'zoom',factor:2});
  const zoomed=planned(line,{viewport:{axes:'x',value}}),reset=changed(zoomed,{type:'reset'});
  assert.deepEqual(planned(line,{viewport:{axes:'x',value:reset}}),initial);
});
check('category pan clamps to last real category',()=>{
  const initial=planned(line,{viewport:{axes:'x',value:{x:{firstId:'c1',lastId:'c3'}}}});
  const value=changed(initial,{type:'pan',delta:{x:100}});assert.equal(value.x.lastId,'c6');
  const p=planned(line,{viewport:{axes:'x',value}});assert(p.labels.length>0&&p.labels.length<=3);
});
check('a combined pinch and pan transforms once; full-window gestures remain no-ops',()=>{
  const frame=planned(line,{viewport:{axes:'x'}});
  assert.deepEqual(changed(frame,{type:'zoom',factor:1}),{});
  assert.deepEqual(changed(frame,{type:'pan',delta:{x:1}}),{});
  const value=changed(frame,{type:'transform',factor:2,anchor:{x:.5},delta:{x:.5}});
  assert(value.x&&'firstId' in value.x);const next=planned(line,{viewport:{axes:'x',value}});assert(next.labels.length<frame.labels.length);
});
check('gesture state preserves category spacing and axis direction explicitly',()=>{
  const frame=planned({...line,axes:{...line.axes,x:{...line.axes.x,edgeSpacing:2}}},{viewport:{axes:'x'}});
  assert.equal(frame.viewport.bounds.x.edgeSpacing,2);assert.deepEqual(frame.viewport.reversed,{x:false,y:false});
  const value=changed(frame,{type:'zoom',factor:2,anchor:{x:0}});assert.equal(value.x.firstId,'c0');
  const bubble={family:'bubble',title:'Reverse',axes:{x:{type:'linear',reversed:true},y:{type:'linear',reversed:true}},series:[{id:'a',name:'A',data:[{id:'a',x:0,y:0,z:1},{id:'b',x:10,y:10,z:2}]}]};
  assert.deepEqual(planned(bubble,{viewport:{axes:'xy'}}).viewport.reversed,{x:true,y:true});
});
for(const type of ['linear','time'])check(type+' zoom and reset retain numeric/time semantics',()=>{
  const spec={...line,axes:{x:{type},y:{type:'linear'}},series:[{id:'a',name:'First',data:Array.from({length:11},(_,i)=>({id:'p'+i,x:i*1000,y:i}))}]};
  const initial=planned(spec,{viewport:{axes:'xy'}}),value=changed(initial,{type:'zoom',factor:2,anchor:{x:.25,y:.75}});
  assert(Array.isArray(value.x)&&Array.isArray(value.y));assert(value.x[1]-value.x[0]<initial.viewport.displayed.x[1]-initial.viewport.displayed.x[0]);
  if(type==='time')assert(value.x.every(Number.isSafeInteger));
  const zoomed=planned(spec,{viewport:{axes:'xy',value}});assert(zoomed.observations.length<initial.observations.length);
  assert.deepEqual(planned(spec,{viewport:{axes:'xy',value:changed(zoomed,{type:'reset'})}}),initial);
});
for(const orientation of ['vertical','horizontal'])check(orientation+' signed stack uses existing sum projection',()=>{
  const frame=planned({...column,orientation},{stacking:'sum'}),a=frame.series[0].bars,b=frame.series[1].bars;
  assert.equal(frame.family,orientation==='horizontal'?'bar':'column');assert.equal(frame.observations.length,5);
  assert.deepEqual(frame.observations.map(p=>p.value),[10,-4,0,20,-6]);
  if(orientation==='vertical'){close(a[0].x,b[0].x);close(b[0].y+b[0].height,a[0].y);close(a[1].y+a[1].height,b[1].y);}
  else{close(a[0].y,b[0].y);close(a[0].x+a[0].width,b[0].x);close(b[1].x+b[1].width,a[1].x);}
});
check('percent stack preserves raw values and exports independent percentages',()=>{
  // A defined zero-total category supplies explicit zeros in every visible
  // series. Unknown/null denominators are checked by verify-plan-references.
  const spec={...column,series:column.series.map(s=>({...s,data:s.data.map(p=>({...p,y:p.y===null?0:Math.abs(p.y)}))}))};
  const frame=planned(spec,{stacking:'percent'}),group=frame.observations.filter(p=>p.id.pointId==='c0');
  assert.deepEqual(group.map(p=>p.value),[10,20]);close(group.reduce((sum,p)=>sum+p.percentage,0),100);
  const hidden=planned(spec,{stacking:'percent',hiddenSeriesIds:['b']});close(hidden.observations.find(p=>p.id.pointId==='c0').percentage,100);
  assert(hidden.observations.some(p=>p.id.pointId==='c2'&&p.value===0));
  assert.equal(hidden.observations.find(p=>p.id.pointId==='c2').percentage,undefined);
});
check('stacked viewport keeps only actual visible categories',()=>{
  const frame=planned(column,{stacking:'sum',viewport:{axes:'x',value:{x:{firstId:'c1',lastId:'c2'}}}});
  assert(frame.observations.every(p=>['c1','c2'].includes(p.id.pointId)));assert.deepEqual(frame.labels.map(p=>p.label),['Category 1','Category 2']);
});
check('stacked percent rejects negative data and incompatible per-series gap',()=>{
  assert.equal(planChart(column,{width:390,height:260,stacking:'percent'}).diagnostic.reason,'NEGATIVE_PERCENT_VALUE');
  assert.equal(planChart({...column,barGap:.1},{width:390,height:260,stacking:'sum'}).status,'invalid');
  assert.equal(planChart(line,{width:390,height:260,stacking:'sum'}).status,'invalid');
});
check('bubble viewport preserves X/Y/size and radii of surviving observations',()=>{
  const spec={family:'bubble',title:'Bubbles',axes:{x:{type:'linear'},y:{type:'linear'}},series:[{id:'a',name:'First',data:Array.from({length:11},(_,i)=>({id:'p'+i,x:i,y:i,z:i+1}))}]};
  const initial=planned(spec,{viewport:{axes:'xy'}}),value=changed(initial,{type:'zoom',factor:2});
  const zoomed=planned(spec,{viewport:{axes:'xy',value}});assert(zoomed.observations.length<initial.observations.length);
  for(const point of zoomed.observations){const old=initial.observations.find(p=>p.id.pointId===point.id.pointId);assert(old);assert.equal(point.xValue,old.xValue);assert.equal(point.value,old.value);assert.equal(point.sizeValue,old.sizeValue);close(point.hit.radius,old.hit.radius);}
});
check('radial families reject inactive viewport/stacking controls',()=>{
  for(const family of ['pie','donut']){const spec={family,title:'Radial',data:[{id:'a',label:'A',value:1}]};assert.equal(planChart(spec,{width:300,height:300,viewport:{axes:'x'}}).status,'invalid');assert.equal(planChart(spec,{width:300,height:300,stacking:'sum'}).status,'invalid');}
});
check('window and gesture input are bounded, typed and descriptor-safe',()=>{
  const frame=planned(line,{viewport:{axes:'x'}});
  for(const intent of [{type:'zoom',factor:0},{type:'zoom',factor:NaN},{type:'zoom',factor:2,anchor:{x:2}},{type:'zoom',factor:2,extra:true},{type:'pan',delta:{x:Infinity}},{type:'pan',delta:{x:'1'}}])assert.equal(transformPlanViewport(frame.viewport,intent).status,'invalid');
  let read=false;const intent={type:'zoom'};Object.defineProperty(intent,'factor',{enumerable:true,get(){read=true;return 2;}});assert.equal(transformPlanViewport(frame.viewport,intent).status,'invalid');assert.equal(read,false);
  assert.equal(planChart(line,{width:390,height:260,viewport:{axes:'x',value:{x:{firstId:'missing',lastId:'c4'}}}}).status,'invalid');
  assert.equal(planChart(line,{width:390,height:260,viewport:{axes:'x',value:{x:[0,1]}}}).status,'invalid');
});
check('viewport exposes its actual projected data rectangle without changing transforms',()=>{
  for(const spec of [line,column,{...column,orientation:'horizontal'},{family:'bubble',title:'B',axes:{x:{type:'linear'},y:{type:'linear'}},series:[{id:'a',name:'A',data:[{id:'a',x:1,y:2,z:3},{id:'b',x:3,y:4,z:5}]}]}]){
    const frame=planned(spec,{viewport:{axes:'xy'}}),plot=frame.viewport.plot;assert(plot);assert(plot.x>=0&&plot.y>=0&&plot.width>0&&plot.height>0);assert(plot.x+plot.width<=frame.width&&plot.y+plot.height<=frame.height);
    const without={...frame.viewport};delete without.plot;assert.deepEqual(transformPlanViewport(frame.viewport,{type:'zoom',factor:2}),transformPlanViewport(without,{type:'zoom',factor:2}));
    assert.equal(transformPlanViewport({...frame.viewport,plot:{...plot,width:NaN}},{type:'zoom',factor:2}).status,'invalid');
  }
});
fs.writeFileSync(path.join(root,'work/reports/core-plan-viewport-stacking-current.json'),JSON.stringify({date:new Date().toISOString(),status:'passed',checks:results,scope:'Pure public Core entry against isolated package; unchanged mathematical modules. Not native gesture/performance acceptance.'},null,2));
console.log('PASS '+results.length+' public viewport/stacking checks; no DOM access.');
