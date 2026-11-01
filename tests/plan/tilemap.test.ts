import {expect,it} from 'vitest';
import {planChart,type PlanTilemapSpec,type PlanTilemapOptions,type PlanColorAxisSpec} from '../../src/plan.js';
const size={width:390,height:320};
const source=(values:readonly(number|null)[]=[0,10,null]):PlanTilemapSpec=>({family:'tilemap',title:'Source cells',series:[{id:'source',name:'One real series',data:values.map((value,i)=>({id:'p'+i,x:i,y:0,value}))}]});
function ok(spec:unknown,options:unknown=size){const result=planChart(spec as PlanTilemapSpec,options as PlanTilemapOptions);if(result.status==='invalid')throw Error(JSON.stringify(result));return result;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanTilemapSpec,options as PlanTilemapOptions).status).toBe('invalid');
const classes:PlanColorAxisSpec={kind:'classes',missingColor:'#EEEEEE',unclassifiedColor:'#999999',classes:[{id:'negative',label:'Negative',maxExclusive:0,color:'#2244CC'},{id:'positive',label:'Ten or more',minInclusive:10,color:'#CC4422'}]};

it('four real cell geometries remain on the single original series with correct numeric identities',()=>{
  for(const shape of ['hexagon','circle','diamond','square'] as const){
    const result=ok({...source(),tileShape:shape}),frame=result.frame;
    expect(frame.series).toHaveLength(1);expect(frame.series[0]!.id).toBe('source');expect(frame.series[0]!.cells).toHaveLength(3);
    expect(frame.observations.map(o=>o.value)).toEqual([0,10]);expect(frame.observations.map(o=>o.id.pointId)).toEqual(['p0','p1']);
    expect(frame.series[0]!.cells![2]!.pointId).toBe('p2');expect(frame.tilemapData![2]!.value).toBeNull();
    const geometry=frame.series[0]!.cells![0]!.geometry;
    if(shape==='circle'){expect(geometry.kind).toBe('circle');if(geometry.kind==='circle')expect(geometry.radius).toBeGreaterThan(0);}
    else{expect(geometry.kind).toBe('polygon');if(geometry.kind==='polygon')expect(geometry.vertices).toHaveLength(shape==='hexagon'?6:4);}
    expect(frame.observations[0]!.hit).toBe(geometry);expect(frame.observations[0]!.tilemap?.sourceX).toBe(0);
  }
});

it('all-missing cells paint honestly without numeric observations or fake zero hits',()=>{
  const result=ok(source([null,null]));expect(result.status).toBe('empty');expect(result.frame.tilemapLayout?.status).toBe('allMissing');
  expect(result.frame.series[0]!.cells).toHaveLength(2);expect(result.frame.observations).toHaveLength(0);
  expect(result.frame.tilemapData!.every(p=>p.value===null&&!p.observed&&p.geometryDecision==='painted'&&p.color.kind==='missing')).toBe(true);
  expect(result.frame.colorAxis).toMatchObject({kind:'continuous',domain:null,domainSource:'none'});
  const zero=ok(source([0,0]));expect(zero.status).toBe('ok');expect(zero.frame.observations.map(o=>o.value)).toEqual([0,0]);
  expect(zero.frame.colorAxis).toMatchObject({kind:'continuous',domain:[0,0],domainSource:'source'});
  expect(zero.frame.tilemapData![0]!.color).toMatchObject({kind:'continuous',value:0,ratio:.5});
});

it('unclassified numeric cells retain exact observations, distinct from missing values',()=>{
  const result=ok({...source([null,0,5,10]),colorAxis:classes});
  expect(result.frame.observations.map(o=>o.value)).toEqual([0,5,10]);
  expect(result.frame.observations[0]!.tilemap?.color).toMatchObject({kind:'unclassified',value:0,color:'#999999'});
  expect(result.frame.tilemapData![0]!.color.kind).toBe('missing');expect(result.frame.colorAxis).toMatchObject({kind:'classes',classes:classes.classes.map(c=>({...c,color:c.color.toLowerCase()}))});
  expect(result.frame.colorAxis?.kind==='classes'&&result.frame.colorAxis.classes).toHaveLength(2);
});

