// Extracted behavioral fixtures from Native drilldown-state.test.ts; no renderer is loaded.
import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {backDrilldown,createDrilldownState,currentDrilldownNode,drilldownDestination,drilldownGeneration,enterDrilldown,ownDrilldownGraph,reconcileDrilldown,rememberDrilldownView,restoredDrilldownView} from '../../src/drilldown.js';
import type {DrilldownData,DrilldownGraphOptions,DrilldownSourceAdapter,DrilldownView} from '../../src/drilldown.js';
const overview={type:'pie',data:[{id:'north',label:'North',value:40},{id:'south',label:'South',value:60}]} as const;
const detail={type:'column',orientation:'vertical',axes:{x:{type:'category',values:[{id:'q1'},{id:'q2'}]},y:{type:'linear'}},series:[{id:'sales',name:'Sales',data:[{id:'q1',x:'q1',y:0},{id:'q2',x:'q2',y:25}]}]} as const;
const leaf={type:'donut',data:[{id:'known-zero',label:'Known zero',value:0},{id:'known',label:'Known',value:25}]} as const;
const data={rootId:'overview',nodes:[{id:'overview',data:overview},{id:'detail',data:detail},{id:'leaf',data:leaf}],links:[
  {fromNodeId:'overview',datumId:{seriesId:'north',pointId:'north'},toNodeId:'detail'},
  {fromNodeId:'detail',datumId:{seriesId:'sales',pointId:'q1'},toNodeId:'leaf'},
]} as const satisfies DrilldownData;

const options={semantics:{detail:'category-unit'}} as const satisfies DrilldownGraphOptions;
function model(source:DrilldownData=data,settings:DrilldownGraphOptions=options){const result=ownDrilldownGraph(source,settings);if(result.status==='invalid')throw Error(result.error.diagnostic.message);return result.value;}
const select=(state:ReturnType<typeof createDrilldownState>,seriesId:string,pointId:string)=>({...drilldownGeneration(state),datumId:{seriesId,pointId}});

test('navigation and saved views match the actual pre-extraction Native golden',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./native-baseline.json',import.meta.url),'utf8'));
  let state=createDrilldownState(model(fixture.data,{}));
  const snapshots:unknown[]=[];
  const save=(label:string)=>snapshots.push({label,nodeId:currentDrilldownNode(state),trail:state.trail,restored:restoredDrilldownView(state)??null});
  save('initial');
  state=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:['south']});save('remember overview');
  state=enterDrilldown(state,select(state,'north','north'));save('detail');
  state=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:['sales'],viewport:{x:{firstId:'q1',lastId:'q2'},y:[0,25]}});save('remember detail');
  state=enterDrilldown(state,select(state,'sales','q1'));save('known-zero leaf');
  state=backDrilldown(state);save('back detail');
  state=backDrilldown(state);save('back overview');
  expect(snapshots).toEqual(fixture.snapshots);
});

test('semantic keys preserve presentation updates and invalidate changed numeric meaning',()=>{
  let state=createDrilldownState(model());
  state=enterDrilldown(state,select(state,'north','north'));
  state=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:['sales'],viewport:{x:[1,2]}});
  const same=reconcileDrilldown(state,model(data,{semantics:{detail:'category-unit'}}));
  expect(same.generation).toBe(state.generation);
  expect(restoredDrilldownView(same)).toBe(restoredDrilldownView(state));
  const changed=reconcileDrilldown(state,model(data,{semantics:{detail:'percent-unit'}}));
  expect(changed.generation).not.toBe(state.generation);
  expect(restoredDrilldownView(changed)).toBeUndefined();
  const replacement={...data,nodes:[data.nodes[0],{id:'detail',data:{...detail}},data.nodes[2]]};
  const replaced=reconcileDrilldown(state,model(replacement));
  expect(replaced.generation).not.toBe(state.generation);
  expect(restoredDrilldownView(replaced)).toBeUndefined();
});

