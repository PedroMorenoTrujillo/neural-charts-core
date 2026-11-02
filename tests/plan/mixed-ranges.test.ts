import {expect,it} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanMixedSpec,PlanMixedRangeSpec,PlanOptions} from '../../src/plan.js';
const data={family:'mixed',title:'Observed interval and measured line',axes:{x:{kind:'category',values:[{id:'a'},{id:'b'},{id:'c'}]},y:{kind:'linear'}},series:[
 {id:'spread',name:'Supplied interval',kind:'arearange',data:[{id:'a',x:'a',low:10,high:30},{id:'b',x:'b',low:20,high:40},{id:'c',x:'c',low:30,high:50}]},
 {id:'measured',name:'Original measurement',kind:'line',data:[{id:'a',x:'a',y:20},{id:'b',x:'b',y:30},{id:'c',x:'c',y:40}]},
]} as const satisfies PlanMixedRangeSpec;
function run(spec:PlanMixedSpec=data,extra:Partial<PlanOptions>={}){const r=planChart(spec,{width:390,height:300,...extra});if(r.status==='invalid')throw Error(JSON.stringify(r));return r;}
it('range and line share actual category coordinates and a single original-value scale',()=>{
 const {frame}=run();expect(frame.family).toBe('mixed');expect(frame.mixedRanges?.mode).toBe('range-line');expect(frame.legend.map(s=>s.id)).toEqual(['spread','measured']);
 for(const category of ['a','b','c']){const range=frame.observations.find(p=>p.id.seriesId==='spread'&&p.id.pointId===category)!,line=frame.observations.find(p=>p.id.seriesId==='measured'&&p.id.pointId===category)!;expect(range.x).toBe(line.x);expect(range.y).toBe(line.y);expect(range.group).toEqual(line.group);expect(range.lowValue).toBe(line.value-10);expect(range.highValue).toBe(line.value+10);expect(line.lowValue).toBeUndefined();expect(line.highValue).toBeUndefined();}
 expect(frame.series.find(s=>s.id==='spread')?.areaCommands?.some(c=>c.kind==='Z')).toBe(true);expect(frame.series.find(s=>s.id==='measured')?.areaCommands).toBeUndefined();expect(frame.series.find(s=>s.id==='measured')?.commands?.filter(c=>c.kind==='M')).toHaveLength(1);
});
it('an original scalar outlier expands the same scale instead of receiving a private fitted scale',()=>{
 const spec={...data,series:[data.series[0],{...data.series[1],data:data.series[1].data.map(p=>({...p,y:p.id==='c'?200:p.y}))}]} as const;
 const original=run().frame,next=run(spec).frame,r=next.observations.find(p=>p.id.seriesId==='spread')!,p=original.observations.find(p=>p.id.seriesId==='spread')!;
 expect(next.observations.at(-1)?.value).toBe(200);expect(r.y).toBeGreaterThan(p.y);expect(next.grid.some(t=>Number(t.label)>=200)).toBe(true);
 const sameY=next.observations.find(p=>p.id.seriesId==='measured'&&p.value===20)!;expect(r.y).toBeCloseTo(sameY.y,10);
});
it.each(['arearange','areasplinerange'] as const)('%s keeps supplied bounds, gaps, exact zero and stable identities',kind=>{
 const spec={...data,series:[{...data.series[0],kind,data:[{id:'a',x:'a',low:0,high:0},{id:'b',x:'b',low:null,high:null},{id:'c',x:'c',low:30,high:50}]},data.series[1]]} as const;
 const f=run(spec).frame;expect(f.observations.filter(p=>p.id.seriesId==='spread').map(p=>[p.id.pointId,p.lowValue,p.highValue])).toEqual([['a',0,0],['c',30,50]]);expect(f.observations.filter(p=>p.id.seriesId==='measured').map(p=>p.value)).toEqual([20,30,40]);
});
it('hiding and restoring originals coordinates both layers, totals and navigation frames',()=>{
 const before=run().frame,hidden=run(data,{hiddenSeriesIds:['spread']}).frame;expect(hidden.series.map(s=>s.id)).toEqual(['measured']);expect(hidden.observations.every(p=>p.id.seriesId==='measured')).toBe(true);expect(hidden.legend.find(s=>s.id==='spread')?.visible).toBe(false);expect(run().frame).toEqual(before);
 const all=run(data,{hiddenSeriesIds:['spread','measured']});expect(all.status).toBe('empty');expect(all.frame.family).toBe('mixed');expect(all.frame.mixedRanges?.series).toHaveLength(2);
});
it('one viewport crops the range and line with the same coordinate maps and source identities',()=>{
 const f=run(data,{viewport:{axes:'xy',value:{x:{firstId:'b',lastId:'c'},y:[15,45]}}}).frame;
 expect(f.viewport?.displayed.y).toEqual([15,45]);expect(f.observations.every(p=>p.id.pointId!=='a')).toBe(true);
 for(const p of f.observations){expect(p.x).toBeGreaterThanOrEqual(16);expect(p.x).toBeLessThanOrEqual(374);expect(p.y).toBeGreaterThanOrEqual(14);expect(p.y).toBeLessThanOrEqual(286);}
 expect(f.observations.find(p=>p.id.seriesId==='spread'&&p.id.pointId==='c')).toMatchObject({lowValue:30,highValue:50});
});
it('reversed scales, readable grids and references use the same original-unit owner',()=>{
 const f=run({...data,axes:{...data.axes,y:{kind:'linear',domain:[0,100],reversed:true}}},{references:[{id:'guide',axis:'y',value:20}]}).frame,p=f.observations.find(p=>p.id.seriesId==='measured'&&p.value===20)!;
 const guide=f.references?.[0];expect(guide?.status).toBe('visible');if(guide?.status==='visible')expect(guide.line.y1).toBe(p.y);expect(f.observations.find(p=>p.id.seriesId==='measured'&&p.value===40)!.y).toBeGreaterThan(p.y);
});
it.each([
 {...data,axes:{...data.axes,secondaryY:{kind:'linear'}}},
 {...data,series:[{...data.series[0],yAxis:'secondary'},data.series[1]]},
 {...data,series:[{...data.series[0],data:[{id:'a',x:'a',low:30,high:10}]},data.series[1]]},
 {...data,series:[{...data.series[0],data:[{id:'a',x:'a',low:null,high:10}]},data.series[1]]},
 {...data,series:[data.series[0],{...data.series[1],kind:'column'}]},
 {...data,series:[data.series[0],{...data.series[0],id:'smooth',kind:'areasplinerange'},data.series[1]]},
 {...data,series:[data.series[0]]},
])('rejects incompatible or ambiguous sources',source=>{expect(planChart(source,{width:390,height:300}).status).toBe('invalid');});
