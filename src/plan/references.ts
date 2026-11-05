import type {ChartResult} from '../public/chart-types.js';
import type {PlanSpec,PlanReference,PlanProjectedReference,PlanFrame} from '../public/plan-types.js';
import type {Plot} from '../internal/layout/frame.js';
import {referenceOutside} from '../internal/axes/scene.js';
import {invalid,ok} from '../internal/diagnostics.js';
import type {AxisInput} from '../internal/axes/plan.js';
import type {PlanReferenceBand} from '../public/reference-band-plan-types.js';
import {withPlanReferenceBands} from './reference-bands.js';

export interface PlanReferenceContext {
  readonly plot:Plot;
  readonly domains:Readonly<{x:readonly[number,number]|null;y:readonly[number,number]|null}>;
  readonly categories?:ReadonlyMap<string,number>;
  readonly mapX?:(value:string|number)=>number|null;
  readonly mapY?:(value:number)=>number|null;
  readonly secondaryY?:Readonly<{domain:readonly[number,number]|null;map:(value:number)=>number|null}>;
  readonly horizontal?:boolean;
  readonly bandSourceAxes?:Readonly<{x:AxisInput;y:AxisInput}>;
  readonly categorySlot?:(id:string)=>readonly[number,number]|null;
}
/** Validate only the additive, style-free envelope. Existing family validators
 * still validate category/time semantics when these values enter their input. */
export function validatePlanReferences(input:unknown,spec:PlanSpec):ChartResult<readonly PlanReference[]|undefined>{
  if(input===undefined)return ok(undefined);
  if(!['contour','vector','windbarb','polygon','lollipop','dumbbell','columnpyramid','boxplot','errorbar','streamgraph','arearange','areasplinerange','columnrange','areaspline','waterfall','mixed','line','area','spline','scatter','column','bubble'].includes(spec.family))return invalid('INVALID_CONFIG','UNSUPPORTED_REFERENCES','options.references');
  if(!Array.isArray(input)||input.length>16)return invalid('INVALID_CONFIG','BAD_REFERENCES','options.references');
  const ids=new Set<string>();
  for(let index=0;index<input.length;index++){
    const reference=input[index],path='options.references['+index+']';
    if(!reference||typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).some(key=>!['id','axis','value','yAxis'].includes(key)))return invalid('INVALID_CONFIG','BAD_REFERENCE',path);
    if(typeof reference.id!=='string'||reference.id.length<1||reference.id.length>64||ids.has(reference.id))return invalid('INVALID_CONFIG','BAD_REFERENCE_ID',path+'.id');
    ids.add(reference.id);
    if(reference.axis!=='x'&&reference.axis!=='y'||(spec.family==='column'||spec.family==='waterfall')&&reference.axis!=='y')return invalid('INVALID_CONFIG','BAD_REFERENCE_AXIS',path+'.axis');
    if(reference.yAxis!==undefined&&(reference.yAxis!=='secondary'||reference.axis!=='y'||spec.family!=='mixed'||!spec.axes?.secondaryY))return invalid('INVALID_CONFIG','BAD_SECONDARY_REFERENCE',path+'.yAxis');
    const category=reference.axis==='x'&&(spec.family==='mixed'||spec.family==='line'||spec.family==='area'||spec.family==='lollipop'||spec.family==='dumbbell'||spec.family==='columnpyramid'||spec.family==='boxplot'||spec.family==='errorbar'||spec.family==='streamgraph'||spec.family==='areaspline'||spec.family==='arearange'||spec.family==='areasplinerange'||spec.family==='columnrange'||spec.family==='spline')&&spec.axes?.x?.type==='category';
    if(category?typeof reference.value!=='string':typeof reference.value!=='number'||!Number.isFinite(reference.value))return invalid('INVALID_CONFIG','BAD_REFERENCE_VALUE',path+'.value');
  }
  return ok(input as readonly PlanReference[]);
}
/** Membership is decided by the existing projected map, not by labels or a
 * second category scale. It includes only the current visible window. */
export function referenceCategories(values:readonly Readonly<{id:string}>[],plot:Plot,mapX:(value:string|number)=>number|null):ReadonlyMap<string,number>{
  const visible=new Map<string,number>();
  for(const category of values){const x=mapX(category.id);if(x!==null&&x>=plot.x&&x<=plot.x+plot.width)visible.set(category.id,visible.size);}
  return visible;
}
function projectedReferences(references:readonly PlanReference[],context:PlanReferenceContext|undefined):readonly PlanProjectedReference[]{
  const categories=context?.categories??new Map<string,number>();
  return references.map(reference=>{
    const secondary=reference.axis==='y'&&reference.yAxis==='secondary',identity={id:reference.id,axis:reference.axis,...(secondary?{valueAxis:'secondary' as const}:{})};
    const domains=context?(secondary?{...context.domains,y:context.secondaryY?.domain??null}:context.domains):undefined;
    if(!context||!domains||typeof reference.value==='number'&&!domains[reference.axis])return {...identity,status:'unavailable' as const};
    if(referenceOutside(reference,domains,categories))return {...identity,status:'outside' as const};
    const coordinate=reference.axis==='x'?context.mapX?.(reference.value):typeof reference.value==='number'?(secondary?context.secondaryY?.map(reference.value):context.mapY?.(reference.value)):null;
    if(coordinate===undefined||coordinate===null||!Number.isFinite(coordinate))return {...identity,status:'unavailable' as const};
    const plot=context.plot,vertical=reference.axis==='x'||context.horizontal===true;
    return {...identity,status:'visible' as const,line:vertical?{x1:coordinate,y1:plot.y,x2:coordinate,y2:plot.y+plot.height}:{x1:plot.x,y1:coordinate,x2:plot.x+plot.width,y2:coordinate}};
  });
}
export function withPlanReferences(frame:PlanFrame,references:readonly PlanReference[]|undefined,context?:PlanReferenceContext,bands?:readonly PlanReferenceBand[]):PlanFrame{
  const output=references===undefined?frame:{...frame,references:projectedReferences(references,context)};
  return withPlanReferenceBands(output,bands,context);
}
