import assert from 'node:assert/strict';
import {planChart,transformPlanViewport} from '../../dist/plan.js';
import {logDistance,logTicks,logValue} from '../../dist/plan/log-scale.js';
const options={width:400,height:300,scales:{y:{kind:'log'}},viewport:{axes:'xy'}};
const line={family:'line',title:'Original units',axes:{x:{kind:'linear',domain:[0,2]},y:{kind:'linear',domain:[1,100]}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:1},{id:'b',x:1,y:10},{id:'c',x:2,y:100}]}]};
let checks=0;
const frame=(spec=line,settings=options)=>{const result=planChart(spec,settings);assert.notEqual(result.status,'invalid',JSON.stringify(result));checks++;return result.frame;};
const first=frame();assert.deepEqual(first.observations.map(p=>p.value),[1,10,100]);
assert.ok(Math.abs((first.observations[0].y-first.observations[1].y)-(first.observations[1].y-first.observations[2].y))<1e-9);checks++;
assert.deepEqual(first.viewport.bounds.y,{kind:'log',base:10,domain:[1,100]});
const zoom=transformPlanViewport(first.viewport,{kind:'zoom',factor:2,anchor:{x:.5,y:.5}});assert.equal(zoom.status,'ok');assert.ok(Math.abs(zoom.value.y[0]-Math.sqrt(10))<1e-12);assert.ok(Math.abs(zoom.value.y[1]-10*Math.sqrt(10))<1e-11);checks++;
const zoomed=frame(line,{...options,viewport:{axes:'xy',value:zoom.value}});assert.deepEqual(zoomed.observations.map(p=>p.id.pointId),['b']);
const reset=transformPlanViewport(zoomed.viewport,{kind:'reset'});assert.deepEqual(reset,{status:'ok',value:{}});checks++;
const anchorZoom=transformPlanViewport(first.viewport,{kind:'zoom',factor:2,anchor:{x:0,y:0}});assert.equal(anchorZoom.status,'ok');assert.equal(anchorZoom.value.y[0],1);assert.ok(Math.abs(anchorZoom.value.y[1]-10)<1e-12);checks++;
const pan=transformPlanViewport(zoomed.viewport,{kind:'pan',delta:{y:.25}});assert.equal(pan.status,'ok');assert.ok(Math.abs(pan.value.y[1]/pan.value.y[0]-10)<1e-10);checks++;
const reversed=frame({...line,axes:{...line.axes,y:{...line.axes.y,reversed:true}}});assert.ok(reversed.observations[0].y<reversed.observations[2].y);
for(const value of [0,-1]){const bad={...line,series:[...line.series,{id:'hidden',name:'Hidden',data:[{id:'bad',x:1,y:value}]}]};const result=planChart(bad,{...options,hiddenSeriesIds:['hidden']});assert.equal(result.status,'invalid');assert.equal(result.diagnostic.reason,'NONPOSITIVE_LOG_VALUE');checks++;}
const missing=frame({...line,series:[{...line.series[0],data:[{id:'a',x:0,y:1},{id:'gap',x:1,y:null},{id:'c',x:2,y:100}]}]});assert.equal(missing.series[0].commands.length,0);assert.equal(missing.observations.length,2);checks++;
const connected=frame({...line,series:[{...line.series[0],gaps:'connect',data:[{id:'a',x:0,y:1},{id:'gap',x:1,y:null},{id:'c',x:2,y:100}]}]});assert.equal(connected.series[0].commands.length,2);checks++;
// Intersections are geometric: y=10 at x=.5, never raw-linear y=50.5.
const crossing=frame({...line,axes:{...line.axes,x:{kind:'linear',domain:[0,1]}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:1},{id:'b',x:1,y:100}]}]},{...options,viewport:{axes:'x',value:{x:[.5,1]}}});
assert.equal(crossing.series[0].commands[0].x,16);assert.ok(Math.abs(crossing.series[0].commands[0].y-150)<1e-9);assert.deepEqual(crossing.observations.map(p=>p.id.pointId),['b']);checks++;
const decorated=frame(line,{...options,references:[{id:'mean',axis:'y',value:10}],referenceBands:[{id:'range',axis:'y',from:1,to:10}]});assert.equal(decorated.references[0].status,'visible');assert.ok(Math.abs(decorated.referenceBands[0].box.height-136)<1e-9);checks++;
for(const extra of [{references:[{id:'zero',axis:'y',value:0}]},{referenceBands:[{id:'bad',axis:'y',from:0,to:10}]}])assert.equal(planChart(line,{...options,...extra}).status,'invalid');checks+=2;
assert.equal(planChart({...line,axes:{...line.axes,y:{...line.axes.y,includeZero:true}}},options).status,'invalid');checks++;
for(const value of [Number.MIN_VALUE,1,1e308,Number.MAX_VALUE]){const constant=frame({...line,axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:1,y:value}]}]});assert.equal(constant.observations[0].value,value);assert.ok(constant.grid.every(p=>Number.isFinite(p.y)));}
const extremes=frame({...line,axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'min',x:0,y:Number.MIN_VALUE},{id:'max',x:1,y:Number.MAX_VALUE}]}]});assert.equal(extremes.observations.length,2);
const adjacent=frame({...line,axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:1e308},{id:'b',x:1,y:1.0000000000000002e308}]}]});assert.ok(adjacent.observations[0].y>adjacent.observations[1].y);
for(const domain of [[1,100],[Number.MIN_VALUE,Number.MAX_VALUE],[1e308,1.0000000000000002e308]]){const ticks=logTicks(domain,5);assert.ok(ticks.length>=2&&ticks.length<=7);assert.ok(ticks.every((v,i)=>Number.isFinite(v)&&v>0&&(i===0||v>ticks[i-1])));checks++;}
const scatter={family:'scatter',title:'XY',axes:{x:{kind:'linear',domain:[1,100],reversed:true},y:{kind:'linear',domain:[1,100]}},series:[{id:'s',name:'Samples',data:[{id:'a',x:1,y:1},{id:'b',x:10,y:10},{id:'c',x:100,y:100}]}]};
const scattered=frame(scatter,{...options,scales:{x:{kind:'log',base:10},y:{kind:'log'}}});assert.deepEqual(scattered.observations.map(p=>p.xValue),[1,10,100]);assert.ok(scattered.observations[0].x>scattered.observations[2].x);
const bubble=frame({...scatter,family:'bubble',series:scatter.series.map(s=>({...s,data:s.data.map((p,i)=>({...p,z:i*4,label:p.id}))}))},{...options,scales:{x:{kind:'log'},y:{kind:'log'}}});assert.deepEqual(bubble.observations.map(p=>p.sizeValue),[0,4,8]);assert.equal(bubble.series[0].circles[0].radius,0);assert.ok(bubble.series[0].circles[1].radius<bubble.series[0].circles[2].radius);
const category=frame({...line,axes:{x:{kind:'category',values:[{id:'a'},{id:'b'},{id:'c'}]},y:line.axes.y},series:[{id:'s',name:'Series',data:[{id:'a',x:'a',y:1},{id:'b',x:'b',y:10},{id:'c',x:'c',y:100}]}]});assert.equal(category.labels.length,3);assert.equal(category.viewport.bounds.x.kind,'category');
for(const family of ['area','spline','column','mixed'])assert.equal(planChart({...line,family},options).status,'invalid');checks+=4;
for(const bad of [{},{y:{kind:'log',base:2}},{z:{kind:'log'}},{x:{kind:'linear'}}])assert.equal(planChart(line,{...options,scales:bad}).status,'invalid');checks+=4;
assert.ok(logDistance(1e308,1.0000000000000002e308)>0);assert.equal(logValue(10,0),10);checks+=2;
const croppedExtreme=frame({...line,axes:{x:{kind:'linear',domain:[0,1]},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'min',x:0,y:Number.MIN_VALUE},{id:'max',x:1,y:Number.MAX_VALUE}]}]},{...options,viewport:{axes:'y',value:{y:[1,10]}}});
assert.ok(croppedExtreme.series[0].commands.every(c=>c.x>=16&&c.x<=384&&c.y>=14&&c.y<=286));assert.equal(croppedExtreme.observations.length,0);checks++;
for(const curve of ['straight','step-before','step-after','step-mid']){const stepped=frame({...line,series:[{...line.series[0],curve}]});assert.ok(stepped.series[0].commands.length<=7);assert.equal(stepped.observations.length,3);}
const malformed={...first.viewport,bounds:{...first.viewport.bounds,y:{kind:'log',base:2,domain:[1,100]}}};assert.equal(transformPlanViewport(malformed,{kind:'zoom',factor:2}).status,'invalid');checks++;
const fullHuge={...line,axes:{x:{kind:'linear',domain:[0,1]},y:{kind:'linear',domain:[Number.MIN_VALUE,Number.MAX_VALUE]}},series:[{id:'s',name:'Series',data:[{id:'a',x:0,y:1e308},{id:'b',x:1,y:1.0000000000000002e308}]}]};
const tiny=frame(fullHuge,{...options,viewport:{axes:'y',value:{y:[1e308,1.0000000000000002e308]}}});assert.equal(tiny.observations.length,2);assert.ok(tiny.observations[0].y>tiny.observations[1].y);checks++;
assert.deepEqual(transformPlanViewport(tiny.viewport,{kind:'zoom',factor:1}),{status:'ok',value:{y:[1e308,1.0000000000000002e308]}});checks++;
const knownXGap={...line,axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:1,y:1},{id:'b',x:10,y:2},{id:'missing',x:1000,y:null}]}]};
const knownX=frame(knownXGap,{...options,scales:{x:{kind:'log'}}});assert.deepEqual(knownX.viewport.bounds.x.domain,[1,1000]);assert.equal(knownX.labels.at(-1).label,'1000');checks++;
const exactEdge=frame({...line,axes:{x:line.axes.x,y:{kind:'linear',domain:[.1,100]}},series:[{id:'s',name:'Series',data:[{id:'edge',x:1,y:3}]}]},{...options,viewport:{axes:'y',value:{y:[1,3]}},references:[{id:'edge',axis:'y',value:3}]});assert.equal(exactEdge.references[0].status,'visible');assert.deepEqual(exactEdge.viewport.displayed.y,[1,3]);assert.deepEqual(transformPlanViewport(exactEdge.viewport,{kind:'zoom',factor:1}),{status:'ok',value:{y:[1,3]}});checks++;
const outside=planChart({...fullHuge,axes:{...fullHuge.axes,y:{kind:'linear',domain:[Number.MIN_VALUE,1e308]}}},{...options,viewport:{axes:'y',value:{y:[Number.MIN_VALUE,1.0000000000000002e308]}}});assert.equal(outside.status,'invalid');assert.equal(outside.diagnostic.reason,'LOG_WINDOW_OUTSIDE_DOMAIN');checks++;
for(const value of [{y:[1,10]},{}]){
 const stale={...exactEdge.viewport,value};
 const result=transformPlanViewport(stale,{kind:'zoom',factor:1});
 assert.equal(result.status,'invalid');assert.equal(result.diagnostic.message,'INCONSISTENT_LOG_VIEWPORT');checks++;
}
console.log(`Logarithmic planning: ${checks} checks passed; original values, multiplicative viewport and clipped geometry retained.`);
