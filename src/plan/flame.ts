import {planXRange} from './xrange.js';
import {freezePlan} from './input.js';
import type {PlanFlameSpec,PlanFlameSpan,PlanFlameValue} from '../public/flame-plan-types.js';
import type {PlanOptions,PlanResult} from '../public/plan-types.js';
interface Span {source:PlanFlameSpan;index:number;depth?:number;children:Span[];}
const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
/** Derive bounded trace depth, then reuse the public temporal projection owner. */
export function planFlame(spec:PlanFlameSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','axes','data','rowPadding'].includes(k)))return bad('UNKNOWN_FLAME_OPTION','spec');
  if(!text(spec.title,200)||spec.description!==undefined&&!text(spec.description,1000)||!spec.axes||typeof spec.axes!=='object'||Object.keys(spec.axes).some(k=>k!=='x')||!Array.isArray(spec.data)||spec.data.length>2048)return bad('BAD_FLAME_SOURCE','spec');
  if((options.hiddenSeriesIds?.length??0)>0||options.stacking!==undefined)return bad('FLAME_HAS_NO_VISIBILITY_STACKS','options');
  const spans:Span[]=[],byId=new Map<string,Span>();
  for(const [index,source]of spec.data.entries()){
    const path='data['+index+']';
    if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!['id','label','start','end','parentId'].includes(k))||!text(source.id,128)||!source.id||byId.has(source.id)||!text(source.label,200)||!Number.isFinite(source.start)||!Number.isFinite(source.end)||source.end<source.start||!Number.isFinite(source.end-source.start)||source.parentId!==undefined&&(!text(source.parentId,128)||!source.parentId))return bad('BAD_FLAME_SPAN',path);
    const span:Span={source,index,children:[]};spans.push(span);byId.set(source.id,span);
  }
  const roots:Span[]=[];
  for(const span of spans){const id=span.source.parentId;if(id===undefined){roots.push(span);continue;}const parent=byId.get(id);if(!parent)return bad('UNKNOWN_FLAME_PARENT','data['+span.index+'].parentId');if(span.source.start<parent.source.start||span.source.end>parent.source.end)return bad('FLAME_CHILD_OUTSIDE_PARENT','data['+span.index+']');parent.children.push(span);}
  let maxDepth=0;
  for(const span of spans){if(span.depth!==undefined)continue;const chain:Span[]=[],seen=new Set<string>();let current:Span|undefined=span;
    while(current&&current.depth===undefined){if(seen.has(current.source.id))return bad('CYCLIC_FLAME_PARENT','data['+current.index+'].parentId');if(chain.length>32)return bad('FLAME_DEPTH_LIMIT','data['+span.index+']');seen.add(current.source.id);chain.push(current);current=current.source.parentId===undefined?undefined:byId.get(current.source.parentId);}
    let depth=current?.depth??-1;
    for(const node of chain.reverse()){node.depth=++depth;if(depth>31)return bad('FLAME_DEPTH_LIMIT','data['+node.index+']');maxDepth=Math.max(maxDepth,depth);}
  }
  const siblingGroups=[roots,...spans.map(s=>s.children)];
  for(const group of siblingGroups){const ordered=[...group].sort((a,b)=>a.source.start-b.source.start||a.source.end-b.source.end||a.index-b.index);let end=-Infinity;
    for(const node of ordered){const s=node.source;if(s.start===s.end)continue;if(s.start<end)return bad('OVERLAPPING_FLAME_SIBLINGS','data['+node.index+']');end=s.end;}
  }
  const roles=new Map<string,PlanFlameValue>();
  for(const span of spans){let sum=0,correction=0;for(const child of span.children){const value=child.source.end-child.source.start,t=sum+value;correction+=Math.abs(sum)>=Math.abs(value)?(sum-t)+value:(value-t)+sum;sum=t;}
    const duration=span.source.end-span.source.start,self=duration-(sum+correction),tolerance=Math.max(duration,1)*Number.EPSILON*Math.max(span.children.length,1)*4;
    if(!Number.isFinite(self)||self< -tolerance)return bad('UNREPRESENTABLE_FLAME_DURATION','data['+span.index+']');
    roles.set(span.source.id,{...(span.source.parentId===undefined?{}:{parentId:span.source.parentId}),depth:span.depth!,childCount:span.children.length,selfDuration:Math.max(0,self)});
  }
  const result=planXRange({family:'xrange',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),axes:{x:spec.axes.x,y:{type:'category',values:spans.length?Array.from({length:maxDepth+1},(_,depth)=>({id:'depth-'+depth,label:String(depth)})):[]}},series:[{id:'profile',name:spec.title,data:spans.map(({source,depth})=>({id:source.id,label:source.label,rowId:'depth-'+depth,start:source.start,end:source.end}))}],grouping:'overlap',rowPadding:spec.rowPadding??.08},options);
  if(result.status==='invalid')return result;
  return freezePlan({status:result.status,frame:{...result.frame,family:'flame',legend:[],flame:{maxDepth:spans.length?maxDepth:0,nodeCount:spans.length,rootCount:roots.length},observations:result.frame.observations.map(({group,...point})=>({...point,flame:roles.get(point.id.pointId)!}))}});
}
