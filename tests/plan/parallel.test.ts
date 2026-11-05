import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanParallelSpec,PlanSpec,PlanOptions} from '../../src/plan.js';
const size={width:390,height:300};
const source:PlanParallelSpec={family:'parallel',title:'Independent vehicle measurements',axes:[{id:'mass',label:'Mass',type:'linear',unit:'kg',domain:[1000,2000]},{id:'time',label:'Acceleration',type:'linear',unit:'s',domain:[5,15],reversed:true},{id:'temperature',label:'Temperature',type:'linear',unit:'°C',domain:[-10,30]}],series:[{id:'a',name:'Vehicle A',data:[{id:'mass-a',axisId:'mass',value:1250},{id:'time-a',axisId:'time',value:7.5},{id:'temp-a',axisId:'temperature',value:0}]},{id:'b',name:'Vehicle B',data:[{id:'mass-b',axisId:'mass',value:2000},{id:'time-b',axisId:'time',value:15},{id:'temp-b',axisId:'temperature',value:30}]}]};
function frame(spec=source,options:PlanOptions=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanSpec,options as PlanOptions).status).toBe('invalid');
test('each dimension owns its own scale, unit, source identity and complete original value',()=>{
  const f=frame();expect(f.family).toBe('parallel');expect(f.unit).toBe('');expect(f.parallel?.coordinates).toBe('cartesian');expect(f.parallel?.axes.map(a=>a.domain)).toEqual([[1000,2000],[5,15],[-10,30]]);expect(f.observations.map(p=>p.value)).toEqual([1250,7.5,0,2000,15,30]);expect(f.observations[0]?.parallel).toEqual({axisId:'mass',axisLabel:'Mass',unit:'kg'});expect(f.observations[1]?.parallel?.unit).toBe('s');expect(f.observations[2]?.parallel?.unit).toBe('°C');expect(f.observations[0]?.y).toBeCloseTo(f.observations[2]!.y);expect(f.observations[0]?.y).toBeGreaterThan(f.observations[1]!.y);
  expect(f.observations[0]?.group?.key).not.toBe(f.observations[1]?.group?.key);expect(f.observations[0]?.group?.key).toBe(f.observations[3]?.group?.key);
});
test('reversing one axis preserves every other dimension and every source value',()=>{
  const a=frame(),b=frame({...source,axes:source.axes.map(axis=>axis.id==='time'?{...axis,reversed:false}:axis)});for(const p of a.observations){const q=b.observations.find(q=>q.id.pointId===p.id.pointId)!;expect(q.value).toBe(p.value);if(p.parallel?.axisId!=='time')expect({x:p.x,y:p.y}).toEqual({x:q.x,y:q.y});else expect(q.y).not.toBe(p.y);}
});
test('polar coordinates retain independent dimensions instead of substituting a common radar maximum',()=>{
  const f=frame({...source,coordinates:'polar'}),grid=f.polarGrid!;expect(grid.rings).toEqual([]);expect(grid.spokes).toEqual([]);expect(f.parallel?.coordinates).toBe('polar');expect(f.parallel?.axes).toHaveLength(3);expect(f.observations.map(p=>p.value)).toEqual([1250,7.5,0,2000,15,30]);for(const p of f.observations){expect(Math.hypot(p.x-grid.cx,p.y-grid.cy)).toBeLessThanOrEqual(grid.radius+1e-9);expect(p.hit?.type).toBe('circle');}expect(f.series[0]?.commands?.at(-1)).toMatchObject({type:'L',x:f.observations[0]!.x,y:f.observations[0]!.y});
});
test('null and absent dimensions break lines and never fabricate a bridge or zero',()=>{
  const spec={...source,series:[{...source.series[0]!,data:source.series[0]!.data.map(p=>p.axisId==='time'?{...p,value:null}:p)}]};for(const coordinates of ['cartesian','polar'] as const){const f=frame({...spec,coordinates});expect(f.observations.map(p=>p.id.pointId)).toEqual(['mass-a','temp-a']);const links=f.series[0]?.commands?.filter(c=>c.type==='L')??[];expect(links).toHaveLength(coordinates==='polar'?1:0);expect(f.series[0]?.circles).toHaveLength(2);}const omitted=frame({...spec,series:[{...spec.series[0]!,data:spec.series[0]!.data.filter(p=>p.axisId!=='time')}]});expect(omitted.observations.map(p=>p.value)).toEqual([1250,0]);
});
test('hiding rows preserves source-based domains, geometry and units for every surviving datum',()=>{
  const automatic={...source,axes:source.axes.map(({domain:_,...axis})=>axis)},a=frame(automatic),b=frame(automatic,{...size,hiddenSeriesIds:['b']});expect(b.parallel).toEqual(a.parallel);expect(b.observations).toEqual(a.observations.filter(p=>p.id.seriesId==='a'));expect(b.legend.find(p=>p.id==='b')?.visible).toBe(false);
});
test('empty dimensions have no invented scale and all-zero dimensions retain real observations',()=>{
  const spec={...source,axes:source.axes.map(({domain:_,...a})=>a),series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,value:null}))}))};const empty=frame(spec);expect(empty.observations).toEqual([]);expect(empty.parallel?.axes.every(a=>a.domain===undefined&&a.ticks.length===0&&a.sourceCount===0)).toBe(true);const zero=frame({...spec,series:spec.series.map(s=>({...s,data:s.data.map(p=>({...p,value:0}))}))});expect(zero.observations).toHaveLength(6);expect(zero.observations.every(p=>p.value===0)).toBe(true);expect(zero.parallel?.axes.every(a=>a.domain!==undefined)).toBe(true);
});
test.each(['cartesian','polar'] as const)('%s layout is bounded, deterministic and deeply owned at 256 original points',coordinates=>{
  const axes=Array.from({length:16},(_,i)=>({id:'axis'+i,type:'linear' as const,unit:'unit'+i})),series=Array.from({length:16},(_,i)=>({id:'row'+i,name:'Row '+i,data:axes.map((a,j)=>({id:'row'+i+'/'+a.id,axisId:a.id,value:(i-8)*(j+1)}))}));const spec={...source,axes,series,coordinates};for(const width of [64,320,768]){const f=frame(spec,{width,height:300});expect(f.observations).toHaveLength(256);expect(f).toEqual(frame(spec,{width,height:300}));expect(Object.isFrozen(f.parallel?.axes)).toBe(true);for(const p of f.observations){expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);expect(p.x).toBeGreaterThanOrEqual(-1e-8);expect(p.x).toBeLessThanOrEqual(width+1e-8);expect(p.y).toBeGreaterThanOrEqual(-1e-8);expect(p.y).toBeLessThanOrEqual(300+1e-8);}}
});
test.each([
  {...source,coordinates:'mixed'},{...source,axes:source.axes.slice(0,1)},
  {...source,coordinates:'polar',axes:source.axes.slice(0,2)},
  {...source,axes:[source.axes[0],source.axes[0]]},
  {...source,axes:source.axes.map((a,i)=>i?a:{...a,type:'logarithmic'})},
  {...source,axes:source.axes.map((a,i)=>i?a:{...a,domain:[1400,1900]})},
  {...source,axes:source.axes.map((a,i)=>i?a:{...a,ticks:null})},
  {...source,axes:source.axes.map((a,i)=>i?a:{...a,unit:'x'.repeat(65)})},
  {...source,series:[{...source.series[0],data:[{id:'a',axisId:'mass',value:1500},{id:'b',axisId:'mass',value:1600}]}]},
  {...source,series:[{...source.series[0],data:[{id:'a',axisId:'unknown',value:1}]}]},
  {...source,series:[{...source.series[0],data:[{id:'a',axisId:'mass',value:NaN}]}]},
  {...source,series:[{...source.series[0],data:[{id:'a',axisId:'mass',value:1500,color:'#000000'}]}]},
])('rejects unsupported or inconsistent independent-axis input %#',spec=>invalid(spec));
test('rejects unsupported global options without silently ignoring them',()=>{
  invalid(source,{...size,viewport:{axes:'x'}});invalid(source,{...size,references:[]});invalid(source,{...size,stacking:'sum'});invalid(source,{...size,hiddenSeriesIds:['unknown']});invalid({...source,extra:true});
});
