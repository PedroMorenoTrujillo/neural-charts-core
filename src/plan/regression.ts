import { invalidPlan } from './diagnostics.js';
import {validateScatter} from '../scatter/validate.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {planAdditional,type ScatterFrameTransform} from './additional.js';
import {describeRegression} from './regression-statistics.js';
import {clipSourceSegment} from './contour-clip.js';
import {validatePlanReferences} from './references.js';
import {freezePlan} from './input.js';
import type {PlanRegressionSpec,PlanRegressionModel} from '../public/regression-plan-types.js';
import type {PlanOptions,PlanResult,PlanScatterSpec,PlanObservation,PlanSeries} from '../public/plan-types.js';
interface Fit{readonly summary:PlanRegressionModel;readonly predict?:(x:number)=>number;readonly name:string;readonly color:string;}
/** Derived OLS and original scatter points share the same numeric frame. */
export function planRegression(spec:PlanRegressionSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','axes','series'].includes(k))||!Array.isArray(spec.series)||spec.series.length>8)return invalidPlan('BAD_REGRESSION_SOURCE','spec');
  let count=0;
  for(const s of spec.series){
    if(!s||Object.keys(s).some(k=>!['id','name','color','data'].includes(k))||typeof s.id!=='string'||s.id.length>96||s.id.startsWith('ols:')||typeof s.name!=='string'||s.name.length>190||!Array.isArray(s.data)||(count+=s.data.length)>4096)return invalidPlan('REGRESSION_SOURCE_LIMIT','series');
    for(const p of s.data)if(!p||Object.keys(p).some(k=>!['id','x','y'].includes(k))||typeof p.id!=='string'||p.id.length>96)return invalidPlan('BAD_REGRESSION_SAMPLE','series.data');
  }
  const checked=validateScatter({...spec,family:'scatter'});if(checked.status==='invalid')return checked;
  const source=checked.value,palette=defaultPalette('light',false).series,fits:Fit[]=[];
  const series:PlanScatterSpec['series'][number][]=source.series.map(s=>({id:s.id,name:s.name,...(s.color?{color:s.color}:{}),data:s.data.map(p=>({id:p.id,x:p.x,y:p.y}))}));
  for(const [i,s]of source.series.entries()){
    const pairs:{x:number;y:number}[]=[];for(const p of s.data)if(p.x!==null&&p.y!==null)pairs.push({x:p.x,y:p.y});
    const calculation=describeRegression(s.id,pairs,s.data.length-pairs.length);if(calculation.status==='invalid')return invalidPlan(calculation.reason,'series['+i+']');
    const summary=calculation.summary,name='OLS · '+s.name,color=palette[(i+1)%palette.length]!;
    fits.push({summary,...(calculation.predict?{predict:calculation.predict}:{}),name,color});
    if(summary.status==='ready')series.push({id:summary.fitSeriesId,name,color,data:[{id:'start',x:summary.minX,y:calculation.predict!(summary.minX)},{id:'end',x:summary.maxX,y:calculation.predict!(summary.maxX)}]});
  }
  const knownIds=new Set(fits.flatMap(f=>[f.summary.sourceSeriesId,f.summary.fitSeriesId])),hidden=options.hiddenSeriesIds??[];
  if(hidden.some(id=>!knownIds.has(id)))return invalidPlan('UNKNOWN_REGRESSION_SERIES','options.hiddenSeriesIds');
  const availableIds=new Set(series.map(s=>s.id)),scatter:PlanScatterSpec={family:'scatter',title:source.title,...(source.description===undefined?{}:{description:source.description}),axes:source.axes,series};
  const references=validatePlanReferences(options.references,scatter);if(references.status==='invalid')return references;
  const fitIds=new Set(fits.map(f=>f.summary.fitSeriesId)),layout={method:'ordinary-least-squares' as const,models:fits.map(f=>f.summary)};
  const transform:ScatterFrameTransform=(frame,context)=>{
    const observations:PlanObservation[]=frame.observations.filter(p=>!fitIds.has(p.id.seriesId)).map(p=>({...p,regression:{type:'sample',modelId:p.id.seriesId}})),paint:PlanSeries[]=frame.series.filter(s=>!fitIds.has(s.id));
    for(const fit of fits){const model=fit.summary;if(model.status!=='ready'||hidden.includes(model.fitSeriesId))continue;
      const clipped=clipSourceSegment({start:{x:model.minX,y:fit.predict!(model.minX)},end:{x:model.maxX,y:fit.predict!(model.maxX)}},context.xDomain,context.yDomain);if(!clipped)continue;
      const a={x:context.mapX(clipped[0].x)!,y:context.mapY(clipped[0].y)!},b={x:context.mapX(clipped[1].x)!,y:context.mapY(clipped[1].y)!};if(![a.x,a.y,b.x,b.y].every(Number.isFinite))throw Error('UNREPRESENTABLE_REGRESSION_GEOMETRY');const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
      const nx=-(b.y-a.y)/length*12,ny=(b.x-a.x)/length*12,vertices=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
      paint.push({id:model.fitSeriesId,name:fit.name,color:fit.color,commands:[{type:'M',...a},{type:'L',...b}]});
      for(const [index,pixel]of [a,b].entries()){const original=clipped[index]!;observations.push({id:{seriesId:model.fitSeriesId,pointId:index===0?'start':'end'},label:fit.name,seriesName:fit.name,value:original.y,xValue:original.x,x:pixel.x,y:pixel.y,color:fit.color,regression:{type:'fit',modelId:model.sourceSeriesId},hit:{type:'polygon',vertices}});}
    }
    return {...frame,family:'regression',regression:layout,series:paint,observations};
  };
  const result=planAdditional(scatter,options.width,options.height,hidden.filter(id=>availableIds.has(id)),options.viewport,references.value,transform);
  if(result.status==='invalid')return result;
  return result.frame.family==='regression'?result:freezePlan({status:result.status,frame:{...result.frame,family:'regression',regression:layout}});
}
