import {validateRadial} from '../radial/validate.js';
import {projectRadial} from '../radial/geometry.js';
import {validateGauge} from '../gauge/validate.js';
import {projectGauge} from '../gauge/geometry.js';
import {validateScatter} from '../scatter/validate.js';
import {normalizeScatter,scatterDomains} from '../scatter/data.js';
import {projectScatter} from '../scatter/geometry.js';
import {createLinearScale} from '../internal/math/linear.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {PlanPieSpec,PlanDonutSpec,PlanGaugeSpec,PlanBubbleSpec,PlanScatterSpec,PlanBubbleSeries,PlanResult,PlanFrame,PlanSeries,PlanObservation,PlanLegendItem,PlanViewportConfig,PlanReference,PlanCircle} from '../public/plan-types.js';
import {freezePlan} from './input.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {withPlanReferences,type PlanReferenceContext} from './references.js';
import type {PlanReferenceBand} from '../public/reference-band-plan-types.js';

const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const finish=(frame:PlanFrame,references?:readonly PlanReference[],context?:PlanReferenceContext,bands?:readonly PlanReferenceBand[]):PlanResult=>freezePlan({status:frame.observations.length?'ok':'empty',frame:withPlanReferences(frame,references,context,bands)});
const legendFor=(items:readonly Readonly<{id:string;name:string;color?:string}>[],palette:readonly string[],hidden:readonly string[]):readonly PlanLegendItem[]=>
  items.map((item,i)=>({id:item.id,name:item.name,color:item.color??palette[i%palette.length]!,visible:!hidden.includes(item.id)}));
export interface ScatterFrameContext{
  readonly plot:Readonly<{x:number;y:number;width:number;height:number}>;
  readonly xDomain:readonly[number,number];readonly yDomain:readonly[number,number];
  readonly mapX:(value:number)=>number|null;readonly mapY:(value:number)=>number|null;
}
export type ScatterFrameTransform=(frame:PlanFrame,context:ScatterFrameContext)=>PlanFrame;

