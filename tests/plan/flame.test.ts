import {expect,test} from 'vitest';
import {planChart,transformPlanViewport} from '../../src/plan.js';
import type {PlanFlameSpec,PlanSpec,PlanOptions} from '../../src/plan.js';
const size={width:390,height:300};
const source:PlanFlameSpec={family:'flame',title:'Call trace',axes:{x:{kind:'linear',unit:'ms',nice:false}},data:[{id:'main',label:'Main',start:0,end:100},{id:'load',label:'Load',parentId:'main',start:10,end:50},{id:'parse',label:'Parse',parentId:'load',start:20,end:40},{id:'paint',label:'Paint',parentId:'main',start:60,end:90}]};
function frame(spec=source,options:PlanOptions=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanSpec,options as PlanOptions).status).toBe('invalid');
test('uses original temporal intervals and computes exclusive duration without accumulating bars',()=>{
  const f=frame();expect(f.family).toBe('flame');expect(f.flame).toEqual({maxDepth:2,nodeCount:4,rootCount:1});expect(f.legend).toEqual([]);expect(f.observations.map(p=>[p.id.pointId,p.interval?.start,p.interval?.end,p.value,p.flame?.selfDuration])).toEqual([['main',0,100,100,30],['load',10,50,40,20],['parse',20,40,20,20],['paint',60,90,30,30]]);expect(f.observations.map(p=>p.flame?.depth)).toEqual([0,1,2,1]);expect(f.observations.every(p=>p.group===undefined)).toBe(true);expect(f.yLabels?.map(p=>p.label)).toEqual(['0','1','2']);
});
test('input order can reference a later parent while preserving original navigation IDs',()=>{
  const data=[...source.data].reverse(),f=frame({...source,data});expect(f.observations.map(p=>p.id.pointId)).toEqual(data.map(p=>p.id));expect(f.observations.map(p=>p.flame?.depth)).toEqual([1,2,1,0]);
});
test('touching siblings, zero events and multiple disjoint roots do not invent overlap or duration',()=>{
  const f=frame({...source,data:[{id:'r',label:'Root',start:-10,end:10},{id:'a',label:'A',parentId:'r',start:-10,end:0},{id:'b',label:'B',parentId:'r',start:0,end:10},{id:'zero',label:'Zero',parentId:'r',start:0,end:0},{id:'second',label:'Second root',start:20,end:30}]});expect(f.flame?.rootCount).toBe(2);expect(f.observations[0]?.flame?.selfDuration).toBe(0);expect(f.observations.find(p=>p.id.pointId==='zero')?.value).toBe(0);expect(f.series[0]?.circles).toHaveLength(1);expect(f.series[0]?.bars).toHaveLength(4);
});
test('UTC trace durations and source endpoints remain unmodified under X viewport transforms',()=>{
  const offset=Date.UTC(2026,0,1),spec:PlanFlameSpec={...source,axes:{x:{kind:'time',nice:false}},data:source.data.map(s=>({...s,start:offset+s.start*1000,end:offset+s.end*1000}))};const a=frame(spec,{...size,viewport:{axes:'x'}}),view=transformPlanViewport(a.viewport!,{kind:'zoom',factor:2});if(view.status==='invalid')throw Error(JSON.stringify(view));const b=frame(spec,{...size,viewport:{axes:'x',value:view.value}});expect(b.viewport?.axes).toBe('x');expect(b.unit).toBe('ms');expect(b.observations.find(p=>p.id.pointId==='load')).toMatchObject({value:40000,interval:{start:offset+10000,end:offset+50000}});expect(b.intervals).toEqual(a.intervals);
});
test('empty traces remain explicitly empty and never create an artificial call',()=>{
  const r=planChart({...source,data:[]},size);expect(r.status).toBe('empty');if(r.status==='invalid')throw Error('Unexpected invalid');expect(r.frame.observations).toEqual([]);expect(r.frame.flame).toEqual({maxDepth:0,nodeCount:0,rootCount:0});
});
test('2048 spans have bounded deterministic geometry at phone and tablet sizes',()=>{
  const spec={...source,data:Array.from({length:2048},(_,i)=>({id:String(i),label:'Function '+i,start:i*2,end:i*2+1}))};for(const width of [64,320,768]){const f=frame(spec,{width,height:300});expect(f.observations).toHaveLength(2048);expect(f).toEqual(frame(spec,{width,height:300}));expect(Object.isFrozen(f.observations[0]?.flame)).toBe(true);expect(f.observations.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=width)).toBe(true);}
});
test.each([
  {...source,data:[...source.data,source.data[0]]},
  {...source,data:[{id:'a',label:'A',parentId:'missing',start:0,end:1}]},
  {...source,data:[{id:'a',label:'A',parentId:'b',start:0,end:1},{id:'b',label:'B',parentId:'a',start:0,end:1}]},
  {...source,data:[{id:'r',label:'R',start:1,end:2},{id:'a',label:'A',parentId:'r',start:0,end:1}]},
  {...source,data:[{id:'a',label:'A',start:0,end:2},{id:'b',label:'B',start:1,end:3}]},
  {...source,data:[{id:'r',label:'R',start:0,end:4},{id:'a',label:'A',parentId:'r',start:0,end:2},{id:'b',label:'B',parentId:'r',start:1,end:3}]},
  {...source,data:[{id:'a',label:'A',start:2,end:1}]},
  {...source,data:[{id:'a',label:'A',start:null,end:1}]},
  {...source,data:[{id:'a',label:'A',start:0,end:Infinity}]},
  {...source,data:[{id:'a',label:'A',start:0,end:1,value:1}]},
  {...source,data:Array.from({length:33},(_,i)=>({id:String(i),label:String(i),start:0,end:1,...(i?{parentId:String(i-1)}:{})}))},
])('rejects invalid or ambiguous single-thread traces %#',spec=>invalid(spec));
test('rejects unsupported stacks/visibility, excessive source and unknown public fields',()=>{
  invalid(source,{...size,stacking:'sum'});invalid(source,{...size,hiddenSeriesIds:['profile']});invalid({...source,unknown:true});invalid({...source,axes:{...source.axes,y:{kind:'linear'}}});invalid({...source,data:Array.from({length:2049},(_,i)=>({id:String(i),label:String(i),start:i,end:i+1}))});
});
