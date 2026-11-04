import type {ChartResult} from '../public/chart-types.js';
import type {PlanSpec,PlanOptions,PlanResult,PlanFrame,PlanSeries,PlanObservation,PlanLineSpec,PlanScatterSpec,PlanViewportValue,PlanViewportState} from '../public/plan-types.js';
import type {Domain} from '../internal/math/domain.js';
import type {PathCommand} from '../internal/geometry/path.js';
import {validateLine} from '../line/validate.js';
import {normalizeLine,lineDomains} from '../line/normalize.js';
import {validateScatter} from '../scatter/validate.js';
import {normalizeScatter,scatterDomains,type NormalizedScatter} from '../scatter/data.js';
import {createLinearScale} from '../internal/math/linear.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks} from '../internal/math/time.js';
import {createCategoryFrame,createPointScale} from '../internal/math/category.js';
import {formatAxis} from '../internal/axes/plan.js';
import type {AxisInput} from '../internal/axes/plan.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planLineViewportScales,planViewportState} from './viewport.js';
import {checkedLogDomain,logDistance,logDomain,logTicks,logValue} from './log-scale.js';
import {clipSourceSegment} from './contour-clip.js';
import {validatePlanReferences,withPlanReferences,referenceCategories} from './references.js';
import {validatePlanReferenceBands} from './reference-bands.js';
import {freezePlan} from './input.js';

const must=<T>(result:ChartResult<T>):T=>{if(result.status==='invalid')throw result.diagnostic;return result.value;};
function fail(reason:string,path:string,message=reason):never{throw {code:'INVALID_CONFIG',reason,path,message};}
type MutableWindow={-readonly [K in keyof PlanViewportValue]:Exclude<PlanViewportValue[K],undefined>};
function selectTicks(domain:Domain,axis:AxisInput,nice:boolean){return axis.kind==='time'?must(selectTimeTicks(domain,{nice,targetCount:axis.ticks?.targetCount??5})):{...must(selectNumericTicks(domain,{nice,targetCount:axis.ticks?.targetCount??5})),interval:null};}
const key=(seriesId:string,pointId:string)=>JSON.stringify([seriesId,pointId]);
/** Log projection is an isolated /plan owner. Validators and source normalization
 * are reused; original observations are never replaced with logged values. */
