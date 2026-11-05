import {expect,it} from 'vitest';
import {planChart,type PlanMixedSpec,type PlanFrame} from '../../src/plan.js';

const categories=['a','b','c','d'].map(id=>({id,label:'Repeated'}));
const points=(id:string,values:readonly(number|null)[])=>values.map((y,i)=>({id:id+i,x:categories[i]!.id,y}));
const source={family:'mixed',title:'Mixed stacks',axes:{x:{type:'category',values:categories},y:{type:'linear'}},series:[{id:'a',name:'A',type:'column',data:points('a',[10,-4,0,null])},{id:'b',name:'B',type:'column',data:points('b',[20,-6,0,7])},{id:'line',name:'Line',type:'line',data:points('l',[12,8,3,4])},{id:'area',name:'Area',type:'area',data:points('r',[4,3,2,1])}]} as const satisfies PlanMixedSpec;
const frame=(spec:PlanMixedSpec,stacking:'sum'|'percent',extra={})=>{const r=planChart(spec,{width:600,height:300,stacking,...extra});if(r.status==='invalid')throw Error(r.diagnostic.reason);return r.frame};
const bar=(f:PlanFrame,id:string,point:string)=>f.series.find(s=>s.id===id)!.bars!.find(b=>b.pointId===point)!;

it('shares a scale for signed accumulated columns and original line/area values',()=>{
  const before=JSON.stringify(source),f=frame(source,'sum'),a=bar(f,'a','a0'),b=bar(f,'b','b0');
  expect(a.x).toBe(b.x);expect(a.width).toBe(b.width);expect(a.y).toBeCloseTo(b.y+b.height,10);
  const na=bar(f,'a','a1'),nb=bar(f,'b','b1');expect(na.y+na.height).toBeCloseTo(nb.y,10);
  expect(bar(f,'a','a2').height).toBe(0);expect(f.observations.some(o=>o.id.pointId==='a3')).toBe(false);
  expect(f.observations.find(o=>o.id.pointId==='b0')?.value).toBe(20);expect(f.observations.find(o=>o.id.pointId==='b0')?.y).toBe(b.y);
  expect(f.observations.find(o=>o.id.pointId==='l0')?.value).toBe(12);expect(f.annotations?.some(a=>a.stackTotal?.value===30)).toBe(true);
  expect(f.observations.filter(o=>o.id.seriesId==='line').map(o=>o.label)).toEqual(['Repeated','Repeated','Repeated','Repeated']);expect(JSON.stringify(source)).toBe(before);
  const hidden=frame(source,'sum',{hiddenSeriesIds:['a'],viewport:{axes:'x',value:{x:{firstId:'b',lastId:'d'}}}});expect(hidden.observations.every(o=>o.id.seriesId!=='a'&&o.id.pointId!=='b0')).toBe(true);
});
it('keeps raw column/line values, percent segments and semantic zero observations distinct',()=>{
  const positive={...source,series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,y:p.y===null?0:Math.abs(p.y)}))}))};
  const f=frame(positive,'percent');expect(f.observations.find(o=>o.id.pointId==='a0')?.percentage).toBeCloseTo(100/3);expect(f.observations.find(o=>o.id.pointId==='a0')?.value).toBe(10);
  expect(f.observations.find(o=>o.id.pointId==='b2')?.value).toBe(0);expect(f.observations.find(o=>o.id.pointId==='b2')?.percentage).toBeUndefined();expect(f.observations.find(o=>o.id.pointId==='l0')?.value).toBe(12);
  expect(planChart(source,{width:600,height:300,stacking:'percent'}).status).toBe('invalid');
  const missing={...positive,series:positive.series.map(s=>s.id==='a'?{...s,data:s.data.map((p,i)=>i===0?{...p,y:null}:p)}:s)};expect(planChart(missing,{width:600,height:300,stacking:'percent'}).status).toBe('invalid');
});
it('coordinates independent dual-axis stacks in distinct category subslots',()=>{
  const columns=source.series.filter(s=>s.type==='column'),dual={...source,axes:{...source.axes,secondaryY:{type:'linear' as const}},series:[...source.series.map(s=>({...s,yAxis:s.id==='b'||s.id==='area'?'secondary' as const:'primary' as const})),...columns.map(s=>({...s,id:s.id+'2',name:s.name+'2',yAxis:s.id==='b'?'secondary' as const:'primary' as const,data:s.data.map(p=>({...p,id:p.id+'copy'}))}))]};
  const f=frame(dual,'sum'),a=bar(f,'a','a0'),a2=bar(f,'a2','a0copy'),b=bar(f,'b','b0'),b2=bar(f,'b2','b0copy');
  expect(a.x).toBe(a2.x);expect(b.x).toBe(b2.x);expect(a.x+a.width).toBeLessThan(b.x);expect(a.y).toBeCloseTo(a2.y+a2.height,10);expect(b.y).toBeCloseTo(b2.y+b2.height,10);
  expect(f.mixedAxes?.mode).toBe('dual-y');expect(f.observations.find(o=>o.id.pointId==='b0')?.valueAxis).toBe('secondary');expect(f.observations.find(o=>o.id.pointId==='b0')?.x).toBeCloseTo(b.x+b.width/2);expect(f.annotations?.length).toBeGreaterThan(0);
});
