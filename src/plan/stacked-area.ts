import { planLegend } from './plan-presentation.js';
import {validateStackedArea} from '../stacked-area/validate.js';
import {normalizeStackedArea,areaStack,stackAreaDomains} from '../stacked-area/data.js';
import {projectStackedArea} from '../stacked-area/geometry.js';
import {pointKey} from '../line/normalize.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks,createTimeScale} from '../internal/math/time.js';
import {createLinearScale} from '../internal/math/linear.js';
import {createCategoryFrame,createPointScale} from '../internal/math/category.js';
import {formatAxis,type AxesPlan} from '../internal/axes/plan.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planViewportState,planLineViewportScales} from './viewport.js';
import {withPlanReferences,referenceCategories} from './references.js';
import {freezePlan} from './input.js';
import {planStackLabels} from './stack-labels.js';
import type {PlanAreaSpec,PlanAreaSplineSpec,PlanOptions,PlanReference,PlanResult,PlanSeries,PlanObservation} from '../public/plan-types.js';
import {smoothStackBands} from './smooth-stack.js';

/** Public orchestration only; stacking, signed bands and projection use their owners. */
export function planStackedArea(spec:PlanAreaSpec|PlanAreaSplineSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  const checked=validateStackedArea({...spec,family:'stacked-area',stacking:options.stacking,...(references?{references}:{})});
  if(checked.status==='invalid')return checked;
  const input=checked.value,hidden=options.hiddenSeriesIds??[],state={hiddenSeriesIds:[...hidden]};
  if(hidden.some(id=>!input.series.some(s=>s.id===id)))return {status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'UNKNOWN_SERIES',path:'options.hiddenSeriesIds',message:'Unknown series ID.'}};
  if(input.axes.x.type==='category'&&input.axes.x.values.length>64)return {status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'LABEL_LIMIT',path:'axes.x.values',message:'Maximum 64 categories.'}};
  const data=normalizeStackedArea(input),stack=areaStack(data,state);if(stack.status==='invalid')return stack;
  const domains=stackAreaDomains(data,stack.value);if(domains.status==='invalid')return domains;
  const {width,height}=options,plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false).series;
  const legend=planLegend(input.series,palette,hidden);
  const base={schema:'nc-plan/1' as const,family:spec.family,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
  if(!domains.value.y)return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],labels:[],grid:[]},references,undefined,options.referenceBands)});
  const xa=input.axes.x;
  let yt=selectNumericTicks(domains.value.y,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
  let xt=xa.type==='category'||!domains.value.x?null:(xa.type==='time'?selectTimeTicks:selectNumericTicks)(domains.value.x,{nice:xa.nice??false,targetCount:xa.ticks?.targetCount??6});if(xt?.status==='invalid')return xt;
  const prepared=preparePlanViewport(input.axes,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},options.viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:xt?.value.domain??domains.value.x,y:yt.value.domain},view);
  if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
  if(view?.value.x&&xa.type!=='category'&&scoped.x){xt=(xa.type==='time'?selectTimeTicks:selectNumericTicks)(scoped.x,{nice:false,targetCount:xa.ticks?.targetCount??6});if(xt.status==='invalid')return xt;}
  const xDomain=xt?.value.domain??domains.value.x,yDomain=yt.value.domain,interval=xt&&'interval' in xt.value?xt.value.interval:null;
  const requested=planLineViewportScales(input.axes,plot,xDomain,yDomain,view);if(requested.status==='invalid')return requested;
  let maps=requested.value;
  if(!maps){
    const y=createLinearScale(yDomain,input.axes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false);if(y.status==='invalid')return y;
    if(xa.type==='category'){
      const frame=createCategoryFrame(xa.values.map(c=>c.id),[plot.x,plot.x+plot.width],xa.edgeSpacing??.5);if(frame.status==='invalid')return frame;
      const x=createPointScale(frame.value);maps={mapX:value=>typeof value==='string'?x.center(value):null,mapY:y.value.map};
    }else{
      if(!xDomain)return {status:'invalid',diagnostic:{code:'INVALID_DOMAIN',reason:'UNREPRESENTABLE_GEOMETRY',path:'axes.x',message:'Missing X domain.'}};
      const x=(xa.type==='time'?createTimeScale:createLinearScale)(xDomain,[plot.x,plot.x+plot.width],false);if(x.status==='invalid')return x;
      maps={mapX:value=>typeof value==='number'?x.value.map(value):null,mapY:y.value.map};
    }
  }
  const axes:AxesPlan={plot,tooSmall:false,...maps,x:{domain:xDomain,ticks:xt?.value.ticks??[],labels:[],interval,target:6},y:{domain:yDomain,ticks:yt.value.ticks,labels:[],interval:null,target:5},xTitle:null,yTitle:null,font:{family:'sans-serif',size:12,weight:400},direction:'ltr'};
  const projected=projectStackedArea(data,state,stack.value,axes);if(projected.status==='invalid')return projected;
  const p=projected.value,series:PlanSeries[]=[],observations:PlanObservation[]=[];
  const smooth=spec.family==='areaspline'?smoothStackBands(p.fills):undefined;
  for(const s of p.series){
    const color=legend.find(item=>item.id===s.series.spec.id)!.color;
    const band=smooth?.get(s.series.spec.id);
    series.push({id:s.series.spec.id,name:s.series.spec.name,color,commands:band?.commands??s.commands,areaCommands:band?.areaCommands??p.fills.get(s.series.spec.id)??[]});
    for(const point of s.eligible){
      const label=formatAxis(point.point.x,xa.type,interval,data.line.labels),segment=p.segments.get(pointKey(s.series.spec.id,point.point.id))!;
      observations.push({id:{seriesId:s.series.spec.id,pointId:point.point.id},label,seriesName:s.series.spec.name,value:point.point.y!,x:point.x,y:point.y,color,...(segment.percentage===null?{}:{percentage:segment.percentage}),group:{key:JSON.stringify([xa.type,point.point.x]),label,coordinate:point.x}});
    }
  }
  const values=xa.type==='category'?xa.values.map(c=>c.id):(xt?.value.ticks??[]),labels=values.flatMap(value=>{const x=p.mapX(value);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:formatAxis(value,xa.type,interval,data.line.labels),...(typeof value==='number'?{value,type:xa.type==='time'?'time' as const:'number' as const}:{})}];});
  const annotations=planStackLabels(stack.value.categories.values(),stack.value.mode,yDomain,id=>p.mapX(data.coordinates[Number(id.slice(1))]!),p.mapY).filter(label=>label.x>=plot.x&&label.x<=plot.x+plot.width);
  const frame=withPlanReferences({...base,series,observations,labels,annotations,grid:yt.value.ticks.map(value=>({y:p.mapY(value)!,label:String(value),value:value,type:'number' as const})),...(view?{viewport:planViewportState(view,{x:xDomain,y:yDomain},input.axes,plot)!}:{})},references,{plot,domains:{x:xDomain,y:yDomain},mapX:p.mapX,mapY:p.mapY,bandSourceAxes:input.axes,...(xa.type==='category'?{categories:referenceCategories(xa.values,plot,p.mapX)}:{})},options.referenceBands);
  return freezePlan({status:observations.length?'ok':'empty',frame});
}
