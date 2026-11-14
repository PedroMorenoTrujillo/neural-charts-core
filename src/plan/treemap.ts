import { invalidPlan } from './diagnostics.js';
import {validateTreemap} from '../treemap/validate.js';
import {projectTreemap} from '../treemap/geometry.js';
import {treeColors} from '../treemap/color.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanTreemapSpec,PlanOptions,PlanResult,PlanSeries,PlanObservation,PlanAnnotation,PlanBar} from '../public/plan-types.js';

/** Hierarchy validation, compensated totals and squarified tiling remain owned. */
export function planTreemap(spec:PlanTreemapSpec,options:PlanOptions):PlanResult{
  if(options.hiddenSeriesIds?.length)return invalidPlan('TREEMAP_HAS_NO_VISIBILITY_LEGEND','options.hiddenSeriesIds');
  const checked=validateTreemap(spec);if(checked.status==='invalid')return checked;
  const data=checked.value,nodes=data.hierarchy.nodes;
  if(nodes.length>512||nodes.some(node=>node.depth>16))return invalidPlan('NATIVE_TREE_LIMIT','root');
  for(const record of nodes){if((record.node.label?.length??0)>200)return invalidPlan('LABEL_LIMIT','root.label');if(Object.hasOwn(record.node,'datum')||Object.hasOwn(record.node,'colorValue'))return invalidPlan('UNSUPPORTED_TREE_FIELD','root');}
  if(new Set(nodes.map(node=>node.groupId)).size>16)return invalidPlan('TREE_GROUP_LIMIT','root.children');
  const {width,height}=options,palette=defaultPalette('light',false),colors=treeColors(data,palette);if(colors.status==='invalid')return colors;
  const projected=projectTreemap(data.hierarchy,{x:4,y:4,width:width-8,height:height-8},12,true);if(projected.status==='invalid')return projected;
  const p=projected.value,groups=new Map<string,{id:string;name:string;color:string;bars:PlanBar[]}>(),observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
  for(const target of p.targets){
    const record=target.record,node=record.node,branch=node.children!==undefined;
    if(!branch&&node.value===null)continue;
    let group=groups.get(record.groupId);
    if(!group){const parent=nodes[data.hierarchy.byId.get(record.groupId)!]!;group={id:record.groupId,name:parent.node.label??parent.node.id,color:record.parent===null?'#DDE5EF':colors.value.color(record),bars:[]};groups.set(group.id,group);}
    const label=node.label??node.id,value=branch?record.weight:node.value!;
    observations.push({id:{seriesId:group.id,pointId:node.id},label,seriesName:group.name,value,x:target.anchor.x,y:target.anchor.y,color:group.color,...(branch?{subtotal:true}:{}),...(record.missing?{incomplete:true}:{})});
    const rect=target.paint;
    if(rect&&rect.width>0&&rect.height>0)group.bars.push({pointId:node.id,...rect});
    const box=target.header??(!branch?rect:null);
    if(box&&box.width>=36&&box.height>=18&&annotations.length<64)annotations.push({x:box.x+box.width/2,y:box.y+box.height/2,text:label,role:'label',box:{width:box.width,height:Math.min(24,box.height),seriesId:group.id}});
  }
  const series:PlanSeries[]=[...groups.values()];
  return freezePlan({status:nodes[0]!.weight>0?'ok':'empty',frame:{schema:'nc-plan/1',family:'treemap',title:spec.title,description:spec.description??'',unit:'',width,height,series,observations,annotations,legend:[],grid:[],labels:[]}});
}
