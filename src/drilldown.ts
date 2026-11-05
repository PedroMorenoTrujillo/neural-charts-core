/** Framework-independent navigation for immutable chart sources. */
export interface DrilldownDatumId { readonly seriesId: string; readonly pointId: string; }
export interface DrilldownNode<D = unknown> { readonly id: string; readonly data: D; }
export interface DrilldownLink { readonly fromNodeId: string; readonly datumId: DrilldownDatumId; readonly toNodeId: string; }
export interface DrilldownData<D = unknown> { readonly rootId: string; readonly nodes: readonly DrilldownNode<D>[]; readonly links: readonly DrilldownLink[]; }
export interface DrilldownHierarchyIdentity { readonly id:string; readonly children?:readonly DrilldownHierarchyIdentity[]; }
/** Identity descriptors, independent of a renderer's chart DTO or geometry. */
export type DrilldownSource =
  | Readonly<{type:'column';series:readonly Readonly<{id:string;data:readonly Readonly<{id:string}>[]}>[]}>
  | Readonly<{type:'pie'|'donut';data:readonly Readonly<{id:string}>[]}>
  | Readonly<{type:'treegraph'|'organization';groups?:readonly Readonly<{id:string}>[];nodes:readonly Readonly<{id:string;groupId?:string}>[]}>
  | Readonly<{type:'treemap'|'sunburst';root:DrilldownHierarchyIdentity}>;
export type DrilldownSourceAdapter<D> = (payload:D)=>DrilldownSource;
export interface DrilldownGraphOptions<D = unknown> {
  readonly semantics?: Readonly<Record<string,string>>;
  readonly source?:DrilldownSourceAdapter<D>;
}
export interface DrilldownDiagnostic { readonly nodeId: string | null; readonly diagnostic: Readonly<{code:'INVALID_CONFIG';reason:string;path:string;message:string}>; }
export interface DrilldownViewportValue { readonly x?: readonly [number,number] | Readonly<{firstId:string;lastId:string}>; readonly y?: readonly [number,number]; }
export interface DrilldownView { readonly hiddenSeriesIds: readonly string[]; readonly viewport?: DrilldownViewportValue; }

/** Backing maps stay private: freezing a native Map would still expose set/delete. */
function readonlyMap<K,V>(source: ReadonlyMap<K,V>): ReadonlyMap<K,V> {
  const owned = new Map(source);
  const view: ReadonlyMap<K,V> = Object.freeze({
    get size() { return owned.size; },
    get: (key: K) => owned.get(key),
    has: (key: K) => owned.has(key),
    keys: () => owned.keys(),
    values: () => owned.values(),
    entries: () => owned.entries(),
    [Symbol.iterator]: () => owned[Symbol.iterator](),
    forEach: (callback: (value: V,key: K,map: ReadonlyMap<K,V>) => void,thisArg?: unknown) => {
      owned.forEach((value,key) => callback.call(thisArg,value,key,view));
    },
  });
  return view;
}

type Row=Readonly<Record<string,unknown>>;
const kinds=new Set(['column','pie','donut','treemap','sunburst','treegraph','organization']);
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
const datumKey=(id:DrilldownDatumId)=>JSON.stringify([id.seriesId,id.pointId]);
function record(value:unknown,keys?:readonly string[]):Row{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected a plain object.');
  const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)throw Error('Expected a plain object.');
  if(Object.getOwnPropertySymbols(value).length)throw Error('Symbol properties are not supported.');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(key=>descriptors[key]!.get||descriptors[key]!.set||keys&&!keys.includes(key)))throw Error('Unknown property or accessor.');
  return value as Row;
}
function array(value:unknown,min:number,max:number):readonly unknown[]{
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)throw Error(`Expected ${min}–${max} plain array entries.`);
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||key!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length)))throw Error('Custom array properties are not supported.');
  for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||d.get||d.set)throw Error('Sparse entries or accessors are not supported.');}
  return value;
}
function identity(value:unknown):DrilldownDatumId{
  const row=record(value,['seriesId','pointId']);if(!validId(row['seriesId'])||!validId(row['pointId']))throw Error('Expected a complete original datum identity.');
  return Object.freeze({seriesId:row['seriesId'],pointId:row['pointId']});
}

/** Only IDs required by outgoing links are retained. Scan budgets match the
 * existing source owners; we never keep a second copy of all datum rows. */