test('owned containers cannot mutate graph targets, navigation or saved views',()=>{
  const graph=model(),state=createDrilldownState(graph);
  for(const map of [graph.nodes,graph.targets,graph.parentById,graph.semantics,graph.targets.get('overview')!,state.views]){
    expect(Object.isFrozen(map)).toBe(true);
    expect('set' in map).toBe(false);expect('delete' in map).toBe(false);expect('clear' in map).toBe(false);
    map.forEach((_value,_key,owner)=>expect(owner).toBe(map));
  }
  expect(Object.isFrozen(graph.links)).toBe(true);
  expect(Object.isFrozen(graph.links[0])).toBe(true);
  expect(Object.isFrozen(graph.links[0]!.datumId)).toBe(true);
  expect(Object.isFrozen(state.trail)).toBe(true);
  const ids=['south'],window:[number,number]=[1,2];
  const next=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:ids,viewport:{x:window}});
  ids[0]='north';window[0]=-50;
  expect(restoredDrilldownView(next)).toEqual({hiddenSeriesIds:['south'],viewport:{x:[1,2]}});
  expect(restoredDrilldownView(state)).toBeUndefined();
});

test('invalid view and semantic options fail closed without calling accessors',()=>{
  let calls=0;
  const state=createDrilldownState(model()),token=drilldownGeneration(state);
  const accessor={get hiddenSeriesIds(){calls++;return [];}};
  expect(()=>rememberDrilldownView(state,token,accessor)).toThrow();
  expect(calls).toBe(0);
  for(const view of [{hiddenSeriesIds:['same','same']},{hiddenSeriesIds:[],viewport:{x:[2,1]}},{hiddenSeriesIds:[],viewport:{y:{firstId:'a',lastId:'b'}}},{hiddenSeriesIds:[],viewport:{x:[1,Infinity]}}]){
    expect(()=>Reflect.apply(rememberDrilldownView,undefined,[state,token,view])).toThrow();
  }
  for(const semantics of [{unknown:'x'},{detail:null},{detail:'x'.repeat(16385)}]){
    expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{semantics}]).status).toBe('invalid');
  }
  expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{semantics:{get detail(){calls++;return 'x';}}}]).status).toBe('invalid');
  expect(calls).toBe(0);
});

test('invalid selection identities and event accessors cannot navigate',()=>{
  let calls=0;const state=createDrilldownState(model()),token=drilldownGeneration(state);
  const selection={...token,datumId:{get seriesId(){calls++;return 'north';},pointId:'north'}};
  expect(enterDrilldown(state,selection)).toBe(state);
  const event={get nodeId(){calls++;return 'overview';},generation:token.generation,datumId:{seriesId:'north',pointId:'north'}};
  expect(enterDrilldown(state,event)).toBe(state);expect(calls).toBe(0);
});

test('generic payloads and host graph extensions retain strict types',()=>{
  const result=ownDrilldownGraph(data);
  if(result.status!=='ok')throw Error(result.error.diagnostic.message);
  const source:typeof data.nodes[number]['data']|undefined=result.value.nodes.get('overview')?.data;
  const graph={...result.value,hostLabel:'native' as const};
  const state=createDrilldownState(graph);
  const moved=backDrilldown(enterDrilldown(state,select(state,'north','north')));
  const host:'native'=moved.graph.hostLabel;
  expect(host).toBe('native');expect(source).toBe(overview);
  // @ts-expect-error Source payload inference must not become any.
  const unsupported:number=result.value.nodes.get('overview')!.data;
  // @ts-expect-error Views deliberately exclude tooltip and pin state.
  const view:DrilldownView={hiddenSeriesIds:[],pinned:true};
  void unsupported;void view;
});

