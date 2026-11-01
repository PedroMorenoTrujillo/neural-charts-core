import {planChart} from './plan.js';
import {createLinearScale} from '../internal/math/linear.js';
import {freezePlan} from './input.js';
import type {PlanParetoSpec,PlanOptions,PlanResult,PlanCommand,PlanObservation,PlanSeries} from '../public/plan-types.js';

/** One category frame, raw-value Y and a separate fixed percentage Y. */
export function planPareto(spec:PlanParetoSpec,options:PlanOptions):PlanResult{
  const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
  if(!Array.isArray(spec.data)||!spec.data.length||spec.data.length>64)return bad('PARETO_CATEGORY_LIMIT','data');
  const ids=new Set<string>();
  for(const p of spec.data){
    if(!p||Object.keys(p).some(k=>!['id','label','value'].includes(k))||typeof p.id!=='string'||!p.id||p.id.length>128||ids.has(p.id)||typeof p.label!=='string'||p.label.length>128)return bad('BAD_PARETO_CATEGORY','data');
    if(typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<0)return bad('COMPLETE_NONNEGATIVE_VALUES_REQUIRED','data.value');
    ids.add(p.id);
  }
  if(options.hiddenSeriesIds?.some(id=>id!=='values'&&id!=='cumulative'))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  if(options.viewport&&(options.viewport.axes!=='x'||options.viewport.value?.y!==undefined))return bad('PARETO_X_VIEWPORT_ONLY','options.viewport');
  const sorted=spec.data.map((p,index)=>({...p,index})).sort((a,b)=>b.value-a.value||a.index-b.index);
  const column=planChart({family:'column',title:spec.title,...(spec.description?{description:spec.description}:{}),axes:{x:{kind:'category',values:sorted.map(p=>({id:p.id,label:p.label}))},y:{kind:'linear'}},series:[{id:'values',name:'Values',color:'#2C6DCD',data:sorted.map(p=>({id:p.id,x:p.id,y:p.value}))}]},{width:options.width,height:options.height,...(options.viewport?{viewport:options.viewport}:{})});
  if(column.status==='invalid')return column;
  // Scaling before summation bounds each addend by 1, avoiding overflow while
  // preserving ratios for finite source values. Ties retain source order.
  const maximum=sorted[0]!.value;
  let total=0,correction=0;
  const add=(value:number)=>{const term=value-correction,next=total+term;correction=(next-total)-term;total=next;};
  for(const p of sorted)add(maximum===0?0:p.value/maximum);
  const denominator=total,percentages=new Map<string,number>();total=0;correction=0;
  for(const [i,p] of sorted.entries()){add(maximum===0?0:p.value/maximum);if(denominator>0)percentages.set(p.id,i===sorted.length-1?100:Math.min(100,total/denominator*100));}
  const f=column.frame,plot={x:16,y:14,width:options.width-32,height:options.height-28};
  const percent=createLinearScale([0,100],[plot.y+plot.height,plot.y],false);if(percent.status==='invalid')return percent;
  const hidden=options.hiddenSeriesIds??[],commands:PlanCommand[]=[],observations:PlanObservation[]=[],series:PlanSeries[]=[];
  if(!hidden.includes('values')){series.push(...f.series);observations.push(...f.observations);}
  if(!hidden.includes('cumulative')&&denominator>0){
    for(const p of f.observations){const value=percentages.get(p.id.pointId)!,y=percent.value.map(value)!;commands.push({kind:commands.length?'L':'M',x:p.x,y});observations.push({...p,id:{seriesId:'cumulative',pointId:p.id.pointId},seriesName:'Cumulative',color:'#638A35',value,valueUnit:'%',y});}
    series.push({id:'cumulative',name:'Cumulative',color:'#638A35',commands});
  }
  const legend=[{id:'values',name:'Values',color:'#2C6DCD',visible:!hidden.includes('values')},{id:'cumulative',name:'Cumulative',color:'#638A35',visible:!hidden.includes('cumulative')}];
  return freezePlan({status:observations.length?'ok':'empty',frame:{...f,family:'pareto',legend,series,observations,secondaryGrid:[0,25,50,75,100].map(value=>({y:percent.value.map(value)!,label:value+'%'}))}});
}
