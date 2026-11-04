import {expect,it} from 'vitest';
import {planChart, type PlanAreaSplineSpec} from '../../src/plan.js';
import {planCartesianChart} from '../../src/cartesian.js';
import {smoothStackBands} from '../../src/plan/smooth-stack.js';

const source={family:'areaspline',title:'Smooth signed stacks',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'a',name:'A',data:[{id:'a0',x:0,y:10},{id:'a1',x:1,y:30},{id:'a2',x:2,y:-5},{id:'a3',x:3,y:null},{id:'a4',x:4,y:15}]},{id:'b',name:'B',data:[{id:'b0',x:0,y:20},{id:'b1',x:1,y:5},{id:'b2',x:2,y:-10},{id:'b3',x:3,y:20},{id:'b4',x:4,y:10}]}]} as const satisfies PlanAreaSplineSpec;
it('renders sum and percent smooth stacks through both public planners with original IDs/values',()=>{
  for(const stacking of ['sum','percent']as const)for(const plan of [planChart,planCartesianChart]){
    const dataset=stacking==='sum'?source:{...source,series:source.series.map(s=>({...s,data:s.data.map(p=>({...p,y:p.y===null?null:Math.abs(p.y)}))}))};
    const r=plan(dataset,{width:600,height:300,stacking});if(r.status==='invalid')throw Error(r.diagnostic.reason);
    expect(r.frame.family).toBe('areaspline');expect(r.frame.series.every(s=>s.commands!.length>8&&s.areaCommands!.length>10)).toBe(true);
    expect(r.frame.observations.find(o=>o.id.pointId==='a2')?.value).toBe(stacking==='sum'?-5:5);
    expect(r.frame.observations.some(o=>o.id.pointId==='a3')).toBe(false);
    expect(r.frame.observations.find(o=>o.id.pointId==='b1')?.value).toBe(5);
    for(const series of r.frame.series)for(const c of [...series.commands!,...series.areaCommands!])if(c.kind!=='Z')expect(Number.isFinite(c.x)&&Number.isFinite(c.y)).toBe(true);
    const hidden=plan(dataset,{width:600,height:300,stacking,hiddenSeriesIds:['b'],viewport:{axes:'x',value:{x:[0,2]}}});if(hidden.status==='invalid')throw Error(hidden.diagnostic.reason);
    expect(hidden.frame.observations.every(o=>o.id.seriesId==='a')).toBe(true);
  }
});
it('shares flattened boundary vertices exactly and never overshoots either endpoint',()=>{
  const band=(top0:number,top1:number,bottom0:number,bottom1:number)=>[{kind:'M' as const,x:0,y:top0},{kind:'L' as const,x:100,y:top1},{kind:'L' as const,x:100,y:bottom1},{kind:'L' as const,x:0,y:bottom0},{kind:'Z' as const}];
  const r=smoothStackBands(new Map([['a',band(20,80,0,0)],['b',band(40,100,20,80)]])),a=r.get('a')!,b=r.get('b')!;
  const upper=a.commands.filter(c=>c.kind!=='Z'),lower=b.areaCommands.slice(b.commands.length,-1).reverse();expect(lower.map(c=>c.kind==='Z'?null:[c.x,c.y])).toEqual(upper.map(c=>c.kind==='Z'?null:[c.x,c.y]));
  expect(upper.every(c=>c.kind!=='Z'&&c.y>=20&&c.y<=80)).toBe(true);
  const quarter=upper[Math.round((upper.length-1)/4)]!;expect(quarter.kind!=='Z'&&quarter.y<20+.25*60).toBe(true);
});
it('retains gap boundaries and does not join across a missing category',()=>{
  const r=planChart(source,{width:600,height:300,stacking:'sum'});if(r.status==='invalid')throw Error(r.diagnostic.reason);
  for(const series of r.frame.series){const lines=series.commands!.filter(c=>c.kind!=='Z');expect(lines.every(c=>c.kind!=='Z'&&c.x<=300)).toBe(true);}
});
