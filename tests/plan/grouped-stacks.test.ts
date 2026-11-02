import {describe,expect,it} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanColumnSpec,PlanOptions,PlanFrame} from '../../src/plan.js';
const spec:PlanColumnSpec={family:'column',title:'Original grouped stacks',axes:{x:{kind:'category',values:[{id:'a',label:'A'},{id:'b',label:'B'}]},y:{kind:'linear',domain:[0,100],nice:false}},series:[{id:'s1',name:'One',data:[{id:'a',x:'a',y:10},{id:'b',x:'b',y:20}]},{id:'s2',name:'Two',data:[{id:'a',x:'a',y:20},{id:'b',x:'b',y:10}]},{id:'s3',name:'Three',data:[{id:'a',x:'a',y:40},{id:'b',x:'b',y:25}]},{id:'s4',name:'Four',data:[{id:'a',x:'a',y:5},{id:'b',x:'b',y:15}]}]};
const groups=[{id:'east',label:'East',seriesIds:['s1','s2']},{id:'west',label:'West',seriesIds:['s3','s4']}] as const;
function result(input:PlanColumnSpec=spec,extra:Partial<PlanOptions>={}){return planChart(input,{width:320,height:300,stacking:'sum',stackGroups:groups,...extra});}
function frame(input:PlanColumnSpec=spec,extra:Partial<PlanOptions>={}):PlanFrame{const r=result(input,extra);if(r.status==='invalid')throw Error(JSON.stringify(r));return r.frame;}
describe('one shared frame for grouped and stacked original columns',()=>{
  it('places two genuinely stacked groups side by side, retaining source identities and common category coordinates',()=>{
    const f=frame(),bars=f.series.map(s=>s.bars!.find(b=>b.pointId==='a')!);expect(bars[0]!.x).toBe(bars[1]!.x);expect(bars[2]!.x).toBe(bars[3]!.x);expect(bars[0]!.x+bars[0]!.width).toBeLessThan(bars[2]!.x);expect(bars[1]!.y+bars[1]!.height).toBeCloseTo(bars[0]!.y,10);expect(bars[3]!.y+bars[3]!.height).toBeCloseTo(bars[2]!.y,10);expect(f.observations.map(p=>p.value)).toEqual([10,20,20,10,40,25,5,15]);expect(new Set(f.observations.filter(p=>p.id.pointId==='a').map(p=>p.group?.coordinate)).size).toBe(1);expect(f.observations.every(p=>p.hit?.kind==='polygon')).toBe(true);expect(f.stackGroups).toEqual({groups,placement:'grouped',stacking:'sum'});
  });
  it('returns independent source stack totals at the actual group centres',()=>{
    const f=frame(),totals=f.annotations!.filter(a=>a.stackTotal);expect(totals.map(a=>a.stackTotal!.value)).toEqual([30,30,45,40]);expect(totals[0]!.x).toBe(f.observations.find(p=>p.id.seriesId==='s1'&&p.id.pointId==='a')!.x);expect(totals[2]!.x).toBe(f.observations.find(p=>p.id.seriesId==='s3'&&p.id.pointId==='a')!.x);expect(totals[0]!.x).not.toBe(totals[2]!.x);
  });
  it('uses the original horizontal owner and keeps stacked endpoints contiguous',()=>{
    const f=frame({...spec,orientation:'horizontal'}),bars=f.series.map(s=>s.bars![0]!);expect(f.family).toBe('bar');expect(bars[0]!.y).toBe(bars[1]!.y);expect(bars[0]!.x+bars[0]!.width).toBeCloseTo(bars[1]!.x,10);expect(bars[0]!.y+bars[0]!.height).toBeLessThan(bars[2]!.y);expect(f.yLabels?.map(l=>l.id)).toEqual(['a','b']);expect(f.annotations![0]!.y).toBe(f.observations[0]!.y);
  });
  it('normalizes percentages inside each group, rather than dividing by all groups combined',()=>{
    const f=frame(spec,{stacking:'percent'}),a=f.observations.filter(p=>p.id.pointId==='a');for(const [i,value]of [100/3,200/3,800/9,100/9].entries())expect(a[i]!.percentage).toBeCloseTo(value,10);expect(f.annotations?.every(a=>a.stackTotal?.percentage===true&&a.stackTotal.value===100)).toBe(true);expect(f.observations.map(p=>p.value)).toEqual([10,20,20,10,40,25,5,15]);
  });
  it('retains declared slots when every member of another group is hidden',()=>{
    const full=frame(),hidden=frame(spec,{hiddenSeriesIds:['s1','s2']});expect(hidden.series.map(s=>s.id)).toEqual(['s3','s4']);expect(hidden.series[0]!.bars!.map(b=>[b.x,b.width])).toEqual(full.series[2]!.bars!.map(b=>[b.x,b.width]));expect(hidden.legend?.filter(l=>!l.visible).map(l=>l.id)).toEqual(['s1','s2']);expect(hidden.stackGroups).toEqual(full.stackGroups);expect(frame(spec,{hiddenSeriesIds:['s1','s2','s3','s4']}).observations).toEqual([]);
  });
  it('merges original positive and negative stack domains across groups without modifying the math',()=>{
    const source={...spec,axes:{...spec.axes,y:{kind:'linear' as const,nice:false}},series:spec.series.map((s,i)=>({...s,data:s.data.map(p=>({...p,y:[-10,-20,40,-5][i]!}))}))},f=frame(source);expect(f.observations.map(p=>p.value)).toEqual([-10,-10,-20,-20,40,40,-5,-5]);expect(f.annotations?.map(a=>a.stackTotal?.value)).toEqual([-30,-30,40,-5,40,-5]);expect(f.grid.map(g=>Number(g.label))).toContain(0);
  });
  it('leaves incomplete sum groups without fabricated totals and rejects incomplete percent groups',()=>{
    const source={...spec,series:spec.series.map(s=>s.id==='s2'?{...s,data:s.data.map(p=>({...p,y:null}))}:s)},f=frame(source);expect(f.annotations?.map(a=>a.stackTotal!.value)).toEqual([45,40]);const r=result(source,{stacking:'percent'});expect(r.status).toBe('invalid');if(r.status==='invalid')expect(r.diagnostic.reason).toBe('INCOMPLETE_PERCENT_GROUP');
  });
  it('preserves real zeros without inventing percentages or drawable stack segments',()=>{
    const source={...spec,series:spec.series.map(s=>({...s,data:s.data.map(p=>({...p,y:0}))}))},f=frame(source,{stacking:'percent'});expect(f.observations).toHaveLength(8);expect(f.observations.every(p=>p.value===0&&p.percentage===undefined)).toBe(true);expect(new Set(f.observations.filter(p=>p.id.pointId==='a').map(p=>p.x)).size).toBe(2);expect(f.annotations).toEqual([]);
  });
  it('keeps source values, group slots and full bounds while clipping the shared viewport',()=>{
    const f=frame(spec,{viewport:{axes:'xy',value:{x:{firstId:'a',lastId:'a'},y:[15,35]}}});expect(f.observations.every(p=>p.id.pointId==='a')).toBe(true);expect(f.observations.map(p=>p.value)).toEqual([20,40]);expect(f.viewport?.bounds.y).toMatchObject({kind:'linear',domain:[0,100]});expect(f.viewport?.displayed.y).toEqual([15,35]);expect(f.observations.every(p=>p.hit?.kind==='polygon'&&p.hit.vertices.every(v=>v.x>=0&&v.x<=f.width&&v.y>=0&&v.y<=f.height))).toBe(true);
  });
  it('uses the shared original-value reference projection',()=>{const f=frame(spec,{references:[{id:'budget',axis:'y',value:50}]});expect(f.references?.[0]).toMatchObject({id:'budget',axis:'y',status:'visible'});});
  it.each([320,768])('supports phone/tablet frame width %s without overlapping group slots',width=>{const f=frame(spec,{width});expect(f.width).toBe(width);for(const id of ['a','b']){const a=f.series[0]!.bars!.find(b=>b.pointId===id)!,b=f.series[2]!.bars!.find(b=>b.pointId===id)!;expect(a.x+a.width).toBeLessThan(b.x);}});
  it('bounds a full64-category,16-series source and stack annotations',()=>{const data:PlanColumnSpec={...spec,axes:{...spec.axes,x:{kind:'category',values:Array.from({length:64},(_,i)=>({id:String(i)}))}},series:Array.from({length:16},(_,i)=>({id:'s'+i,name:'Series '+i,data:Array.from({length:64},(_,j)=>({id:String(j),x:String(j),y:i+j}))}))},stackGroups=Array.from({length:8},(_,i)=>({id:'g'+i,label:'Group '+i,seriesIds:['s'+i*2,'s'+(i*2+1)]})),f=frame(data,{stackGroups});expect(f.observations).toHaveLength(1024);expect(f.annotations!.length).toBeLessThanOrEqual(64);expect(f.series).toHaveLength(16);});
  it.each([[],[{id:'a',label:'A',seriesIds:['s1','s2']}],[{id:'a',label:'A',seriesIds:['s1','s2','s3','s4','unknown']}],[{id:'a',label:'A',seriesIds:['s1','s2']},{id:'b',label:'B',seriesIds:['s2','s3','s4']}],[{id:'a',label:'A',seriesIds:['s1','s2']},{id:'a',label:'B',seriesIds:['s3','s4']}]].map(stackGroups=>({stackGroups})))('rejects malformed group partition %#',({stackGroups})=>{expect(result(spec,{stackGroups}).status).toBe('invalid');});
  it('requires explicit stacking and never silently applies groups to another family',()=>{expect(planChart(spec,{width:320,height:300,stackGroups:groups}).status).toBe('invalid');expect(planChart({family:'pie',title:'Not columns',data:[{id:'a',label:'A',value:1}]},{width:320,height:300,stackGroups:groups,stacking:'sum'}).status).toBe('invalid');});
});
