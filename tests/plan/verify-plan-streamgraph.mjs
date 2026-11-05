import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const categories=['a','b','c'].map(id=>({id,label:id.toUpperCase()}));
const source={family:'streamgraph',title:'Activity stream',axes:{x:{type:'category',values:categories},y:{type:'linear',domain:[-5,5],nice:false,title:'Activity'}},series:[{id:'one',name:'One',data:[2,4,1].map((y,i)=>({id:'one-'+i,x:categories[i].id,y}))},{id:'two',name:'Two',data:[6,2,3].map((y,i)=>({id:'two-'+i,x:categories[i].id,y}))}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec=source,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function y(value){return 150-value*27.2;}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}
function polygonAt(series,index){return series.areaCommands.slice(index*5,index*5+5);}

check('silhouette bands and eligible anchors are both genuinely centered around zero',()=>{
  const f=frame();assert.equal(f.family,'streamgraph');assert.equal(f.unit,'Activity');assert.equal(f.observations.length,6);
  const a=polygonAt(f.series[0],0),b=polygonAt(f.series[1],0);assert.equal(a.at(-1).type,'Z');assert.equal(b.at(-1).type,'Z');
  close(a[0].y,y(-2));close(a[3].y,y(-4));close(b[0].y,y(4));close(b[3].y,y(-2));close((a[3].y+b[0].y)/2,150);
  const obs=f.observations.find(o=>o.id.seriesId==='one'&&o.id.pointId==='one-0');close(obs.y,a[0].y);assert.notEqual(obs.y,y(2),'anchor uses centered segment, not raw sum geometry');
  assert.deepEqual(f.observations.map(o=>o.value),[2,4,1,6,2,3]);assert.ok(f.observations.every(o=>!Object.hasOwn(o,'percentage')));
});
check('each band thickness equals its original value and adjacent series share the same seam',()=>{
  const f=frame();
  for(let i=0;i<2;i++){
    const a=polygonAt(f.series[0],i),b=polygonAt(f.series[1],i);close(a[0].y,b[3].y);close(a[1].y,b[2].y);
    close(a[3].y-a[0].y,source.series[0].data[i].y*27.2);close(b[3].y-b[0].y,source.series[1].data[i].y*27.2);
    close(a[2].y-a[1].y,source.series[0].data[i+1].y*27.2);close(b[2].y-b[1].y,source.series[1].data[i+1].y*27.2);
    close((a[3].y+b[0].y)/2,150);close((a[2].y+b[1].y)/2,150);
  }
});
check('visibility recomputes the actual silhouette, anchors, legends and stable restoration',()=>{
  const before=frame(),hidden=frame(source,{...options,hiddenSeriesIds:['two']});assert.equal(hidden.series.length,1);assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[1].visible,false);assert.equal(hidden.series[0].color,before.series[0].color);
  const band=polygonAt(hidden.series[0],0);close(band[0].y,y(1));close(band[3].y,y(-1));close(hidden.observations[0].y,y(1));assert.equal(hidden.observations[0].value,2);assert.equal(hidden.observations.length,3);
  assert.deepEqual(frame(),before);const all=planChart(source,{...options,hiddenSeriesIds:['one','two']});assert.equal(all.status,'empty');assert.equal(all.frame.legend.length,2);
});
check('one missing or null component breaks the whole row and adjacent fill bands',()=>{
  for(const missing of [false,true]){
    const spec=structuredClone(source);if(missing)spec.series[0].data.splice(1,1);else spec.series[0].data[1].y=null;
    const f=frame(spec);assert.deepEqual(f.observations.map(o=>o.id.pointId),['one-0','one-2','two-0','two-2']);assert.ok(f.series.every(s=>s.areaCommands.length===0&&s.commands.length===0));
    const restored=frame(spec,{...options,hiddenSeriesIds:['one']});assert.equal(restored.observations.length,3);assert.equal(restored.series[0].areaCommands.length,10);
  }
});
check('automatic domains derive from centered segments rather than positive raw sums',()=>{
  const spec={...source,axes:{...source.axes,y:{type:'linear',nice:false}}},f=frame(spec),zero=f.grid.find(g=>Number(g.label)===0);assert.ok(zero);close(zero.y,150);
  const values=f.grid.map(g=>Number(g.label));assert.ok(values.some(v=>v<0)&&values.some(v=>v>0));
  const first=polygonAt(f.series[0],0),last=polygonAt(f.series[1],0);close(first[3].y,286);close(last[0].y,14);
});
check('numeric and time X preserve nonuniform domain spacing and original observation identity',()=>{
  for(const type of ['linear','time']){
    const origin=type==='time'?Date.UTC(2026,0,1):0,unit=type==='time'?86400000:1;
    const spec={...source,axes:{...source.axes,x:{type}},series:source.series.map(s=>({...s,data:s.data.map((p,i)=>({...p,x:origin+[0,1,4][i]*unit}))}))},f=frame(spec),obs=f.observations.filter(o=>o.id.seriesId==='one');
    close((obs[2].x-obs[1].x)/(obs[1].x-obs[0].x),3);assert.deepEqual(obs.map(o=>o.xValue),spec.series[0].data.map(p=>p.x));assert.deepEqual(obs.map(o=>o.id.pointId),['one-0','one-1','one-2']);
  }
});
check('zero streams remain semantic without invented percentages or positive thickness',()=>{
  const f=frame({...source,series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,y:0}))}))});assert.equal(f.observations.length,6);assert.ok(f.observations.every(o=>o.value===0&&o.y===150&&o.hit===undefined&&!Object.hasOwn(o,'percentage')));
  for(const s of f.series)for(const c of s.areaCommands)if(c.type!=='Z')assert.equal(c.y,150);
  const empty=planChart({...source,series:[]},options);assert.equal(empty.status,'empty');assert.equal(empty.frame.observations.length,0);
});
check('references, viewport and reversed Y use the same centered geometry maps',()=>{
  const f=frame(source,{...options,references:[{id:'zero',axis:'y',value:0},{id:'b',axis:'x',value:'b'}]});assert.equal(f.references.length,2);close(f.references[0].line.y1,150);close(f.references[1].line.x1,f.observations[1].x);
  assert.equal(planChart(source,{...options,references:[{id:'missing',axis:'x',value:'missing'}]}).status,'invalid');
  const zoom=frame(source,{...options,viewport:{axes:'y',value:{y:[-2,2]}}});assert.deepEqual(zoom.viewport.displayed.y,[-2,2]);assert.ok(zoom.observations.every(o=>o.y>=14&&o.y<=286));
  const reverse=frame({...source,axes:{...source.axes,y:{...source.axes.y,reversed:true}}});close(reverse.observations[0].y,300-frame().observations[0].y);assert.equal(reverse.observations[0].value,2);
});
check('finite large stacks stay representable and overflowing totals fail explicitly',()=>{
  const spec={...source,axes:{...source.axes,y:{type:'linear',domain:[-5e307,5e307],nice:false}},series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,y:4e307}))}))},f=frame(spec);assert.ok(f.observations.every(o=>o.value===4e307&&Number.isFinite(o.x)&&Number.isFinite(o.y)));assert.ok(!JSON.stringify(f).includes('null'));
  const overflow={...source,series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,y:Number.MAX_VALUE}))}))};assert.equal(planChart(overflow,options).status,'invalid');
});
check('strict source/option bounds reject negatives, curve overrides, gaps, bad visibility and sparse input',()=>{
  const malformed=[{...source,offset:'wiggle'},{...source,series:[{...source.series[0],curve:'straight'}]},{...source,series:[{...source.series[0],gaps:'connect'}]},{...source,series:[{...source.series[0],markers:'off'}]},{...source,series:[{...source.series[0],data:[{id:'bad',x:'a',y:-1}]}]},{...source,series:[{...source.series[0],data:[{id:'bad',x:'a',y:Infinity}]}]},{...source,series:[{...source.series[0],data:new Array(2)}]}];
  for(const spec of malformed)assert.equal(planChart(spec,options).status,'invalid');for(const opts of [{stacking:'sum'},{stacking:'percent'},{hiddenSeriesIds:['missing']},{hiddenSeriesIds:['one','one']}])assert.equal(planChart(source,{...options,...opts}).status,'invalid');
  assert.equal(planChart({...source,series:Array.from({length:17},(_,i)=>({...source.series[0],id:'s'+i}))},options).status,'invalid');
});
check('output geometry is owned and deeply frozen without mutating caller values',()=>{
  const spec=structuredClone(source),snapshot=structuredClone(spec),result=planChart(spec,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(spec,snapshot);assert.ok(!Object.isFrozen(spec));
  spec.series[0].data[0].y=999;assert.equal(result.frame.observations[0].value,2);close(result.frame.observations[0].y,y(-2));
});

writeFileSync(new URL('../../work/reports/core-plan-streamgraph-current.json',import.meta.url),JSON.stringify({status:'passed',checks,encoding:'Fixed silhouette: per-X offset = -visibleTotal/2. Thickness is the nonnegative original Y. No wiggle optimizer, smoothing or percentage encoding.'},null,2)+'\n');
console.log(`PASS ${checks.length} streamgraph Core contract checks`);
