import {array,fail,number,record,text} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {PlanCommand,PlanOptions,PlanLegendItem} from '../public/plan-types.js';
import type {PlanRelationshipSpec} from '../public/relationship-types.js';

export interface RelationshipNode {
  id:string;label:string;groupId:string;index:number;
  incoming:number;outgoing:number;incident:number;weight:number;incomplete:boolean;
}
export interface RelationshipEdge {
  id:string;from:RelationshipNode;to:RelationshipNode;value:number|null;weight:number;index:number;
}
export interface RelationshipGraph {
  family:PlanRelationshipSpec['family'];title:string;description:string;width:number;height:number;
  input:Record<string,unknown>;nodes:RelationshipNode[];edges:RelationshipEdge[];
  groups:readonly {id:string;label:string;color:string}[];legend:PlanLegendItem[];
}
export interface Vertex {readonly x:number;readonly y:number;}
export const coordinate=(value:number)=>Math.round(value*10000)/10000;
export const vertex=(x:number,y:number):Vertex=>({x:coordinate(x),y:coordinate(y)});
export function stableTotal(values:readonly number[],path:string):number {
  let largest=0;for(const value of values)largest=Math.max(largest,value);
  if(largest===0)return 0;
  let sum=0,error=0;
  for(const value of values){const add=value/largest-error,next=sum+add;error=(next-sum)-add;sum=next;}
  const result=sum*largest;if(!Number.isFinite(result))fail(path,'UNREPRESENTABLE_RELATION_TOTAL');return result;
}

