import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';
const options={width:400,height:300},spec={family:'pareto',title:'Causes',data:[{id:'a',label:'A',value:10},{id:'b',label:'B',value:30},{id:'c',label:'C',value:30},{id:'zero',label:'Zero',value:0}]},checks=[];
function check(name,fn){fn();checks.push(name);}
check('stable descending order and real dual Y scales share category centers',()=>{
  const p=planChart(spec,options);assert.equal(p.status,'ok');
  const raw=p.frame.observations.filter(p=>p.id.seriesId==='values'),derived=p.frame.observations.filter(p=>p.id.seriesId==='cumulative');
  assert.deepEqual(raw.map(p=>p.id.pointId),['b','c','a','zero']);assert.deepEqual(raw.map(p=>p.value),[30,30,10,0]);
  assert.equal(derived.at(-1).value,100);assert.equal(derived[0].valueUnit,'%');
  assert.deepEqual(derived.map(p=>p.x),raw.map(p=>p.x));assert.equal(p.frame.secondaryGrid.at(-1).label,'100%');
  assert.notEqual(raw[0].y,derived[0].y);assert.equal(spec.data[0].id,'a');
});
check('windowed Pareto keeps full-source denominator and cumulative prefix',()=>{
  const p=planChart(spec,{...options,viewport:{axes:'x',value:{x:{firstId:'c',lastId:'a'}}}});assert.equal(p.status,'ok');
  const first=p.frame.observations.find(p=>p.id.seriesId==='cumulative');assert.ok(Math.abs(first.value-600/7)<1e-10);assert.equal(first.id.pointId,'c');
});
check('all-zero data has original navigable zeroes and no invented percentage',()=>{
  const p=planChart({...spec,data:spec.data.map(p=>({...p,value:0}))},options);assert.equal(p.status,'ok');assert.equal(p.frame.observations.length,4);assert.ok(p.frame.observations.every(p=>p.value===0&&p.valueUnit===undefined));
});
check('ratio accumulation remains finite when the raw sum would overflow',()=>{
  const p=planChart({...spec,data:Array.from({length:32},(_,i)=>({id:'p'+i,label:'P'+i,value:1e307}))},options);assert.equal(p.status,'ok');assert.equal(p.frame.observations.at(-1).value,100);assert.ok(p.frame.observations.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.value)));
});
check('visibility does not change the denominator; incomplete/negative/ambiguous data is rejected',()=>{
  const p=planChart(spec,{...options,hiddenSeriesIds:['values']});assert.equal(p.status,'ok');assert.equal(p.frame.observations[0].value,300/7);
  for(const value of [null,-1,Infinity,NaN])assert.equal(planChart({...spec,data:[{id:'a',label:'A',value}]},options).status,'invalid');
  assert.equal(planChart({...spec,data:[spec.data[0],spec.data[0]]},options).status,'invalid');
  assert.equal(planChart(spec,{...options,viewport:{axes:'y'}}).status,'invalid');
  assert.equal(planChart(spec,{...options,stacking:'sum'}).status,'invalid');
});
writeFileSync(new URL('../../work/reports/core-plan-pareto-current.json',import.meta.url),JSON.stringify({status:'passed',checks},null,2)+'\n');console.log(`PASS ${checks.length} Pareto calculation checks`);
