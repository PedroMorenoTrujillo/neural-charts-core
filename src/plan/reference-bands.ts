import type {ChartResult} from '../public/chart-types.js';
import type {PlanFrame,PlanSpec} from '../public/plan-types.js';
import type {PlanReferenceBand,PlanProjectedReferenceBand} from '../public/reference-band-plan-types.js';
import type {AxesPlan,AxisInput} from '../internal/axes/plan.js';
import type {ReferenceAxisContract,ReferenceBandAxis} from '../internal/axes/reference-bands.js';
import type {PlanReferenceContext} from './references.js';
import {validateReferenceBands,projectReferenceBands} from '../internal/axes/reference-bands.js';
import {referenceBandAxes} from '../internal/axes/reference-band-axes.js';
import {invalid,ok} from '../internal/diagnostics.js';

/** Validate the bounded, style-free public envelope. Frozen owners retain
 * category ordering, date limits and numeric interval validation. */
export function validatePlanReferenceBands(input:unknown,spec:PlanSpec):ChartResult<readonly PlanReferenceBand[]|undefined>{
  if(input===undefined)return ok(undefined);
  if(spec.family!=='line'&&spec.family!=='area'&&spec.family!=='spline'&&spec.family!=='areaspline'&&spec.family!=='column'&&spec.family!=='mixed'&&spec.family!=='scatter'&&spec.family!=='bubble')return invalid('INVALID_CONFIG','UNSUPPORTED_REFERENCE_BANDS','options.referenceBands');
  if(!Array.isArray(input)||input.length>32)return invalid('INVALID_CONFIG','BAD_REFERENCE_BANDS','options.referenceBands');
  const contract=(axis:AxisInput|undefined):ReferenceAxisContract=>axis?.type==='category'?{type:'category',ranks:new Map((Array.isArray(axis.values)?axis.values:[]).map((value,index)=>[value?.id,index]))}:{type:axis?.type==='time'?'time':'linear'};
  const axes={x:contract(spec.axes?.x),y:contract(spec.axes?.y)},ids=new Set<string>(),output:PlanReferenceBand[]=[];
  for(const [index,raw]of input.entries()){
    const path='options.referenceBands['+index+']';
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['id','axis','from','to','valueAxis'].includes(key)))return invalid('INVALID_CONFIG','BAD_REFERENCE_BAND',path);
    if(typeof raw.id!=='string'||ids.has(raw.id))return invalid('INVALID_CONFIG','BAD_REFERENCE_BAND_ID',path+'.id');
    ids.add(raw.id);
    if(Object.hasOwn(raw,'valueAxis')&&(raw.valueAxis!=='secondary'||raw.axis!=='y'||spec.family!=='mixed'||!spec.axes.secondaryY))return invalid('INVALID_CONFIG','BAD_SECONDARY_REFERENCE_BAND',path+'.valueAxis');
    // The frozen validator's 16-band contract is unchanged. Validate each of
    // this seam's at most 32 intervals, enforcing global IDs above.
    const checked=validateReferenceBands([{id:raw.id,axis:raw.axis,from:raw.from,to:raw.to}],axes);
    if(checked.status==='invalid')return {...checked,diagnostic:{...checked.diagnostic,path:checked.diagnostic.path.replace('referenceBands[0]',path)}};
    const band=checked.value[0]!;
    if(band.axis==='x'&&typeof band.from==='string'&&typeof band.to==='string')output.push({id:band.id,axis:'x',from:band.from,to:band.to});
    else if(band.axis==='x'&&typeof band.from==='number'&&typeof band.to==='number')output.push({id:band.id,axis:'x',from:band.from,to:band.to});
    else if(band.axis==='y'&&typeof band.from==='number'&&typeof band.to==='number')output.push({id:band.id,axis:'y',from:band.from,to:band.to,...(raw.valueAxis==='secondary'?{valueAxis:'secondary' as const}:{})});
    else return invalid('INVALID_CONFIG','BAD_REFERENCE_BAND',path);
  }
  return ok(output);
}

/** Supply existing maps/domains to the frozen slot adapter. The synthetic
 * envelope carries no new scale or layout calculation. Columns pass their
 * actual band edges rather than inferring a width from a marker or label. */
function bandAxes(context:PlanReferenceContext):Readonly<{x:ReferenceBandAxis;y:ReferenceBandAxis}>|undefined{
  const source=context.bandSourceAxes;
  if(!source)return undefined;
  const {plot}=context,empty={ticks:[],labels:[],interval:null,target:0};
  const scopedX=source.x.type==='category'?{...source.x,values:(source.x.values??[]).filter(value=>{
    if(context.categorySlot)return context.categorySlot(value.id)!==null;
    const coordinate=context.mapX?.(value.id);return coordinate!==undefined&&coordinate!==null&&coordinate>=plot.x&&coordinate<=plot.x+plot.width;
  })}:source.x;
  const plan:AxesPlan={plot,tooSmall:false,x:{...empty,domain:context.domains.x},y:{...empty,domain:context.domains.y},mapX:value=>context.mapX?.(value)??null,mapY:value=>context.mapY?.(value)??null,xTitle:null,yTitle:null,font:{family:'sans-serif',size:12,weight:400},direction:'ltr'};
  if(!context.horizontal&&!context.categorySlot)return referenceBandAxes(plan,{x:scopedX,y:source.y},source);
  // Horizontal bar maps retain logical X=category and Y=value. The category
  // owner supplies the real physical slot, including its configured gap.
  let x:ReferenceBandAxis;
  if(source.x.type==='category'){
    const values=source.x.values??[],ranks=new Map(values.map((value,index)=>[value.id,index])),visible=values.flatMap((value,index)=>context.categorySlot?.(value.id)?[index]:[]);
    x={type:'category',dimension:context.horizontal?'y':'x',ranks,first:visible[0]??0,last:visible[visible.length-1]??-1,slot:rank=>{const id=values[rank]?.id;return id===undefined?null:context.categorySlot?.(id)??null;}};
  }else x={type:source.x.type,dimension:context.horizontal?'y':'x',domain:context.domains.x,map:value=>context.mapX?.(value)??null};
  return {x,y:{type:source.y.type==='time'?'time':'linear',dimension:context.horizontal?'x':'y',domain:context.domains.y,map:value=>context.mapY?.(value)??null}};
}

export function withPlanReferenceBands(frame:PlanFrame,bands:readonly PlanReferenceBand[]|undefined,context?:PlanReferenceContext):PlanFrame{
  if(bands===undefined)return frame;
  const axes=context?bandAxes(context):undefined;
  const projected:readonly PlanProjectedReferenceBand[]=bands.map(band=>{
    if(!context||!axes)return {...band,status:'unavailable' as const};
    const secondary=band.axis==='y'&&band.valueAxis==='secondary';
    const axis=secondary?context.secondaryY?{type:'linear' as const,dimension:'y' as const,...context.secondaryY}:undefined:axes[band.axis];
    if(!axis||axis.type!=='category'&&!axis.domain)return {...band,status:'unavailable' as const};
    const checked=projectReferenceBands([band],context.plot,secondary?{...axes,y:axis}:axes);
    if(checked.status==='invalid')return {...band,status:'unavailable' as const};
    const box=checked.value[0]?.box;
    return box?{...band,status:'visible' as const,box}:{...band,status:'outside' as const};
  });
  return {...frame,referenceBands:projected};
}
