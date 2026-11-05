import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const categories=['a','b','c'].map(id=>({id,label:id.toUpperCase()}));
const source={family:'boxplot',title:'Observed distribution',axes:{x:{type:'category',values:categories},y:{type:'linear',domain:[0,20],nice:false}},series:[{id:'sample',name:'Sample',data:[{id:'first',x:'a',minimum:1,q1:4,median:7,q3:10,maximum:14},{id:'second',x:'b',minimum:2,q1:5,median:6,q3:12,maximum:18},{id:'gap',x:'c',minimum:null,q1:null,median:null,q3:null,maximum:null}]}]};
const error={family:'errorbar',title:'Observed uncertainty',axes:source.axes,series:[{id:'measurement',name:'Measurement',data:[{id:'first',x:'a',low:2,high:8},{id:'second',x:'b',low:5,high:13},{id:'gap',x:'c',low:null,high:null}]}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec=source,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function near(actual,expected){return Math.abs(actual-expected)<1e-8;}
function y(value){return 286-value*13.6;}
function segments(commands){const lines=[];for(let i=0;i<commands.length;i+=2){assert.equal(commands[i].type,'M');assert.equal(commands[i+1].type,'L');lines.push([commands[i],commands[i+1]]);}return lines;}
function horizontalAt(commands,ordinate){return segments(commands).filter(([a,b])=>Math.abs(a.y-ordinate)<1e-8&&Math.abs(b.y-ordinate)<1e-8);}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('boxplot transports all five observed values and fills only the actual interquartile box',()=>{
  const f=frame(),o=f.observations[0],bar=f.series[0].bars[0];assert.equal(f.family,'boxplot');assert.equal(f.observations.length,2);assert.deepEqual(o.id,{seriesId:'sample',pointId:'first'});
  assert.deepEqual([o.minimumValue,o.q1Value,o.medianValue,o.q3Value,o.maximumValue],[1,4,7,10,14]);assert.equal(o.value,7);assert.equal(o.lowValue,1);assert.equal(o.highValue,14);
  assert.equal(bar.pointId,'first');close(bar.y,y(10));close(bar.height,6*13.6);close(o.y,y(7));assert.equal(f.series[0].areaCommands,undefined);
  assert.notEqual(bar.height,13*13.6,'min/max is a whisker range, never a filled range column');assert.equal(f.observations[1].value,6);
});
check('box outline, median, whiskers and half-width default caps are real independent line geometry',()=>{
  const f=frame(),s=f.series[0],bar=s.bars[0],median=horizontalAt(s.commands,y(7));assert.equal(median.length,1);close(median[0][0].x,bar.x);close(median[0][1].x,bar.x+bar.width);
  assert.ok(horizontalAt(s.commands,y(4)).some(([a,b])=>a.x===bar.x&&b.x===bar.x+bar.width));assert.ok(horizontalAt(s.commands,y(10)).some(([a,b])=>a.x===bar.x&&b.x===bar.x+bar.width));
  const minCap=horizontalAt(s.commands,y(1))[0],maxCap=horizontalAt(s.commands,y(14))[0];close(minCap[1].x-minCap[0].x,bar.width/2);close(maxCap[1].x-maxCap[0].x,bar.width/2);
  const lines=segments(s.commands);assert.ok(lines.some(([a,b])=>a.x===f.observations[0].x&&b.x===a.x&&near(a.y,y(1))&&near(b.y,y(4))));assert.ok(lines.some(([a,b])=>a.x===f.observations[0].x&&b.x===a.x&&near(a.y,y(10))&&near(b.y,y(14))));
});
check('errorbar draws stems and endpoint caps without pretending to be a filled column',()=>{
  const f=frame(error),s=f.series[0],o=f.observations[0];assert.equal(f.family,'errorbar');assert.equal(s.bars,undefined);assert.equal(s.areaCommands,undefined);assert.equal(o.lowValue,2);assert.equal(o.highValue,8);assert.equal(o.value,5);
  const lines=segments(s.commands);assert.equal(lines.length,6);assert.ok(lines.some(([a,b])=>a.x===o.x&&b.x===o.x&&near(a.y,y(2))&&near(b.y,y(8))));
  assert.equal(horizontalAt(s.commands,y(2)).length,1);assert.equal(horizontalAt(s.commands,y(8)).length,1);assert.equal(o.hit.type,'polygon');assert.equal(o.hit.vertices.length,4);
  close(o.hit.vertices[0].y,y(8));close(o.hit.vertices[2].y,y(2));
});
check('cap fractions are bounded geometry settings and zero removes caps without dropping semantic records',()=>{
  const noBoxCaps=frame({...source,whiskerWidth:0});assert.equal(horizontalAt(noBoxCaps.series[0].commands,y(1)).length,0);assert.equal(horizontalAt(noBoxCaps.series[0].commands,y(7)).length,1);
  const noErrorCaps=frame({...error,capWidth:0});assert.equal(noErrorCaps.observations.length,2);assert.equal(noErrorCaps.series[0].commands.length,4);for(const o of noErrorCaps.observations){assert.equal(o.hit.type,'polygon');close(o.hit.vertices[1].x-o.hit.vertices[0].x,2);assert.ok(o.x>=o.hit.vertices[0].x&&o.x<=o.hit.vertices[1].x);}
  const half=frame({...error,capWidth:.5}),full=frame(error);const halfCap=horizontalAt(half.series[0].commands,y(2))[0],fullCap=horizontalAt(full.series[0].commands,y(2))[0];close(halfCap[1].x-halfCap[0].x,(fullCap[1].x-fullCap[0].x)/2);
});
check('zero IQR and equal endpoints retain visible strokes with finite bounded targets only when painted',()=>{
  const box=frame({...source,series:[{...source.series[0],data:[{id:'equal',x:'a',minimum:5,q1:5,median:5,q3:5,maximum:5}]}]});assert.equal(box.series[0].bars.length,0);assert.ok(horizontalAt(box.series[0].commands,y(5)).length>=1);assert.equal(box.observations[0].hit.type,'polygon');assert.equal(box.observations[0].medianValue,5);
  const zero={...error,series:[{...error.series[0],data:[{id:'equal',x:'a',low:5,high:5}]}]},interval=frame(zero),o=interval.observations[0];assert.equal(interval.series[0].commands.length,2);assert.equal(o.hit.type,'polygon');close(o.hit.vertices[2].y-o.hit.vertices[0].y,2);assert.ok(o.y>=o.hit.vertices[0].y&&o.y<=o.hit.vertices[2].y);assert.equal(o.value,5);
  const invisible=frame({...zero,capWidth:0});assert.equal(invisible.series[0].commands.length,0);assert.equal(invisible.observations[0].hit,undefined);
});
check('viewport clips glyphs but never invents endpoint caps at viewport edges',()=>{
  const opts={...options,viewport:{axes:'y',value:{y:[5,10]}}},f=frame(source,opts),o=f.observations[0];assert.equal(o.minimumValue,1);assert.equal(o.maximumValue,14);assert.equal(o.medianValue,7);
  for(const s of f.series){for(const c of s.commands)assert.ok(c.x>=16&&c.x<=304&&c.y>=14&&c.y<=286);for(const b of s.bars)assert.ok(b.y>=14&&b.y+b.height<=286);}
  const clipped=frame({...error,series:[{...error.series[0],data:[{id:'wide',x:'a',low:0,high:20}]}]},opts);assert.equal(clipped.series[0].commands.length,2);assert.equal(clipped.series[0].commands[0].y,286);assert.equal(clipped.series[0].commands[1].y,14);assert.equal(clipped.observations[0].lowValue,0);assert.equal(clipped.observations[0].highValue,20);
  const medianOutside=frame({...source,series:[{...source.series[0],data:[{id:'outside',x:'a',minimum:0,q1:3,median:15,q3:18,maximum:20}]}]},opts);assert.equal(medianOutside.observations[0].medianValue,15);assert.equal(medianOutside.observations[0].value,15);assert.equal(medianOutside.observations[0].y,14);
});
check('linear and time edge glyphs keep stems aligned to source X after slot clipping',()=>{
  for(const type of ['linear','time']){
    const origin=type==='time'?Date.UTC(2026,0,1):0,unit=type==='time'?86400000:1,spec={...error,axes:{...error.axes,x:{type,domain:[origin,origin+4*unit]}},series:[{...error.series[0],data:[{id:'start',x:origin,low:2,high:8},{id:'end',x:origin+4*unit,low:5,high:13}]}]},f=frame(spec);
    close(f.observations[0].x,16);close(f.observations[1].x,304);assert.deepEqual(f.observations.map(o=>o.xValue),[origin,origin+4*unit]);
    const lines=segments(f.series[0].commands);assert.ok(lines.some(([a,b])=>a.x===16&&b.x===16&&a.y!==b.y));assert.ok(lines.some(([a,b])=>a.x===304&&b.x===304&&a.y!==b.y));
  }
});
check('automatic numeric/time grouping keeps all four originals across ranges, boxes and errors',()=>{
  for(const type of ['linear','time'])for(const family of ['columnrange','boxplot','errorbar']){
    const start=type==='time'?Date.UTC(2026,0,1):0,step=type==='time'?86400000:1;
    const series=['one','two'].map(id=>({id,name:id,data:[0,1].map(i=>({id:'p'+i,x:start+i*step,...(family==='boxplot'?{minimum:1,q1:3,median:5,q3:7,maximum:9}:{low:2,high:8})}))}));
    const f=frame({family,title:'Grouped intervals',axes:{x:{type},y:source.axes.y},series});
    assert.deepEqual(f.observations.map(o=>[o.id.seriesId,o.id.pointId]),[['one','p0'],['one','p1'],['two','p0'],['two','p1']]);
    assert.ok(f.observations.every(o=>o.x>=16&&o.x<=304));assert.ok(f.series.every(s=>(s.commands??[]).every(c=>c.x>=16&&c.x<=304)));
    for(const viewport of [{axes:'x'},{axes:'y',value:{y:[1,9]}}])assert.equal(frame({family,title:'Grouped intervals',axes:{x:{type},y:source.axes.y},series},{...options,viewport}).observations.length,4);
    const window=[start-step/4,start+step*1.25],zoom=frame({family,title:'Grouped intervals',axes:{x:{type},y:source.axes.y},series},{...options,viewport:{axes:'x',value:{x:window}}});assert.deepEqual(zoom.viewport.bounds.x.domain,[start-step/2,start+step*1.5]);assert.deepEqual(zoom.viewport.displayed.x,window);assert.equal(zoom.observations.length,4);
  }
});
check('hidden groups reflow shared slots while retaining source identity, color and restore behavior',()=>{
  const extra={...source.series[0],id:'other',name:'Other'},spec={...source,series:[...source.series,extra]},before=frame(spec),hidden=frame(spec,{...options,hiddenSeriesIds:['sample']});
  assert.equal(hidden.observations.length,2);assert.ok(hidden.observations.every(o=>o.id.seriesId==='other'));assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[0].visible,false);assert.equal(hidden.series[0].color,before.series[1].color);assert.ok(hidden.series[0].bars[0].width>before.series[1].bars[0].width);assert.deepEqual(frame(spec),before);
  const all=planChart(spec,{...options,hiddenSeriesIds:['sample','other']});assert.equal(all.status,'empty');assert.equal(all.frame.family,'boxplot');assert.equal(all.frame.legend.length,2);
});
check('all-null tuples are gaps; empty results retain their actual public family',()=>{
  for(const spec of [source,error]){
    const f=frame(spec);assert.equal(f.observations.length,2);assert.ok(f.observations.every(o=>o.id.pointId!=='gap'));
    const empty=planChart({...spec,series:[{...spec.series[0],data:[spec.series[0].data[2]]}]},options);assert.equal(empty.status,'empty');assert.equal(empty.frame.family,spec.family);assert.equal(empty.frame.observations.length,0);assert.equal(empty.frame.legend.length,1);
  }
});
check('references and reversed Y share the actual statistical frame',()=>{
  const f=frame(source,{...options,references:[{id:'a',axis:'x',value:'a'},{id:'seven',axis:'y',value:7}]});assert.equal(f.references.length,2);close(f.references[0].line.x1,f.observations[0].group.coordinate);close(f.references[1].line.y1,f.observations[0].y);
  assert.equal(planChart(source,{...options,references:[{id:'unknown',axis:'x',value:'missing'}]}).status,'invalid');
  const reversed=frame({...source,axes:{...source.axes,y:{...source.axes.y,reversed:true}}});close(reversed.observations[0].y,300-frame().observations[0].y);assert.equal(reversed.observations[0].medianValue,7);
});
check('negative and large finite summaries retain exact endpoints and safe compatible scalar values',()=>{
  const negative=frame({...source,axes:{...source.axes,y:{type:'linear',domain:[-12,8],nice:false}},series:[{...source.series[0],data:[{id:'signed',x:'a',minimum:-10,q1:-6,median:-2,q3:2,maximum:5}]}]});assert.equal(negative.observations[0].minimumValue,-10);assert.equal(negative.observations[0].medianValue,-2);
  const axes={...source.axes,y:{type:'linear',domain:[8e307,1.7e308],nice:false}},box=frame({...source,axes,series:[{...source.series[0],data:[{id:'huge',x:'a',minimum:9e307,q1:1e308,median:1.2e308,q3:1.4e308,maximum:1.6e308}]}]});assert.equal(box.observations[0].value,1.2e308);assert.equal(box.observations[0].minimumValue,9e307);assert.equal(box.observations[0].maximumValue,1.6e308);assert.ok(!JSON.stringify(box).includes('null'));
  const interval=frame({...error,axes,series:[{...error.series[0],data:[{id:'huge',x:'a',low:1e308,high:1.6e308}]}]});assert.equal(interval.observations[0].value,1.3e308);assert.ok(Number.isFinite(interval.observations[0].y));
});
check('strict order, complete tuples, finite values, dense budgets and family options are validated',()=>{
  const first=source.series[0].data[0],malformed=[{minimum:5,q1:4},{q1:9,median:7},{median:11,q3:10},{q3:15,maximum:14},{minimum:null},{q1:Infinity},{median:NaN},{maximum:'14'},{extra:true}];
  for(const patch of malformed)assert.equal(planChart({...source,series:[{...source.series[0],data:[{...first,...patch}]}]},options).status,'invalid');
  for(const spec of [{...source,notches:true},{...source,capWidth:.5},{...error,whiskerWidth:.5},{...source,series:[{...source.series[0],data:[first,first]}]},{...source,series:[{...source.series[0],data:new Array(2)}]}])assert.equal(planChart(spec,options).status,'invalid');
  for(const whiskerWidth of [-1,1.1,Infinity,null,'50%'])assert.equal(planChart({...source,whiskerWidth},options).status,'invalid');
  for(const capWidth of [-1,1.1,Infinity,null,'50%'])assert.equal(planChart({...error,capWidth},options).status,'invalid');
  for(const patch of [{stacking:'sum'},{hiddenSeriesIds:['missing']}])assert.equal(planChart(source,{...options,...patch}).status,'invalid');
  const dense={...error,axes:{...error.axes,x:{type:'linear'}},series:[{...error.series[0],data:Array.from({length:10001},(_,i)=>({id:'p'+i,x:i,low:1,high:2}))}]};assert.equal(planChart(dense,options).status,'invalid');
});
check('owned frozen output cannot be changed by mutating the original summary',()=>{
  const spec=structuredClone(source),snapshot=structuredClone(spec),result=planChart(spec,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(spec,snapshot);assert.ok(!Object.isFrozen(spec));spec.series[0].data[0].median=999;assert.equal(result.frame.observations[0].medianValue,7);
});

writeFileSync(new URL('../../work/reports/core-plan-statistical-ranges-current.json',import.meta.url),JSON.stringify({status:'passed',checks,encoding:'Observed five-number boxes and low/high errors only. IQR fill, median, stems and caps are distinct geometry. Polygon targets are clipped glyph envelopes; painted zero-width/height strokes receive a one-unit margin only in collapsed dimensions.'},null,2)+'\n');
console.log(`PASS ${checks.length} statistical range Core contract checks`);
