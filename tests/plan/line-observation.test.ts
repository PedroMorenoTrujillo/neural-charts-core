import {expect, it} from 'vitest';
import {ownPlanInput,freezePlan} from '../../src/plan/input.js';
import {planChart, type PlanLineSpec} from '../../src/plan.js';

it('reuses immutable large-series identity metadata across viewports without stale values or coordinates', () => {
  const data = Object.freeze(Array.from({length: 3000}, (_, i) => Object.freeze({id: 'p' + i, x: i, y: i % 17})));
  const spec = ownPlanInput(Object.freeze({family: 'line', title: 'Large', axes: Object.freeze({x: Object.freeze({kind: 'linear'}), y: Object.freeze({kind: 'linear'})}), series: Object.freeze([Object.freeze({id: 's', name: 'Source', data})])})) as PlanLineSpec;
  const options = {width: 700, height: 300, capacity: {points: 3000}},full = planChart(spec, options), zoom = planChart(spec, {...options, viewport: {axes: 'x', value: {x: [1000, 2000]}}});
  if(full.status==='invalid'||zoom.status==='invalid')throw Error('Expected plan');
  const before=full.frame.observations.find(o=>o.id.pointId==='p1200')!,after=zoom.frame.observations.find(o=>o.id.pointId==='p1200')!;
  expect(after.id).toBe(before.id);expect(after.group!.key).toBe(before.group!.key);expect(after.x).not.toBe(before.x);expect(after.value).toBe(1200%17);
  expect(Object.isFrozen(after)).toBe(true);expect(Object.isFrozen(after.group)).toBe(true);expect(Object.isFrozen(after.id)).toBe(true);
  const changed=planChart({...spec,series:[{...spec.series[0]!,data:data.map(p=>p.id==='p1200'?{...p,y:42}:p)}]},options);
  if(changed.status==='invalid')throw Error(changed.diagnostic.reason);
  expect(changed.frame.observations.find(o=>o.id.pointId==='p1200')!.value).toBe(42);expect(before.value).toBe(1200%17);
});

it('retains crossing paths in an empty-observation viewport without requiring identity metadata',()=>{
  const spec={family:'line',title:'Crossings',axes:{x:{kind:'linear'},y:{kind:'linear',includeZero:true}},series:[{id:'s',name:'Source',data:Array.from({length:3000},(_,i)=>({id:'p'+i,x:i,y:i%2}))}]}as const satisfies PlanLineSpec;
  const result=planChart(spec,{width:700,height:300,capacity:{points:3000},viewport:{axes:'y',value:{y:[.4,.6]}}});
  if(result.status==='invalid')throw Error(result.diagnostic.reason);
  expect(result.status).toBe('empty');expect(result.frame.observations).toHaveLength(0);expect(result.frame.series[0]!.commands).toHaveLength(3000);
  expect(result.frame.series[0]!.commands!.some(command=>command.kind!=='Z'&&command.y<14)).toBe(true);
  expect(result.frame.series[0]!.commands!.some(command=>command.kind!=='Z'&&command.y>286)).toBe(true);
});

it('keeps dense time data and freshly formatted labels equivalent under the real public viewport',()=>{
  const origin=Date.UTC(2026,0,1),spec=ownPlanInput(freezePlan({family:'line',title:'Time',axes:{x:{kind:'time'},y:{kind:'linear'}},series:[{id:'s',name:'Source',data:Array.from({length:3000},(_,i)=>({id:'p'+i,x:origin+i*3600000,y:i%17}))}]}))as PlanLineSpec;
  const options={width:700,height:300,capacity:{points:3000}},full=planChart(spec,options),view={...options,viewport:{axes:'x' as const,value:{x:[origin+700*3600000,origin+800*3600000]as const}}},zoom=planChart(spec,view),fresh=planChart(JSON.parse(JSON.stringify(spec))as PlanLineSpec,view);
  if(full.status==='invalid'||zoom.status==='invalid'||fresh.status==='invalid')throw Error('Expected temporal plans');
  expect(zoom.frame).toEqual(fresh.frame);expect(zoom.frame.observations).toHaveLength(101);
  expect(zoom.frame.observations[0]!.id).toBe(full.frame.observations.find(o=>o.id.pointId==='p700')!.id);
});

it('preserves duplicate category positions through the real public dense category viewport',()=>{
  const categories=Array.from({length:3000},(_,i)=>({id:'c'+i,label:'Repeated'})),spec=ownPlanInput(freezePlan({family:'line',title:'Categories',axes:{x:{kind:'category',values:categories},y:{kind:'linear'}},series:[{id:'s',name:'Source',data:categories.map((category,i)=>({id:'p'+i,x:category.id,y:i%17}))}]}))as PlanLineSpec;
  const options={width:700,height:300,capacity:{points:3000,categories:3000}},full=planChart(spec,options),zoom=planChart(spec,{...options,viewport:{axes:'x',value:{x:{firstId:'c1000',lastId:'c1500'}}}});
  if(full.status==='invalid'||zoom.status==='invalid')throw Error('Expected category plans');
  expect(zoom.frame.observations).toHaveLength(501);expect(new Set(zoom.frame.observations.map(o=>o.group!.key)).size).toBe(501);
  expect(zoom.frame.observations.every(o=>o.label==='Repeated'&&o.x>=16&&o.x<=684)).toBe(true);
  expect(zoom.frame.observations.find(o=>o.id.pointId==='p1200')!.id).toBe(full.frame.observations.find(o=>o.id.pointId==='p1200')!.id);
});
