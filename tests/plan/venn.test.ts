import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanVennSpec} from '../../src/plan.js';
import {vennMembership} from '../../src/plan/venn-math.js';
const size={width:390,height:300};
function source(values:readonly(number|null)[]=[100,80,35]):PlanVennSpec{
  const sets=values.length===7?[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}]:[{id:'a',label:'A'},{id:'b',label:'B'}];
  return {family:'venn',title:'Measured sets',sets,data:values.map((value,index)=>({id:'measure-'+(index+1),sets:sets.filter((_,i)=>((index+1)&(1<<i))!==0).map(s=>s.id),value}))};
}
function frame(spec=source(),options=size){const result=planChart(spec,options);if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));return result.frame;}
test('public dispatch preserves inclusive source values, identities, circles and exact two-set overlap',()=>{
  const spec=source(),f=frame(spec),layout=f.vennLayout!;
  expect(f.family).toBe('venn');expect(layout.status).toBe('exact');expect(layout.maxErrorRatio).toBeLessThan(1e-10);
  expect(f.vennData!.map(row=>({id:row.id.pointId,sets:row.sets,value:row.value}))).toEqual(spec.data.map(row=>({id:row.id,sets:row.sets,value:row.value})));
  const [a,b]=layout.circles;expect(a!.radius*a!.radius/(b!.radius*b!.radius)).toBeCloseTo(100/80,12);
  expect(layout.errors[0]!.expected).toBe(35);expect(layout.errors[0]!.actual).toBeCloseTo(35,9);
  for(const point of f.observations){expect(point.venn?.geometry).toBe('placed');expect(vennMembership(layout.circles,point.x,point.y)).toBe(point.venn!.mask);}
});
test('three-set source reports the actual circular residual without changing counts',()=>{
  const spec=source([100,90,40,80,35,30,15]),f=frame(spec),layout=f.vennLayout!;
  expect(f.observations.map(p=>p.value)).toEqual(spec.data.map(p=>p.value));expect(layout.objectiveEvaluations).toBeLessThanOrEqual(577);
  expect(['exact','approximate']).toContain(layout.status);expect(layout.errors).toHaveLength(4);expect(layout.maxErrorRatio).toBeGreaterThanOrEqual(0);
});
test.each([size,{width:320,height:240},{width:1024,height:600},{width:64,height:64}])('circles and readable label boxes fit %j',viewport=>{
  const f=frame(source([100,90,40,80,35,30,15]),viewport);
  for(const c of f.vennLayout!.circles){expect(c.cx-c.radius).toBeGreaterThanOrEqual(-1e-9);expect(c.cx+c.radius).toBeLessThanOrEqual(viewport.width+1e-9);expect(c.cy-c.radius).toBeGreaterThanOrEqual(-1e-9);expect(c.cy+c.radius).toBeLessThanOrEqual(viewport.height+1e-9);}
  for(const a of f.annotations??[]){expect(a.box!.width).toBeGreaterThan(0);expect(a.x-a.box!.width/2).toBeGreaterThanOrEqual(0);}
});
test('unknown intersection prevents invented areas while retaining known counts',()=>{
  const f=frame(source([100,80,null]));expect(f.vennLayout!.status).toBe('unknown');expect(f.vennLayout!.circles).toEqual([]);
  expect(f.vennData![2]!.value).toBeNull();expect(f.observations.map(p=>p.value)).toEqual([100,80]);expect(f.observations.every(p=>p.venn!.geometry==='omitted')).toBe(true);
});
test('zero is an accessible original value with no invented positive-area glyph',()=>{
  const f=frame(source([0,0,0]));expect(f.vennLayout!.status).toBe('allZero');expect(f.observations.map(p=>p.value)).toEqual([0,0,0]);expect(f.vennLayout!.circles).toEqual([]);
});
test('an empty source is explicitly empty',()=>{
  const result=planChart({family:'venn',title:'Empty',sets:[],data:[]},size);expect(result).toMatchObject({status:'empty',frame:{vennLayout:{status:'noSource'},observations:[]}});
});
test('hiding sets retains original data and recalculates only visible memberships',()=>{
  const spec=source([100,90,40,80,35,30,15]),f=frame(spec,{...size,hiddenSeriesIds:['c']} as typeof size);
  expect(f.vennData).toHaveLength(7);expect(f.observations.map(p=>p.value)).toEqual([100,90,40]);expect(f.vennLayout!.circles.map(c=>c.id)).toEqual(['a','b']);expect(f.legend!.find(s=>s.id==='c')!.visible).toBe(false);
  const all=frame(spec,{...size,hiddenSeriesIds:['a','b','c']} as typeof size);expect(all.vennLayout!.status).toBe('hidden');expect(all.observations).toEqual([]);
});
test('disjoint and contained Euler arrangements remain measured circle layouts',()=>{
  expect(frame(source([100,80,0])).vennLayout!.status).toBe('exact');
  const f=frame(source([100,40,40]));expect(f.vennLayout!.maxErrorRatio).toBeLessThan(1e-10);expect(f.observations.find(p=>p.venn!.mask===2)!.venn!.geometry).toBe('omitted');expect(f.observations.find(p=>p.venn!.mask===3)!.venn!.geometry).toBe('placed');
});
test('unknown hidden relationships do not block visible known sets',()=>{
  const f=frame(source([100,90,40,null,null,null,null]),{...size,hiddenSeriesIds:['c']} as typeof size);expect(f.vennLayout!.status).toBe('exact');expect(f.observations).toHaveLength(3);
});
test('tiny positive values remain original positive values when not representable as ink',()=>{
  const spec=source([1e300,1e-300,0]),f=frame(spec);expect(f.observations.find(p=>p.id.pointId==='measure-2')!.value).toBe(1e-300);expect(f.observations.find(p=>p.id.pointId==='measure-2')!.venn!.geometry).toBe('omitted');
});
test.each([
  {spec:source([100,80,81]),reason:'INTERSECTION_EXCEEDS_PARENT'},
  {spec:source([100,100,80,100,80,80,0]),reason:'NEGATIVE_EXCLUSIVE_MEMBERSHIP'},
  {spec:source([100,100,80,null,80,80,0]),reason:'NEGATIVE_EXCLUSIVE_MEMBERSHIP'},
  {spec:{...source(),data:source().data.slice(0,2)},reason:'EXPLICIT_INTERSECTIONS_REQUIRED'},
  {spec:{...source(),data:[...source().data.slice(0,2),{id:'bad',sets:['a','a'],value:1}]},reason:'INVALID_MEMBERSHIP'},
  {spec:{...source(),data:[...source().data.slice(0,2),{id:'bad',sets:['unknown'],value:1}]},reason:'UNKNOWN_SET_ID'},
])('rejects inconsistent source: $reason',({spec,reason})=>{expect(planChart(spec as PlanVennSpec,size)).toMatchObject({status:'invalid',diagnostic:{reason}});});
test('unsupported viewport/stacking/reference/text ports are rejected, not silently ignored',()=>{
  for(const unsupported of [{viewport:{axes:'xy'}},{stacking:'sum'},{references:[]},{wordcloudText:{fontKey:'other'}}])expect(Reflect.apply(planChart,undefined,[source(),{...size,...unsupported}]).status).toBe('invalid');
});
test('plans own immutable source snapshots without retaining application arrays',()=>{
  const spec=structuredClone(source()),f=frame(spec);(spec.data as {value:number}[])[0]!.value=999;
  expect(f.vennData![0]!.value).toBe(100);expect(Object.isFrozen(f)).toBe(true);expect(Object.isFrozen(f.vennData)).toBe(true);
});
