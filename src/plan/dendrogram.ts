import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanDendrogramSpec,PlanDendrogramNode,PlanDendrogramValue,PlanDendrogramLayout} from '../public/dendrogram-plan-types.js';
import type {PlanOptions,PlanResult,PlanObservation,PlanCommand,PlanAnnotation} from '../public/plan-types.js';
const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;
interface Cluster {source:PlanDendrogramNode;parent:Cluster|null;children:Cluster[];depth:number;first:number;last:number;leafCount:number;height:number;x:number;y:number;}

/** Ordered clustering geometry: real merge heights or explicitly derived topology levels. */
export function planDendrogram(spec:PlanDendrogramSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','root','unit','orientation'].includes(k)))return bad('UNKNOWN_OPTION','spec');
  if(!text(spec.title,200)||spec.description!==undefined&&!text(spec.description,1000)||spec.unit!==undefined&&!text(spec.unit,64))return bad('BAD_DESCRIPTION','title');
  if(spec.orientation!==undefined&&!['horizontal','vertical'].includes(spec.orientation))return bad('BAD_ORIENTATION','orientation');
  if(options.viewport!==undefined||options.references!==undefined||options.stacking!==undefined||(options.hiddenSeriesIds?.length??0)>0)return bad('UNSUPPORTED_DENDROGRAM_OPTION','options');
  const nodes:Cluster[]=[],ids=new Set<string>();let leaves=0,error:PlanResult|undefined;
  const visit=(source:PlanDendrogramNode,parent:Cluster|null,depth:number):Cluster|null=>{
    if(error)return null;
    if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!['id','label','height','children'].includes(k))||!text(source.id,128)||!source.id||ids.has(source.id)||source.label!==undefined&&!text(source.label,200)||source.height!==undefined&&(!Number.isFinite(source.height)||source.height<0)||source.children!==undefined&&!Array.isArray(source.children)){error=bad('BAD_DENDROGRAM_NODE','root');return null;}
    if(nodes.length>=128||depth>16){error=bad('DENDROGRAM_NODE_LIMIT','root');return null;}
    ids.add(source.id);const node:Cluster={source,parent,children:[],depth,first:leaves,last:leaves,leafCount:0,height:0,x:0,y:0};nodes.push(node);
    for(const child of source.children??[]){const c=visit(child,node,depth+1);if(c)node.children.push(c);}
    if(error)return null;
    if(!node.children.length){if(source.height!==undefined&&source.height!==0){error=bad('DENDROGRAM_LEAF_HEIGHT_IS_ZERO','root.height');return null;}node.first=node.last=leaves++;node.leafCount=1;if(leaves>64){error=bad('DENDROGRAM_LEAF_LIMIT','root');return null;}}
    else{node.first=node.children[0]!.first;node.last=node.children.at(-1)!.last;node.leafCount=node.children.reduce((n,c)=>n+c.leafCount,0);}
    return node;
  };
  const root=visit(spec.root,null,0);if(error)return error;if(!root)return bad('BAD_DENDROGRAM_NODE','root');
  const internal=nodes.filter(n=>n.children.length),provided=internal.filter(n=>n.source.height!==undefined),distance=provided.length>0||internal.length===0&&spec.root.height!==undefined;
  if(distance&&provided.length!==internal.length)return bad('INCOMPLETE_DENDROGRAM_HEIGHTS','root.height');
  if(!distance&&spec.unit!==undefined&&spec.unit!=='levels')return bad('TOPOLOGY_HEIGHT_HAS_NO_PHYSICAL_UNIT','unit');
  for(const node of [...nodes].reverse()){
    node.height=distance?(node.source.height===0?0:node.source.height??0):node.children.length?1+Math.max(...node.children.map(c=>c.height)):0;
    if(node.children.some(c=>c.height>node.height))return bad('DENDROGRAM_HEIGHT_BELOW_CHILD','root.height');
  }
  const {width,height}=options,vertical=spec.orientation==='vertical',marginX=Math.min(24,width*.1),marginY=Math.min(24,height*.1),labelWidth=Math.min(112,width*.32);
  const plot={x:marginX,y:marginY,width:Math.max(8,width-marginX-(vertical?marginX:labelWidth+16)),height:Math.max(8,height-marginY-(vertical?48:marginY))};
  const heightScale=root.height>0?createLinearScale([0,root.height],vertical?[plot.y+plot.height,plot.y]:[plot.x+plot.width,plot.x],false):null;if(heightScale?.status==='invalid')return heightScale;
  const mapHeight=(value:number)=>heightScale?.value.map(value)??(vertical?plot.y+plot.height:plot.x+plot.width);
  for(const node of nodes){const fraction=(node.first+node.last+1)/2/leaves;node.x=vertical?plot.x+fraction*plot.width:mapHeight(node.height);node.y=vertical?mapHeight(node.height):plot.y+fraction*plot.height;}
  const commands:PlanCommand[]=[];
  for(const node of nodes)if(node.parent){const parent=node.parent;commands.push({type:'M',x:parent.x,y:parent.y},vertical?{type:'L',x:node.x,y:parent.y}:{type:'L',x:parent.x,y:node.y},{type:'L',x:node.x,y:node.y});}
  const unit=distance?spec.unit??'':'levels',color=defaultPalette('light',false).series[0]!,observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
  for(const node of nodes){
    const leaf=node.children.length===0,label=node.source.label??node.source.id,role:PlanDendrogramValue={type:leaf?'leaf':'cluster',heightMode:distance?'distance':'topology',heightSource:node.source.height!==undefined?'source':leaf?'leafZero':'topology',leafCount:node.leafCount,depth:node.depth,unit};
    observations.push({id:{seriesId:'tree',pointId:node.source.id},label,seriesName:spec.title,value:node.height,x:node.x,y:node.y,color,hit:{type:'circle',cx:node.x,cy:node.y,radius:7},dendrogram:role});
    if(!leaf||!label)continue;
    const w=vertical?Math.min(112,plot.width/leaves-6):labelWidth,h=vertical?28:18,x=vertical?node.x:node.x+8+w/2,y=vertical?node.y+18:node.y;
    if(w<32||!vertical&&plot.height/leaves<20||x-w/2<0||x+w/2>width||y-h/2<0||y+h/2>height)continue;
    const maximum=Math.max(3,Math.floor(w/7)),bounded=label.length>maximum?label.slice(0,maximum-1)+'…':label;
    annotations.push({x,y,text:bounded,role:'label',box:{width:w,height:h,seriesId:'tree'}});
  }
  let values:readonly number[]=[];
  if(root.height>0){const ticks=selectNumericTicks([0,root.height],{nice:false,targetCount:5});if(ticks.status==='invalid')return ticks;values=[0,...ticks.value.ticks.filter(v=>v>0&&v<root.height),root.height];}
  const dendrogram:PlanDendrogramLayout={orientation:vertical?'vertical':'horizontal',heightMode:distance?'distance':'topology',maxHeight:root.height,nodeCount:nodes.length,leafCount:leaves,unit};
  return freezePlan({status:'ok',frame:{schema:'nc-plan/1',family:'dendrogram',title:spec.title,description:spec.description??'',unit,width,height,legend:[],series:[{id:'tree',name:spec.title,color,commands,circles:nodes.map(n=>({pointId:n.source.id,cx:n.x,cy:n.y,radius:3}))}],observations,annotations,labels:vertical?[]:values.map(value=>({x:mapHeight(value),label:String(value)})),grid:vertical?values.map(value=>({y:mapHeight(value),label:String(value)})):[],dendrogram}});
}