export function planLogarithmic(spec:PlanSpec,options:PlanOptions):PlanResult{
 try{
  if(spec.family!=='line'&&spec.family!=='scatter'&&spec.family!=='bubble')fail('UNSUPPORTED_LOG_FAMILY','options.scales');
  // Keep narrowing explicit: incompatible families cannot become a scalar line.
  if(spec.family!=='line'&&spec.family!=='scatter'&&spec.family!=='bubble')throw Error('Unreachable');
  if(options.stacking!==undefined||options.stackGroups!==undefined||options.circular!==undefined||options.wordcloudText!==undefined)fail('INCOMPATIBLE_LOG_OPTION','options');
  if(Object.keys(spec).some(k=>!['family','title','description','axes','series'].includes(k)))fail('UNKNOWN_OPTION','spec');
  const scales=options.scales;if(!scales||typeof scales!=='object'||Array.isArray(scales)||!Object.keys(scales).length||Object.keys(scales).some(k=>k!=='x'&&k!=='y'))fail('BAD_LOG_SCALES','options.scales');
  const logs={x:scales?.x!==undefined,y:scales?.y!==undefined};
  for(const axis of ['x','y'] as const){const scale=scales?.[axis];if(scale===undefined)continue;
   if(!scale||typeof scale!=='object'||Array.isArray(scale)||Object.keys(scale).some(k=>!['kind','base'].includes(k))||scale.kind!=='log'||scale.base!==undefined&&scale.base!==10)fail('BAD_LOG_SCALE','options.scales.'+axis);
   const source=spec.axes?.[axis];if(!source||source.kind!=='linear'||'includeZero' in source&&source.includeZero===true)fail('LOG_REQUIRES_POSITIVE_NUMERIC_AXIS','axes.'+axis);
   if(source.domain!==undefined)checkedLogDomain(source.domain);
  }
  const hidden=options.hiddenSeriesIds??[],state={hiddenSeriesIds:[...hidden]},width=options.width,height=options.height,palette=defaultPalette('light',false).series;
  if(!Array.isArray(spec.series)||spec.series.length>16||spec.series.reduce((n,s)=>n+(Array.isArray(s?.data)?s.data.length:10001),0)>10000)fail('INPUT_LIMIT','series');
  if(spec.axes?.x.kind==='category'&&spec.axes.x.values.length>64)fail('LABEL_LIMIT','axes.x.values');
  for(const [si,s]of spec.series.entries())for(const [pi,p]of s.data.entries())for(const axis of ['x','y'] as const)if(logs[axis]&&p[axis]!==null&&!(typeof p[axis]==='number'&&p[axis]>0&&Number.isFinite(p[axis])))fail('NONPOSITIVE_LOG_VALUE',`series[${si}].data[${pi}].${axis}`);
  const refs=must(validatePlanReferences(options.references,spec)),bands=must(validatePlanReferenceBands(options.referenceBands,spec));
  for(const [i,r]of (refs??[]).entries())if(logs[r.axis]&&!(typeof r.value==='number'&&r.value>0))fail('NONPOSITIVE_LOG_REFERENCE',`options.references[${i}].value`);
  for(const [i,b]of (bands??[]).entries())if(logs[b.axis]&&!(typeof b.from==='number'&&b.from>0&&typeof b.to==='number'&&b.to>0))fail('NONPOSITIVE_LOG_BAND',`options.referenceBands[${i}]`);
  // Safe explicit placeholders only for frozen linear validation/domain helpers.
  // Their output for a logarithmic axis is discarded, never sent to the host.
  const axes={x:logs.x?{...spec.axes.x,domain:[1,10] as Domain,nice:false}:spec.axes.x,y:logs.y?{...spec.axes.y,domain:[1,10] as Domain,nice:false,includeZero:false}:spec.axes.y};
  const sizes=new Map<string,{z:number;label:string}>();let maximum=0;
  let line:ReturnType<typeof normalizeLine>|null=null;
  let scatter:NormalizedScatter<unknown>|null=null;
  let domains:Readonly<{x:Domain|null;y:Domain|null}>;
  let sourceAxes:PlanLineSpec['axes']|PlanScatterSpec['axes'];
  if(spec.family==='line'){
   const input=must(validateLine({...spec,axes}));line=normalizeLine(input);domains=must(lineDomains(line,state));sourceAxes=input.axes;
  }else{
   for(const series of spec.series){
    if(Object.keys(series).some(k=>!['id','name','color','data'].includes(k)))fail('UNKNOWN_OPTION','series');
    for(const p of series.data){
     if(Object.keys(p).some(k=>!(spec.family==='bubble'?['id','x','y','z','label']:['id','x','y']).includes(k)))fail('UNKNOWN_OPTION','series.data');
     const z='z' in p?p.z:0;if(spec.family==='bubble'&&!(typeof z==='number'&&Number.isFinite(z)&&z>=0))fail('BAD_BUBBLE_SIZE','series.data.z');
     const label='label' in p?p.label:undefined;if(label!==undefined&&(typeof label!=='string'||label.length>200))fail('BAD_BUBBLE_LABEL','series.data.label');
     sizes.set(key(series.id,p.id),{z:z as number,label:label??p.id});if(!hidden.includes(series.id)&&p.x!==null&&p.y!==null)maximum=Math.max(maximum,z as number);
    }
   }
   const input=must(validateScatter({family:'scatter',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),axes,series:spec.series.map(s=>({...s,data:s.data.map((p:PlanScatterSpec['series'][number]['data'][number])=>({id:p.id,x:p.x,y:p.y}))}))}));
   scatter=must(normalizeScatter(input));domains=must(scatterDomains(scatter,state));sourceAxes=input.axes;
  }
  const sources=line?.series.map(s=>({spec:s.spec,valid:s.valid,runs:s.runs}))??scatter!.series.map(s=>({spec:s.spec,valid:s.paired.map(p=>p.point),runs:[]}));
  if(hidden.some(id=>!sources.some(s=>s.spec.id===id)))fail('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const legend=sources.map((s,i)=>({id:s.spec.id,name:s.spec.name,color:s.spec.color??palette[i%palette.length]!,visible:!hidden.includes(s.spec.id)}));
  const base={schema:'nc-plan/1' as const,family:spec.family,width,height,title:spec.title,description:spec.description??'',unit:spec.axes.y.title??'',legend};
  const visible=sources.filter(s=>!hidden.includes(s.spec.id)),valid=visible.flatMap(s=>s.valid);
  if(!valid.length)return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],labels:[],grid:[]},refs,undefined,bands)});
  const originalXs=line?line.series.flatMap(s=>s.points.map(p=>p.x as number)):valid.map(p=>p.x as number);
  const full={x:logs.x?logDomain(originalXs,spec.axes.x.kind==='linear'?spec.axes.x.domain:undefined,spec.axes.x.kind==='linear'&&!!spec.axes.x.nice):domains.x,y:logs.y?logDomain(valid.map(p=>p.y!),spec.axes.y.domain,!!spec.axes.y.nice):domains.y};
  const fullTicks=(axis:'x'|'y')=>{const d=full[axis],a=sourceAxes[axis];if(!d||logs[axis]||a.kind==='category')return null;return selectTicks(d,a,a.nice??(axis==='y'&&!a.domain));};
  const xt=fullTicks('x'),yt=fullTicks('y');if(xt)full.x=xt.domain;if(yt)full.y=yt.domain;
  if(!full.y||sourceAxes.x.kind!=='category'&&!full.x)fail('BAD_LOG_DOMAIN','axes');
  const configured=options.viewport?.value,window:MutableWindow={...configured};
  // A tiny displayed window inside an enormous full domain must retain its
  // own precision. Two full-origin logarithms can round to the same double.
  const origin={x:full.x?.[0]??1,y:full.y[0]};
  for(const axis of ['x','y'] as const)if(logs[axis]&&window[axis]!==undefined){const pair=checkedLogDomain(window[axis]),bounds=full[axis]!;if(pair[0]<bounds[0]||pair[1]>bounds[1])fail('LOG_WINDOW_OUTSIDE_DOMAIN','options.viewport.value.'+axis);origin[axis]=pair[0];}
  const encode=(axis:'x'|'y',value:number)=>logs[axis]?logDistance(origin[axis],value):value;
  const encoded={x:logs.x?[encode('x',full.x![0]),encode('x',full.x![1])] as Domain:full.x,y:logs.y?[encode('y',full.y[0]),encode('y',full.y[1])] as Domain:full.y};
  const decode=(axis:'x'|'y',value:number)=>logs[axis]?(value===encoded[axis]![0]?full[axis]![0]:value===encoded[axis]![1]?full[axis]![1]:logValue(origin[axis],value)):value;
  for(const axis of ['x','y'] as const)if(logs[axis]&&window[axis]!==undefined){const raw=checkedLogDomain(window[axis]);window[axis]=[encode(axis,raw[0]),encode(axis,raw[1])];}
  const viewport=must(preparePlanViewport(sourceAxes,encoded,options.viewport?{...options.viewport,value:window}:undefined)),displayed=withViewportDomains(encoded,viewport);
  const plot=spec.family==='line'?{x:16,y:14,width:width-32,height:height-28}:{x:Math.min(48,width/4),y:Math.min(48,height/4),width:width-2*Math.min(48,width/4),height:height-2*Math.min(48,height/4)};
  const xr:Domain='reversed' in sourceAxes.x&&sourceAxes.x.reversed?[plot.x+plot.width,plot.x]:[plot.x,plot.x+plot.width],yr:Domain=sourceAxes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y];
  const numericX=displayed.x?must(createLinearScale(displayed.x,xr,false)):null,y=must(createLinearScale(displayed.y!,yr,false));
  let categoryMap:((v:string|number)=>number|null)|undefined;
  if(line&&sourceAxes.x.kind==='category'){
   const prepared=must(planLineViewportScales(line.spec.axes,plot,displayed.x,displayed.y!,viewport));
   const point=createPointScale(must(createCategoryFrame(sourceAxes.x.values.map(v=>v.id),xr,sourceAxes.x.edgeSpacing??.5)));
   categoryMap=prepared?.mapX??(v=>typeof v==='string'?point.center(v):null);
  }
  const mapX=(value:string|number)=>categoryMap?categoryMap(value):typeof value==='number'?numericX!.map(encode('x',value)):null,mapY=(value:number)=>y.map(encode('y',value));
  const rawDomains={x:logs.x?configured?.x!==undefined?checkedLogDomain(configured.x):full.x:displayed.x?[decode('x',displayed.x[0]),decode('x',displayed.x[1])] as Domain:null,y:logs.y?configured?.y!==undefined?checkedLogDomain(configured.y):full.y:[decode('y',displayed.y![0]),decode('y',displayed.y![1])] as Domain};
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  const inside=(value:number,domain:Domain)=>value>=domain[0]&&value<=domain[1];
  for(const s of visible){const color=legend.find(l=>l.id===s.spec.id)!.color,commands:PathCommand[]=[],circles:NonNullable<PlanSeries['circles']>[number][]=[];
   if(line){
    const cx:Domain=categoryMap?[plot.x,plot.x+plot.width]:displayed.x!,cy=displayed.y!;
    for(const run of s.runs)for(let i=1;i<run.length;i++){
     const before=run[i-1]!,after=run[i]!,a={x:categoryMap?categoryMap(before.x)!:encode('x',before.x as number),y:encode('y',before.y!)},b={x:categoryMap?categoryMap(after.x)!:encode('x',after.x as number),y:encode('y',after.y!)};
     const curve='curve' in s.spec?s.spec.curve:'straight',mid=a.x/2+b.x/2;
     const path=curve==='step-before'?[a,{x:a.x,y:b.y},b]:curve==='step-after'?[a,{x:b.x,y:a.y},b]:curve==='step-mid'?[a,{x:mid,y:a.y},{x:mid,y:b.y},b]:[a,b];
     for(let j=1;j<path.length;j++){const clipped=clipSourceSegment({start:path[j-1]!,end:path[j]!},cx,cy);if(!clipped)continue;
      const [start,end]=clipped,toX=(v:number)=>categoryMap?v:numericX!.map(v)!;
      const startX=toX(start.x),startY=y.map(start.y)!,previous=commands.at(-1);
      if(!previous||previous.kind!=='L'||previous.x!==startX||previous.y!==startY)commands.push({kind:'M',x:startX,y:startY});
      commands.push({kind:'L',x:toX(end.x),y:y.map(end.y)!});
     }
    }
   }
   for(const p of s.valid){
    if(p.y===null||p.x===null||!inside(encode('y',p.y),displayed.y!)||!categoryMap&&!inside(encode('x',p.x as number),displayed.x!))continue;
    const px=mapX(p.x),py=mapY(p.y);if(px===null||py===null||px<plot.x||px>plot.x+plot.width)continue;
    if(line){const label=line.labels.get(String(p.x))??formatAxis(p.x,sourceAxes.x.kind,xt&&'interval' in xt?xt.interval:null,line.labels);observations.push({id:{seriesId:s.spec.id,pointId:p.id},label,seriesName:s.spec.name,value:p.y,x:px,y:py,color,group:{key:JSON.stringify([sourceAxes.x.kind,p.x]),label,coordinate:px}});}
    else{const size=sizes.get(key(s.spec.id,p.id))!,radius=spec.family==='scatter'?3:size.z>0?Math.min(44,width/4,height/4)*Math.max(6/44,Math.sqrt(size.z/maximum)):0;
     circles.push({pointId:p.id,cx:px,cy:py,radius});observations.push({id:{seriesId:s.spec.id,pointId:p.id},label:size.label,seriesName:s.spec.name,value:p.y,x:px,y:py,color,xValue:p.x as number,...(spec.family==='bubble'?{sizeValue:size.z}:{}),hit:{kind:'circle',cx:px,cy:py,radius}});
    }
   }
   series.push({id:s.spec.id,name:s.spec.name,color,...(line?{commands}:{circles})});
  }
  const ticks=(axis:'x'|'y')=>{const domain=rawDomains[axis],a=sourceAxes[axis];if(!domain||a.kind==='category')return [];return logs[axis]?logTicks(domain,a.ticks?.targetCount??5):selectTicks(domain,a,false).ticks;};
  const categories=sourceAxes.x.kind==='category'?sourceAxes.x.values:[];
  const labels=categories.length?categories.flatMap(v=>{const x=mapX(v.id);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:v.label??v.id}];}):ticks('x').map(v=>({x:mapX(v)!,label:sourceAxes.x.kind==='time'?formatAxis(v,'time',xt&&'interval' in xt?xt.interval:null,new Map()):String(v)}));
  let view:PlanViewportState|undefined;
  if(viewport){const encodedState=planViewportState(viewport,displayed,sourceAxes,plot)!;const bounds={...encodedState.bounds},value:MutableWindow={...encodedState.value};
   for(const axis of ['x','y'] as const)if(logs[axis]){bounds[axis]={kind:'log',base:10,domain:full[axis]!};const raw=value[axis];if(Array.isArray(raw))value[axis]=rawDomains[axis]!;}
   view={...encodedState,bounds,value,displayed:rawDomains};
  }
  const frame:PlanFrame={...base,series,observations,labels,grid:ticks('y').map(v=>({y:mapY(v)!,label:String(v),value:v,kind:'number' as const})),...(view?{viewport:view}:{})};
  return freezePlan({status:observations.length?'ok':'empty',frame:withPlanReferences(frame,refs,{plot,domains:rawDomains,mapX,mapY,bandSourceAxes:sourceAxes,...(categories.length?{categories:referenceCategories(categories,plot,mapX)}:{})},bands)});
 }catch(error){if(error&&typeof error==='object'&&'code' in error&&'reason' in error&&'path' in error&&'message' in error)return {status:'invalid',diagnostic:error as Extract<PlanResult,{status:'invalid'}>['diagnostic']};return {status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_LOG_SCALE',path:'options.scales',message:error instanceof Error?error.message:'Invalid log projection.'}};}
}
