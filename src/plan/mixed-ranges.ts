import {record,array,text,number,choice,fail,ValidationFailure} from '../internal/data/validation.js';
import {validateLine} from '../line/validate.js';
import {normalizeLine} from '../line/normalize.js';
import {projectLine} from '../line/geometry.js';
import {planRanges} from './ranges.js';
import {freezePlan} from './input.js';
import type {PlanMixedSpec,PlanRangeSpec,PlanOptions,PlanReference,PlanResult,PlanObservation,PlanSeries} from '../public/plan-types.js';
import type {PlanMixedRangesLayout} from '../public/mixed-range-plan-types.js';

/** Domain, axes, window and coordinate maps have one owner. Scalar sources
 * participate in that domain, but never paint surrogate interval geometry. */
export function planMixedRanges(spec:PlanMixedSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
 try{
  const input=record(spec,['family','title','description','axes','series'],['family','title','axes','series'],'spec');
  const title=text(input.title,'title'),description=input.description===undefined?'':text(input.description,'description',4096,true);
  const axes=record(input.axes,['x','y'],['x','y'],'axes');
  if(record(axes.x,['type','values','edgeSpacing','title'],['type','values'],'axes.x').type!=='category')fail('axes.x','MIXED_RANGES_REQUIRE_CATEGORY_X');
  const kinds=new Map<string,'line'|'arearange'|'areasplinerange'>(),rangeIds=new Set<string>(),scalar:unknown[]=[],source:{id:string;name:string;color?:string;data:{id:string;x:string;low:number|null;high:number|null}[]}[]=[];
  let count=0,rangeKind:'arearange'|'areasplinerange'|undefined;
  for(const [index,raw]of array(input.series,16,'series').entries()){
   const path='series['+index+']',candidate=record(raw,['id','name','color','type','data','yAxis','curve','gaps','markers','dash'],['id','name','type','data'],path),type=choice(candidate.type,['line','arearange','areasplinerange'],path+'.type');
   const id=text(candidate.id,path+'.id',64),name=text(candidate.name,path+'.name');
   if(kinds.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');kinds.set(id,type);
   if(candidate.yAxis!==undefined&&candidate.yAxis!=='primary'||type!=='line'&&candidate.yAxis!==undefined)fail(path+'.yAxis','RANGE_COMPOSITION_HAS_ONE_Y_AXIS');
   if(type!=='line'&&['curve','gaps','markers','dash'].some(k=>Object.hasOwn(candidate,k)))fail(path,'RANGE_HAS_FIXED_BOUNDARY_POLICY');
   const data=array(candidate.data,10000,path+'.data').map((raw,j)=>{
    if(++count>10000)fail('series.data','RESOURCE_LIMIT');
    const pp=path+'.data['+j+']',p=record(raw,type==='line'?['id','x','y']:['id','x','low','high'],type==='line'?['id','x','y']:['id','x','low','high'],pp);
    const pointId=text(p.id,pp+'.id',64),x=text(p.x,pp+'.x',256);
    if(type==='line'){const value=p.y===null?null:number(p.y,pp+'.y');return {id:pointId,x,low:value,high:value};}
    if((p.low===null)!==(p.high===null))fail(pp,'COMPLETE_RANGE_OR_NULL_PAIR_REQUIRED');
    return {id:pointId,x,low:p.low===null?null:number(p.low,pp+'.low'),high:p.high===null?null:number(p.high,pp+'.high')};
   });
   const paint=candidate.color===undefined?{}:{color:text(candidate.color,path+'.color')};
   source.push({id,name,...paint,data});
   if(type==='line'){const {type:_,yAxis:__,...line}=candidate;scalar.push(line);}
   else {if(rangeKind&&rangeKind!==type)fail(path+'.type','USE_ONE_RANGE_INTERPOLATION_POLICY');rangeKind=type;rangeIds.add(id);}
  }
  if(!rangeKind||!scalar.length)fail('series','RANGE_AND_LINE_REQUIRED');
  const lines=validateLine({family:'line',title,axes:input.axes,series:scalar});if(lines.status==='invalid')return lines;
  const normalized=normalizeLine(lines.value),mixedRanges:PlanMixedRangesLayout={mode:'range-line',series:[...kinds].map(([id,type])=>({id,type}))};
  const master={family:rangeKind,title,...(description?{description}:{}),axes:input.axes,series:source} as PlanRangeSpec;
  const result=planRanges(master,options,references,(frame,context)=>{
   const projected=projectLine(normalized,{hiddenSeriesIds:[...(options.hiddenSeriesIds??[])]},context.plot,null,context.yDomain,context);if(projected.status==='invalid')throw new ValidationFailure(projected.diagnostic);
   const observations:PlanObservation[]=[...frame.observations],series:PlanSeries[]=[...frame.series],paint=new Map(frame.legend.map(s=>[s.id,s.color]));
   for(const s of projected.value.series){
    const id=s.series.spec.id,color=paint.get(id)!;
    series.push({id,name:s.series.spec.name,color,commands:s.commands});
    for(const p of s.eligible){const label=normalized.labels.get(String(p.point.x))??String(p.point.x);observations.push({id:{seriesId:id,pointId:p.point.id},label,seriesName:s.series.spec.name,value:p.point.y!,x:p.x,y:p.y,color,group:{key:JSON.stringify(['category',p.point.x]),label,coordinate:p.x}});}
   }
   const rank=new Map([...kinds.keys()].map((id,i)=>[id,i]));observations.sort((a,b)=>rank.get(a.id.seriesId)!-rank.get(b.id.seriesId)!);
   return {...frame,series,observations};
  },rangeIds);
  if(result.status==='invalid')return result;
  return freezePlan({...result,frame:{...result.frame,family:'mixed',mixedRanges}});
 }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_MIXED_RANGE_SOURCE',path:'spec',message:'Invalid coordinated range/line source.'}};}
}
