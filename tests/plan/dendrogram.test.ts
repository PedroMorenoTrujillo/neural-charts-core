import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanDendrogramSpec,PlanDendrogramNode,PlanSpec,PlanOptions} from '../../src/plan.js';
const size={width:390,height:300};
const source:PlanDendrogramSpec={family:'dendrogram',title:'Clusters',unit:'km',root:{id:'root',height:10,children:[{id:'ab',height:2,children:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}]},{id:'c',label:'Gamma'}]}};
function frame(spec=source,options:PlanOptions=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
const invalid=(spec:unknown,options:unknown=size)=>expect(planChart(spec as PlanSpec,options as PlanOptions).status).toBe('invalid');
test('leaf alignment uses merge heights, not tree depth',()=>{
  const f=frame(),[root,ab,a,b,c]=f.observations;expect(a!.x).toBe(b!.x);expect(b!.x).toBe(c!.x);expect((a!.x-ab!.x)/(a!.x-root!.x)).toBeCloseTo(.2);expect(f.observations.map(p=>p.id.pointId)).toEqual(['root','ab','a','b','c']);expect(root?.value).toBe(10);expect(ab?.dendrogram).toEqual({type:'cluster',heightMode:'distance',heightSource:'source',leafCount:2,depth:1,unit:'km'});expect(a?.dendrogram?.heightSource).toBe('leafZero');expect(f.legend).toEqual([]);expect(f.labels.at(-1)?.label).toBe('10');
});
test.each(['horizontal','vertical'] as const)('%s branches join at the original merge position',orientation=>{
  const f=frame({...source,orientation}),commands=f.series[0]!.commands!;expect(commands).toHaveLength(12);for(let i=0;i<commands.length;i+=3){const p=commands[i]!,bend=commands[i+1]!,child=commands[i+2]!;expect(p.type).toBe('M');expect(bend.type).toBe('L');expect(child.type).toBe('L');if('x'in p&&'x'in bend&&'x'in child){if(orientation==='horizontal'){expect(p.x).toBe(bend.x);expect(bend.y).toBe(child.y)}else{expect(p.y).toBe(bend.y);expect(bend.x).toBe(child.x)}}}const leaves=f.observations.filter(p=>p.dendrogram?.type==='leaf');expect(new Set(leaves.map(p=>orientation==='horizontal'?p.x:p.y)).size).toBe(1);expect(f.dendrogram?.orientation).toBe(orientation);
});
test('height-free trees explicitly use derived topology levels with no fabricated physical measurement',()=>{
  const f=frame({family:'dendrogram',title:'Hierarchy',root:{id:'r',children:[{id:'inner',children:[{id:'one'}]},{id:'two'}]}});expect(f.observations.map(p=>p.value)).toEqual([2,1,0,0]);expect(f.unit).toBe('levels');expect(f.dendrogram?.heightMode).toBe('topology');expect(f.observations[0]?.dendrogram?.heightSource).toBe('topology');
});
test('zero-distance trees and single leaves retain actual zero, identities and inspectable points',()=>{
  const zero=frame({...source,root:{...source.root,height:0,children:[{id:'a'},{id:'b',height:-0}]}});expect(zero.observations.every(p=>p.value===0&&!Object.is(p.value,-0))).toBe(true);expect(zero.labels).toEqual([]);expect(zero.dendrogram?.maxHeight).toBe(0);const single=frame({...source,root:{id:'only',height:0}});expect(single.observations).toHaveLength(1);expect(single.dendrogram).toMatchObject({heightMode:'distance',nodeCount:1,leafCount:1});
});
test('bounded layouts own their geometry, preserve source and stay deterministic on phone/tablet',()=>{
  const root:PlanDendrogramNode={id:'r',children:Array.from({length:63},(_,i)=>({id:'branch'+i,children:[{id:'leaf'+i,label:'Original leaf '+i}]}))};const spec:PlanDendrogramSpec={family:'dendrogram',title:'Dense',root};const before=JSON.stringify(spec);for(const width of [64,320,768]){const f=frame(spec,{width,height:300});expect(f).toEqual(frame(spec,{width,height:300}));expect(f.observations).toHaveLength(127);expect(f.observations.every(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=300&&p.hit?.type==='circle')).toBe(true);expect(f.annotations.length).toBeLessThanOrEqual(63);expect(Object.isFrozen(f.observations[0]?.dendrogram)).toBe(true)}expect(JSON.stringify(spec)).toBe(before);
});
test.each([
  {...source,root:null},{...source,root:{id:'r',children:[{id:'r'}]}},
  {...source,root:{id:'r',height:1,children:[{id:'a',height:2,children:[{id:'leaf'}]}]}},
  {...source,root:{id:'r',height:1,children:[{id:'a',children:[{id:'leaf'}]}]}},
  {...source,root:{id:'r',height:1}},{...source,root:{id:'r',height:NaN}},
  {...source,root:{id:'r',height:-1}},{...source,root:{id:'r',value:2}},
  {...source,orientation:'radial'},{...source,unknown:true},
  {...source,root:{id:'r',children:[{id:'leaf'}]}},
  {...source,root:{id:'r',height:1,children:Array.from({length:65},(_,i)=>({id:String(i)}))}},
])('rejects invalid or ambiguous clustering source %#',spec=>invalid(spec));
test('rejects cycles/deep recursion, node overflow and unsupported global options without doing excess work',()=>{
  const cycle:{id:string;children?:unknown[]}={id:'cycle'};cycle.children=[cycle];invalid({...source,root:cycle});let root:PlanDendrogramNode={id:'leaf'};for(let i=0;i<17;i++)root={id:'depth'+i,children:[root]};invalid({...source,root});invalid(source,{...size,hiddenSeriesIds:['tree']});invalid(source,{...size,references:[]});invalid(source,{...size,stacking:'sum'});invalid(source,{...size,viewport:{axes:'x'}});
});
