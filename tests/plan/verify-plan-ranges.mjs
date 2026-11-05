import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const categories=['a','b','c'].map(id=>({id,label:id.toUpperCase()}));
const source={family:'arearange',title:'Temperature envelope',axes:{x:{type:'category',values:categories},y:{type:'linear',domain:[0,20],nice:false,title:'°C'}},series:[{id:'temperature',name:'Temperature',data:[{id:'first',x:'a',low:2,high:6},{id:'second',x:'b',low:4,high:12},{id:'third',x:'c',low:3,high:9}]}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec=source,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}
function splitPaths(commands){const paths=[];for(const c of commands){if(c.type==='M')paths.push([]);paths.at(-1).push(c);}return paths;}

check('arearange closes between original lower and upper bounds rather than a zero baseline',()=>{
  const f=frame(),s=f.series[0];assert.equal(Object.hasOwn(source,'description'),false);assert.equal(f.description,'');assert.equal(frame({...source,description:'Original intervals'}).description,'Original intervals');assert.equal(f.family,'arearange');assert.equal(f.unit,'°C');assert.equal(s.areaCommands.at(-1).type,'Z');assert.equal(s.areaCommands.length,7);
  const [upper,lower]=splitPaths(s.commands);assert.equal(upper.length,3);assert.equal(lower.length,3);
  for(let i=0;i<3;i++){const o=f.observations[i],p=source.series[0].data[i];assert.deepEqual(o.id,{seriesId:'temperature',pointId:p.id});assert.equal(o.lowValue,p.low);assert.equal(o.highValue,p.high);assert.equal(o.value,p.low/2+p.high/2);close(o.y,upper[i].y/2+lower[i].y/2);assert.equal(o.x,upper[i].x);assert.equal(o.hit,undefined);}
  close(upper[0].y,286-6/20*272);close(lower[0].y,286-2/20*272);
  assert.ok(s.areaCommands.filter(c=>c.type!=='Z').every(c=>c.y<286),'no invented zero baseline');assert.deepEqual(f.observations.map(o=>o.label),['A','B','C']);
});
check('paired nulls are real gaps and neither boundary nor fill bridges them',()=>{
  const values=Array.from({length:5},(_,i)=>({id:'p'+i,x:i,low:i===2?null:i+1,high:i===2?null:i+5}));
  for(const family of ['arearange','areasplinerange']){
    const f=frame({...source,family,axes:{...source.axes,x:{type:'linear'}},series:[{...source.series[0],data:values}]});
    assert.deepEqual(f.observations.map(o=>o.id.pointId),['p0','p1','p3','p4']);assert.equal(f.series[0].areaCommands.filter(c=>c.type==='Z').length,2);assert.equal(f.series[0].commands.filter(c=>c.type==='M').length,4);
  }
  const singleton=frame({...source,series:[{...source.series[0],data:[source.series[0].data[0],{id:'gap',x:'b',low:null,high:null},source.series[0].data[2]]}]});
  assert.equal(singleton.series[0].areaCommands.length,0);assert.equal(singleton.series[0].commands.length,4);assert.equal(singleton.observations.length,2);
});
check('areasplinerange is genuinely smooth with paired noncrossing samples and original-only observations',()=>{
  const points=[{id:'p0',x:0,low:1,high:2},{id:'p1',x:1,low:9.9,high:10},{id:'p2',x:2,low:1,high:12},{id:'p3',x:3,low:10.9,high:11}];
  const spec={...source,axes:{...source.axes,x:{type:'linear'}},series:[{...source.series[0],data:points}]},straight=frame(spec),smooth=frame({...spec,family:'areasplinerange'}),s=smooth.series[0];
  assert.ok(s.commands.length>straight.series[0].commands.length);assert.equal(s.areaCommands.at(-1).type,'Z');assert.deepEqual(smooth.observations.map(o=>o.id.pointId),points.map(p=>p.id));
  const [upper,lower]=splitPaths(s.commands);assert.equal(upper.length,lower.length);
  for(let i=0;i<upper.length;i++){close(upper[i].x,lower[i].x);assert.ok(upper[i].y<=lower[i].y+1e-10);assert.ok(Number.isFinite(upper[i].y)&&Number.isFinite(lower[i].y));}
  const a=upper[0],b=upper.find(p=>p.x>16&&p.x<112);assert.ok(b);const sourceEndX=smooth.observations[1].x,sourceEndY=286-10/20*272,chord=a.y+(sourceEndY-a.y)*(b.x-a.x)/(sourceEndX-a.x);assert.ok(Math.abs(b.y-chord)>1e-4,'a smooth boundary differs from its straight chord');
});
check('columnrange draws the actual low-to-high grouped interval with exact source-identified rectangles',()=>{
  const second={id:'other',name:'Other',data:source.series[0].data.map(p=>({...p,low:p.low+1,high:p.high+1}))},f=frame({...source,family:'columnrange',series:[...source.series,second]});
  assert.equal(f.series.length,2);assert.equal(f.series[0].bars.length,3);
  const bar=f.series[0].bars[0],o=f.observations[0];assert.equal(bar.pointId,'first');close(bar.y,286-6/20*272);close(bar.height,4/20*272);assert.equal(o.hit.type,'polygon');
  assert.deepEqual(o.hit.vertices,[{x:bar.x,y:bar.y},{x:bar.x+bar.width,y:bar.y},{x:bar.x+bar.width,y:bar.y+bar.height},{x:bar.x,y:bar.y+bar.height}]);close(o.x,bar.x+bar.width/2);close(o.y,bar.y+bar.height/2);
  assert.ok(bar.x+bar.width<f.series[1].bars[0].x,'grouped intervals do not overlap');assert.equal(o.lowValue,2);assert.equal(o.highValue,6);assert.equal(typeof o.group.coordinate,'number');assert.equal(o.group.coordinate,f.observations[3].group.coordinate);
  const capped=frame({...source,family:'columnrange',maxBarWidth:8});assert.ok(capped.series[0].bars.every(b=>b.width<=8));
});
check('zero-length intervals stay semantic, draw no artificial area and keep exact endpoints',()=>{
  for(const family of ['arearange','areasplinerange','columnrange']){
    const f=frame({...source,family,series:[{...source.series[0],data:[{id:'equal',x:'a',low:5,high:5}]}]}),o=f.observations[0];assert.equal(o.lowValue,5);assert.equal(o.highValue,5);assert.equal(o.value,5);assert.equal(o.hit,undefined);
    if(family==='columnrange'){assert.equal(f.series[0].bars.length,0);assert.equal(f.series[0].commands.length,2);assert.equal(f.series[0].commands[0].y,f.series[0].commands[1].y);}else assert.equal(f.series[0].areaCommands.length,0);
  }
});
check('linear and time X retain original coordinates and proportional nonuniform spacing',()=>{
  for(const type of ['linear','time']){
    const start=type==='time'?Date.UTC(2026,0,1):0,step=type==='time'?86400000:1,data=source.series[0].data.map((p,i)=>({...p,x:start+[0,1,4][i]*step}));
    for(const family of ['arearange','areasplinerange','columnrange']){
      const f=frame({...source,family,axes:{...source.axes,x:{type}},series:[{...source.series[0],data}]});assert.deepEqual(f.observations.map(o=>o.xValue),data.map(p=>p.x));
      if(family!=='columnrange')close((f.observations[2].x-f.observations[1].x)/(f.observations[1].x-f.observations[0].x),3);
    }
  }
});
check('automatic numeric/time grouped columns retain every outer source identity',()=>{
  for(const type of ['linear','time']){
    const start=type==='time'?Date.UTC(2026,0,1):0,step=type==='time'?86400000:1;
    const series=['one','two'].map(id=>({id,name:id,data:[0,1].map(i=>({id:'p'+i,x:start+i*step,low:2,high:8}))}));
    const f=frame({...source,family:'columnrange',axes:{...source.axes,x:{type}},series});
    assert.deepEqual(f.observations.map(o=>[o.id.seriesId,o.id.pointId]),[['one','p0'],['one','p1'],['two','p0'],['two','p1']]);
    assert.ok(f.series.every(s=>s.bars.length===2&&s.bars.every(b=>b.x>=16&&b.x+b.width<=304)));
    for(const viewport of [{axes:'x'},{axes:'y',value:{y:[1,9]}},{axes:'xy',value:{}}]){const enabled=frame({...source,family:'columnrange',axes:{...source.axes,x:{type}},series},{...options,viewport});assert.equal(enabled.observations.length,4);assert.deepEqual(enabled.viewport.bounds.x.domain,[start-step/2,start+step*1.5]);}
    assert.equal(planChart({...source,family:'columnrange',axes:{...source.axes,x:{type}},series},{...options,viewport:{axes:'xy',value:{x:null,y:null}}}).status,'invalid');
    const window=[start-step/4,start+step*1.25],zoom=frame({...source,family:'columnrange',axes:{...source.axes,x:{type}},series},{...options,viewport:{axes:'x',value:{x:window}}});assert.deepEqual(zoom.viewport.bounds.x.domain,[start-step/2,start+step*1.5]);assert.deepEqual(zoom.viewport.displayed.x,window);assert.equal(zoom.observations.length,4);
    const explicit=frame({...source,family:'columnrange',axes:{...source.axes,x:{type,domain:[start,start+step]}},series:[series[0]]});close(explicit.observations[0].group.coordinate,16);close(explicit.observations[1].group.coordinate,304);
  }
});
check('hidden source series reflow grouped widths without leaking surrogate IDs or endpoint records',()=>{
  const other={id:'other',name:'Other',data:source.series[0].data.map(p=>({...p,low:p.low+3,high:p.high+3}))},spec={...source,family:'columnrange',series:[...source.series,other]},before=frame(spec),hidden=frame(spec,{...options,hiddenSeriesIds:['temperature']});
  assert.deepEqual(hidden.legend.map(l=>l.id),['temperature','other']);assert.equal(hidden.legend[0].visible,false);assert.equal(hidden.series.length,1);assert.equal(hidden.series[0].id,'other');assert.equal(hidden.series[0].color,before.series[1].color);assert.ok(hidden.series[0].bars[1].width>before.series[1].bars[1].width);
  assert.ok(hidden.observations.every(o=>o.id.seriesId==='other'));assert.equal(hidden.observations.length,3);assert.deepEqual(frame(spec),before);
  const all=planChart(spec,{...options,hiddenSeriesIds:['temperature','other']});assert.equal(all.status,'empty');assert.equal(all.frame.legend.length,2);
});
check('viewport clips complete crossing intervals and exact column hits to the displayed plot',()=>{
  const spec={...source,family:'columnrange',series:[{...source.series[0],data:[{id:'crossing',x:'a',low:-100,high:100}]}]};
  const f=frame(spec,{...options,viewport:{axes:'y',value:{y:[4,8]}}}),o=f.observations[0],bar=f.series[0].bars[0];
  close(bar.y,14);close(bar.height,272);assert.equal(o.lowValue,-100);assert.equal(o.highValue,100);close(o.y,150);assert.deepEqual(f.viewport.displayed.y,[4,8]);
  const reversed=frame({...source,axes:{...source.axes,y:{...source.axes.y,reversed:true}}});close(reversed.observations[0].y,14+4/20*272);assert.equal(reversed.observations[0].lowValue,2);
});
check('references share the actual interval frame and exact source X axis',()=>{
  const f=frame(source,{...options,references:[{id:'x-ref',axis:'x',value:'b'},{id:'y-ref',axis:'y',value:10}]});
  assert.equal(f.references.length,2);assert.ok(f.references.every(r=>r.status==='visible'));close(f.references[0].line.x1,f.observations[1].x);close(f.references[1].line.y1,150);
  assert.equal(planChart(source,{...options,references:[{id:'unknown',axis:'x',value:'missing'}]}).status,'invalid');
});
check('finite extremes preserve endpoints and safe midpoints without nonfinite transport',()=>{
  const spec={...source,axes:{x:{type:'category',values:[categories[0]]},y:{type:'linear',domain:[8e307,1.7e308],nice:false}},series:[{...source.series[0],data:[{id:'huge',x:'a',low:1e308,high:1.6e308}]}]};
  for(const family of ['arearange','areasplinerange','columnrange']){
    const f=frame({...spec,family}),o=f.observations[0];assert.equal(o.lowValue,1e308);assert.equal(o.highValue,1.6e308);assert.equal(o.value,1.3e308);assert.ok(Number.isFinite(o.x)&&Number.isFinite(o.y));assert.ok(!JSON.stringify(f).includes('null'));
  }
  const subnormal=frame({...source,axes:{...source.axes,y:{type:'linear',domain:[0,1e-300],nice:false}},series:[{...source.series[0],data:[{id:'tiny',x:'a',low:Number.MIN_VALUE,high:1e-301}]}]});assert.equal(subnormal.observations[0].lowValue,Number.MIN_VALUE);
});
check('results own frozen geometry and source endpoint mutation cannot alter observations',()=>{
  const spec=structuredClone(source),snapshot=structuredClone(spec),result=planChart(spec,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(spec,snapshot);assert.ok(!Object.isFrozen(spec));
  spec.series[0].data[0].low=-99;spec.series[0].data[0].high=99;assert.equal(result.frame.observations[0].lowValue,2);assert.equal(result.frame.observations[0].highValue,6);
});
check('inverted, partial-null, nonfinite, duplicate, unsorted, sparse and unknown fields fail explicitly',()=>{
  const badPoints=[{low:4,high:3},{low:null,high:3},{low:3,high:null},{low:NaN,high:3},{low:1,high:Infinity},{low:'1',high:3},{low:1,high:3,extra:true}];
  const malformed=badPoints.map(p=>({...source,series:[{...source.series[0],data:[{id:'bad',x:'a',...p}]}]}));
  malformed.push({...source,extra:true},{...source,series:[{...source.series[0],curve:'straight'}]},{...source,series:[{...source.series[0],name:undefined}]},{...source,series:[{...source.series[0],data:[source.series[0].data[0],source.series[0].data[0]]}]},{...source,series:[{...source.series[0],data:[source.series[0].data[1],source.series[0].data[0]]}]},{...source,series:[{...source.series[0],data:new Array(2)}]},{...source,groupGap:.1});
  for(const spec of malformed)assert.equal(planChart(spec,options).status,'invalid');
  for(const opts of [{stacking:'sum'},{hiddenSeriesIds:['missing']},{hiddenSeriesIds:['temperature','temperature']}])assert.equal(planChart(source,{...options,...opts}).status,'invalid');
  for(const value of [-1,1,Infinity])assert.equal(planChart({...source,family:'columnrange',groupGap:value},options).status,'invalid');
  let reads=0;const getter={...source,series:[{...source.series[0],data:[{id:'p',x:'a',get low(){reads++;return 1;},high:2}]}]};assert.equal(planChart(getter,options).status,'invalid');assert.equal(reads,0);
});
check('dense bounds reject overflow safely while an empty visible interval table remains explicit',()=>{
  const empty=planChart({...source,series:[{...source.series[0],data:source.series[0].data.map(p=>({...p,low:null,high:null}))}]},options);assert.equal(empty.status,'empty');assert.equal(empty.frame.observations.length,0);assert.equal(empty.frame.legend.length,1);
  assert.equal(planChart({...source,series:Array.from({length:17},(_,i)=>({...source.series[0],id:'s'+i}))},options).status,'invalid');
  const dense={...source,axes:{...source.axes,x:{type:'linear'}},series:[{...source.series[0],data:Array.from({length:10001},(_,i)=>({id:'p'+i,x:i,low:0,high:1}))}]};assert.equal(planChart(dense,options).status,'invalid');
});

writeFileSync(new URL('../../work/reports/core-plan-ranges-current.json',import.meta.url),JSON.stringify({status:'passed',checks,semantics:'Original lowValue/highValue endpoints; scalar value is compatibility midpoint only. Paired nulls are gaps. Spline samples never become observations.'},null,2)+'\n');
console.log(`PASS ${checks.length} range Core contract checks`);
