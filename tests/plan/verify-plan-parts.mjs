import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const variable={family:'variablepie',title:'Independent dimensions',zDomain:[0,100],data:[{id:'small',label:'Small',value:1,z:0},{id:'large',label:'Large',value:3,z:100},{id:'zero',label:'Zero',value:0,z:50}]};
const item={family:'item',title:'Observed units',columns:3,data:[{id:'a',label:'A',value:3},{id:'b',label:'B',value:2},{id:'zero',label:'Zero',value:0}]};
const polygon={family:'polygon',title:'Ordered region',axes:{x:{kind:'linear',domain:[0,4],nice:false},y:{kind:'linear',domain:[0,4],nice:false}},series:[{id:'region',name:'Region',data:[[0,0],[4,0],[4,4],[2,2],[0,4]].map(([x,y],i)=>({id:'v'+i,x,y}))}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('variablepie independently encodes angular weights and radial Z with original semantics',()=>{
  const f=frame(variable),[small,large,zero]=f.observations;assert.equal(f.family,'variablepie');assert.deepEqual(f.observations.map(o=>o.id.pointId),['small','large','zero']);assert.deepEqual(f.observations.map(o=>o.value),[1,3,0]);assert.deepEqual(f.observations.map(o=>o.sizeValue),[0,100,50]);assert.deepEqual(f.observations.map(o=>o.percentage),[25,75,0]);
  close(small.hit.end-small.hit.start,Math.PI/2);close(large.hit.end-large.hit.start,Math.PI*1.5);close(small.hit.radius/large.hit.radius,.25);assert.equal(zero.hit,undefined);assert.deepEqual(f.series[2].commands,[]);assert.ok(f.series.every(s=>s.fill===true));
});
check('area and radius normalization are explicit and constant automatic Z remains a finite equal radius',()=>{
  const data=[{id:'a',label:'A',value:1,z:25},{id:'b',label:'B',value:1,z:100}],area=frame({...variable,data}),radius=frame({...variable,data,radiusScale:'radius'}),outer=area.observations[1].hit.radius;
  close(area.observations[0].hit.radius/outer,Math.sqrt(.25*.25+.25*(1-.25*.25)));close(radius.observations[0].hit.radius/outer,.25+.25*.75);
  const constant=frame({family:'variablepie',title:'Constant Z',data:data.map(p=>({...p,z:7}))});assert.equal(constant.observations[0].hit.radius,constant.observations[1].hit.radius);close(constant.observations[0].hit.radius,136);
});
check('single full-circle variable sector uses two explicit arcs and hiding recomputes shares without identity loss',()=>{
  const f=frame(variable,{...options,hiddenSeriesIds:['large','zero']});assert.equal(f.observations.length,1);assert.equal(f.observations[0].percentage,100);assert.equal(f.series[0].commands.filter(c=>c.kind==='A').length,2);close(f.observations[0].hit.end-f.observations[0].hit.start,Math.PI*2);assert.equal(f.legend.length,3);assert.equal(f.legend[1].visible,false);assert.equal(f.series[0].color,frame(variable).series[0].color);
  assert.deepEqual(frame(variable),frame(structuredClone(variable)));
});
check('zero angular totals and collapsed radial data retain semantics without invisible sector targets',()=>{
  const f=frame({...variable,data:variable.data.map(p=>({...p,value:0}))});assert.equal(f.observations.length,3);assert.ok(f.observations.every(o=>o.hit===undefined&&!Object.hasOwn(o,'percentage')));assert.ok(f.series.every(s=>s.commands.length===0));
  const collapsed=frame({...variable,minRadiusRatio:0});assert.equal(collapsed.observations[0].value,1);assert.equal(collapsed.observations[0].percentage,25);assert.equal(collapsed.observations[0].hit,undefined);
  const huge=frame({...variable,data:[{id:'a',label:'A',value:Number.MAX_VALUE,z:0},{id:'b',label:'B',value:Number.MAX_VALUE,z:100}]});assert.deepEqual(huge.observations.map(o=>o.percentage),[50,50]);assert.ok(huge.observations.every(o=>o.value===Number.MAX_VALUE&&Number.isFinite(o.x)&&Number.isFinite(o.y)));
});
check('item paints exactly one circle per observed unit with one raw-count observation per category',()=>{
  const f=frame(item);assert.equal(f.family,'item');assert.equal(f.observations.length,3);assert.deepEqual(f.observations.map(o=>o.value),[3,2,0]);assert.deepEqual(f.observations.map(o=>o.percentage),[60,40,0]);assert.deepEqual(f.series.map(s=>s.circles.length),[3,2,0]);assert.equal(f.series.reduce((sum,s)=>sum+s.circles.length,0),5);
  for(const [i,s]of f.series.entries()){assert.equal(s.id,item.data[i].id);assert.ok(s.circles.every(c=>c.pointId===s.id));assert.equal(f.observations[i].id.seriesId,s.id);assert.equal(f.observations[i].id.pointId,s.id);assert.equal(f.observations[i].hit,undefined);if(s.circles.length){assert.equal(f.observations[i].x,s.circles[0].cx);assert.equal(f.observations[i].y,s.circles[0].cy);}}
  const all=f.series.flatMap(s=>s.circles),blank={x:16+2.5*96,y:14+1.5*136};assert.ok(all.every(c=>Math.hypot(c.cx-blank.x,c.cy-blank.y)>c.radius),'blank grid cell has no unit geometry/target');
});
check('item visibility reflows whole units and the exact 256-unit bound remains finite',()=>{
  const before=frame(item),hidden=frame(item,{...options,hiddenSeriesIds:['a']});assert.equal(hidden.series.reduce((sum,s)=>sum+s.circles.length,0),2);assert.equal(hidden.observations[0].value,2);assert.equal(hidden.series[0].color,before.series[1].color);assert.equal(hidden.legend.length,3);assert.equal(hidden.legend[0].visible,false);
  const maximum=frame({family:'item',title:'Bounded units',data:[{id:'all',label:'All',value:256}]});assert.equal(maximum.series[0].circles.length,256);assert.ok(maximum.series[0].circles.every(c=>Number.isFinite(c.cx)&&Number.isFinite(c.cy)&&c.radius>0&&c.cx-c.radius>=16&&c.cx+c.radius<=304&&c.cy-c.radius>=14&&c.cy+c.radius<=286));
  const zero=frame({...item,data:item.data.map(p=>({...p,value:0}))});assert.equal(zero.observations.length,3);assert.ok(zero.observations.every(o=>!Object.hasOwn(o,'percentage')));assert.ok(zero.series.every(s=>s.circles.length===0));
});
check('variable/item strict finite values, IDs, domain policies, integer counts and unsupported options fail',()=>{
  for(const spec of [{...variable,data:[{id:'bad',label:'Bad',value:-1,z:1}]},{...variable,data:[{id:'bad',label:'Bad',value:1,z:null}]},{...variable,zDomain:[0,10]},{...variable,zDomain:[1,1]},{...variable,minRadiusRatio:1.1},{...variable,radiusScale:'unknown'},{...item,data:[{id:'bad',label:'Bad',value:1.5}]},{...item,data:[{id:'bad',label:'Bad',value:257}]},{...item,columns:1.5},{...item,columns:33},{...item,data:[item.data[0],item.data[0]]}])assert.equal(planChart(spec,options).status,'invalid');
  for(const spec of [variable,item])for(const opts of [{stacking:'sum'},{viewport:{axes:'x'}},{references:[{id:'r',axis:'y',value:1}]},{hiddenSeriesIds:['missing']}])assert.equal(planChart(spec,{...options,...opts}).status,'invalid');
});
check('polygon preserves ordered concave source vertices and closes the actual filled region',()=>{
  const f=frame(polygon),s=f.series[0];assert.equal(f.family,'polygon');assert.equal(f.observations.length,5);assert.deepEqual(f.observations.map(o=>o.id.pointId),['v0','v1','v2','v3','v4']);assert.deepEqual(f.observations.map(o=>o.xValue),[0,4,4,2,0]);assert.deepEqual(f.observations.map(o=>o.value),[0,0,4,2,4]);assert.equal(s.areaCommands.at(-1).kind,'Z');assert.equal(s.areaCommands.length,6);
  assert.deepEqual(s.areaCommands.slice(0,-1).map(({x,y})=>({x,y})),f.observations.map(o=>({x:o.x,y:o.y})));assert.equal(s.commands.length,10);assert.equal(s.circles.length,5);assert.ok(f.observations.every(o=>o.hit.kind==='circle'),'no region bounding-box target');
  const clockwise=frame({...polygon,series:[{...polygon.series[0],data:[...polygon.series[0].data].reverse()}]});assert.deepEqual(clockwise.observations.map(o=>o.id.pointId),['v4','v3','v2','v1','v0']);
});
check('polygon viewport introduces drawing intersections but never fake source observations',()=>{
  const f=frame(polygon,{...options,viewport:{axes:'xy',value:{x:[1,3],y:[1,3]}}});assert.deepEqual(f.observations.map(o=>o.id.pointId),['v3']);assert.equal(f.observations[0].xValue,2);assert.equal(f.observations[0].value,2);assert.ok(f.series[0].areaCommands.length>0);
  for(const c of [...f.series[0].commands,...f.series[0].areaCommands])if(c.kind!=='Z')assert.ok(c.x>=16&&c.x<=304&&c.y>=14&&c.y<=286);
});
check('painted polygon remains ok with no source vertices in the viewport; fully cropped geometry is empty',()=>{
  const enclosing={...polygon,axes:{x:{kind:'linear',domain:[-20,20],nice:false},y:{kind:'linear',domain:[-20,20],nice:false}},series:[{...polygon.series[0],data:[[-10,-10],[10,-10],[10,10],[-10,10]].map(([x,y],i)=>({id:'outer'+i,x,y}))}]},f=frame(enclosing,{...options,viewport:{axes:'xy',value:{x:[-1,1],y:[-1,1]}}});assert.equal(f.observations.length,0);assert.equal(f.series[0].circles.length,0);assert.equal(f.series[0].commands.length,0);assert.equal(f.series[0].areaCommands.length,5);
  const outside=planChart(enclosing,{...options,viewport:{axes:'xy',value:{x:[12,16],y:[12,16]}}});assert.equal(outside.status,'empty');assert.equal(outside.frame.family,'polygon');assert.equal(outside.frame.observations.length,0);
  const tangent=planChart({...polygon,axes:{x:{kind:'linear',domain:[-2,2],nice:false},y:{kind:'linear',domain:[-2,2],nice:false}},series:[{...polygon.series[0],data:[[-1,1],[1,-1],[-1,-1]].map(([x,y],i)=>({id:'t'+i,x,y}))}]},{...options,viewport:{axes:'xy',value:{x:[0,1],y:[0,1]}}});assert.equal(tangent.status,'empty');assert.equal(tangent.frame.series[0].commands.length,0);
});
check('translated-area validation survives large coordinate offsets and time X remains original',()=>{
  const base=1e12,shifted={...polygon,axes:{x:{kind:'linear',domain:[base,base+4],nice:false},y:{kind:'linear',domain:[base,base+4],nice:false}},series:[{...polygon.series[0],data:polygon.series[0].data.map(p=>({...p,x:base+p.x,y:base+p.y}))}]},f=frame(shifted);assert.equal(f.observations.length,5);assert.equal(f.observations[3].value,base+2);
  const origin=Date.UTC(2026,0,1),day=86400000,time={...polygon,axes:{...polygon.axes,x:{kind:'time',domain:[origin,origin+4*day],nice:false}},series:[{...polygon.series[0],data:polygon.series[0].data.map(p=>({...p,x:origin+p.x*day}))}]},dated=frame(time);assert.equal(dated.observations[3].xValue,origin+2*day);assert.notEqual(dated.observations[3].label,String(origin+2*day));
});
check('strict polygons reject crossings, touches, duplicate vertices, null gaps and degenerate area',()=>{
  const shapes=[[[0,0],[4,4],[0,4],[4,0]],[[0,0],[4,0],[4,4],[2,0],[0,4]],[[0,0],[4,0],[2,0],[2,4],[0,4]],[[0,0],[1,1],[2,2]],[[0,0],[4,0],[0,0],[0,4]]];
  for(const vertices of shapes)assert.equal(planChart({...polygon,series:[{...polygon.series[0],data:vertices.map(([x,y],i)=>({id:'p'+i,x,y}))}]},options).status,'invalid');
  for(const data of [[{id:'one',x:0,y:0},{id:'two',x:1,y:1}],polygon.series[0].data.map((p,i)=>i===2?{...p,y:null}:p),new Array(3)])assert.equal(planChart({...polygon,series:[{...polygon.series[0],data}]},options).status,'invalid');
  assert.equal(planChart({...polygon,axes:{...polygon.axes,x:{kind:'category',values:[]}},series:[]},options).status,'invalid');
});
check('pathological polygon intersection work has an explicit finite resource limit',()=>{
  const count=3000,left=Array.from({length:count},(_,i)=>({id:'l'+i,x:(i%2)-.01,y:i})),right=Array.from({length:count},(_,i)=>({id:'r'+i,x:(i%2)+.01,y:i})).reverse(),result=planChart({...polygon,axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{...polygon.series[0],data:[...left,...right]}]},options);
  assert.equal(result.status,'invalid');assert.equal(result.diagnostic.reason,'RESOURCE_LIMIT');
});
check('polygon references, hidden identity, empty data and strict source budgets remain coherent',()=>{
  const f=frame(polygon,{...options,references:[{id:'middle',axis:'x',value:2},{id:'level',axis:'y',value:2}]});assert.equal(f.references.length,2);close(f.references[0].line.x1,f.observations[3].x);close(f.references[1].line.y1,f.observations[3].y);
  const hidden=planChart(polygon,{...options,hiddenSeriesIds:['region']});assert.equal(hidden.status,'empty');assert.equal(hidden.frame.legend[0].visible,false);assert.equal(hidden.frame.family,'polygon');
  const empty=planChart({...polygon,series:[]},options);assert.equal(empty.status,'empty');assert.equal(empty.frame.family,'polygon');assert.equal(empty.frame.observations.length,0);
  assert.equal(planChart({...polygon,series:Array.from({length:17},(_,i)=>({...polygon.series[0],id:'s'+i}))},options).status,'invalid');
});
check('all parts results own deeply frozen geometry without mutating user source',()=>{
  for(const spec of [variable,item,polygon]){const original=structuredClone(spec),snapshot=structuredClone(original),result=planChart(original,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(original,snapshot);assert.ok(!Object.isFrozen(original));if(original.data)original.data[0].value=999;else original.series[0].data[0].y=999;assert.notEqual(result.frame.observations[0].value,999);}
});

writeFileSync(new URL('../../work/reports/core-plan-parts-current.json',import.meta.url),JSON.stringify({status:'passed',checks,encoding:'Independent variablepie angle/radius; exact integer item circles with one original-category observation; strict ordered simple polygons with original source-vertex selection only.',referencePolicyNote:'Explicit-domain references remain projected when all range series are hidden; cross-family consistency decision is deferred.'},null,2)+'\n');
console.log(`PASS ${checks.length} parts Core contract checks`);
