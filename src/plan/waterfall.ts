import {validateColumn} from '../column/validate.js';
import {finiteExtent,normalizeNumericDomain} from '../internal/math/domain.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {createMixedCategoryFrame} from '../mixed/frame.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {withPlanReferences} from './references.js';
import {freezePlan} from './input.js';
import type {PlanWaterfallSpec,PlanOptions,PlanReference,PlanResult,PlanBar,PlanCommand,PlanObservation} from '../public/plan-types.js';

/** An ordered flow has one compensated accumulator, independent of the view window. */
export function planWaterfall(spec:PlanWaterfallSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  const bad=(reason:string,path:string,message=reason):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message}});
  if(!Array.isArray(spec.series)||spec.series.length!==1)return bad('ONE_FLOW_REQUIRED','series');
  const flow=spec.series[0];if(!flow||Object.keys(flow).some(key=>!['id','name','color','data'].includes(key))||!Array.isArray(flow.data)||flow.data.length>64)return bad('FLOW_LIMIT','series');
  if(spec.startValue!==undefined&&!Number.isFinite(spec.startValue))return bad('NONFINITE_START','startValue');
  for(const point of flow.data){
    if(!point||!['delta','subtotal','total'].includes(point.kind)||Object.keys(point).some(key=>!(point.kind==='delta'?['id','x','kind','value']:['id','x','kind']).includes(key)))return bad('BAD_FLOW_POINT','series.data');
    if(point.kind==='delta'&&!Number.isFinite(point.value))return bad('COMPLETE_FLOW_REQUIRED','series.data.value','A waterfall requires finite deltas. Missing changes cannot be treated as zero.');
  }
  const {startValue:_start,family:_family,...input}=spec;
  const checked=validateColumn({...input,family:'column',series:[{...flow,data:flow.data.map(point=>({id:point.id,x:point.x,y:point.kind==='delta'?point.value:0}))}],...(references?{references}:{})});if(checked.status==='invalid')return checked;
  const axes=checked.value.axes,categories=axes.x.values;
  if(categories.length!==flow.data.length||flow.data.some((point,i)=>point.x!==categories[i]?.id))return bad('ORDERED_COMPLETE_CATEGORIES','series.data','Supply exactly one flow point per category, in category order.');
  const hidden=options.hiddenSeriesIds??[];if(hidden.some(id=>id!==flow.id))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const {width,height}=options,plot={x:16,y:14,width:width-32,height:height-28},color=flow.color??'#2C6DCD';
  const base={schema:'nc-plan/1' as const,family:'waterfall' as const,width,height,title:spec.title,description:spec.description??'',unit:axes.y.title??'',legend:[{id:flow.id,name:flow.name,color,visible:!hidden.includes(flow.id)}]};
  if(hidden.length||!flow.data.length)return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],grid:[],labels:[]},references)});
  let running=spec.startValue??0,compensation=0,checkpoint=running;
  const rows:{point:typeof flow.data[number];base:number;end:number;value:number}[]=[],extent=[0,running];
  for(const point of flow.data){
    let from=running,value:number;
    if(point.kind==='delta'){const adjusted=point.value-compensation,next=running+adjusted;compensation=(next-running)-adjusted;running=next;value=point.value;}
    else if(point.kind==='total'){from=0;value=running;}
    else{from=checkpoint;value=running-checkpoint;checkpoint=running;}
    if(![from,running,value,compensation].every(Number.isFinite))return bad('FLOW_OVERFLOW','series.data');
    rows.push({point,base:from,end:running,value});extent.push(from,running);
  }
  const domain=normalizeNumericDomain(finiteExtent(extent),{includeZero:!axes.y.domain,...(axes.y.domain?{explicit:axes.y.domain}:{})});if(domain.status==='invalid')return domain;if(domain.status==='empty')return bad('EMPTY_DOMAIN','axes.y');
  let ticks=selectNumericTicks(domain.domain,{nice:axes.y.nice??!axes.y.domain,targetCount:axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;
  const prepared=preparePlanViewport(axes,{x:null,y:ticks.value.domain},options.viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:null,y:ticks.value.domain},view);
  if(view?.value.y){ticks=selectNumericTicks(scoped.y!,{nice:false,targetCount:axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;}
  const window=view?.value.x?viewportCategoryWindow(view.value.x)??undefined:undefined,first=window?categories.findIndex(c=>c.id===window.firstId):0,last=window?categories.findIndex(c=>c.id===window.lastId):categories.length-1;
  const visible=categories.slice(first,last+1),frame=createMixedCategoryFrame(visible.map(c=>c.id),plot,spec.groupGap);if(frame.status==='invalid')return frame;
  const y=createLinearScale(ticks.value.domain,axes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],true);if(y.status==='invalid')return y;
  const bars:PlanBar[]=[],commands:PlanCommand[]=[],observations:PlanObservation[]=[];
  let previous:{right:number;end:number}|undefined;
  for(const row of rows.slice(first,last+1)){
    const band=frame.value.bands.band(row.point.x)!;
    const barWidth=Math.min(band.width,spec.maxBarWidth??band.width),left=band.center-barWidth/2,end=y.value.map(row.end)!,start=y.value.map(row.base)!;
    if(previous&&previous.end>=ticks.value.domain[0]&&previous.end<=ticks.value.domain[1])commands.push({kind:'M',x:previous.right,y:y.value.map(previous.end)!},{kind:'L',x:left,y:y.value.map(previous.end)!});
    previous={right:left+barWidth,end:row.end};
    if(Math.max(row.base,row.end)<ticks.value.domain[0]||Math.min(row.base,row.end)>ticks.value.domain[1])continue;
    bars.push({pointId:row.point.id,x:left,y:Math.min(start,end),width:barWidth,height:Math.abs(end-start)});
    const label=categories.find(c=>c.id===row.point.x)!.label??row.point.x,pointColor=row.point.kind==='delta'?(row.value<0?'#CC4F55':'#2F8C5A'):'#2C6DCD';
    observations.push({id:{seriesId:flow.id,pointId:row.point.id},label,seriesName:flow.name,value:row.value,x:band.center,y:end,color:pointColor,...(row.point.kind==='delta'?{}:{computedKind:row.point.kind})});
  }
  const result=withPlanReferences({...base,series:[{id:flow.id,name:flow.name,color,bars,commands}],observations,grid:ticks.value.ticks.map(value=>({y:y.value.map(value)!,label:String(value)})),labels:visible.map(c=>({x:frame.value.points.center(c.id)!,label:c.label??c.id})),...(view?{viewport:planViewportState(view,{x:null,y:ticks.value.domain},axes,plot)!}:{})},references,{plot,domains:{x:null,y:ticks.value.domain},mapY:y.value.map});
  return freezePlan({status:observations.length?'ok':'empty',frame:result});
}
