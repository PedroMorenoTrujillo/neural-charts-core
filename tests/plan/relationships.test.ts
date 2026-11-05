import {describe,expect,test} from 'vitest';
import {planDependencyWheel} from '../../src/plan/dependencywheel.js';
import {planChord} from '../../src/plan/chord.js';
import {planArcDiagram} from '../../src/plan/arcdiagram.js';
import type {PlanRelationshipSpec,PlanRelationshipResult} from '../../src/public/relationship-types.js';
import {ownPolygon as ownNativePolygon} from './relationship-polygon-oracle.js';

const nodes=[{id:'a',label:'Alpha'},{id:'b',label:'Beta'},{id:'c',label:'Gamma'}];
const links=[{id:'ab',from:'a',to:'b',value:12},{id:'bc',from:'b',to:'c',value:8},{id:'ca',from:'c',to:'a',value:4}];
const planners={dependencywheel:planDependencyWheel,chord:planChord,arcdiagram:planArcDiagram};
const run=(family:PlanRelationshipSpec['family'],extra:Record<string,unknown>={},options:Record<string,unknown>={})=>(planners[family] as (s:unknown,o:unknown)=>PlanRelationshipResult)({family,title:'Relations',nodes,links,...extra},{width:390,height:320,...options});
function frame(result:PlanRelationshipResult){if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));return result.frame;}
function simple(vertices:readonly {x:number;y:number}[]){
 const turn=(a:typeof vertices[number],b:typeof a,c:typeof a)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(let i=0;i<vertices.length;i++)for(let j=i+2;j<vertices.length;j++){
  if(i===0&&j===vertices.length-1)continue;
  const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!,c=vertices[j]!,d=vertices[(j+1)%vertices.length]!;
  if(turn(a,b,c)*turn(a,b,d)<-1e-12&&turn(c,d,a)*turn(c,d,b)<-1e-12)return false;
 }
 return true;
}
for(const family of Object.keys(planners) as PlanRelationshipSpec['family'][]){
 describe(family,()=>{
  test('cycles are real weighted relationships with stable node/link identities',()=>{
   const f=frame(run(family));expect(f.observations).toHaveLength(6);expect(f.observations.map(p=>p.id.pointId).sort()).toEqual(['a','ab','b','bc','c','ca']);
   expect(f.observations.find(p=>p.id.pointId==='a')).toMatchObject({value:16,relationship:{incoming:4,outgoing:12,incident:16}});
   expect(f.observations.find(p=>p.id.pointId==='ab')).toMatchObject({value:12,relationship:{type:'link',directed:family==='dependencywheel'}});
   expect(Object.isFrozen(f.observations)).toBe(true);expect(f.observations.every(p=>/^#[\da-f]{6}$/i.test(p.color))).toBe(true);expect(run(family)).toEqual(run(family));
  });
  test('empty source is empty; isolated nodes retain their measured zero',()=>{
   expect(run(family,{nodes:[],links:[]}).status).toBe('empty');const f=frame(run(family,{links:[]}));expect(f.observations.map(p=>p.value)).toEqual([0,0,0]);
   if(family!=='arcdiagram')expect(f.observations.every(p=>p.hit?.type==='circle')).toBe(true);
  });
  test('null is unknown, zero remains zero, and neither fabricates a ribbon',()=>{
   const f=frame(run(family,{links:[{...links[0]!,value:null},{...links[1]!,value:0}]}));
   expect(f.observations.some(p=>p.id.pointId==='ab')).toBe(false);expect(f.observations.find(p=>p.id.pointId==='a')?.incomplete).toBe(true);
   expect(f.observations.find(p=>p.id.pointId==='bc')).toMatchObject({value:0,relationship:{geometryOmitted:true}});
  });
  test('rejects unknown and repeated visibility groups rather than silently ignoring them',()=>{
   expect(run(family,{}, {hiddenSeriesIds:['missing']})).toMatchObject({status:'invalid',diagnostic:{reason:'UNKNOWN_SERIES'}});
   expect(run(family,{}, {hiddenSeriesIds:['nodes','nodes']})).toMatchObject({status:'invalid',diagnostic:{reason:'DUPLICATE_ID'}});
  });
  test('hiding an extreme group renormalizes tiny visible weights and restores original state',()=>{
   const spec={groups:[{id:'big',label:'Big'},{id:'small',label:'Small'}],nodes:[{id:'a',label:'A',groupId:'big'},{id:'b',label:'B',groupId:'big'},{id:'c',label:'C',groupId:'small'},{id:'d',label:'D',groupId:'small'}],links:[{id:'ab',from:'a',to:'b',value:1e308},{id:'cd',from:'c',to:'d',value:1e-15}]};
   const before=frame(run(family,spec)),hidden=frame(run(family,spec,{hiddenSeriesIds:['big']}));
   expect(hidden.observations).toHaveLength(3);expect(hidden.observations.find(p=>p.id.pointId==='cd')?.hit).toBeDefined();expect(hidden.observations.find(p=>p.id.pointId==='cd')?.value).toBe(1e-15);
   expect(hidden.legend.find(g=>g.id==='big')?.visible).toBe(false);expect(frame(run(family,spec))).toEqual(before);
   const tiny=before.observations.find(p=>p.id.pointId==='cd')!;expect(tiny.value).toBe(1e-15);expect(tiny.hit).toBeUndefined();expect(tiny.relationship.geometryOmitted).toBe(true);
   if(family!=='arcdiagram'){const tinyNode=before.observations.find(p=>p.id.pointId==='c')!;expect(tinyNode.value).toBe(1e-15);expect(tinyNode.hit).toBeUndefined();}
  });
  test.each([
   {links:[{...links[0]!,value:-1}]},{links:[{...links[0]!,value:Infinity}]},
   {links:[{...links[0]!,to:'missing'}]},{links:[{...links[0]!,to:'a'}]},
   {nodes:[nodes[0],nodes[0]],links:[]},{links:[links[0],links[0]]},
   {nodes:[{...nodes[0]!,groupId:'missing'}],links:[]},
   {links:[{...links[0]!,value:1e308},{id:'again',from:'c',to:'b',value:1e308}]},
  ])('invalid source is rejected even if its group is hidden: %j',extra=>{
   expect(run(family,extra,{hiddenSeriesIds:['nodes']}).status).toBe('invalid');
  });
  test('budgets, unknown fields and unsupported layout are explicit',()=>{
   expect(run(family,{nodes:Array.from({length:65},(_,i)=>({id:String(i),label:String(i)})),links:[]}).status).toBe('invalid');
   expect(run(family,{typo:true}).status).toBe('invalid');for(const extra of [{stacking:'sum'},{references:[]},{viewport:{mode:'xy'}}])expect(run(family,{},extra).status).toBe('invalid');
   expect(run(family,{family:'wrong'}).status).toBe('invalid');
   let touched=false;const unsafe={title:'Unsafe',nodes,links};Object.defineProperty(unsafe,'family',{enumerable:true,get(){touched=true;return family;}});expect((planners[family] as (s:unknown,o:unknown)=>PlanRelationshipResult)(unsafe,{width:390,height:320}).status).toBe('invalid');expect(touched).toBe(false);
   expect(run(family,{links:Array.from({length:257},(_,i)=>({...links[0]!,id:'edge'+i}))}).status).toBe('invalid');
   for(const size of [NaN,Infinity,0,63,10001])expect(run(family,{}, {width:size}).status).toBe('invalid');
   const invalidLayout=family==='arcdiagram'?[{nodeRadius:1},{nodeRadius:25},{linkWidth:0},{linkWidth:49},{reversed:1}]:[{nodeWidth:1},{nodeWidth:65},{nodePadding:-1},{nodePadding:21},{startAngle:361}];
   for(const layout of invalidLayout)expect(run(family,layout).status).toBe('invalid');
  });
  test('geometry stays finite, bounded, simple and within the documented polygon budget',()=>{
   for(const width of [64,390,10000])for(const height of [64,320,10000]){
    const f=frame(run(family,{}, {width,height}));for(const p of f.observations){expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(width);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThanOrEqual(height);
     if(p.hit?.type==='polygon'){expect(p.hit.vertices.length).toBeLessThanOrEqual(34);expect(simple(p.hit.vertices)).toBe(true);for(const v of p.hit.vertices){expect(v.x>=0&&v.x<=width&&v.y>=0&&v.y<=height).toBe(true);}}
    }
   }
  });
  test('dense cyclic data and uneven positive weights keep each ribbon simple after quantization',()=>{
   let seed=731;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   for(let attempt=0;attempt<24;attempt++){
    const count=3+Math.floor(next()*22),source=Array.from({length:count},(_,i)=>({id:'n'+i,label:'Node '+i}));
    const edges=Array.from({length:count*3},(_,i)=>{const from=Math.floor(next()*count),to=(from+1+Math.floor(next()*(count-1)))%count;return {id:'e'+i,from:'n'+from,to:'n'+to,value:[.17,1e-12,1e-8,1,1e6][Math.floor(next()*5)]!};});
    const f=frame(run(family,{nodes:source,links:edges}));
    for(const p of f.observations)if(p.hit?.type==='polygon'){expect(simple(p.hit.vertices),family+':'+attempt+':'+p.id.pointId).toBe(true);expect(()=>ownNativePolygon(p.hit as Extract<NonNullable<typeof p.hit>,{type:'polygon'}>,f),family+':'+attempt+':'+p.id.pointId).not.toThrow();const first=p.hit.vertices[0]!,last=p.hit.vertices.at(-1)!;expect(first.x!==last.x||first.y!==last.y).toBe(true);}
   }
  });
 });
}
test('radial node sectors are exactly proportional to incident measured amounts',()=>{
 const f=frame(run('dependencywheel'));const sectors=f.observations.filter(p=>p.relationship.type==='node');
 const spans=sectors.map(p=>p.hit?.type==='sector'?p.hit.end-p.hit.start:0);
 expect(spans[0]!/spans[1]!).toBeCloseTo(16/20,10);expect(spans[2]!/spans[1]!).toBeCloseTo(12/20,10);
});

test('radial ribbons and solid node sectors have explicit render roles in the same source series',()=>{
 for(const family of ['dependencywheel','chord'] as const){
  const f=frame(run(family)),series=f.series[0]!;
  expect(f.series.map(row=>row.id)).toEqual(['nodes']);
  expect(series.areaCommands?.filter(command=>command.type==='M')).toHaveLength(3);
  expect(series.areaCommands?.filter(command=>command.type==='A')).toHaveLength(6);
  expect(series.areaCommands?.filter(command=>command.type==='Q')).toHaveLength(6);
  expect(series.nodeCommands?.filter(command=>command.type==='M')).toHaveLength(3);
  expect(series.nodeCommands?.filter(command=>command.type==='A')).toHaveLength(6);
  expect(Object.isFrozen(series.nodeCommands)).toBe(true);
  expect(f.observations.map(point=>point.id.pointId).sort()).toEqual(['a','ab','b','bc','c','ca']);
  const zeros=frame(run(family,{links:links.map(link=>({...link,value:0}))}));
  expect(zeros.series[0]?.nodeCommands).toBeUndefined();
  expect(zeros.series[0]?.circles).toHaveLength(3);
 }
});
test('radial hit sectors contain their painted anchors using clockwise bearings from twelve oclock',()=>{
 const tau=Math.PI*2;
 for(const family of ['dependencywheel','chord'] as const)for(const startAngle of [-360,-90,0,125,360]){
  const f=frame(run(family,{startAngle}));
  for(const point of f.observations){
   const hit=point.hit;if(point.relationship.type!=='node'||hit?.type!=='sector')continue;
   const bearing=Math.atan2(point.x-hit.cx,hit.cy-point.y),delta=((bearing-hit.start)%tau+tau)%tau;
   expect(Math.hypot(point.x-hit.cx,point.y-hit.cy)).toBeGreaterThanOrEqual(hit.innerRadius-1e-4);
   expect(delta).toBeGreaterThanOrEqual(0);expect(delta).toBeLessThanOrEqual(hit.end-hit.start+1e-4);
   // The opposite bearing must not hit a node whose painted sector is below half a circle.
   if(hit.end-hit.start<Math.PI){const outside=((bearing+Math.PI-hit.start)%tau+tau)%tau;expect(outside).toBeGreaterThan(hit.end-hit.start);}
  }
 }
});
test('arc reversal mirrors geometry and preserves measured identities and values',()=>{
 const normal=frame(run('arcdiagram')),reverse=frame(run('arcdiagram',{reversed:true}));
 for(const p of normal.observations){const q=reverse.observations.find(q=>q.id.pointId===p.id.pointId)!;expect(q.value).toBe(p.value);expect(q.x).toBe(p.x);expect(q.y).toBeCloseTo(normal.height-p.y,4);}
});

test('dense ordered arc nodes stay disjoint and every painted anchor belongs to one actual node hit',()=>{
 const sourceNodes=Array.from({length:64},(_,i)=>({id:'node'+i,label:'Node '+i}));
 for(const width of [64,300,390,768])for(const nodeRadius of [2,6,24]){
  const f=frame(run('arcdiagram',{nodes:sourceNodes,links:[{id:'relation',from:'node0',to:'node63',value:1}],nodeRadius},{width}));
  const points=f.observations.filter(point=>point.relationship.type==='node');
  expect(points.map(point=>point.id.pointId)).toEqual(sourceNodes.map(node=>node.id));
  const circles=f.series.flatMap(series=>series.circles??[]);
  expect(circles).toHaveLength(64);
  for(let i=0;i<circles.length;i++){
   const circle=circles[i]!;expect(circle.radius).toBeGreaterThan(0);expect(circle.radius).toBeLessThanOrEqual(nodeRadius);
   if(i>0)expect(circle.cx-circles[i-1]!.cx).toBeGreaterThan(circle.radius+circles[i-1]!.radius);
   const point=points[i]!;
   const hits=points.filter(candidate=>candidate.hit?.type==='circle'&&Math.hypot(point.x-candidate.hit.cx,point.y-candidate.hit.cy)<=candidate.hit.radius);
   expect(hits.map(hit=>hit.id.pointId)).toEqual([point.id.pointId]);
  }
 }
 const isolated=frame(run('arcdiagram',{nodes:[{id:'single',label:'Single'}],links:[],nodeRadius:24},{width:64}));
 expect(isolated.series.flatMap(series=>series.circles??[])[0]?.radius).toBe(24);
});