it('original color domain is independent of legend visibility and restore reproduces the same frame',()=>{
  const input=source([-10,null,50]),first=ok(input),hidden=ok(input,{...size,hiddenSeriesIds:['source']});
  expect(first.frame.colorAxis).toMatchObject({kind:'continuous',domain:[-10,50]});
  expect(hidden.frame.colorAxis).toEqual(first.frame.colorAxis);expect(hidden.frame.tilemapData!.map(p=>p.color)).toEqual(first.frame.tilemapData!.map(p=>p.color));
  expect(hidden.frame.series).toHaveLength(0);expect(hidden.frame.observations).toHaveLength(0);expect(hidden.frame.tilemapLayout?.status).toBe('allHidden');
  expect(ok(input,{...size,hiddenSeriesIds:[]})).toEqual(first);
  invalid(input,{...size,hiddenSeriesIds:['unknown']});invalid(input,{...size,hiddenSeriesIds:['source','source']});
});

it('validates original duplicate/null coordinates, IDs, span and integer coordinates before hiding',()=>{
  const base=source();
  for(const data of [[{id:'a',x:0,y:0,value:null},{id:'b',x:0,y:0,value:1}],[{id:'a',x:0,y:0,value:1},{id:'a',x:1,y:0,value:2}],[{id:'a',x:0,y:0,value:1},{id:'b',x:4097,y:0,value:2}],[{id:'a',x:.5,y:0,value:1}]])invalid({...base,series:[{...base.series[0],data}]},{...size,hiddenSeriesIds:['source']});
});

it('noSource, allMissing, allHidden, noInk and ready are distinct source/layout decisions',()=>{
  expect(ok(source([])).frame.tilemapLayout?.status).toBe('noSource');
  expect(ok(source([null])).frame.tilemapLayout?.status).toBe('allMissing');
  expect(ok(source([1]),{...size,hiddenSeriesIds:['source']}).frame.tilemapLayout?.status).toBe('allHidden');
  const noInk=ok({...source([1]),pointPadding:32},{width:64,height:64});expect(noInk.frame.tilemapLayout?.status).toBe('noInk');expect(noInk.frame.tilemapData![0]).toMatchObject({value:1,geometryDecision:'noInk',observed:false});
  expect(ok(source([1])).frame.tilemapLayout?.status).toBe('ready');
});

it('explicit color clipping changes only color and records the decision, preserving original extremes',()=>{
  const scale:PlanColorAxisSpec={kind:'continuous',domain:[0,10],stops:[{at:0,color:'#000000'},{at:1,color:'#FFFFFF'}],missingColor:'#EEEEEE'};
  const result=ok({...source([-200,0,200]),colorAxis:scale});expect(result.frame.observations.map(o=>o.value)).toEqual([-200,0,200]);
  expect(result.frame.tilemapData![0]!.color).toMatchObject({value:-200,ratio:0,clamped:true});expect(result.frame.tilemapData![2]!.color).toMatchObject({value:200,ratio:1,clamped:true});
  const extremes=ok(source([-Number.MAX_VALUE,0,Number.MAX_VALUE]));expect(extremes.frame.tilemapData!.map(p=>p.color.kind==='continuous'?p.color.ratio:null)).toEqual([0,.5,1]);
});

it('public inputs and results are independently owned and source/config/option getters never execute',()=>{
  let calls=0;const input=source();Object.defineProperty(input,'colorAxis',{enumerable:true,get(){calls++;return{};}});invalid(input);expect(calls).toBe(0);
  const opts={...size};Object.defineProperty(opts,'hiddenSeriesIds',{enumerable:true,get(){calls++;return[];}});invalid(source(),opts);expect(calls).toBe(0);
  const mutable={...source(),series:[{id:'source',name:'Original',data:[{id:'p',x:0,y:0,value:3}]}]},result=ok(mutable),snapshot=JSON.stringify(result);
  mutable.series[0]!.data[0]!.value=999;mutable.series[0]!.name='Changed';expect(JSON.stringify(result)).toBe(snapshot);
  expect(Object.isFrozen(result.frame.series[0]!.cells![0]!.geometry)).toBe(true);expect(Object.isFrozen(result.frame.colorAxis)).toBe(true);
});