test('a typed source adapter supports renderer-independent payloads and cannot bypass original ID checks',()=>{
  const root={family:'custom-series',originalIds:['a','b']},child={family:'custom-series',originalIds:['c']};
  const source={rootId:'root',nodes:[{id:'root',data:root},{id:'child',data:child}],links:[{fromNodeId:'root',datumId:{seriesId:'rows',pointId:'a'},toNodeId:'child'}]};
  const adapter:DrilldownSourceAdapter<typeof root>=payload=>({type:'column',series:[{id:'rows',data:payload.originalIds.map(id=>({id}))}]});
  const result=ownDrilldownGraph(source,{source:adapter});
  expect(result.status).toBe('ok');
  if(result.status!=='ok')return;
  expect(result.value.nodes.get('root')!.data).toBe(root);
  const state=createDrilldownState(result.value);
  expect(drilldownDestination(state,{...drilldownGeneration(state),datumId:{seriesId:'rows',pointId:'a'}})).toBe('child');
  expect(drilldownDestination(state,{...drilldownGeneration(state),datumId:{seriesId:'rows',pointId:'missing'}})).toBeUndefined();
  const missing={...source,links:[{...source.links[0]!,datumId:{seriesId:'rows',pointId:'missing'}}]};
  expect(ownDrilldownGraph(missing,{source:adapter}).status).toBe('invalid');
});

test('source caches are isolated by adapter identity and adapter changes cancel old views/events',()=>{
  const adapter:DrilldownSourceAdapter<unknown>=payload=>payload as ReturnType<DrilldownSourceAdapter<unknown>>;
  const other:DrilldownSourceAdapter<unknown>=payload=>payload as ReturnType<DrilldownSourceAdapter<unknown>>;
  const first=model(data,{source:adapter}),same=model(data,{source:adapter}),changed=model(data,{source:other});
  expect(same.nodes).toBe(first.nodes);expect(same.targets).toBe(first.targets);
  expect(changed.targets).not.toBe(first.targets);
  let state=createDrilldownState(first);
  state=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:['south']});
  const old=select(state,'north','north');
  const next=reconcileDrilldown(state,changed);
  expect(next.generation).not.toBe(state.generation);
  expect(restoredDrilldownView(next)).toBeUndefined();
  expect(enterDrilldown(next,old)).toBe(next);
});

test('source adapter descriptors keep the same budgets, plain records and accessor safety',()=>{
  let calls=0;
  const badAdapter=()=>({type:'column',series:[{id:'rows',data:Array.from({length:10001},(_,i)=>({id:String(i)}))}]});
  expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{source:badAdapter}]).status).toBe('invalid');
  const accessor=()=>({get type(){calls++;return 'pie';},data:[]});
  expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{source:accessor}]).status).toBe('invalid');
  expect(calls).toBe(0);
  expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{source:()=>true}]).status).toBe('invalid');
  expect(Reflect.apply(ownDrilldownGraph,undefined,[data,{source:42}]).status).toBe('invalid');
});

test('original source references and a known zero drilldown datum remain unchanged',()=>{
  const before=JSON.stringify(data),graph=model();expect(graph.nodes.get('detail')?.data).toBe(detail);
  let state=createDrilldownState(graph);
  const overviewSelection=select(state,'north','north');
  expect(drilldownDestination(state,overviewSelection)).toBe('detail');expect(state.trail).toEqual(['overview']);
  // Only the explicit action invokes enterDrilldown. Selection alone has no effect.
  state=enterDrilldown(state,overviewSelection);expect(state.trail).toEqual(['overview','detail']);
  state=enterDrilldown(state,select(state,'sales','q1'));expect(state.trail).toEqual(['overview','detail','leaf']);
  expect(graph.nodes.get('leaf')?.data).toBe(leaf);expect(JSON.stringify(data)).toBe(before);
});

test('late output generations cannot enter another node or overwrite its saved view',()=>{
  let state=createDrilldownState(model()),old=drilldownGeneration(state);
  const next=enterDrilldown(state,{...old,datumId:{seriesId:'north',pointId:'north'}});expect(next).not.toBe(state);state=next;
  expect(enterDrilldown(state,{...old,datumId:{seriesId:'north',pointId:'north'}})).toBe(state);
  expect(rememberDrilldownView(state,old,{hiddenSeriesIds:['north']})).toBe(state);
  const parentToken=drilldownGeneration(state);state=backDrilldown(state);
  expect(enterDrilldown(state,{...parentToken,datumId:{seriesId:'sales',pointId:'q1'}})).toBe(state);
});

