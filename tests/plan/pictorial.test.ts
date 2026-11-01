import {it as test} from 'vitest';
import assert from 'node:assert/strict';
import {planPictorial} from '../../src/plan/pictorial.js';
import type {PlanPictorialSpec,PlanPictorialOptions} from '../../src/plan.js';
const size={width:360,height:320};
function spec(values:readonly (readonly (number|null)[])[]=[[60,30],[40,20]]){
  return{family:'pictorial',title:'Capacity',axes:{x:{kind:'category',values:[{id:'a',label:'A'},{id:'b',label:'B'}]},y:{kind:'linear' as const} as {kind:'linear';domain?:readonly [number,number]}},series:values.map((ys,i)=>({id:'s'+i,name:'Series '+i,data:ys.map((y,j)=>({id:'p'+j,x:j?'b':'a',y}))}))};
}
function ok(source:unknown,options:unknown=size){const result=planPictorial(source as PlanPictorialSpec,options as PlanPictorialOptions);if(result.status==='invalid')throw Error(JSON.stringify(result));return result;}
const invalid=(source:unknown,options:unknown=size,reason?:string)=>{const r=planPictorial(source,options);assert.equal(r.status,'invalid');if(r.status!=='invalid')throw Error('Expected invalid');if(reason)assert.equal(r.diagnostic.reason,reason);};

test('grouped, absolute and percent modes have real distinct fills and shared-stack glyphs',()=>{
  const grouped=ok(spec()).frame;assert.equal(grouped.pictorialGlyphs.length,4);assert.equal(grouped.observations.length,4);assert.equal(grouped.pictorialLayout.capacity,60);
  const sum=ok(spec(),{...size,stacking:'sum'}).frame;assert.equal(sum.pictorialGlyphs.length,2);assert.equal(sum.pictorialLayout.capacity,100);
  const a=sum.observations.filter(o=>o.pictorial.categoryId==='a');assert.equal(a[0]!.pictorial.high,a[1]!.pictorial.low);assert.equal(a[1]!.pictorial.high,1);assert.equal(a[0]!.pictorial.glyphId,a[1]!.pictorial.glyphId);
  const percent=ok(spec(),{...size,stacking:'percent'}).frame;assert.ok(Math.abs(percent.observations[0]!.percentage-60)<1e-10);assert.ok(Math.abs(percent.observations[1]!.percentage-40)<1e-10);assert.equal(percent.pictorialLayout.capacity,100);
  assert.ok(sum.series.every(s=>s.pictorialFills.every(f=>f.commands.some(c=>c.kind==='Z'))));
});

test('source capacity remains fixed when hiding a series, with restore equality',()=>{
  const source=spec(),initial=ok(source,{...size,stacking:'sum'}),hidden=ok(source,{...size,stacking:'sum',hiddenSeriesIds:['s0']});
  assert.equal(hidden.frame.pictorialLayout.capacity,100);assert.equal(hidden.frame.observations[0]!.pictorial.high,.4);
  assert.equal(hidden.frame.pictorialData.filter(p=>p.status==='hidden').length,2);
  assert.deepEqual(ok(source,{...size,stacking:'sum',hiddenSeriesIds:[]}),initial);
  invalid(source,{...size,hiddenSeriesIds:['unknown']},'UNKNOWN_SERIES');invalid(source,{...size,hiddenSeriesIds:['s0','s0']},'DUPLICATE_ID');
});

test('zero, null, missing and empty retain distinct source and layout states',()=>{
  for(const [source,reason]of [[spec([[0,0]]),'noPositiveValues'],[spec([[null,null]]),'noPositiveValues'],[spec([[]]),'noSource']]){
    const result=ok(source);assert.equal(result.status,'empty');assert.equal(result.frame.pictorialLayout.capacity,null);assert.equal(result.frame.pictorialLayout.layoutCapacity,1);assert.equal(result.frame.pictorialLayout.capacitySource,'none');assert.equal(result.frame.pictorialLayout.emptyReason,reason);
    assert.equal(result.frame.series.flatMap(s=>s.pictorialFills).length,0);
  }
  const zero=ok(spec([[0,0]])).frame;assert.equal(zero.observations.length,2);assert.ok(zero.observations.every(o=>o.value===0&&!o.hit));assert.ok(zero.pictorialData.every(p=>p.status==='zero'));
  const unknown=ok(spec([[null,null]])).frame;assert.equal(unknown.observations.length,0);assert.ok(unknown.pictorialData.every(p=>p.y===null&&p.status==='null'));
  const percent=ok(spec([[0,0]]),{...size,stacking:'percent'}).frame;assert.equal(percent.pictorialLayout.capacity,null);assert.equal(percent.pictorialLayout.layoutCapacity,100);
  const hidden=ok(spec(),{...size,hiddenSeriesIds:['s0','s1']});assert.equal(hidden.status,'empty');assert.equal(hidden.frame.pictorialLayout.emptyReason,'hidden');
});