/** Family orchestration over the existing radial/gauge/scatter calculation owners. */
export function planAdditional(spec:PlanPieSpec|PlanDonutSpec|PlanGaugeSpec|PlanBubbleSpec|PlanScatterSpec,width:number,height:number,hidden:readonly string[],viewport?:PlanViewportConfig,references?:readonly PlanReference[],transform?:ScatterFrameTransform,bands?:readonly PlanReferenceBand[]):PlanResult {
  const palette=defaultPalette('light',false).series;
  if(spec.family==='pie'||spec.family==='donut'){
    if(Array.isArray(spec.data)&&spec.data.length>16)return bad('SLICE_LIMIT','data');
    const checked=validateRadial(spec,spec.family);if(checked.status==='invalid')return checked;
    const input=checked.value;
    if(input.data.length>16)return bad('SLICE_LIMIT','data');
    if(hidden.some(id=>!input.data.some(p=>p.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
    const side=Math.min(width,height),legend=legendFor(input.data.map(p=>({id:p.id,name:p.label,...(p.color?{color:p.color}:{})})),palette,hidden);
    const projected=projectRadial(input,{hiddenSliceIds:[...hidden]},{x:0,y:0,width:side,height:side});if(projected.status==='invalid')return projected;
    const p=projected.value,series:PlanSeries[]=[],observations:PlanObservation[]=[];
    for(const slice of p.data.eligible){
      const point=slice.point,color=legend.find(item=>item.id===point.id)!.color,mark=p.markById.get(point.id);
      series.push({id:point.id,name:point.label,color,commands:mark?.commands??[],fill:true});
      observations.push({id:{seriesId:point.id,pointId:point.id},label:point.label,seriesName:input.title,value:point.value!,x:mark?.anchor.x??p.frame.cx,y:mark?.anchor.y??p.frame.cy,color,percentage:slice.fraction*100,...(mark?{hit:{type:'sector' as const,...p.frame,start:slice.start,end:slice.end}}:{})});
    }
    return finish({schema:'nc-plan/1',family:spec.family,width:side,height:side,title:input.title,description:input.description??'',unit:'',legend,series,observations,grid:[],labels:[],...(spec.family==='donut'?{annotations:[{x:p.frame.cx,y:p.frame.cy,text:p.data.total===null?'—':String(p.data.total),role:'value' as const}]}:{})});
  }
  if(spec.family==='gauge'){
    if(hidden.length)return bad('GAUGE_HAS_NO_LEGEND','options.hiddenSeriesIds');
    const checked=validateGauge(spec);if(checked.status==='invalid')return checked;
    const input=checked.value,side=Math.min(width,height);
    const base={schema:'nc-plan/1' as const,family:'gauge' as const,width:side,height:side,title:input.title,description:input.description??'',unit:input.unit??'',legend:[],grid:[],labels:[]};
    if(input.value===null)return finish({...base,series:[],observations:[]});
    const projected=projectGauge(input,{x:0,y:0,width:side,height:side},24);if(projected.status==='invalid')return projected;
    const p=projected.value,color=input.color??palette[0]!,series:PlanSeries[]=[
      {id:'track',name:input.title,color:'#DDE5EF',commands:p.track,fill:true},
      {id:'reading',name:input.title,color,commands:p.fill,fill:true},
      ...p.bands.map(b=>({id:'band:'+b.id,name:input.title,color:b.color,commands:b.commands,fill:true})),
      {id:'target',name:input.title,color:'#718299',commands:p.target,fill:true},
    ];
    return finish({...base,series,observations:[{id:{seriesId:'reading',pointId:'value'},label:input.title,seriesName:input.unit??'',value:input.value,x:p.anchor.x,y:p.anchor.y,color,hit:{type:'sector',...p.frame,innerRadius:0,start:p.start,end:p.start+p.span}}],annotations:[{x:p.frame.cx,y:p.readingBaseline,text:String(input.value)+(input.unit??''),role:'value'},...(input.target?[{x:p.frame.cx,y:Math.min(side-12,p.readingBaseline+50),text:(input.target.label??'Target')+' '+input.target.value+(input.unit??''),role:'label' as const}]:[])]});
  }
  const scatter=spec.family==='scatter',source=spec.series;
  if(!Array.isArray(source)||source.length>16||source.reduce((n,s)=>n+(Array.isArray(s?.data)?s.data.length:10001),0)>10000)return bad('INPUT_LIMIT','series');
  const sizes=new Map<string,{z:number;label:string}>();let maximum=0;
  for(const s of source){
    if(Object.keys(s).some(k=>!['id','name','color','data'].includes(k)))return bad('UNKNOWN_OPTION','series');
    for(const point of s.data){
    if(!scatter&&(!('z' in point)||!Number.isFinite(point.z)||point.z<0))return bad('BAD_BUBBLE_SIZE','series.data.z');
    if('label' in point&&point.label!==undefined&&(typeof point.label!=='string'||point.label.length>200))return bad('BAD_BUBBLE_LABEL','series.data.label');
    if(Object.keys(point).some(k=>!(scatter?['id','x','y']:['id','x','y','z','label']).includes(k)))return bad('UNKNOWN_OPTION','series.data');
    if(!hidden.includes(s.id)&&point.x!==null&&point.y!==null)maximum=Math.max(maximum,'z' in point?point.z:0);
    sizes.set(JSON.stringify([s.id,point.id]),{z:'z' in point?point.z:0,label:'label' in point?point.label??point.id:point.id});
  }}
  const checked=validateScatter({family:'scatter',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),...(references===undefined?{}:{references}),axes:spec.axes,series:source.map((s:PlanBubbleSeries|PlanScatterSpec['series'][number])=>({...s,data:s.data.map(p=>({id:p.id,x:p.x,y:p.y}))}))});
  if(checked.status==='invalid')return checked;
  const input=checked.value,state={hiddenSeriesIds:[...hidden]},legend=legendFor(input.series,palette,hidden);
  if(hidden.some(id=>!input.series.some(s=>s.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const base={schema:'nc-plan/1' as const,family:spec.family,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
  const data=normalizeScatter(input);if(data.status==='invalid')return data;
  const domains=scatterDomains(data.value,state);if(domains.status==='invalid')return domains;
  if(!domains.value.x||!domains.value.y)return finish({...base,series:[],observations:[],labels:[],grid:[]},references,undefined,bands);
  let xt=selectNumericTicks(domains.value.x,{nice:input.axes.x.nice??!input.axes.x.domain,targetCount:input.axes.x.ticks?.targetCount??5}),yt=selectNumericTicks(domains.value.y,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});
  if(xt.status==='invalid')return xt;if(yt.status==='invalid')return yt;
  const prepared=preparePlanViewport(input.axes,{x:xt.value.domain,y:yt.value.domain},viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:xt.value.domain,y:yt.value.domain},view);
  if(view?.value.x){xt=selectNumericTicks(scoped.x!,{nice:false,targetCount:input.axes.x.ticks?.targetCount??5});if(xt.status==='invalid')return xt;}
  if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
  const px=Math.min(48,width/4),py=Math.min(48,height/4),xr:readonly[number,number]=input.axes.x.reversed?[width-px,px]:[px,width-px],yr:readonly[number,number]=input.axes.y.reversed?[py,height-py]:[height-py,py];
  const x=createLinearScale(xt.value.domain,xr,true),y=createLinearScale(yt.value.domain,yr,true);if(x.status==='invalid')return x;if(y.status==='invalid')return y;
  const projected=projectScatter(data.value,state,{plot:{x:px,y:py,width:width-2*px,height:height-2*py},tooSmall:false,x:{domain:xt.value.domain},y:{domain:yt.value.domain},mapX:v=>x.value.map(v),mapY:v=>y.value.map(v)});if(projected.status==='invalid')return projected;
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  for(const s of projected.value.series){
    const color=legend.find(item=>item.id===s.series.spec.id)!.color,circles:PlanCircle[]=[];
    for(const p of s.targets){const size=sizes.get(JSON.stringify([s.series.spec.id,p.point.id]))!,radius=scatter?p.radius:size.z>0?Math.min(44,width/4,height/4)*Math.max(6/44,Math.sqrt(size.z/maximum)):0;
      circles.push({pointId:p.point.id,cx:p.x,cy:p.y,radius});observations.push({id:{seriesId:s.series.spec.id,pointId:p.point.id},label:size.label,seriesName:s.series.spec.name,value:p.point.y,x:p.x,y:p.y,color,xValue:p.point.x,...(scatter?{}:{sizeValue:size.z}),hit:{type:'circle',cx:p.x,cy:p.y,radius}});
    }
    series.push({id:s.series.spec.id,name:s.series.spec.name,color,circles});
  }
  const plot={x:px,y:py,width:width-2*px,height:height-2*py},frame:PlanFrame={...base,series,observations,labels:xt.value.ticks.map(v=>({x:x.value.map(v)!,label:String(v),value:v,type:'number' as const})),grid:yt.value.ticks.map(v=>({y:y.value.map(v)!,label:String(v),value:v,type:'number' as const})),...(view?{viewport:planViewportState(view,{x:xt.value.domain,y:yt.value.domain},input.axes,plot)!}:{})};
  return finish(transform?transform(frame,{plot,xDomain:xt.value.domain,yDomain:yt.value.domain,mapX:x.value.map,mapY:y.value.map}):frame,references,!data.value.series.some(series=>!hidden.includes(series.spec.id)&&series.paired.length>0)?undefined:{plot,domains:{x:xt.value.domain,y:yt.value.domain},mapX:value=>typeof value==='number'?x.value.map(value):null,mapY:y.value.map,bandSourceAxes:input.axes},bands);
}