test('back restores only visibility and original-unit viewport values',()=>{
  let state=createDrilldownState(model());state=enterDrilldown(state,select(state,'north','north'));
  const generation=state.generation;
  state=rememberDrilldownView(state,drilldownGeneration(state),{hiddenSeriesIds:['sales'],viewport:{x:{firstId:'q1',lastId:'q2'}}});
  expect(state.generation).toBe(generation);
  state=enterDrilldown(state,select(state,'sales','q1'));state=backDrilldown(state);
  expect(restoredDrilldownView(state)).toEqual({hiddenSeriesIds:['sales'],viewport:{x:{firstId:'q1',lastId:'q2'}}});
  expect(Object.keys(restoredDrilldownView(state)!)).toEqual(['hiddenSeriesIds','viewport']);
  expect(()=>Reflect.apply(rememberDrilldownView,undefined,[state,drilldownGeneration(state),{hiddenSeriesIds:[],pinned:true}])).toThrow();
});

test('reconcile retains the closest surviving ancestor prefix and rejects old generations',()=>{
  let state=createDrilldownState(model());state=enterDrilldown(state,select(state,'north','north'));state=enterDrilldown(state,select(state,'sales','q1'));
  const token=drilldownGeneration(state),newData={rootId:'overview',nodes:[data.nodes[0]],links:[]} as const;
  state=reconcileDrilldown(state,model(newData,{}));expect(state.trail).toEqual(['overview']);expect(state.generation).not.toBe(token.generation);
  expect(rememberDrilldownView(state,token,{hiddenSeriesIds:[]})).toBe(state);
});

test('presentation-only updates reuse source indexes without rescanning original points',()=>{
  let inspected=0;
  const counted=new Proxy([...detail.series[0].data],{getOwnPropertyDescriptor(target,key){inspected++;return Reflect.getOwnPropertyDescriptor(target,key);}});
  const source={...data,nodes:[data.nodes[0],{id:'detail',data:{...detail,series:[{...detail.series[0],data:counted}]}},data.nodes[2]]};
  const first=model(source),afterSource=inspected;
  expect(afterSource).toBeGreaterThan(0);
  const second=model(source,{semantics:{detail:'category-unit'}});
  expect(inspected).toBe(afterSource);expect(second.nodes).toBe(first.nodes);expect(second.targets).toBe(first.targets);
});

test('changing active destinations rejects an event for the old destination',()=>{
  const state=createDrilldownState(model()),old=select(state,'north','north');
  const changed={...data,links:[{...data.links[0],datumId:{seriesId:'south',pointId:'south'}},data.links[1]]};
  const next=reconcileDrilldown(state,model(changed));
  expect(next.generation).not.toBe(state.generation);expect(enterDrilldown(next,old)).toBe(next);
});

test('a relocated descendant is not entered implicitly after data replacement',()=>{
  let state=createDrilldownState(model());state=enterDrilldown(state,select(state,'north','north'));state=enterDrilldown(state,select(state,'sales','q1'));
  const relocated={rootId:'overview',nodes:[data.nodes[0],data.nodes[2]],links:[{fromNodeId:'overview',datumId:{seriesId:'north',pointId:'north'},toNodeId:'leaf'}]} as const;
  state=reconcileDrilldown(state,model(relocated,{}));expect(state.trail).toEqual(['overview']);
});

test('horizontal column data uses original series/point identities without coordinate projection',()=>{
  const source={rootId:'horizontal',nodes:[{id:'horizontal',data:{...detail,orientation:'horizontal'}},{id:'leaf',data:leaf}],links:[{fromNodeId:'horizontal',datumId:{seriesId:'sales',pointId:'q1'},toNodeId:'leaf'}]} as const;
  expect(ownDrilldownGraph(source,{}).status).toBe('ok');
});

