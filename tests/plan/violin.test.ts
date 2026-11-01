import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanViolinSpec,PlanSpec,PlanOptions} from '../../src/plan.js';
const size={width:390,height:300};
const source:PlanViolinSpec={family:'violin',title:'Measured distributions',axes:{y:{kind:'linear',unit:'ms'}},groups:[{id:'a',label:'A',samples:[-2,0,2,4,6].map((value,i)=>({id:'a'+i,value}))},{id:'b',label:'B',samples:[0,1,1,2,3,9].map((value,i)=>({id:'b'+i,value}))}]};
function frame(spec=source,options:PlanOptions=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanSpec,options as PlanOptions).status).toBe('invalid');
test('summaries distinguish original samples from derived density and preserve signed values',()=>{
  const f=frame();expect(f.family).toBe('violin');expect(f.unit).toBe('ms');expect(f.observations.map(p=>p.value)).toEqual([2,1.5]);expect(f.observations[0]?.violin).toMatchObject({derived:true,sampleCount:5,missingCount:0,minimum:-2,q1:0,median:2,q3:4,maximum:6,mean:2});expect(f.observations.every(p=>p.id.pointId==='summary'&&p.hit?.kind==='polygon')).toBe(true);expect(f.series.every(s=>s.areaCommands?.length&&s.circles?.length===1)).toBe(true);expect(f.violin?.kernel).toBe('epanechnikov');
});
test('the compact density integrates to one, has exact zero support endpoints and never creates input observations',()=>{
  const f=frame({...source,resolution:128,bandwidth:2}),groups=f.violin!.groups;
  for(const group of groups){const d=group.density;let area=0;for(let i=1;i<d.length;i++)area+=(d[i]!.value-d[i-1]!.value)*(d[i]!.density+d[i-1]!.density)/2;expect(area).toBeCloseTo(1,2);expect(d[0]?.density).toBe(0);expect(d.at(-1)?.density).toBe(0);expect(d.every(p=>p.density>=0&&Number.isFinite(p.density))).toBe(true)}expect(f.observations).toHaveLength(2);expect(f.observations[0]?.hit?.kind==='polygon'&&f.observations[0].hit.vertices.length).toBe(256);
});
test('an explicitly selected bandwidth gives the expected single-sample kernel without fabricating source spread',()=>{
  const f=frame({...source,groups:[{id:'one',label:'One sample',samples:[{id:'actual',value:0}]}],bandwidth:2});expect(f.observations[0]?.violin).toMatchObject({minimum:0,maximum:0,median:0,bandwidth:2,sampleCount:1});const density=f.violin!.groups[0]!.density;expect(density.find(p=>p.value===0)?.density).toBeCloseTo(.375);expect(density[0]?.value).toBe(-2);expect(density.at(-1)?.value).toBe(2);
});
test('constant groups without a requested bandwidth remain zero-spread summaries, not invented bell curves',()=>{
  const f=frame({...source,groups:[{id:'zero',label:'Zero',samples:[{id:'z',value:0},{id:'z2',value:0}]}]});expect(f.violin?.groups[0]?.density).toEqual([]);expect(f.observations[0]?.value).toBe(0);expect(f.observations[0]?.violin?.bandwidth).toBeNull();expect(f.series[0]?.areaCommands).toEqual([]);expect(f.series[0]?.circles).toHaveLength(1);
});
test('null and absent measurements remain unknown, including groups with no known values',()=>{
  const r=planChart({...source,groups:[{id:'missing',label:'Unknown',samples:[{id:'m',value:null}]},{id:'empty',label:'Empty',samples:[]}]},size);expect(r.status).toBe('empty');if(r.status==='invalid')throw Error('Invalid empty state');expect(r.frame.observations).toEqual([]);expect(r.frame.violin?.groups.map(g=>[g.sampleCount,g.missingCount,g.summary])).toEqual([[0,1,undefined],[0,0,undefined]]);const f=frame({...source,groups:[{id:'partial',label:'Partial',samples:[{id:'m',value:null},{id:'z',value:0}]}]});expect(f.observations[0]?.violin).toMatchObject({sampleCount:1,missingCount:1,median:0});
});
test.each(['width','area','count'] as const)('%s normalisation has explicit width/area/count semantics and stable geometry on legend hiding',normalization=>{
  const samples=[-1,0,1],spec:PlanViolinSpec={...source,bandwidth:1,normalization,groups:[{id:'small',label:'Small',samples:samples.map((value,i)=>({id:String(i),value}))},{id:'large',label:'Large',samples:[...samples,...samples].map((value,i)=>({id:String(i),value}))}]};const f=frame(spec),widths=f.observations.map(p=>{const h=p.hit;if(h?.kind!=='polygon')throw Error('No polygon');return Math.max(...h.vertices.map(v=>v.x))-Math.min(...h.vertices.map(v=>v.x))});expect(widths[1]!/widths[0]!).toBeCloseTo(normalization==='count'?2:1);const hidden=frame(spec,{...size,hiddenSeriesIds:['large']});expect(hidden.observations[0]).toEqual(f.observations[0]);expect(hidden.grid).toEqual(f.grid);expect(hidden.labels).toEqual(f.labels);expect(hidden.legend.find(l=>l.id==='large')?.visible).toBe(false);
});
test('reversed numeric axes preserve source summaries while changing projected Y direction',()=>{
  const a=frame(),b=frame({...source,axes:{y:{kind:'linear',unit:'ms',reversed:true}}});expect(b.observations[0]?.violin).toEqual(a.observations[0]?.violin);expect(b.observations[0]?.y).not.toBe(a.observations[0]?.y);expect(b.violin).toEqual(a.violin);
});
test('4096 original samples across16 groups are bounded, deterministic and independent of caller mutation',()=>{
  const spec:PlanViolinSpec={...source,resolution:128,groups:Array.from({length:16},(_,i)=>({id:'group'+i,label:'Group '+i,samples:Array.from({length:256},(_,j)=>({id:String(j),value:i+j%11}))}))};const before=JSON.stringify(spec);for(const width of [64,320,768]){const f=frame(spec,{width,height:300});expect(f.observations).toHaveLength(16);expect(f).toEqual(frame(spec,{width,height:300}));expect(f.violin?.groups.every(g=>g.density.length===129&&Object.isFrozen(g.summary))).toBe(true);expect(f.observations.every(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=300)).toBe(true);for(const p of f.observations)if(p.hit?.kind==='polygon')expect(p.hit.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=width&&v.y>=0&&v.y<=300)).toBe(true)}expect(JSON.stringify(spec)).toBe(before);
});
test.each([
  {...source,axes:null},{...source,axes:{y:{kind:'logarithmic'}}},
  {...source,axes:{y:{kind:'linear',domain:[0,1]}}},{...source,axes:{y:{kind:'linear',domain:null}}},
  {...source,normalization:null},{...source,resolution:null},{...source,resolution:129},{...source,gapRatio:null},
  {...source,bandwidth:0},{...source,bandwidth:NaN},{...source,bandwidth:Number.MIN_VALUE},
  {...source,groups:[source.groups[0],source.groups[0]]},
  {...source,groups:[{id:'a',label:'A',samples:[{id:'p',value:1},{id:'p',value:2}]}]},
  {...source,groups:[{id:'a',label:'A',samples:[{id:'p',value:Infinity}]}]},
  {...source,groups:[{id:'a',label:'A',samples:[{id:'p',value:0,color:'#000000'}]}]},
])('rejects unsupported, ambiguous or unrepresentable density input %#',spec=>invalid(spec));
test('enforces unknown IDs, work limits and unsupported global features instead of silently accepting them',()=>{
  invalid({...source,extra:true});invalid(source,{...size,hiddenSeriesIds:['unknown']});invalid(source,{...size,viewport:{axes:'y'}});invalid(source,{...size,references:[]});invalid(source,{...size,stacking:'sum'});invalid({...source,groups:Array.from({length:17},(_,i)=>({...source.groups[0]!,id:String(i)}))});invalid({...source,groups:[{id:'a',label:'A',samples:Array.from({length:4097},(_,i)=>({id:String(i),value:i}))}]});
});