test('percent known-subset semantics are incomplete for null and missing members',()=>{
  const source=spec([[20,null],[null,10]]);source.series.push({id:'missing',name:'Missing',data:[]});
  const result=ok(source,{...size,stacking:'percent'}).frame;
  assert.ok(result.observations.every(o=>o.percentage===100&&o.pictorial.incomplete));
  assert.equal(result.pictorialData.length,4,'missing source points are not invented');
  assert.ok(result.pictorialData.every(p=>p.incomplete));
});

test('absolute source overflow rejects even hidden; percent originals remain finite and truthful',()=>{
  const max=Number.MAX_VALUE,source=spec([[max,1],[max,1]]);
  invalid(source,{...size,stacking:'sum',hiddenSeriesIds:['s1']},'TOTAL_OVERFLOW');
  const percent=ok(source,{...size,stacking:'percent'}).frame,a=percent.observations.filter(o=>o.pictorial.categoryId==='a');
  assert.ok(a.every(o=>o.value===max&&o.percentage===50&&o.pictorial.total===null&&o.pictorial.totalStatus==='overflow'));
  const tiny=ok(spec([[Number.MIN_VALUE,1]]),size).frame;
  const positive=tiny.observations.find(o=>o.value===Number.MIN_VALUE);assert.equal(positive.pictorial.status,'noInk');assert.equal(positive.hit,undefined);assert.equal(tiny.pictorialData[0]!.y,Number.MIN_VALUE);
});

test('capacity is a single authority and invalid source validates before hiding',()=>{
  const source=spec();source.axes.y.domain=[0,100];
  assert.equal(ok(source).frame.pictorialLayout.capacity,100);
  invalid(source,{...size,stacking:'percent'},'PERCENT_DOMAIN_UNSUPPORTED');
  source.axes.y.domain=[0,20];invalid(source,{...size,hiddenSeriesIds:['s0','s1']},'SOURCE_EXCEEDS_CAPACITY');
  source.axes.y.domain=[5,100];invalid(source,size,'ZERO_BASELINE_REQUIRED');
  source.axes.y.domain=[0,100];source.series[0]!.data[0]!.y=-1;invalid(source,{...size,hiddenSeriesIds:['s0']});
  source.series[0]!.data[0]!.y=Infinity;invalid(source,{...size,hiddenSeriesIds:['s0']});
});

test('only bounded summation roundoff can reach a declared capacity, without changing source values',()=>{
  const source=spec([[.1],[.2]]);source.axes.y.domain=[0,.3];
  const result=ok(source,{...size,stacking:'sum'}).frame;
  assert.equal(result.pictorialLayout.capacity,.3);assert.ok(result.pictorialLayout.capacityRoundoff.maxExcess>0);
  assert.ok(result.pictorialLayout.capacityRoundoff.maxExcess<=result.pictorialLayout.capacityRoundoff.tolerance);
  assert.deepEqual(result.pictorialData.map(p=>p.y),[.1,.2]);assert.equal(result.observations[0]!.pictorial.total,.1+.2);
  assert.equal(result.observations[1]!.pictorial.high,1);
  source.series[1]!.data[0]!.y=.20001;invalid(source,{...size,stacking:'sum'},'SOURCE_EXCEEDS_CAPACITY');
  const individual=spec([[.1+.2]]);individual.axes.y.domain=[0,.3];invalid(individual,size,'SOURCE_EXCEEDS_CAPACITY');
  invalid(individual,{...size,stacking:'sum'},'SOURCE_EXCEEDS_CAPACITY');
});

