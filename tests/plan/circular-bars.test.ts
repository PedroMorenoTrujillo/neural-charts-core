import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanWindRoseSpec,PlanRadialBarSpec,PlanFrame,PlanOptions,PlanSpec} from '../../src/plan.js';
const size={width:390,height:300};
const wind:PlanWindRoseSpec={family:'windrose',title:'Frequency',axes:{x:{type:'category',values:[{id:'n',label:'North'},{id:'s',label:'South'}]},y:{type:'linear',nice:false,title:'hours'}},series:[{id:'slow',name:'Slow',data:[{id:'slow-n',x:'n',y:2},{id:'slow-s',x:'s',y:4}]},{id:'fast',name:'Fast',data:[{id:'fast-n',x:'n',y:6},{id:'fast-s',x:'s',y:4}]}]};
const radial:PlanRadialBarSpec={family:'radialbar',title:'Progress',unit:'%',domain:[0,100],data:[{id:'a',label:'First',value:100},{id:'b',label:'Second',value:50},{id:'zero',label:'Zero',value:0},{id:'unknown',label:'Unknown',value:null}]};
function frame(spec:PlanSpec,options:PlanOptions=size):PlanFrame{const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanSpec,options as PlanOptions).status).toBe('invalid');

test('retains the maximum supported wind-rose grid without losing source identity',()=>{
  const values=Array.from({length:32},(_,i)=>({id:'direction-'+i}));
  const series=Array.from({length:16},(_,i)=>({id:'source-'+i,name:'Source '+i,data:values.map(({id})=>({id,x:id,y:1}))}));
  const result=frame({...wind,axes:{...wind.axes,x:{type:'category',values}},series});
  expect(result.observations).toHaveLength(512);
  expect(new Set(result.observations.map(o=>JSON.stringify(o.id))).size).toBe(512);
});

test('draws large radial arcs in both directions and enforces percentage-domain units',()=>{
  const chart=frame({...radial,data:[{id:'above-half',label:'Three quarters',value:75}]});
  const arcs=chart.series[0]?.commands?.filter(command=>command.type==='A');
  expect(arcs?.map(command=>[command.largeArc,command.sweep])).toEqual([[1,1],[1,0]]);
  expect(chart.observations[0]).toMatchObject({value:75,id:{pointId:'above-half'}});
  const percent={...wind,stacking:'percent' as const,axes:{...wind.axes,y:{...wind.axes.y,domain:[0,100] as const}}};
  expect(frame(percent).observations.map(point=>point.value)).toEqual([2,4,6,4]);
  expect(planChart({...percent,axes:{...percent.axes,y:{...percent.axes.y,domain:[0,120]}}},size)).toMatchObject({
    status:'invalid',diagnostic:{reason:'RADIAL_DOMAIN_EXCLUDES_STACK',path:'axes.y.domain'},
  });
});

test('keeps radial titles and units with automatic scale on empty measurements',()=>{
  const empty=frame({family:'radialbar',title:'Progress',description:'Original records',data:[{id:'unreported',label:'Unreported',value:null}]});
  expect(empty).toMatchObject({description:'Original records',unit:'',observations:[]});
  expect(empty.legend).toMatchObject([{id:'unreported',name:'Unreported',visible:true}]);
  const neutral=frame({...wind,description:'Unmeasured frequency',axes:{...wind.axes,y:{type:'linear'}},
    series:wind.series.map(s=>({...s,data:s.data.map(p=>({...p,y:0}))}))});
  expect(neutral).toMatchObject({description:'Unmeasured frequency',unit:''});
  expect(neutral.observations.map(p=>p.value)).toEqual([0,0,0,0]);
});

