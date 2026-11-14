import { invalidPlan } from './diagnostics.js';
import {validateLine} from '../line/validate.js';
import {finiteExtent,normalizeNumericDomain} from '../internal/math/domain.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanParallelSpec,PlanParallelPoint,PlanParallelAxisFrame,PlanParallelLayout} from '../public/parallel-plan-types.js';
import type {PlanOptions,PlanResult,PlanSeries,PlanObservation,PlanCommand} from '../public/plan-types.js';
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;

/** Independent linear dimensions; no global Y domain is substituted for them. */
export function planParallel(spec:PlanParallelSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','axes','series','coordinates'].includes(k)))return invalidPlan('UNKNOWN_OPTION','spec');
  if(options.viewport!==undefined||options.references!==undefined||options.stacking!==undefined)return invalidPlan('UNSUPPORTED_PARALLEL_OPTION','options');
  if(!text(spec.title,200)||spec.description!==undefined&&!text(spec.description,1000))return invalidPlan('BAD_DESCRIPTION','title');
  if(!Array.isArray(spec.axes)||spec.axes.length<2||spec.axes.length>16)return invalidPlan('PARALLEL_AXIS_LIMIT','axes');
  if(!Array.isArray(spec.series)||spec.series.length>16)return invalidPlan('PARALLEL_SERIES_LIMIT','series');
  if(spec.coordinates!==undefined&&!['cartesian','polar'].includes(spec.coordinates))return invalidPlan('BAD_COORDINATES','coordinates');
  const polar=spec.coordinates==='polar';if(polar&&spec.axes.length<3)return invalidPlan('POLAR_PARALLEL_REQUIRES_THREE_AXES','axes');
  const axisIds=new Set<string>();
  for(const [i,a]of spec.axes.entries()){
    if(!a||typeof a!=='object'||Object.keys(a).some(k=>!['id','label','type','unit','domain','reversed','nice','ticks'].includes(k))||a.type!=='linear'||!text(a.id,128)||!a.id||axisIds.has(a.id)||a.label!==undefined&&!text(a.label,200)||a.unit!==undefined&&!text(a.unit,64)||a.reversed!==undefined&&typeof a.reversed!=='boolean'||a.nice!==undefined&&typeof a.nice!=='boolean')return invalidPlan('BAD_PARALLEL_AXIS','axes.'+i);
    if(a.ticks!==undefined&&(!a.ticks||typeof a.ticks!=='object'||Array.isArray(a.ticks)||Object.keys(a.ticks).some(k=>k!=='targetCount')))return invalidPlan('BAD_PARALLEL_TICKS','axes.'+i+'.ticks');
    axisIds.add(a.id);
  }
  const checked=validateLine({family:'line',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),axes:{x:{type:'category',values:spec.axes.map(a=>({id:a.id,...(a.label===undefined?{}:{label:a.label})}))},y:{type:'linear'}},series:spec.series.map(s=>({...s,data:Array.isArray(s?.data)?s.data.map((p:PlanParallelPoint)=>({id:p?.id,x:p?.axisId,y:p?.value})):s?.data}))});if(checked.status==='invalid')return checked;
  for(const s of spec.series){
    if(Object.keys(s).some(k=>!['id','name','color','data'].includes(k)))return invalidPlan('BAD_PARALLEL_SERIES','series');
    if(s.data.some((p:PlanParallelPoint)=>Object.keys(p).some(k=>!['id','axisId','value'].includes(k))))return invalidPlan('BAD_PARALLEL_POINT','series.data');
    if(new Set(s.data.map((p:PlanParallelPoint)=>p.axisId)).size!==s.data.length)return invalidPlan('DUPLICATE_PARALLEL_COORDINATE','series.data.axisId');
  }
  const hidden=new Set(options.hiddenSeriesIds??[]);if([...hidden].some(id=>!spec.series.some(s=>s.id===id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const source:PlanParallelSpec['series']=spec.series,indexes=source.map(s=>new Map(s.data.map(p=>[p.axisId,p])));
  const {width,height}=options,cx=width/2,cy=height/2,inset=Math.min(44,Math.min(width,height)*.16),radius=Math.min(width,height)/2-inset;
  const left=Math.min(40,width*.15),right=width-left,top=Math.min(36,height*.2),bottom=height-Math.min(28,height*.16);
  const axes:PlanParallelAxisFrame[]=[],maps:Array<((value:number)=>number|null)|null>=[],commands:PlanCommand[]=[];
  for(const [i,a]of spec.axes.entries()){
    const values=indexes.flatMap(index=>{const p=index.get(a.id);return !p||p.value===null?[]:[p.value];});
    const normalized=normalizeNumericDomain(finiteExtent(values),{includeZero:false,...(a.domain===undefined?{}:{explicit:a.domain})});if(normalized.status==='invalid')return normalized;
    if(a.domain&&values.some(v=>v<a.domain![0]||v>a.domain![1]))return invalidPlan('PARALLEL_DOMAIN_EXCLUDES_SOURCE','axes.'+i+'.domain');
    const angle=i/spec.axes.length*Math.PI*2,x=left+(right-left)*i/(spec.axes.length-1);
    const from=polar?{x:cx,y:cy}:{x,y:bottom},to=polar?{x:cx+Math.sin(angle)*radius,y:cy-Math.cos(angle)*radius}:{x,y:top};
    const labelRadius=Math.min(radius+18,Math.min(width,height)/2-4);
    const labelAnchor=polar?{x:cx+Math.sin(angle)*labelRadius,y:cy-Math.cos(angle)*labelRadius}:{x,y:top-18};
    const tickPlan=normalized.status==='empty'?null:selectNumericTicks(normalized.domain,{nice:a.nice??!a.domain,targetCount:a.ticks?.targetCount??5});if(tickPlan?.status==='invalid')return tickPlan;
    const domain=tickPlan?.value.domain,scale=domain?createLinearScale(domain,a.reversed?[1,0]:[0,1],false):null;if(scale?.status==='invalid')return scale;
    const map=scale?scale.value.map:null;maps.push(map);
    const position=(fraction:number)=>({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction});
    const ticks=tickPlan?.value.ticks.map(value=>({value,label:String(value),...position(map!(value)!)}))??[];
    axes.push({id:a.id,label:a.label??a.id,unit:a.unit??'',sourceCount:values.length,...(domain?{domain}:{}),from,to,labelAnchor,ticks});
    commands.push({type:'M',...from},{type:'L',...to});
  }
  const palette=defaultPalette('light',false).series,legend=source.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.has(s.id)}));
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  for(const [si,s]of source.entries()){
    if(hidden.has(s.id))continue;const color=legend[si]!.color;
    const points=axes.map((a,i)=>{const p=indexes[si]!.get(a.id),fraction=p?.value===null||p?.value===undefined?null:maps[i]?.(p.value)??null;if(fraction===null||!p||p.value===null)return null;
      const point={x:a.from.x+(a.to.x-a.from.x)*fraction,y:a.from.y+(a.to.y-a.from.y)*fraction};
      observations.push({id:{seriesId:s.id,pointId:p.id},label:a.label,seriesName:s.name,value:p.value,color,...point,hit:{type:'circle',cx:point.x,cy:point.y,radius:5},parallel:{axisId:a.id,axisLabel:a.label,unit:a.unit},group:{key:JSON.stringify(['parallel',a.id]),label:a.label,coordinate:i}});return {...point,pointId:p.id};
    });
    const path:PlanCommand[]=[];let connected=false;
    for(const point of points){if(!point){connected=false;continue;}path.push({type:connected?'L':'M',x:point.x,y:point.y});connected=true;}
    if(polar&&points[0]&&points.at(-1))path.push({type:'L',x:points[0].x,y:points[0].y});
    series.push({id:s.id,name:s.name,color,commands:path,circles:points.flatMap(p=>p?[{pointId:p.pointId,cx:p.x,cy:p.y,radius:3}]:[])});
  }
  const parallel:PlanParallelLayout={coordinates:polar?'polar':'cartesian',axes,commands};
  return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'parallel',title:spec.title,description:spec.description??'',unit:'',width,height,legend,series,observations,labels:[],grid:[],parallel,...(polar?{polarGrid:{cx,cy,radius,rings:[],spokes:[]}}:{})}});
}