function validateSourceTargets(data:unknown,required:ReadonlySet<string>):void{
  if(!required.size)return;
  const source=record(data),found=new Set<string>(),type=source['type'];
  const see=(seriesId:unknown,pointId:unknown)=>{
    if(!validId(seriesId)||!validId(pointId))throw Error('Invalid original source identity.');
    const key=datumKey({seriesId,pointId});if(required.has(key))found.add(key);
  };
  if(type==='column'){
    let count=0;const seriesIds=new Set<string>();
    for(const item of array(source['series'],0,16)){
      const series=record(item);if(!validId(series['id'])||seriesIds.has(series['id']))throw Error('Invalid original series identity.');seriesIds.add(series['id']);
      const points=array(series['data'],0,10000);count+=points.length;if(count>10000)throw Error('Original point budget exceeded.');
      const ids=new Set<string>();for(const item of points){const point=record(item);if(!validId(point['id'])||ids.has(point['id']))throw Error('Invalid original point identity.');ids.add(point['id']);see(series['id'],point['id']);}
    }
  }else if(type==='pie'||type==='donut'){
    const ids=new Set<string>();for(const item of array(source['data'],0,16)){const point=record(item);if(!validId(point['id'])||ids.has(point['id']))throw Error('Invalid original segment identity.');ids.add(point['id']);see(point['id'],point['id']);}
  }else if(type==='treegraph'||type==='organization'){
    const groups=new Set<string>(['nodes']);for(const item of array(source['groups']??[],0,15)){const group=record(item);if(!validId(group['id']))throw Error('Invalid original group identity.');groups.add(group['id']);}
    const ids=new Set<string>();for(const item of array(source['nodes'],0,128)){const node=record(item),groupId=node['groupId']??'nodes';if(!validId(node['id'])||ids.has(node['id'])||typeof groupId!=='string'||!groups.has(groupId))throw Error('Invalid original graph node identity.');ids.add(node['id']);see(groupId,node['id']);}
  }else{
    const pending:[unknown,string|null,number][]=[[source['root'],null,0]],ids=new Set<string>();let count=0;
    while(pending.length){
      const [item,parentGroup,depth]=pending.pop()!;if(++count>512||depth>(type==='sunburst'?8:16))throw Error('Original hierarchy budget exceeded.');
      const node=record(item);if(!validId(node['id'])||ids.has(node['id']))throw Error('Invalid or cyclic original hierarchy.');ids.add(node['id']);
      // Core's transport uses the root ID for the root and each immediate
      // root child ID for its descendants. This is identity bookkeeping only.
      const groupId=depth<=1?node['id']:parentGroup!;see(groupId,node['id']);
      if(Object.hasOwn(node,'children'))for(const child of array(node['children'],0,512))pending.push([child,groupId,depth+1]);
    }
  }
  if([...required].some(key=>!found.has(key)))throw Error('A drilldown link does not name an original datum in its source chart.');
}

function numericPair(value:unknown):readonly[number,number]|undefined{
  if(value===undefined)return undefined;const pair=array(value,2,2);
  if(!pair.every(v=>typeof v==='number'&&Number.isFinite(v))||pair[0]===pair[1])throw Error('Invalid numeric source window.');
  return Object.freeze([pair[0] as number,pair[1] as number]);
}
function ownWindow(value:unknown):DrilldownViewportValue|undefined{
  if(value===undefined)return undefined;const input=record(value,['x','y']);const out:{x?:NonNullable<DrilldownViewportValue['x']>;y?:NonNullable<DrilldownViewportValue['y']>}={};
  for(const axis of ['x','y'] as const){const v=input[axis];if(v===undefined)continue;
    if(Array.isArray(v)){const pair=numericPair(v)!;if(pair[0]>=pair[1])throw Error('Expected an increasing original-unit window.');out[axis]=pair;}
    else{if(axis!=='x')throw Error('Only X can contain category window IDs.');const category=record(v,['firstId','lastId']);if(!validId(category['firstId'])||!validId(category['lastId']))throw Error('Invalid original category window.');out.x=Object.freeze({firstId:category['firstId'],lastId:category['lastId']});}
  }
  return Object.freeze(out);
}