/** Own all input first. Visibility never makes malformed source data valid. */
export function relationshipGraph(spec:PlanRelationshipSpec,options:PlanOptions,family:PlanRelationshipSpec['family'],layout:readonly string[]):RelationshipGraph {
  const input=record(spec,['family','title','description','nodes','links','groups',...layout],['family','title','nodes','links'],'spec');
  if(input.family!==family)fail('family');
  const title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',4096,true):'';
  const ownOptions=record(options,['width','height','hiddenSeriesIds','stacking','references','viewport'],['width','height'],'options');
  const width=number(ownOptions.width,'options.width',64,10000),height=number(ownOptions.height,'options.height',64,10000);
  for(const key of ['stacking','references','viewport'])if(Object.hasOwn(ownOptions,key))fail('options.'+key,'UNSUPPORTED_LAYOUT_OPTION');
  const groupMap=new Map<string,{id:string;label:string}>();
  if(Object.hasOwn(input,'groups'))for(const [index,item]of array(input.groups,15,'groups').entries()){
    const path='groups['+index+']',group=record(item,['id','label'],['id','label'],path),id=text(group.id,path+'.id',128);
    if(groupMap.has(id))fail(path+'.id','DUPLICATE_GROUP_ID');groupMap.set(id,{id,label:text(group.label,path+'.label',256)});
  }
  const ids=new Set<string>(),byId=new Map<string,RelationshipNode>();
  const allNodes=array(input.nodes,64,'nodes').map((item,index):RelationshipNode=>{
    const path='nodes['+index+']',node=record(item,['id','label','groupId'],['id','label'],path),id=text(node.id,path+'.id',128),groupId=Object.hasOwn(node,'groupId')?text(node.groupId,path+'.groupId',128):'nodes';
    if(ids.has(id))fail(path+'.id','DUPLICATE_NODE_ID');ids.add(id);
    if(!groupMap.has(groupId)){if(groupId!=='nodes')fail(path+'.groupId','UNKNOWN_GROUP_ID');groupMap.set('nodes',{id:'nodes',label:title});}
    const owned={id,label:text(node.label,path+'.label',256),groupId,index,incoming:0,outgoing:0,incident:0,weight:0,incomplete:false};byId.set(id,owned);return owned;
  });
  const allEdges=array(input.links,256,'links').map((item,index):RelationshipEdge=>{
    const path='links['+index+']',edge=record(item,['id','from','to','value'],['id','from','to','value'],path),id=text(edge.id,path+'.id',128);
    if(ids.has(id))fail(path+'.id','DUPLICATE_LINK_ID');ids.add(id);
    const from=byId.get(text(edge.from,path+'.from',128)),to=byId.get(text(edge.to,path+'.to',128));
    if(!from||!to)fail(path,'UNKNOWN_NODE_ID');
    // Self-links need a different geometry and are rejected rather than silently lost.
    if(from===to)fail(path,'SELF_RELATION');
    return {id,from,to,value:edge.value===null?null:number(edge.value,path+'.value',0),weight:0,index};
  });
  const sums=(nodes:readonly RelationshipNode[],edges:readonly RelationshipEdge[])=>{
    const totals=new Map(nodes.map(node=>[node.id,{incoming:[] as number[],outgoing:[] as number[],incomplete:false}]));
    for(const edge of edges){const from=totals.get(edge.from.id)!,to=totals.get(edge.to.id)!;from.outgoing.push(edge.value??0);to.incoming.push(edge.value??0);if(edge.value===null)from.incomplete=to.incomplete=true;}
    for(const node of nodes){const own=totals.get(node.id)!;
      node.incoming=stableTotal(own.incoming,'nodes.'+node.id+'.incoming');node.outgoing=stableTotal(own.outgoing,'nodes.'+node.id+'.outgoing');
      node.incident=stableTotal([node.incoming,node.outgoing],'nodes.'+node.id+'.incident');node.incomplete=own.incomplete;
    }
  };
  sums(allNodes,allEdges);
  const hidden=new Set<string>();if(Object.hasOwn(ownOptions,'hiddenSeriesIds'))for(const [index,value]of array(ownOptions.hiddenSeriesIds,16,'options.hiddenSeriesIds').entries()){
    const path='options.hiddenSeriesIds['+index+']',id=text(value,path,128);
    if(!groupMap.has(id))fail(path,'UNKNOWN_SERIES');
    if(hidden.has(id))fail(path,'DUPLICATE_ID');
    hidden.add(id);
  }
  const nodes=allNodes.filter(node=>!hidden.has(node.groupId)),visible=new Set(nodes),edges=allEdges.filter(edge=>visible.has(edge.from)&&visible.has(edge.to));
  sums(nodes,edges);
  const largest=edges.reduce((max,edge)=>Math.max(max,edge.value??0),0);
  for(const edge of edges)edge.weight=largest?(edge.value??0)/largest:0;
  for(const edge of edges){edge.from.weight+=edge.weight;edge.to.weight+=edge.weight;}
  const palette=defaultPalette('light',false).series;
  const groups=[...groupMap.values()].map((group,index)=>({...group,color:palette[index%palette.length]!}));
  return {family,title,description,width,height,input,nodes,edges,groups,legend:groups.map(group=>({id:group.id,name:group.label,color:group.color,visible:!hidden.has(group.id)}))};
}

export function polygonCommands(vertices:readonly Vertex[]):PlanCommand[] {
  return vertices.length<3?[]:[{type:'M',...vertices[0]!},...vertices.slice(1).map(point=>({type:'L' as const,...point})),{type:'Z'}];
}

/** Quantization may collapse thin ribbons; preserve their observation without inventing area. */
export function ownPolygon(input:readonly Vertex[]):Vertex[] {
  const points:Vertex[]=[];
  for(const raw of input){const point=vertex(raw.x,raw.y),previous=points.at(-1);if(!previous||point.x!==previous.x||point.y!==previous.y)points.push(point);}
  if(points.length>1&&points[0]!.x===points.at(-1)!.x&&points[0]!.y===points.at(-1)!.y)points.pop();
  let changed=true;while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++){
    const a=points[(i+points.length-1)%points.length]!,b=points[i]!,c=points[(i+1)%points.length]!;
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(Math.abs(cross)<1e-10&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0){points.splice(i,1);changed=true;break;}
  }}
  let twiceArea=0;for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!;twiceArea+=a.x*b.y-a.y*b.x;}
  return points.length>=3&&Math.abs(twiceArea)>.0000001?points:[];
}
export const shortLabel=(value:string,width:number)=>{const chars=Array.from(value),cap=Math.max(1,Math.floor(width/7));return chars.length<=cap?value:chars.slice(0,Math.max(0,cap-1)).join('')+'…';};
