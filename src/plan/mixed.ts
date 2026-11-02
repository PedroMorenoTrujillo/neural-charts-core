import {validateMixed} from '../mixed/validate.js';
import {normalizeMixed,mixedDomains} from '../mixed/data.js';
import {createMixedCategoryFrame} from '../mixed/frame.js';
import {projectMixed} from '../mixed/geometry.js';
import {mixedScene} from '../mixed/scene.js';
import {seriesKey} from '../line/normalize.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {emptyLayers} from '../internal/axes/scene.js';
import type {AxesPlan} from '../internal/axes/plan.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {preparePlanViewport,planViewportState,planLineViewportScales} from './viewport.js';
import {withPlanReferences,referenceCategories} from './references.js';
import {freezePlan} from './input.js';
import type {PlanMixedSpec,PlanOptions,PlanReference,PlanResult,PlanSeries,PlanObservation} from '../public/plan-types.js';

/** One category frame and one value scale; no overlaid independent charts. */
export function planMixed(spec:PlanMixedSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  const checked=validateMixed({...spec,...(references?{references}:{})});if(checked.status==='invalid')return checked;
  const input=checked.value,hidden=options.hiddenSeriesIds??[],state={hiddenSeriesIds:[...hidden]};
  const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
  if(hidden.some(id=>!input.series.some(s=>s.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  if(input.axes.x.values.length>64)return bad('LABEL_LIMIT','axes.x.values');
  const data=normalizeMixed(input),domains=mixedDomains(data,state);if(domains.status==='invalid')return domains;
  const {width,height}=options,plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false);
  const legend=input.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette.series[i%palette.series.length]!,visible:!hidden.includes(s.id)}));
  const base={schema:'nc-plan/1' as const,family:'mixed' as const,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
  if(!domains.value.y)return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],labels:[],grid:[]},references,undefined,options.referenceBands)});
  let yt=selectNumericTicks(domains.value.y,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
  const prepared=preparePlanViewport(input.axes,{x:null,y:yt.value.domain},options.viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:null,y:yt.value.domain},view);
  if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
  const window=view?.value.x?viewportCategoryWindow(view.value.x)??undefined:undefined,all=input.axes.x.values;
  const first=window?all.findIndex(c=>c.id===window.firstId):0,last=window?all.findIndex(c=>c.id===window.lastId):all.length-1;
  const visible=all.slice(first,last+1),shared=createMixedCategoryFrame(visible.map(c=>c.id),plot,input.groupGap);if(shared.status==='invalid')return shared;
  const y=createLinearScale(yt.value.domain,input.axes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false);if(y.status==='invalid')return y;
  const extended=planLineViewportScales(input.axes,plot,null,yt.value.domain,view);if(extended.status==='invalid')return extended;
  const maps=extended.value??{mapX:(value:string|number)=>typeof value==='string'?shared.value.points.center(value):null,mapY:y.value.map};
  const axes:AxesPlan={plot,tooSmall:false,...maps,x:{domain:null,ticks:visible.map(c=>c.id),labels:[],interval:null,target:6},y:{domain:yt.value.domain,ticks:yt.value.ticks,labels:[],interval:null,target:5},xTitle:null,yTitle:null,font:{family:'sans-serif',size:12,weight:400},direction:'ltr'};
  const projected=projectMixed(data,state,axes,shared.value,window);if(projected.status==='invalid')return projected;
  const p=projected.value,layers=emptyLayers(),painted=mixedScene(p,palette,layers,new Map());if(painted.status==='invalid')return painted;
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  for(const s of p.line.series){
    const id=s.series.spec.id,color=legend.find(item=>item.id===id)!.color,key=seriesKey(id),kind=data.kinds.get(id);
    if(kind==='column')series.push({id,name:s.series.spec.name,color,bars:(p.column?.rects??[]).filter(rect=>rect.series.spec.id===id).map(rect=>({pointId:rect.point.id,x:rect.x,y:rect.y,width:rect.width,height:rect.height}))});
    else series.push({id,name:s.series.spec.name,color,commands:s.commands,...(kind==='area'?{areaCommands:layers.marks.flatMap(mark=>mark.kind==='path'&&mark.key.startsWith(key+'|area:')?mark.commands:[])}:{})});
  }
  for(const row of p.index.targets)for(const target of row){const s=target.series.series.spec,point=target.point,label=data.line.labels.get(String(point.point.x))??String(point.point.x),coordinate=maps.mapX(point.point.x)!;observations.push({id:{seriesId:s.id,pointId:point.point.id},label,seriesName:s.name,value:point.point.y!,x:point.x,y:point.y,color:legend.find(item=>item.id===s.id)!.color,group:{key:JSON.stringify(['category',point.point.x]),label,coordinate}});}
  // Preserve semantic/legend order while matching the owner's paint precedence.
  const rank=(id:string)=>data.kinds.get(id)==='area'?0:data.kinds.get(id)==='column'?1:2;
  series.sort((a,b)=>rank(a.id)-rank(b.id));
  const frame=withPlanReferences({...base,series,observations,labels:visible.map(c=>({x:maps.mapX(c.id)!,label:c.label??c.id})),grid:yt.value.ticks.map(value=>({y:maps.mapY(value)!,label:String(value)})),...(view?{viewport:planViewportState(view,{x:null,y:yt.value.domain},input.axes,plot)!}:{})},references,{plot,domains:{x:null,y:yt.value.domain},...maps,bandSourceAxes:input.axes,categories:referenceCategories(all,plot,maps.mapX)},options.referenceBands);
  return freezePlan({status:observations.length?'ok':'empty',frame});
}