export interface OwnedDrilldownGraph<D = unknown> {
  readonly rootId:string;
  readonly nodes:ReadonlyMap<string,DrilldownNode<D>>;
  readonly links:readonly DrilldownLink[];
  readonly parentById:ReadonlyMap<string,string>;
  readonly targets:ReadonlyMap<string,ReadonlyMap<string,string>>;
  readonly semantics:ReadonlyMap<string,string>;
}
type OwnedDrilldownSource<D = unknown> = Omit<OwnedDrilldownGraph<D>,'semantics'>;
/** Inputs and opaque payloads are immutable snapshots supplied by the host.
 * Replacing data requires a new input reference; presentation changes reuse indexes. */
const defaultSourceOwner=Object.freeze({});
const preparedSources = new WeakMap<object,WeakMap<object,OwnedDrilldownSource>>();
const sourceOwnerByTargets = new WeakMap<object,object>();
export type DrilldownGraphResult<D = unknown> = Readonly<{status:'ok';value:OwnedDrilldownGraph<D>}> | Readonly<{status:'invalid';error:DrilldownDiagnostic}>;

export function ownDrilldownGraph<T extends DrilldownData>(data:T,options:DrilldownGraphOptions<T['nodes'][number]['data']> = {}):DrilldownGraphResult<T['nodes'][number]['data']> {
  type D=T['nodes'][number]['data'];
  let path='data',nodeId:string|null=null;
  const invalid=(reason:string,message:string):DrilldownGraphResult<D>=>Object.freeze({status:'invalid',error:Object.freeze({nodeId,diagnostic:Object.freeze({code:'INVALID_CONFIG',reason,path,message})})});
  try {
    path='options';const config=record(options,['semantics','source']);
    const sourceAdapter=config['source'];
    if(sourceAdapter!==undefined&&typeof sourceAdapter!=='function')return invalid('INVALID_DRILLDOWN_SOURCE_ADAPTER','source must be an identity adapter function.');
    const owner=sourceAdapter??defaultSourceOwner;
    let cache=preparedSources.get(data);
    let preparedSource=cache?.get(owner) as OwnedDrilldownSource<D>|undefined;
    if (!preparedSource) {
    path='data';const input=record(data,['rootId','nodes','links']),nodes=new Map<string,DrilldownNode<D>>(),sources=new Map<string,unknown>();
    for(const [i,item]of array(input['nodes'],1,64).entries()){
      nodeId=null;path=`data.nodes[${i}]`;const node=record(item,['id','data']);
      if(!validId(node['id'])||nodes.has(node['id']))return invalid('INVALID_DRILLDOWN_NODE_ID','Node IDs must be unique nonempty strings.');
      nodeId=node['id'];const definition=record(sourceAdapter===undefined?node['data']:(sourceAdapter as DrilldownSourceAdapter<D>)(node['data'] as D));if(typeof definition['type']!=='string'||!kinds.has(definition['type']))return invalid('UNSUPPORTED_DRILLDOWN_TYPE','This drilldown chart identity descriptor type is not supported.');
      nodes.set(nodeId,Object.freeze({id:nodeId,data:node['data'] as D}));sources.set(nodeId,definition);
    }
    nodeId=null;path='data.rootId';if(!validId(input['rootId'])||!nodes.has(input['rootId']))return invalid('UNKNOWN_DRILLDOWN_ROOT','rootId must name an existing node.');
    const rootId=input['rootId'],parentById=new Map<string,string>(),targets=new Map<string,Map<string,string>>(),links:DrilldownLink[]=[],required=new Map<string,Set<string>>();
    for(const [i,item]of array(input['links'],0,256).entries()){
      path=`data.links[${i}]`;const link=record(item,['fromNodeId','datumId','toNodeId']);
      if(!validId(link['fromNodeId'])||!validId(link['toNodeId'])||!nodes.has(link['fromNodeId'])||!nodes.has(link['toNodeId']))return invalid('UNKNOWN_DRILLDOWN_NODE','Both ends of a link must name existing nodes.');
      const from=link['fromNodeId'],to=link['toNodeId'],datumId=identity(link['datumId']),key=datumKey(datumId);
      if(to===rootId)return invalid('DRILLDOWN_ROOT_HAS_PARENT','The root node cannot have an incoming link.');
      if(parentById.has(to)&&parentById.get(to)!==from)return invalid('MULTIPLE_DRILLDOWN_PARENTS','Each destination node has one parent node.');parentById.set(to,from);
      const next=targets.get(from)??new Map<string,string>();if(next.has(key))return invalid('AMBIGUOUS_DRILLDOWN_TARGET','An original datum has at most one drilldown destination.');next.set(key,to);targets.set(from,next);
      const expected=required.get(from)??new Set<string>();expected.add(key);required.set(from,expected);
      links.push(Object.freeze({fromNodeId:from,datumId,toNodeId:to}));
    }
    // Check all parent chains, including an otherwise unreachable cycle.
    for(const id of nodes.keys()){const visited=new Set<string>();let current:string|undefined=id;while(current!==undefined){if(visited.has(current))return invalid('CYCLIC_DRILLDOWN_GRAPH','Drilldown links must be acyclic.');visited.add(current);current=parentById.get(current);}}
    for(const id of nodes.keys()){let current=id,depth=0;while(current!==rootId){const parent=parentById.get(current);if(parent===undefined)return invalid('UNREACHABLE_DRILLDOWN_NODE','Every node must be reachable from the configured root.');current=parent;if(++depth>16)return invalid('DRILLDOWN_DEPTH_LIMIT','At most16 edges may separate a node from the root.');}}
    for(const [id,ids]of required){nodeId=id;path='data.nodes.'+id+'.data';validateSourceTargets(sources.get(id),ids);}

      const ownedTargets = new Map<string,ReadonlyMap<string,string>>();
      for (const [id,byDatum] of targets) ownedTargets.set(id,readonlyMap(byDatum));
      preparedSource=Object.freeze({rootId,nodes:readonlyMap(nodes),links:Object.freeze(links),parentById:readonlyMap(parentById),targets:readonlyMap(ownedTargets)});
      sourceOwnerByTargets.set(preparedSource.targets,owner);
      if(!cache){cache=new WeakMap();preparedSources.set(data,cache);}
      cache.set(owner,preparedSource);
    }
    nodeId=null;
    path='options.semantics';const settings=record(config['semantics']??{}),semantics=new Map<string,string>();
    for (const id of Object.keys(settings)) if (!preparedSource.nodes.has(id)) return invalid('UNKNOWN_DRILLDOWN_NODE_SEMANTICS','Node semantics must name a declared node ID.');
    for (const id of preparedSource.nodes.keys()) {
      const key=Object.hasOwn(settings,id)?settings[id]:'';
      if (typeof key!=='string'||key.length>16384) return invalid('INVALID_DRILLDOWN_NODE_SEMANTICS','Node semantics must be strings of at most16384 characters.');
      semantics.set(id,key);
    }
    return Object.freeze({status:'ok',value:Object.freeze({...preparedSource,semantics:readonlyMap(semantics)})});
  } catch(error) {return invalid('INVALID_DRILLDOWN_CONFIG',error instanceof Error?error.message:'Invalid drilldown configuration.');}
}