test.each(['treemap','sunburst'] as const)('%s accepts existing branch-owned source IDs',type=>{
  const hierarchy={type,root:{id:'root',children:[{id:'group',children:[{id:'child',value:1}]}]}};
  const source={rootId:'tree',nodes:[{id:'tree',data:hierarchy},{id:'leaf',data:leaf}],links:[{fromNodeId:'tree',datumId:{seriesId:'group',pointId:'child'},toNodeId:'leaf'}]} as const;
  expect(ownDrilldownGraph(source,{}).status).toBe('ok');
});
test.each(['treegraph','organization'] as const)('%s accepts declared original node groups',type=>{
  const source={rootId:'graph',nodes:[{id:'graph',data:{type,groups:[{id:'g',label:'Group'}],nodes:[{id:'n',label:'Node',groupId:'g'}],links:[]}},{id:'leaf',data:leaf}],links:[{fromNodeId:'graph',datumId:{seriesId:'g',pointId:'n'},toNodeId:'leaf'}]} as const;
  expect(ownDrilldownGraph(source,{}).status).toBe('ok');
});

test.each(['constructor','__proto__'])('original node ID %s is not confused with an inherited options property',rootId=>{
  const source={rootId,nodes:[{id:rootId,data:overview}],links:[]} as const;
  expect(ownDrilldownGraph(source,{}).status).toBe('ok');
  expect(ownDrilldownGraph(source,{semantics:Object.fromEntries([[rootId,'unit-semantics']])}).status).toBe('ok');
});

test('unknown original data targets are rejected before any inactive chart is planned',()=>{
  const source={...data,links:[{...data.links[0],datumId:{seriesId:'unknown',pointId:'north'}},data.links[1]]};
  expect(ownDrilldownGraph(source,options).status).toBe('invalid');
});
test('unreachable or cyclic graphs cannot create a hidden navigation island',()=>{
  expect(ownDrilldownGraph({...data,links:[data.links[0]]},options).status).toBe('invalid');
  const cycle={...data,links:[{fromNodeId:'detail',datumId:{seriesId:'sales',pointId:'q1'},toNodeId:'leaf'},{fromNodeId:'leaf',datumId:{seriesId:'known',pointId:'known'},toNodeId:'detail'}]};
  const result=ownDrilldownGraph(cycle,options);expect(result.status).toBe('invalid');if(result.status==='invalid')expect(result.error.diagnostic.reason).toBe('CYCLIC_DRILLDOWN_GRAPH');
});
test('a datum has one destination and a node has one parent node',()=>{
  expect(ownDrilldownGraph({...data,links:[...data.links,data.links[0]]},options).status).toBe('invalid');
  expect(ownDrilldownGraph({...data,links:[...data.links,{fromNodeId:'overview',datumId:{seriesId:'south',pointId:'south'},toNodeId:'leaf'}]},options).status).toBe('invalid');
});
test('bounded node, edge and depth budgets reject excess work',()=>{
  const chart={type:'pie',data:[{id:'next',label:'Next',value:1}]} as const;
  const nodes=Array.from({length:18},(_,i)=>({id:'node-'+i,data:chart})),links=nodes.slice(1).map((node,i)=>({fromNodeId:nodes[i]!.id,datumId:{seriesId:'next',pointId:'next'},toNodeId:node.id}));
  expect(ownDrilldownGraph({rootId:'node-0',nodes,links},{}).status).toBe('invalid');
  expect(ownDrilldownGraph({...data,nodes:Array.from({length:65},(_,i)=>({id:String(i),data:chart}))},{}).status).toBe('invalid');
  expect(ownDrilldownGraph({...data,links:Array.from({length:257},()=>data.links[0])},{}).status).toBe('invalid');
});
test('configuration accessors are rejected without invoking them',()=>{
  let calls=0;const input={rootId:'overview',nodes:data.nodes,get links(){calls++;return data.links;}};
  expect(ownDrilldownGraph(input,options).status).toBe('invalid');expect(calls).toBe(0);
});


