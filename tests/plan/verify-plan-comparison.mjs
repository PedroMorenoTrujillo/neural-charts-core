import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const categories=['a','b','c'].map(id=>({id,label:id.toUpperCase()}));
const source={family:'lollipop',title:'Observed changes',axes:{x:{kind:'category',values:categories},y:{kind:'linear',domain:[-5,10],nice:false}},series:[{id:'changes',name:'Changes',data:[{id:'positive',x:'a',y:5},{id:'negative',x:'b',y:-3},{id:'zero',x:'c',y:0}]}]};
const dumbbell={family:'dumbbell',title:'Observed endpoints',axes:source.axes,series:[{id:'intervals',name:'Intervals',data:[{id:'range',x:'a',low:1,high:7},{id:'gap',x:'b',low:null,high:null},{id:'equal',x:'c',low:3,high:3}]}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec=source,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function y(value){return 286-(value+5)/15*272;}
function paths(commands){const result=[];for(const c of commands){if(c.kind==='M')result.push([]);result.at(-1).push(c);}return result;}
function inside(vertices,x,y){let found=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i],b=vertices[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)found=!found;}return found;}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('lollipop has true zero stems and real endpoint circles while scalar observations retain original Y',()=>{
  const f=frame(),s=f.series[0];assert.equal(f.family,'lollipop');assert.equal(s.bars,undefined);assert.equal(s.circles.length,3);assert.equal(s.commands.length,4);
  assert.deepEqual(f.observations.map(o=>o.value),[5,-3,0]);assert.deepEqual(f.observations.map(o=>o.id.pointId),['positive','negative','zero']);assert.ok(f.observations.every(o=>!Object.hasOwn(o,'lowValue')&&!Object.hasOwn(o,'highValue')));
  const stems=paths(s.commands);for(const [i,stem]of stems.entries()){close(stem[0].y,y(0));close(stem[1].y,y(source.series[0].data[i].y));assert.equal(stem[0].x,stem[1].x);assert.deepEqual(f.observations[i].stem,{x:stem[0].x,startY:stem[0].y,endY:stem[1].y});}
  for(const [i,circle]of s.circles.entries()){assert.equal(circle.pointId,source.series[0].data[i].id);close(circle.cy,y(source.series[0].data[i].y));close(circle.cx,f.observations[i].x);assert.equal(circle.radius,4);}
});
check('zero lollipop remains a painted semantic point with a bounded selectable glyph',()=>{
  const f=frame(),o=f.observations[2],circle=f.series[0].circles[2];assert.equal(o.value,0);assert.equal(circle.pointId,'zero');assert.equal(o.stem,undefined);assert.equal(o.hit.kind,'polygon');assert.ok(inside(o.hit.vertices,o.x,o.y));assert.ok(o.hit.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));
});
check('dumbbell draws the original connector and both endpoint circles with one source observation',()=>{
  const f=frame(dumbbell),s=f.series[0];assert.equal(f.family,'dumbbell');assert.equal(f.observations.length,2);assert.equal(s.bars,undefined);assert.equal(s.areaCommands,undefined);assert.equal(s.commands.length,2);assert.equal(s.circles.length,3);
  const o=f.observations[0],ends=s.circles.filter(c=>c.pointId==='range');assert.equal(ends.length,2);close(ends[0].cy,y(1));close(ends[1].cy,y(7));assert.deepEqual(o.stem,{x:s.commands[0].x,startY:s.commands[0].y,endY:s.commands[1].y});assert.equal(o.lowValue,1);assert.equal(o.highValue,7);assert.equal(o.value,4);assert.deepEqual(o.id,{seriesId:'intervals',pointId:'range'});
  assert.equal(s.circles.filter(c=>c.pointId==='equal').length,1);assert.equal(f.observations[1].lowValue,3);assert.equal(f.observations[1].highValue,3);assert.ok(!f.observations.some(o=>o.id.pointId==='gap'));
});
check('signed column pyramids are actual filled triangles with exact matching polygon hits',()=>{
  const f=frame({...source,family:'columnpyramid'}),s=f.series[0],triangles=paths(s.commands);assert.equal(f.family,'columnpyramid');assert.equal(s.fill,true);assert.equal(s.bars,undefined);assert.equal(s.circles,undefined);assert.equal(triangles.length,2);
  for(const [i,path]of triangles.entries()){
    assert.equal(path.length,4);assert.equal(path.at(-1).kind,'Z');const o=f.observations[i],vertices=path.slice(0,-1).map(({x,y})=>({x,y}));assert.deepEqual(o.hit.vertices,vertices);assert.equal(o.hit.kind,'polygon');assert.equal(vertices.length,3);close(vertices[0].y,y(0));close(vertices[1].y,y(0));close(vertices[2].y,y(o.value));
    const left=Math.min(...vertices.map(v=>v.x)),right=Math.max(...vertices.map(v=>v.x)),nearApexY=vertices[2].y+(vertices[0].y-vertices[2].y)*.05;assert.equal(inside(vertices,left+(right-left)*.05,nearApexY),false,'triangle bounding-box corner is not a target');
  }
  assert.equal(f.observations[2].value,0);assert.equal(f.observations[2].hit,undefined);
});
check('viewport clips triangles by their real edges and never fabricates endpoint markers',()=>{
  const opts={...options,viewport:{axes:'y',value:{y:[-1,2]}}},triangles=frame({...source,family:'columnpyramid'},opts);
  for(const o of triangles.observations)if(o.hit){assert.ok(o.hit.vertices.length>=3&&o.hit.vertices.length<=6);assert.ok(o.hit.vertices.every(v=>v.x>=16&&v.x<=304&&v.y>=14&&v.y<=286));}
  assert.deepEqual(triangles.observations.map(o=>o.value),[5,-3,0]);const lollipop=frame(source,opts);assert.deepEqual(lollipop.series[0].circles.map(c=>c.pointId),['zero']);assert.equal(lollipop.series[0].commands.length,4);
  const numeric={...source,family:'columnpyramid',axes:{...source.axes,x:{kind:'linear',domain:[0,1]}},series:[{...source.series[0],data:[{id:'edge',x:0,y:5},{id:'other',x:1,y:-3}]}]},edge=frame(numeric);assert.equal(edge.observations.length,2);assert.ok(edge.observations.every(o=>o.hit.vertices.every(v=>v.x>=16&&v.x<=304)));
});
check('marker radius is finite bounded geometry and belongs only to endpoint-marker families',()=>{
  for(const spec of [source,dumbbell])assert.ok(frame({...spec,markerRadius:6}).series[0].circles.every(c=>c.radius===6));
  for(const markerRadius of [0,17,Infinity,null,'4'])assert.equal(planChart({...source,markerRadius},options).status,'invalid');assert.equal(planChart({...source,family:'columnpyramid',markerRadius:4},options).status,'invalid');
});
check('automatic grouped numeric/time frames retain all source IDs and stable global zoom bounds',()=>{
  for(const kind of ['linear','time'])for(const family of ['lollipop','dumbbell','columnpyramid']){
    const start=kind==='time'?Date.UTC(2026,0,1):0,step=kind==='time'?86400000:1,series=['one','two'].map(id=>({id,name:id,data:[0,1].map(i=>({id:'p'+i,x:start+i*step,...(family==='dumbbell'?{low:1,high:7}:{y:i?-3:5})}))})),spec={family,title:'Grouped comparison',axes:{x:{kind},y:source.axes.y},series};
    const f=frame(spec,{...options,viewport:{axes:'x'}});assert.deepEqual(f.observations.map(o=>[o.id.seriesId,o.id.pointId]),[['one','p0'],['one','p1'],['two','p0'],['two','p1']]);assert.deepEqual(f.viewport.bounds.x.domain,[start-step/2,start+step*1.5]);
    const window=[start-step/4,start+step*1.25],zoom=frame(spec,{...options,viewport:{axes:'x',value:{x:window}}});assert.deepEqual(zoom.viewport.bounds.x.domain,f.viewport.bounds.x.domain);assert.deepEqual(zoom.viewport.displayed.x,window);assert.equal(zoom.observations.length,4);
  }
});
check('hiding groups reflows geometry while preserving colors, legend and complete restore',()=>{
  const spec={...source,series:[...source.series,{...source.series[0],id:'other',name:'Other'}]},before=frame(spec),hidden=frame(spec,{...options,hiddenSeriesIds:['changes']});assert.equal(hidden.series.length,1);assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[0].visible,false);assert.equal(hidden.series[0].color,before.series[1].color);assert.ok(hidden.observations.every(o=>o.id.seriesId==='other'));assert.deepEqual(frame(spec),before);
  const all=planChart(spec,{...options,hiddenSeriesIds:['changes','other']});assert.equal(all.status,'empty');assert.equal(all.frame.family,'lollipop');
});
check('zero-baseline families reject incompatible domains while dumbbell retains true endpoint-only scales',()=>{
  for(const family of ['lollipop','columnpyramid'])for(const y of [{kind:'linear',includeZero:false},{kind:'linear',domain:[1,10]}])assert.equal(planChart({...source,family,axes:{...source.axes,y}},options).status,'invalid');
  const valid=frame({...dumbbell,axes:{...dumbbell.axes,y:{kind:'linear',domain:[1,10],includeZero:false,nice:false}}});assert.equal(valid.observations[0].lowValue,1);assert.equal(valid.observations[0].highValue,7);
});
check('references and reversed axes use the shared scalar/comparison frame',()=>{
  const f=frame(source,{...options,references:[{id:'zero',axis:'y',value:0},{id:'a',axis:'x',value:'a'}]});assert.equal(f.references.length,2);close(f.references[0].line.y1,f.series[0].commands[0].y);close(f.references[1].line.x1,f.observations[0].group.coordinate);
  assert.equal(planChart(source,{...options,references:[{id:'bad',axis:'x',value:'missing'}]}).status,'invalid');const reversed=frame({...source,axes:{...source.axes,y:{...source.axes.y,reversed:true}}});close(reversed.observations[0].y,300-frame().observations[0].y);assert.equal(reversed.observations[0].value,5);
});
check('finite extreme scalar/endpoints retain safe raw semantics and immutable geometry',()=>{
  const spec={...source,axes:{...source.axes,y:{kind:'linear',domain:[-8e307,8e307],nice:false}},series:[{...source.series[0],data:[{id:'huge',x:'a',y:8e307}]}]};for(const family of ['lollipop','columnpyramid']){const f=frame({...spec,family});assert.equal(f.observations[0].value,8e307);assert.ok(Number.isFinite(f.observations[0].y));}
  const original=structuredClone(source),snapshot=structuredClone(original),result=planChart(original,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(original,snapshot);assert.ok(!Object.isFrozen(original));original.series[0].data[0].y=999;assert.equal(result.frame.observations[0].value,5);
});
check('actual visible endpoint primitives enforce the ten-thousand limit without silently dropping source records',()=>{
  const spec={...dumbbell,axes:{...dumbbell.axes,x:{kind:'linear'}},series:['one','two'].map(id=>({id,name:id,data:Array.from({length:5000},(_,i)=>({id:'p'+i,x:i,low:1,high:7}))}))};
  const tooMany=planChart(spec,options);assert.equal(tooMany.status,'invalid');assert.equal(tooMany.diagnostic.reason,'RESOURCE_LIMIT');
  const hidden=frame(spec,{...options,hiddenSeriesIds:['two']});assert.equal(hidden.observations.length,5000);assert.equal(hidden.series[0].circles.length,10000);assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[1].visible,false);
});
check('gaps, bounds, source identity and unsupported fields are validated explicitly',()=>{
  const gap=planChart({...source,series:[{...source.series[0],data:[{id:'gap',x:'a',y:null}]}]},options);assert.equal(gap.status,'empty');assert.equal(gap.frame.family,'lollipop');
  const malformed=[{...source,curve:'straight'},{...source,series:[{...source.series[0],curve:'straight'}]},{...source,series:[{...source.series[0],data:[{id:'bad',x:'a',y:Infinity}]}]},{...source,series:[{...source.series[0],data:[source.series[0].data[0],source.series[0].data[0]]}]},{...dumbbell,series:[{...dumbbell.series[0],data:[{id:'partial',x:'a',low:null,high:7}]}]},{...dumbbell,series:[{...dumbbell.series[0],data:[{id:'inverted',x:'a',low:7,high:1}]}]}];for(const spec of malformed)assert.equal(planChart(spec,options).status,'invalid');
  for(const patch of [{stacking:'sum'},{hiddenSeriesIds:['missing']}])assert.equal(planChart(source,{...options,...patch}).status,'invalid');
  const dense={...source,axes:{...source.axes,x:{kind:'linear'}},series:[{...source.series[0],data:Array.from({length:10001},(_,i)=>({id:'p'+i,x:i,y:1}))}]};assert.equal(planChart(dense,options).status,'invalid');
});

writeFileSync(new URL('../../work/reports/core-plan-comparison-current.json',import.meta.url),JSON.stringify({status:'passed',checks,encoding:'True zero stems/endpoints, ordered endpoint connectors, and signed triangles. Scalar raw Y is preserved; triangle hits match clipped drawing polygons exactly.'},null,2)+'\n');
console.log(`PASS ${checks.length} comparison Core contract checks`);