export interface DrilldownGeneration {readonly nodeId:string;readonly generation:object;}
export interface DrilldownSelection extends DrilldownGeneration {readonly datumId:DrilldownDatumId;}
interface SavedNodeView{readonly data:unknown;readonly semantics:string;readonly view:DrilldownView;}
export interface DrilldownState<G extends OwnedDrilldownGraph = OwnedDrilldownGraph>{
  readonly graph:G;
  readonly trail:readonly string[];
  readonly generation:object;
  readonly views:ReadonlyMap<string,SavedNodeView>;
}
const epoch=()=>Object.freeze({});
export const currentDrilldownNode=<G extends OwnedDrilldownGraph>(state:DrilldownState<G>)=>state.trail[state.trail.length-1]!;
export const drilldownGeneration=<G extends OwnedDrilldownGraph>(state:DrilldownState<G>):DrilldownGeneration=>Object.freeze({nodeId:currentDrilldownNode(state),generation:state.generation});
const currentEvent=(state:DrilldownState,event:DrilldownGeneration)=>{
  try {
    const input=record(event,['nodeId','generation','datumId']);
    return input['nodeId']===currentDrilldownNode(state)&&input['generation']===state.generation;
  } catch { return false; }
};
export function createDrilldownState<G extends OwnedDrilldownGraph>(graph:G):DrilldownState<G>{return Object.freeze({graph,trail:Object.freeze([graph.rootId]),generation:epoch(),views:readonlyMap(new Map<string,SavedNodeView>())});}