test('diagnoses category, frequency and observation budgets at the original radial input', () => {
  const assertInvalid = (spec: unknown, reason: string, path: string) => {
    expect(planChart(spec as PlanSpec, size)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
  };
  const manySeries = Array.from({length: 17}, (_, i) => ({...wind.series[0], id: String(i)}));
  assertInvalid({...wind, series: manySeries}, 'WIND_ROSE_SERIES_LIMIT', 'series');
  assertInvalid({...wind, axes: {...wind.axes, x: {...wind.axes.x, values: [{id: 'n'}]}},
    series: wind.series.map(series => ({...series, data: series.data.slice(0, 1)}))}, 'WIND_ROSE_CATEGORY_LIMIT', 'axes.x');
  assertInvalid({...wind, axes: {...wind.axes, y: {...wind.axes.y, reversed: true}}}, 'UNKNOWN_RADIAL_AXIS_OPTION', 'axes');
  assertInvalid({...wind, series: wind.series.map(series => ({...series, markers: 'on'}))}, 'BAD_WIND_ROSE_SERIES', 'series');
  assertInvalid({...wind, series: wind.series.map(series => ({...series,
    data: series.data.map(point => ({...point, y: Number.MAX_VALUE})),
  }))}, 'UNREPRESENTABLE_STACK', 'series');
  assertInvalid({...radial, data: Array.from({length: 17}, (_, i) => ({id: String(i), label: String(i), value: 5}))},
    'RADIAL_BAR_INPUT_LIMIT', 'data');
});

test('wind rose keeps every original value and identity in real adjacent annular stacks',()=>{
  const f=frame(wind),north=f.observations.filter(p=>p.label==='North');expect(f.family).toBe('windrose');expect(north.map(p=>[p.id.pointId,p.value])).toEqual([['slow-n',2],['fast-n',6]]);
  const [a,b]=north;if(a?.hit?.type!=='sector'||b?.hit?.type!=='sector')throw Error('Missing sectors');expect(a.hit.innerRadius).toBe(0);expect(a.hit.radius).toBeCloseTo(b.hit.innerRadius);expect(b.hit.radius/a.hit.radius).toBeCloseTo(4);expect(a.hit.start).toBe(b.hit.start);expect(a.hit.end).toBe(b.hit.end);expect(a.percentage).toBe(25);expect(b.percentage).toBe(75);expect(f.polarGrid?.spokes.map(p=>p.label)).toEqual(['North','South']);
});
test('percent stacking normalizes the entire direction and keeps raw tooltip measurements',()=>{
  const f=frame({...wind,stacking:'percent'});expect(f.observations.map(p=>p.value)).toEqual([2,4,6,4]);expect(f.observations.map(p=>p.percentage)).toEqual([25,50,75,50]);const a=f.observations[0]!,b=f.observations[2]!;if(a.hit?.type!=='sector'||b.hit?.type!=='sector')throw Error('Missing sectors');expect(b.hit.radius/a.hit.radius).toBeCloseTo(4);
});
test('null does not silently become zero or an invented percentage',()=>{
  const source={...wind,series:wind.series.map((s,i)=>i?{...s,data:s.data.map((p,j)=>j?p:{...p,y:null})}:s)};
  const f=frame(source);expect(f.observations.find(p=>p.id.pointId==='fast-n')).toBeUndefined();expect(f.observations.find(p=>p.id.pointId==='slow-n')).toMatchObject({value:2,incomplete:true});expect(f.observations.find(p=>p.id.pointId==='slow-n')?.percentage).toBeUndefined();invalid({...source,stacking:'percent'});
});
test('legend removal replans the actual stack and retains source series identities',()=>{
  const f=frame(wind,{...size,hiddenSeriesIds:['slow']});expect(f.legend.map(p=>[p.id,p.visible])).toEqual([['slow',false],['fast',true]]);expect(f.observations.map(p=>p.id.pointId)).toEqual(['fast-n','fast-s']);for(const p of f.observations){expect(p.hit?.type).toBe('sector');if(p.hit?.type==='sector')expect(p.hit.innerRadius).toBe(0);}expect(frame(wind,{...size,hiddenSeriesIds:['slow','fast']}).observations).toEqual([]);
});
test('a true zero remains available without a fictitious positive sector',()=>{
  const source={...wind,series:wind.series.map(s=>({...s,data:s.data.map(p=>({...p,y:0}))}))};const f=frame({...source,stacking:'percent'});expect(f.observations).toHaveLength(4);for(const p of f.observations){expect(p.value).toBe(0);expect(p.percentage).toBeUndefined();expect(p.hit).toBeUndefined();}expect(f.series.every(s=>s.commands?.length===0)).toBe(true);
});
test('radial bars use the same angle scale, real ring holes and two arcs for a full turn',()=>{
  const f=frame(radial);expect(f.observations.map(p=>[p.id.pointId,p.value])).toEqual([['a',100],['b',50],['zero',0]]);const [a,b,z]=f.observations;if(a?.hit?.type!=='sector'||b?.hit?.type!=='sector')throw Error('Missing ring sectors');expect(a.hit.end).toBeCloseTo(2*Math.PI);expect(b.hit.end).toBeCloseTo(Math.PI);expect(a.hit.innerRadius).toBeGreaterThan(b.hit.radius);expect(f.series[0]?.commands?.filter(c=>c.type==='A')).toHaveLength(4);expect(z?.hit).toBeUndefined();expect(f.unit).toBe('%');
});
test('radial legend preserves physical band ownership instead of shifting remaining items',()=>{
  const a=frame(radial),b=frame(radial,{...size,hiddenSeriesIds:['a']});expect(b.observations.find(p=>p.id.pointId==='b')?.hit).toEqual(a.observations.find(p=>p.id.pointId==='b')?.hit);expect(b.legend.find(p=>p.id==='a')?.visible).toBe(false);
  const {domain:_,...automatic}=radial;expect(frame(automatic,{...size,hiddenSeriesIds:['a']}).observations.find(p=>p.id.pointId==='b')?.hit).toEqual(frame(automatic).observations.find(p=>p.id.pointId==='b')?.hit);
});
test.each([64,320,768,1200])('both layouts stay finite inside a %s logical-point viewport',width=>{
  for(const spec of [wind,radial]){const f=frame(spec,{width,height:300});for(const p of f.observations){expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(width);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThanOrEqual(300);}}
});
test('bounded 512-observation wind input remains exact and deterministic',()=>{
  const categories=Array.from({length:32},(_,i)=>({id:String(i)})),series=Array.from({length:16},(_,i)=>({id:'s'+i,name:'Series '+i,data:categories.map(c=>({id:'s'+i+'/'+c.id,x:c.id,y:i+1}))}));const spec={...wind,axes:{...wind.axes,x:{type:'category' as const,values:categories}},series};const f=frame(spec);expect(f.observations).toHaveLength(512);expect(new Set(f.observations.map(p=>p.id.seriesId+'/'+p.id.pointId)).size).toBe(512);expect(frame(spec)).toEqual(f);expect(Object.isFrozen(f)).toBe(true);
});
test.each([
  {...wind,gapRatio:-.1},{...wind,gapRatio:NaN},{...wind,gapRatio:.51},{...wind,stacking:'grouped'},
  {...wind,axes:{...wind.axes,y:{type:'linear',domain:[0,2]}}},
  {...wind,series:[{...wind.series[0],data:[{id:'bad',x:'n',y:-1}]}]},
  {...wind,series:[{...wind.series[0],data:[{id:'a',x:'n',y:1},{id:'b',x:'n',y:2}]}]},
  {...wind,axes:{...wind.axes,x:{type:'category',values:[{id:'n'}]}}},
  {...radial,domain:[1,100]},{...radial,domain:[0,20]},{...radial,innerRadiusRatio:1},{...radial,unit:3},
  {...radial,data:[{id:'a',label:'A',value:-1}]},{...radial,gapRatio:Infinity},
])('rejects incompatible or unrepresentable data %#',source=>invalid(source));
test.each([wind,radial])('rejects unsupported viewport, references, stacking, hidden identity and unknown options',source=>{
  invalid(source,{...size,viewport:{mode:'x'}});invalid(source,{...size,references:[]});invalid(source,{...size,stacking:'sum'});invalid(source,{...size,hiddenSeriesIds:['not-source']});invalid({...source,extra:true});
});
