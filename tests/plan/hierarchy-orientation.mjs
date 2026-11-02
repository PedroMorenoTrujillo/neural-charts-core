import assert from 'node:assert/strict';
import {planChart,transformPlanViewport} from '../../dist/plan.js';
let checks=0;
for(const family of ['treegraph','organization']){
 const spec={family,title:'Original relationships',nodes:[{id:'root',label:'Root'},{id:'left',label:'Left'},{id:'right',label:'Right'}],links:[{id:'a',from:'root',to:'left'},{id:'b',from:'root',to:'right'}]};
 const source=JSON.stringify(spec),settings={width:600,height:400};
 const baseline=planChart(spec,settings),vertical=planChart(spec,{...settings,hierarchy:{orientation:'vertical'}}),horizontal=planChart(spec,{...settings,hierarchy:{orientation:'horizontal'}});
 assert.notEqual(baseline.status,'invalid');assert.notEqual(vertical.status,'invalid');assert.notEqual(horizontal.status,'invalid',JSON.stringify(horizontal));
 assert.deepEqual(vertical,baseline);checks++;
 const a=horizontal.frame.observations.find(p=>p.id.pointId==='root'),b=horizontal.frame.observations.find(p=>p.id.pointId==='left');assert.ok(a.x<b.x);checks++;
 const av=vertical.frame.observations.find(p=>p.id.pointId==='root'),bv=vertical.frame.observations.find(p=>p.id.pointId==='left');assert.ok(av.y<bv.y);checks++;
 assert.deepEqual(horizontal.frame.observations.map(p=>p.id),vertical.frame.observations.map(p=>p.id));assert.deepEqual(horizontal.frame.observations.map(p=>p.node),vertical.frame.observations.map(p=>p.node));checks++;
 const zoom=transformPlanViewport(horizontal.frame.viewport,{kind:'zoom',factor:2});assert.equal(zoom.status,'ok');
 const zoomed=planChart(spec,{...settings,hierarchy:{orientation:'horizontal'},viewport:{axes:'xy',value:zoom.value}});assert.notEqual(zoomed.status,'invalid',JSON.stringify(zoomed));checks++;
 const reset=transformPlanViewport(zoomed.frame.viewport,{kind:'reset'});assert.equal(reset.status,'ok');assert.deepEqual(reset.value,{});checks++;
 assert.equal(JSON.stringify(spec),source);checks++;
 assert.equal(planChart(spec,{...settings,hierarchy:{orientation:'diagonal'}}).status,'invalid');checks++;
 assert.equal(planChart({...spec,family:'networkgraph'},{...settings,hierarchy:{orientation:'horizontal'}}).status,'invalid');checks++;
}
console.log(`Hierarchy orientation: ${checks} checks passed; original topology, identities and physical XY viewport retained.`);