it('rejects axes, stack, zoom, references and contradictory color-axis properties',()=>{
  invalid({...source(),axes:{}});for(const opts of [{...size,stacking:'sum'},{...size,viewport:{axes:'x'}},{...size,references:[]},{...size,wordcloudText:{fontKey:'x',measurements:[]}}])invalid(source(),opts);
  for(const colorAxis of [null,{kind:'continuous',stops:[],missingColor:'#EEEEEE'},{kind:'continuous',stops:[{at:0,color:'#000000'},{at:1,color:'#FFFFFF'}],missingColor:'#EEEEEE',classes:[]},{...classes,domain:[0,1]},{...classes,classes:[{id:'a',label:'A',maxExclusive:20,color:'#000000'},{id:'b',label:'B',minInclusive:10,color:'#FFFFFF'}]}])invalid({...source(),colorAxis},{...size,hiddenSeriesIds:['source']});
});

it('2048 cells stay on one real series while 2049 rejects without silent sampling',()=>{
  const values=Array.from({length:2048},(_,i)=>({id:'p'+i,x:i%64,y:Math.floor(i/64),value:i%17===0?null:i-500})),input={...source(),pointPadding:0,series:[{id:'source',name:'Large source',data:values}]};
  const result=ok(input);expect(result.frame.series).toHaveLength(1);expect(result.frame.series[0]!.cells).toHaveLength(2048);expect(result.frame.tilemapData).toHaveLength(2048);
  expect(result.frame.observations).toHaveLength(values.filter(p=>p.value!==null).length);
  values.push({id:'extra',x:65,y:40,value:9});invalid(input);
});

it('source reorder preserves geometry by original ID and raw coordinate parity',()=>{
  const input={...source(),series:[{id:'__proto__',name:'Opaque identities',data:[{id:'constructor',x:-3,y:1,value:0},{id:'\ud800|"',x:4,y:-2,value:7}]}]},first=ok(input);
  input.series[0]!.data.reverse();const second=ok(input);
  const byId=(frame:typeof first.frame)=>new Map(frame.series[0]!.cells!.map(c=>[c.pointId,c.geometry]));
  expect(byId(second.frame)).toEqual(byId(first.frame));expect(first.frame.tilemapData![0]!.x).toBe(-3);
});

it('opacity is explicit per cell; zero opacity has no invisible numeric touch target',()=>{
  const partial=ok({...source(),opacity:.25});expect(partial.frame.series[0]!.cells!.every(c=>c.opacity===.25)).toBe(true);
  const transparent=ok({...source(),opacity:0});expect(transparent.frame.series[0]!.cells).toHaveLength(0);expect(transparent.frame.observations).toHaveLength(0);expect(transparent.frame.tilemapLayout?.status).toBe('noInk');expect(transparent.frame.tilemapData).toHaveLength(3);
});

it('retains full long names and source IDs for adapters before visual label truncation',()=>{
  const input={...source(),title:'T'.repeat(512),description:'D'.repeat(2048),series:[{id:'s',name:'N'.repeat(256),data:[{id:'p'.repeat(256),name:'P'.repeat(512),x:0,y:0,value:1}]}]},result=ok(input);
  expect(result.frame.title).toHaveLength(512);expect(result.frame.description).toHaveLength(2048);expect(result.frame.observations[0]!.label).toHaveLength(512);expect(result.frame.observations[0]!.id.pointId).toHaveLength(256);expect(result.frame.tilemapData![0]!.name).toHaveLength(512);
});
