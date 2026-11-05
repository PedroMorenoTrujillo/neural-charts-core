import type {PlanPieSpec,PlanDonutSpec,PlanGaugeSpec,PlanOptions,PlanFrame,PlanResult,PlanSeries,PlanObservation} from '../public/plan-types.js';
import type {PlanCircularFrame,PlanGaugeCircularBase} from '../public/circular-plan-types.js';
import {validateRadial} from '../radial/validate.js';
import {projectRadial} from '../radial/geometry.js';
import {validateGauge} from '../gauge/validate.js';
import {sectorPath,polar,type RadialFrame} from '../internal/geometry/radial-sector.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import {circularBounds} from './circular-bounds.js';

const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const finish=(frame:PlanFrame):PlanResult=>freezePlan({status:frame.observations.length?'ok':'empty',frame});
const degrees=Math.PI/180;
// The shared path owner accepts a start within one turn. Hit intervals retain
// their unwrapped angular origin, while each drawn sector uses the same arc
// translated by whole turns. Later slices/bands can start beyond the seam.
function circularPath(frame:RadialFrame,start:number,end:number){
 const tau=Math.PI*2,origin=((start%tau)+tau)%tau;
 return sectorPath(frame,origin,origin+Math.min(tau,Math.max(0,end-start)));
}
/** New display envelopes reuse the frozen radial normalization and scalar scale. */
export function planCircularDisplay(spec:PlanPieSpec|PlanDonutSpec|PlanGaugeSpec,options:PlanOptions):PlanResult{
 const config=options.circular===undefined?{}:options.circular,gauge=spec.family==='gauge';
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['startAngle','endAngle','gaugeStyle','tickCount'].includes(k)))return bad('BAD_CIRCULAR_OPTIONS','options.circular');
 if(!gauge&&(config.gaugeStyle!==undefined||config.tickCount!==undefined))return bad('GAUGE_OPTIONS_ONLY','options.circular');
 if(config.gaugeStyle!==undefined&&!['solid','needle'].includes(config.gaugeStyle))return bad('BAD_GAUGE_STYLE','options.circular.gaugeStyle');
 const needle=gauge&&config.gaugeStyle==='needle';
 if(config.tickCount!==undefined&&(!needle||!Number.isInteger(config.tickCount)||config.tickCount<2||config.tickCount>12))return bad('BAD_GAUGE_TICK_COUNT','options.circular.tickCount');
 const start=config.startAngle??(gauge&&spec.preset!=='ring'?-90:0),end=config.endAngle??(gauge&&spec.preset!=='ring'?90:360);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start< -360||start>360||end< -359||end>720||end-start<1||end-start>360)return bad('BAD_CIRCULAR_SWEEP','options.circular');
 const from=((start%360)+360)%360*degrees,span=(end-start)*degrees,to=from+span,side=Math.min(options.width,options.height),hidden=options.hiddenSeriesIds??[],palette=defaultPalette('light',false).series;
 if(spec.family==='pie'||spec.family==='donut'){
  const checked=validateRadial(spec,spec.family);if(checked.status==='invalid')return checked;const input=checked.value;
  if(input.data.length>16)return bad('SLICE_LIMIT','data');if(hidden.some(id=>!input.data.some(p=>p.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const projected=projectRadial(input,{hiddenSliceIds:[...hidden]},{x:0,y:0,width:side,height:side});if(projected.status==='invalid')return projected;
  const p=projected.value,legend=input.data.map((point,i)=>({id:point.id,name:point.label,color:point.color??palette[i%palette.length]!,visible:!hidden.includes(point.id)})),colors=new Map(legend.map(s=>[s.id,s.color])),series:PlanSeries[]=[],observations:PlanObservation[]=[];
  for(const slice of p.data.eligible){
   const a=from+slice.start/(2*Math.PI)*span,b=from+slice.end/(2*Math.PI)*span,color=colors.get(slice.point.id)!;
   const path=b>a&&!p.tooSmall?circularPath(p.frame,a,b):undefined;if(path?.status==='invalid')return path;
   const commands=path?.value??[],anchor=commands.length?polar(p.frame,(p.frame.radius+p.frame.innerRadius)/2,(a+b)/2):{x:p.frame.cx,y:p.frame.cy};
   series.push({id:slice.point.id,name:slice.point.label,color,commands,fill:true});
   observations.push({id:{seriesId:slice.point.id,pointId:slice.point.id},label:slice.point.label,seriesName:input.title,value:slice.point.value!,x:anchor.x,y:anchor.y,color,percentage:slice.fraction*100,...(commands.length?{hit:{type:'sector' as const,...p.frame,start:a,end:b}}:{})});
  }
  const bounds=circularBounds(p.frame,from,to,Math.max(2,side*.02),side,spec.family==='donut'?[{x:p.frame.cx-p.frame.radius*.3,y:p.frame.cy-side*.04},{x:p.frame.cx+p.frame.radius*.3,y:p.frame.cy+side*.04}]:[]),circular:PlanCircularFrame={style:'sectors',startAngle:start,endAngle:end,...p.frame,bounds};
  const knownCount=p.data.eligible.length,knownTotal=knownCount?p.data.total:null;
  return finish({schema:'nc-plan/1',family:spec.family,width:side,height:side,title:input.title,description:input.description??'',unit:'',legend,series,observations,grid:[],labels:[],circular,radialSummary:{knownTotal,overflow:knownCount>0&&p.data.total===null,missingCount:p.data.missing,hiddenCount:p.data.hidden,knownCount,percentageBasis:p.data.missing?'known-visible-subtotal':'complete-visible-total'},...(spec.family==='donut'?{annotations:[{x:p.frame.cx,y:p.frame.cy,text:knownTotal===null?'—':String(knownTotal),role:'value' as const}]}:{})});
 }
 if(hidden.length)return bad('GAUGE_HAS_NO_LEGEND','options.hiddenSeriesIds');
 const checked=validateGauge(spec);if(checked.status==='invalid')return checked;const input=checked.value;
 const normalized=createLinearScale(input.domain,[0,1],true);if(normalized.status==='invalid')return normalized;
 const visualT=input.value===null?null:normalized.value.map(input.value),valueState:PlanGaugeCircularBase['valueState']=input.value===null?'missing':input.value<input.domain[0]?'under':input.value>input.domain[1]?'over':'within';
 if(input.value!==null&&visualT===null)return bad('UNREPRESENTABLE_GAUGE','value');
 const angular=createLinearScale(input.domain,[from,to],true);if(angular.status==='invalid')return angular;
 const targetOutside=input.target!==undefined&&(input.target.value<input.domain[0]||input.target.value>input.domain[1]);
 const radius=side*.4,frame:RadialFrame={cx:side/2,cy:side/2,radius,innerRadius:radius*.78},color=input.color??palette[0]!;
 const track=circularPath(frame,from,to);if(track.status==='invalid')return track;
 const series:PlanSeries[]=[{id:'track',name:input.title,color:'#DDE5EF',commands:track.value,fill:true}],tickPoints:{value:number;x:number;y:number}[]=[],extras:{x:number;y:number}[]=[];
 for(const band of input.bands??[]){
  const a=angular.value.map(band.from),b=angular.value.map(band.to);if(a===null||b===null)return bad('UNREPRESENTABLE_GAUGE_BAND','bands');
  const path=circularPath({...frame,radius:radius*1.1,innerRadius:radius*1.035},a,b);if(path.status==='invalid')return path;series.push({id:'band:'+band.id,name:band.label??input.title,color:band.color,commands:path.value,fill:true});
 }
 const angle=visualT===null?null:from+span*visualT;
 if(angle!==null){
  if(needle){const tip=polar(frame,radius*.92,angle),left=polar(frame,radius*.035,angle-Math.PI/2),right=polar(frame,radius*.035,angle+Math.PI/2);series.push({id:'reading',name:input.title,color,commands:[{type:'M',...left},{type:'L',...tip},{type:'L',...right},{type:'Z'}],fill:true,circles:[{pointId:'value',cx:frame.cx,cy:frame.cy,radius:radius*.06}]});}
  else{const fill=circularPath(frame,from,angle);if(fill.status==='invalid')return fill;series.push({id:'reading',name:input.title,color,commands:fill.value,fill:true});}
 }
 if(needle){
  const tickPlan=selectNumericTicks(input.domain,{nice:false,targetCount:config.tickCount??7});if(tickPlan.status==='invalid')return bad('UNREPRESENTABLE_GAUGE_TICKS','domain');
  const commands:NonNullable<PlanSeries['commands']>[number][]=[];
  for(const value of tickPlan.value.ticks){if(span===2*Math.PI&&value===input.domain[1])continue;const a=angular.value.map(value);if(a===null)return bad('UNREPRESENTABLE_GAUGE_TICK','domain');const first=polar(frame,radius*.96,a),last=polar(frame,radius*1.03,a),label=polar(frame,radius*.66,a);commands.push({type:'M',...first},{type:'L',...last});tickPoints.push({value,...label});extras.push(last);}
  if(tickPoints.length>16)return bad('GAUGE_TICK_LIMIT','options.circular.tickCount');
  series.push({id:'scale',name:input.title,color:'#718299',commands,fill:false});
 }
 if(input.target&&!targetOutside){const a=angular.value.map(input.target.value);if(a===null)return bad('UNREPRESENTABLE_GAUGE_TARGET','target');const first=polar(frame,radius*.72,a),last=polar(frame,radius*1.13,a);series.push({id:'target',name:input.target.label??'Target',color:'#718299',commands:[{type:'M',...first},{type:'L',...last}],fill:false});extras.push(first,last);}
 const readingBaseline=frame.cy+radius*(span<=Math.PI?.3:.2),readingWidth=radius*.65;
 extras.push({x:frame.cx-readingWidth,y:readingBaseline-side*.05},{x:frame.cx+readingWidth,y:readingBaseline+side*.02});
 const targetY=Math.min(side-side*.04,readingBaseline+side*.1);if(input.target)extras.push({x:frame.cx-readingWidth,y:targetY},{x:frame.cx+readingWidth,y:targetY});
 const bounds=circularBounds({...frame,radius:radius*1.13,innerRadius:0},from,to,Math.max(2,side*.02),side,extras),base:PlanGaugeCircularBase={startAngle:start,endAngle:end,...frame,bounds,domain:input.domain,valueState};
 const circular:PlanCircularFrame=needle?{...base,style:'needle-gauge',needle:{from,to:angle},ticks:tickPoints}:{...base,style:'solid-gauge'};
 const anchor=angle!==null&&needle?polar(frame,radius*.78,angle):{x:frame.cx,y:readingBaseline-side*.02};
 return finish({schema:'nc-plan/1',family:'gauge',width:side,height:side,title:input.title,description:input.description??'',unit:input.unit??'',legend:[],grid:[],labels:[],series,circular,observations:input.value===null?[]:[{id:{seriesId:'reading',pointId:'value'},label:input.title,seriesName:input.unit??'',value:input.value,...anchor,color,hit:{type:'sector',...frame,innerRadius:0,start:from,end:to}}],annotations:[{x:frame.cx,y:readingBaseline,text:input.value===null?'—':String(input.value)+(input.unit??''),role:'value'},...tickPoints.map(t=>({x:t.x,y:t.y,text:String(t.value),role:'label' as const})),...(input.target?[{x:frame.cx,y:targetY,text:(input.target.label??'Target')+' '+input.target.value+(input.unit??''),role:'label' as const}]:[])]});
}