test('strict shape/options reject ignored or contradictory keys',()=>{
  invalid({...spec(),unexpected:true});invalid(spec(),{...size,viewport:{axes:'x'}});invalid(spec(),{...size,references:[]});invalid(spec(),{...size,wordcloudText:{}});
  invalid({...spec(),pictorial:{shape:{kind:'preset',name:'person',mesh:{}}}});
  invalid({...spec(),pictorial:{shape:{kind:'mesh',name:'person',mesh:{}}}});
  invalid(spec(),{...size,hiddenSeriesIds:null});
  invalid({...spec(),pictorial:null});
});

test('input accessors never execute; source/option objects and returned output are independently owned',()=>{
  let calls=0;const source=spec();Object.defineProperty(source,'pictorial',{enumerable:true,get(){calls++;return{};}});invalid(source);assert.equal(calls,0);
  const options={...size};Object.defineProperty(options,'stacking',{enumerable:true,get(){calls++;return'sum';}});invalid(spec(),options);assert.equal(calls,0);
  const data=spec(),result=ok(data),snapshot=JSON.stringify(result);data.series[0]!.data[0]!.y=999;assert.equal(JSON.stringify(result),snapshot);assert.ok(Object.isFrozen(result.frame.pictorialGlyphs[0]!.backgroundCommands[0]!));
});

test('lossless identities, source category order and keyboard identity remain stable',()=>{
  const source=spec([[10,20]]);source.axes.x.values[0]!.id='\ud800:|a';source.axes.x.values[1]!.id='2::';source.series[0]!.id='__proto__';source.series[0]!.data[0]!.x='\ud800:|a';source.series[0]!.data[1]!.x='2::';source.series[0]!.data[0]!.id='constructor';
  const first=ok(source);source.series[0]!.data.reverse();const reordered=ok(source);assert.deepEqual(first.frame.observations,reordered.frame.observations);
  assert.equal(first.frame.observations[0]!.id.seriesId,'__proto__');assert.equal(first.frame.observations[0]!.id.pointId,'constructor');
  assert.equal(new Set(first.frame.pictorialGlyphs.map(g=>JSON.stringify(g.id))).size,2);
});

test('typed glyph identities preserve maximum quotes, backslashes and lone surrogates without artificial string IDs',()=>{
  const source=spec([[10]]),category='"\\\ud800:'.repeat(32),series='\\"\udfff|'.repeat(32);
  assert.equal(category.length,128);assert.equal(series.length,128);
  source.axes.x.values=[{id:category,label:'Opaque identity'}];source.series[0]!.id=series;source.series[0]!.data[0]!.x=category;
  const frame=ok(source).frame,glyph=frame.pictorialGlyphs[0]!;
  assert.deepEqual(glyph.id,{kind:'grouped',categoryId:category,seriesId:series});
  assert.strictEqual(frame.series[0]!.pictorialFills[0]!.glyphId,glyph.id);
  assert.strictEqual(frame.observations[0]!.pictorial.glyphId,glyph.id);
  assert.equal(frame.observations[0]!.id.seriesId,series);
});

test('tiny viewport fits geometry without stretching the silhouette or leaking outside logical bounds',()=>{
  const frame=ok(spec(),{width:1,height:1}).frame;
  for(const glyph of frame.pictorialGlyphs){assert.ok(glyph.bounds.x>=0&&glyph.bounds.y>=0);assert.ok(glyph.bounds.x+glyph.bounds.width<=1+1e-12);assert.ok(glyph.bounds.y+glyph.bounds.height<=1+1e-12);assert.ok(Math.abs(glyph.bounds.width/glyph.bounds.height-.56)<1e-12);}
});

test('no data is silently dropped above explicit source budgets',()=>{
  const source=spec([Array.from({length:33},()=>1)]);source.axes.x.values=Array.from({length:33},(_,i)=>({id:'c'+i,label:''}));source.series[0]!.data.forEach((p,i)=>p.x='c'+i);invalid(source);
  const tooMany=spec(Array.from({length:9},()=>[1]!));invalid(tooMany);
});
