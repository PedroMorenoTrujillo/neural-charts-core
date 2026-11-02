import {planRanges} from './ranges.js';
import type {RangeGlyphContext} from './ranges.js';
import {freezePlan} from './input.js';
import {validatePlanReferences} from './references.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {PlanFanSpec,PlanFanBand,PlanFanPoint} from '../public/fan-plan-types.js';
import type {PlanOptions,PlanResult,PlanRangeSpec,PlanRangeSeries,PlanFrame,PlanCommand} from '../public/plan-types.js';
const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;
function categoryFan(spec:PlanFanSpec):spec is Extract<PlanFanSpec,{axes:{x:{kind:'category'}}}>{return spec.axes?.x?.kind==='category';}
function rangeSeries<TX extends string|number>(data:readonly PlanFanPoint<TX>[],bands:readonly PlanFanBand[],name:string,color:string,bandColor:string):readonly PlanRangeSeries<TX>[] {
  return [...bands.map(band=>({id:band.id,name:band.label,color:band.color??bandColor,data:data.map(p=>{const range=p.intervals.find(r=>r.bandId===band.id);return {id:p.id,x:p.x,low:range?.low??null,high:range?.high??null};})})),{id:'center',name,color,data:data.map(p=>({id:p.id,x:p.x,low:p.value,high:p.value}))}];
}
function rangeSource(spec:PlanFanSpec,bands:readonly PlanFanBand[]):PlanRangeSpec{
  const palette=defaultPalette('light',false).series,common={family:'arearange' as const,title:spec.title,...(spec.description===undefined?{}:{description:spec.description})};
  if(categoryFan(spec))return {...common,axes:spec.axes,series:rangeSeries<string>(spec.data,bands,spec.centerName??spec.title,spec.centerColor??palette[0]!,palette[0]!)};
  const series=rangeSeries<number>(spec.data,bands,spec.centerName??spec.title,spec.centerColor??palette[0]!,palette[0]!);
  return spec.axes.x.kind==='time'
    ? {...common,axes:{x:{...spec.axes.x,kind:'time'},y:spec.axes.y},series}
    : {...common,axes:{x:{...spec.axes.x,kind:'linear'},y:spec.axes.y},series};
}
/** One shared range-owner frame, including the central estimate in the same domain. */
export function planFan(spec:PlanFanSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','axes','bands','data','centerName','centerColor'].includes(k))||!Array.isArray(spec.bands)||spec.bands.length<1||spec.bands.length>6||!Array.isArray(spec.data)||spec.data.length>1024)return bad('BAD_FAN_SOURCE','spec');
  if(!spec.axes?.x||!['category','linear','time'].includes(spec.axes.x.kind))return bad('BAD_FAN_AXIS','axes.x');
  if(spec.centerName!==undefined&&!text(spec.centerName,200)||spec.centerColor!==undefined&&!/^#[\da-f]{6}$/i.test(spec.centerColor))return bad('BAD_FAN_PRESENTATION','spec');
  const ids=new Set<string>(['center']),bands:readonly PlanFanBand[]=spec.bands,data:readonly PlanFanPoint[]=spec.data,pointIds=new Set<string>();let previous=0;
  for(const [i,b]of bands.entries()){
    if(!b||Object.keys(b).some(k=>!['id','label','coverage','color'].includes(k))||!text(b.id,64)||ids.has(b.id)||!text(b.label,200)||!Number.isFinite(b.coverage)||b.coverage<=previous||b.coverage>=1||b.color!==undefined&&!/^#[\da-f]{6}$/i.test(b.color))return bad('BAD_FAN_BAND','bands['+i+']');
    ids.add(b.id);previous=b.coverage;
  }
  for(const [i,p]of data.entries()){
    const path='data['+i+']';
    if(!p||Object.keys(p).some(k=>!['id','x','value','intervals'].includes(k))||!text(p.id,64)||pointIds.has(p.id)||p.value!==null&&!Number.isFinite(p.value)||!Array.isArray(p.intervals)||p.intervals.length>bands.length)return bad('BAD_FAN_POINT',path);
    pointIds.add(p.id);const seen=new Set<string>(),intervals=new Map<string,typeof p.intervals[number]>();
    for(const [j,range]of p.intervals.entries()){
      if(!range||Object.keys(range).some(k=>!['bandId','low','high'].includes(k))||!ids.has(range.bandId)||range.bandId==='center'||seen.has(range.bandId)||(range.low===null)!==(range.high===null)||range.low!==null&&(!Number.isFinite(range.low)||!Number.isFinite(range.high)||range.low>range.high!||p.value===null||range.low>p.value||range.high!<p.value))return bad('BAD_FAN_INTERVAL',path+'.intervals['+j+']');
      seen.add(range.bandId);intervals.set(range.bandId,range);
    }
    let low:number|undefined,high:number|undefined;
    for(const band of bands){const interval=intervals.get(band.id);if(interval?.low===undefined||interval.low===null)continue;if(low!==undefined&&(interval.low>low||interval.high!<high!))return bad('NON_NESTED_FAN_INTERVAL',path+'.intervals');low=interval.low;high=interval.high!;}
  }
  const rangeSpec=rangeSource(spec,bands);
  const transform=(frame:PlanFrame,context:RangeGlyphContext):PlanFrame=>{
    const bandMap=new Map(bands.map(b=>[b.id,b])),commands:PlanCommand[]=[];let active=false;
    for(const p of spec.data){if(p.value===null){active=false;continue;}const x=context.mapX(p.x),y=context.mapY(p.value);if(x===null||y===null){active=false;continue;}commands.push({kind:active?'L':'M',x,y});active=true;}
    const center=frame.series.find(s=>s.id==='center'),ordered=[...frame.series.filter(s=>s.id!=='center')].sort((a,b)=>bandMap.get(b.id)!.coverage-bandMap.get(a.id)!.coverage);
    if(center)ordered.push({id:center.id,name:center.name,color:center.color,commands,circles:frame.observations.filter(p=>p.id.seriesId==='center').map(p=>({pointId:p.id.pointId,cx:p.x,cy:p.y,radius:3}))});
    const points=frame.observations.map(p=>{if(p.id.seriesId==='center'){const {lowValue:_,highValue:__,...point}=p;return {...point,fan:{kind:'center' as const}};}return {...p,fan:{kind:'interval' as const,coverage:bandMap.get(p.id.seriesId)!.coverage,low:p.lowValue!,high:p.highValue!}};});
    const observations=[...points.filter(p=>p.fan.kind==='center'),...points.filter(p=>p.fan.kind!=='center')],legend=[...(frame.legend??[]).filter(s=>s.id==='center'),...(frame.legend??[]).filter(s=>s.id!=='center')];
    return {...frame,family:'fan',fan:{centerId:'center',bands:bands.map(({id,label,coverage})=>({id,label,coverage}))},series:ordered,observations,legend};
  };
  const references=validatePlanReferences(options.references,rangeSpec);if(references.status==='invalid')return references;
  const result=planRanges(rangeSpec,options,references.value,transform);
  // Empty input and all-hidden series still retain the declared fan semantics.
  if(result.status==='invalid')return result;
  if(result.frame.family==='fan')return result;
  return freezePlan({status:result.status,frame:{...result.frame,family:'fan',fan:{centerId:'center',bands:bands.map(({id,label,coverage})=>({id,label,coverage}))}}});
}
