import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const categories=['a','b','c','d'].map(id=>({id,label:id.toUpperCase()}));
const radar={family:'radar',title:'Capabilities',axes:{x:{type:'category',values:categories},y:{type:'linear',domain:[0,10]}},series:[{id:'one',name:'One',data:[2,4,6,8].map((y,i)=>({id:'p'+i,x:categories[i].id,y}))}]};
const options={width:320,height:320};
const tests=[];
function check(name,run){run();tests.push(name);}
check('radar is projected on radial axes with original values and closed polygon',()=>{
  const p=planChart(radar,options);assert.equal(p.status,'ok');
  const f=p.frame,g=f.polarGrid;assert.equal(g.spokes.length,4);assert.equal(f.series[0].commands.at(-1).type,'Z');
  assert.equal(f.observations[0].x,g.cx);assert.ok(f.observations[0].y<g.cy);
  assert.ok(f.observations[1].x>g.cx);assert.equal(f.observations[1].y,g.cy);
  assert.deepEqual(f.observations.map(p=>p.value),[2,4,6,8]);assert.ok(Object.isFrozen(g.spokes));
});
check('radar gaps break the polygon and never fill across missing categories',()=>{
  const data=structuredClone(radar);data.series[0].data[1].y=null;
  const p=planChart(data,options);assert.equal(p.status,'ok');assert.equal(p.frame.observations.length,3);
  assert.equal(p.frame.series[0].areaCommands,undefined);assert.ok(p.frame.series[0].commands.every(c=>c.type!=='Z'));
});
const polar={family:'polar',title:'Distribution',data:[1,4,0,null].map((value,i)=>({id:categories[i].id,label:categories[i].label,value})),domain:[0,4]};
check('polar sectors have equal angles and independent radii; zero is semantic and null absent',()=>{
  const p=planChart(polar,options);assert.equal(p.status,'ok');
  const [a,b,z]=p.frame.observations;assert.equal(b.hit.radius/a.hit.radius,4);
  assert.equal(a.hit.end-a.hit.start,b.hit.end-b.hit.start);assert.equal(z.value,0);assert.equal(z.hit,undefined);
  assert.deepEqual(p.frame.observations.map(o=>o.id.pointId),['a','b','c']);
  const area=planChart({...polar,radiusScale:'area'},options);assert.equal(area.frame.observations[1].hit.radius/area.frame.observations[0].hit.radius,2);
});
check('visibility preserves identity; unsupported axes and malformed inputs fail explicitly',()=>{
  assert.equal(planChart(radar,{...options,hiddenSeriesIds:['one']}).status,'empty');
  for(const bad of [{...radar,axes:{...radar.axes,y:{type:'linear',domain:[1,10]}}},{...radar,series:[{...radar.series[0],data:[{id:'p',x:'a',y:-1}]}]},{...polar,radiusScale:'unknown'},{...polar,domain:[0,Infinity]}])assert.equal(planChart(bad,options).status,'invalid');
  for(const opts of [{viewport:{axes:'x'}},{stacking:'sum'},{references:[{id:'r',axis:'y',value:1}]}])assert.equal(planChart(radar,{...options,...opts}).status,'invalid');
});
check('one polar category uses two explicit semicircles for native full-circle compatibility',()=>{
  const p=planChart({...polar,data:[{id:'only',label:'Only',value:4}]},options);assert.equal(p.status,'ok');
  const commands=p.frame.series[0].commands,arcs=commands.filter(c=>c.type==='A');
  assert.equal(arcs.length,2);assert.notEqual(arcs[0].y,arcs[1].y);
  assert.equal(p.frame.observations[0].hit.end-p.frame.observations[0].hit.start,Math.PI*2);
});
writeFileSync(new URL('../../work/reports/core-plan-polar-current.json',import.meta.url),JSON.stringify({status:'passed',checks:tests},null,2)+'\n');
console.log(`PASS ${tests.length} radial Core contract checks`);
