import assert from 'node:assert/strict';
import {planChart} from '../../dist/plan.js';
import {planCartesianChart} from '../../dist/cartesian.js';
const spec={family:'line',title:'Large',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:Array.from({length:50000},(_,i)=>({id:'p'+i,x:i,y:Math.sin(i/10)}))}]};
assert.equal(planChart(spec,{width:640,height:360}).status,'invalid','Default resource guarantee preserved');
const options={width:640,height:360,capacity:{points:50000}},a=planCartesianChart(spec,options),b=planChart(spec,options);
assert.equal(a.status,'ok');assert.equal(a.frame.observations.length,50000);assert.deepEqual(a,b);
const column={family:'column',title:'Categories',axes:{x:{kind:'category',values:Array.from({length:1000},(_,i)=>({id:'c'+i,label:'Category '+i}))},y:{kind:'linear'}},series:[{id:'s',name:'S',data:Array.from({length:1000},(_,i)=>({id:'p'+i,x:'c'+i,y:i%19-8}))}]};
assert.equal(planChart(column,{width:900,height:380}).status,'invalid');
const c=planCartesianChart(column,{width:900,height:380,capacity:{categories:1000}});assert.equal(c.status,'ok');assert.equal(c.frame.observations.length,1000);
const mutable={...spec,series:[{id:'s',name:'Mutable',data:[{id:'p',x:0,y:3}]}]};
for(const planner of [planChart,planCartesianChart]){
  const frame=planner(mutable,{width:640,height:360});assert.equal(frame.status,'ok');
  mutable.series[0].data[0].y=7;
  assert.equal(frame.frame.observations[0].value,3,'Output retains owned values after consumer mutation');
  mutable.series[0].data[0].y=3;
  let reads=0;const hostile={...mutable};Object.defineProperty(hostile,'series',{enumerable:true,get(){reads++;return mutable.series;}});
  assert.equal(planner(hostile,{width:640,height:360}).status,'invalid');assert.equal(reads,0,'Accessor input rejected without executing it');
}
console.log('PASS explicit bounded large data and public Cartesian entry parity');