export function drilldownDestination<G extends OwnedDrilldownGraph>(state:DrilldownState<G>,selection:DrilldownSelection):string|undefined{
  if(!currentEvent(state,selection))return undefined;
  try {return state.graph.targets.get(selection.nodeId)?.get(datumKey(identity(selection.datumId)));}
  catch {return undefined;}
}
/** Called only by an explicit host action such as View detail. Merely receiving
 * an interaction/Next event must never invoke this transition automatically. */
export function enterDrilldown<G extends OwnedDrilldownGraph>(state:DrilldownState<G>,selection:DrilldownSelection):DrilldownState<G>{
  const to=drilldownDestination(state,selection);if(!to||state.trail.length>16||state.graph.parentById.get(to)!==currentDrilldownNode(state))return state;
  return Object.freeze({...state,trail:Object.freeze([...state.trail,to]),generation:epoch()});
}
export function backDrilldown<G extends OwnedDrilldownGraph>(state:DrilldownState<G>):DrilldownState<G>{
  return state.trail.length===1?state:Object.freeze({...state,trail:Object.freeze(state.trail.slice(0,-1)),generation:epoch()});
}
export function rememberDrilldownView<G extends OwnedDrilldownGraph>(state:DrilldownState<G>,event:DrilldownGeneration,input:DrilldownView):DrilldownState<G>{
  if(!currentEvent(state,event))return state;
  const row=record(input,['hiddenSeriesIds','viewport']),ids=array(row['hiddenSeriesIds'],0,16);
  if(!ids.every(validId)||new Set(ids).size!==ids.length)throw Error('Invalid saved visibility.');
  const view=Object.freeze({hiddenSeriesIds:Object.freeze([...ids] as string[]),...(row['viewport']===undefined?{}:{viewport:ownWindow(row['viewport'])!})}),node=state.graph.nodes.get(event.nodeId)!;
  const views=new Map(state.views);views.set(event.nodeId,Object.freeze({data:node.data,semantics:state.graph.semantics.get(event.nodeId)!,view}));
  // A view update does not change the renderer generation or clear selection.
  return Object.freeze({...state,views:readonlyMap(views)});
}
export function restoredDrilldownView<G extends OwnedDrilldownGraph>(state:DrilldownState<G>,nodeId=currentDrilldownNode(state)):DrilldownView|undefined{
  const saved=state.views.get(nodeId),node=state.graph.nodes.get(nodeId);
  return saved&&saved.data===node?.data&&saved.semantics===state.graph.semantics.get(nodeId)?saved.view:undefined;
}
/** Stay on the surviving original ancestor prefix. A relocated descendant is
 * not entered implicitly. Presentation-only changes preserve the active token;
 * source, active destinations and numeric semantics changes reject stale events. */
export function reconcileDrilldown<G extends OwnedDrilldownGraph>(state:DrilldownState<G>,graph:G):DrilldownState<G>{
  if(state.graph===graph)return state;
  const trail=[graph.rootId];
  if(state.trail[0]===graph.rootId)for(const id of state.trail.slice(1)){if(!graph.nodes.has(id)||graph.parentById.get(id)!==trail[trail.length-1])break;trail.push(id);}
  const views=new Map<string,SavedNodeView>();
  const sameOwner=sourceOwnerByTargets.get(state.graph.targets)===sourceOwnerByTargets.get(graph.targets);
  if(sameOwner)for(const [id,saved]of state.views){const node=graph.nodes.get(id);if(node&&saved.data===node.data&&saved.semantics===graph.semantics.get(id))views.set(id,saved);}
  const active=currentDrilldownNode(state),nextActive=trail[trail.length-1]!;
  const previousTargets=state.graph.targets.get(active),nextTargets=graph.targets.get(nextActive);
  const sameTargets=(previousTargets?.size??0)===(nextTargets?.size??0)&&(!previousTargets||[...previousTargets].every(([key,value])=>nextTargets?.get(key)===value&&state.graph.nodes.get(value)?.data===graph.nodes.get(value)?.data&&state.graph.semantics.get(value)===graph.semantics.get(value)));
  const retainGeneration=sameOwner&&active===nextActive&&state.trail.length===trail.length&&state.trail.every((id,index)=>id===trail[index])&&state.graph.nodes.get(active)?.data===graph.nodes.get(active)?.data&&state.graph.semantics.get(active)===graph.semantics.get(active)&&sameTargets;
  return Object.freeze({graph,trail:Object.freeze(trail),generation:retainGeneration?state.generation:epoch(),views:readonlyMap(views)});
}
