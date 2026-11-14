import { planLegend } from './plan-presentation.js';
import { invalidPlan } from './diagnostics.js';
import {areaScene} from '../area/scene.js';
import {splineScene} from '../spline/scene.js';
import {splineAreaCommands} from './areaspline.js';
import {emptyLayers} from '../internal/axes/scene.js';
import {seriesKey,lineDomains} from '../line/normalize.js';
import {projectLine} from '../line/geometry.js';
import {validateColumn} from '../column/validate.js';
import {normalizeColumn,columnDomain} from '../column/normalize.js';
import {projectColumn} from '../column/geometry.js';
import {validateStacked} from '../stacked/validate.js';
import {stackedDomain,projectStacked} from '../stacked/geometry.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks} from '../internal/math/time.js';
import {formatAxis} from '../internal/axes/plan.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {PlanSpec,PlanOptions,PlanResult,PlanFrame,PlanSeries,PlanObservation} from '../public/plan-types.js';
import {ownPlanInput,freezePlan} from './input.js';
import {planCapacity} from './capacity.js';
import {preparePlanViewport,planViewportState,planLineViewportScales} from './viewport.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {validatePlanReferences,withPlanReferences,referenceCategories,type PlanReferenceContext} from './references.js';
import {validatePlanReferenceBands} from './reference-bands.js';
import {planStackLabels} from './stack-labels.js';
import {planStackedArea} from './stacked-area.js';
import {planGroupedStacks} from './grouped-stacks.js';
import {planLogarithmic} from './logarithmic.js';
import {prepareOwnedLine} from './prepared-line.js';
import {projectPlanLine, type PlanLineProjection} from './line-projection.js';
import {lineObservationMetadata} from './line-observation.js';


/** Cartesian-only public entry. It shares the certified planners without retaining radial/graph families. */
export function planCartesianChart(value:PlanSpec,options:PlanOptions):PlanResult {
  return planCartesian(value,options,false);
}
/** Internal dispatcher boundary: both inputs have already passed ownPlanInput.
 * Not exported by the package's public Cartesian or plan entrypoints. */
export function planOwnedCartesianChart(value:PlanSpec,options:PlanOptions):PlanResult {
  return planCartesian(value,options,true);
}
function planCartesian(value:PlanSpec,options:PlanOptions,owned:boolean):PlanResult {
  try {
    const ownedOptions=owned?options:ownPlanInput(options) as PlanOptions;
    if(!ownedOptions||typeof ownedOptions!=='object'||Object.keys(ownedOptions).some(k=>!['width','height','hiddenSeriesIds','stacking','stackGroups','viewport','references','referenceBands','scales','capacity'].includes(k)))return invalidPlan('UNKNOWN_OPTION','options');
    const capacity=planCapacity(ownedOptions.capacity),spec=owned?value:ownPlanInput(value,capacity) as PlanSpec,{width,height}=ownedOptions,hidden=ownedOptions.hiddenSeriesIds??[];
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<64||height<64||width>10000||height>10000)return invalidPlan('BAD_VIEWPORT','options');
    if(!Array.isArray(hidden)||hidden.length>16||hidden.some(id=>typeof id!=='string'||!id||id.length>256)||new Set(hidden).size!==hidden.length)return invalidPlan('BAD_VISIBILITY','options.hiddenSeriesIds');
    if(!spec||!['line','area','areaspline','spline','column'].includes(spec.family))return invalidPlan('UNSUPPORTED_FAMILY','family');
    if(spec.family!=='line'&&spec.family!=='area'&&spec.family!=='areaspline'&&spec.family!=='spline'&&spec.family!=='column')return invalidPlan('UNSUPPORTED_FAMILY','family');
    if(ownedOptions.scales)return planLogarithmic(spec,ownedOptions);
    const checkedBands=validatePlanReferenceBands(ownedOptions.referenceBands,spec);if(checkedBands.status==='invalid')return checkedBands;
    const checkedReferences=validatePlanReferences(ownedOptions.references,spec);if(checkedReferences.status==='invalid')return checkedReferences;const references=checkedReferences.value;
    if(ownedOptions.stacking!==undefined&&(!['column','area','areaspline'].includes(spec.family)||!['sum','percent'].includes(ownedOptions.stacking)))return invalidPlan('BAD_STACK_MODE','options.stacking');
    if(ownedOptions.stackGroups!==undefined&&(spec.family!=='column'||!ownedOptions.stacking))return invalidPlan('STACK_GROUPS_REQUIRE_STACKED_COLUMNS','options.stackGroups');
    if(spec.family==='column'&&ownedOptions.stackGroups)return planGroupedStacks(spec,ownedOptions,references);
    if((spec.family==='area'||spec.family==='areaspline')&&ownedOptions.stacking)return planStackedArea(spec,ownedOptions,references);
    if(!Array.isArray(spec.series)||spec.series.length>16||spec.series.reduce((n,s)=>n+(Array.isArray(s?.data)?s.data.length:capacity.points+1),0)>capacity.points)return invalidPlan('INPUT_LIMIT','series');
    if(spec.axes?.x?.type==='category'&&Array.isArray(spec.axes.x.values)&&spec.axes.x.values.length>capacity.categories)return invalidPlan('LABEL_LIMIT','axes.x.values');
    const state={hiddenSeriesIds:[...hidden]},plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false).series;
    const finish=(frame:PlanFrame,context?:PlanReferenceContext):PlanResult=>freezePlan({status:frame.observations.length?'ok':'empty',frame:withPlanReferences(frame,references,context,checkedBands.value)});
    if(spec.family==='line'||spec.family==='area'||spec.family==='areaspline'||spec.family==='spline'){
      const filled=spec.family==='area'||spec.family==='areaspline';
      if(filled&&Object.getOwnPropertyDescriptor(spec.axes.y,'includeZero')?.value===false)return invalidPlan('AREA_REQUIRES_ZERO','axes.y.includeZero');
      if((spec.family==='spline'||spec.family==='areaspline')&&spec.series.some(s=>s.curve!==undefined))return invalidPlan('SPLINE_HAS_FIXED_CURVE','series.curve');
      const lineSpec={...spec,family:'line' as const,...(filled?{axes:{...spec.axes,y:{...spec.axes.y,includeZero:true}}}:{})};
      const checked=prepareOwnedLine(references===undefined?lineSpec:{...lineSpec,references});if(checked.status==='invalid')return checked;
      const {input,data}=checked.value,domains=lineDomains(data,state),legend=planLegend(input.series,palette,hidden);
      if(domains.status==='invalid')return domains;
      if(hidden.some(id=>!input.series.some(s=>s.id===id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
      const base={schema:'nc-plan/1' as const,family:spec.family,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
      if(!domains.value.y)return finish({...base,series:[],observations:[],labels:[],grid:[]});
      let yt=selectNumericTicks(domains.value.y,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
      const xa=input.axes.x;let xt=xa.type==='category'||!domains.value.x?null:(xa.type==='time'?selectTimeTicks:selectNumericTicks)(domains.value.x,{nice:xa.nice??false,targetCount:xa.ticks?.targetCount??6});if(xt?.status==='invalid')return xt;
      const prepared=preparePlanViewport(input.axes,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},ownedOptions.viewport);if(prepared.status==='invalid')return prepared;
      const view=prepared.value,scoped=withViewportDomains({x:xt?.value.domain??domains.value.x,y:yt.value.domain},view);
      if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
      if(view?.value.x&&xa.type!=='category'&&scoped.x){xt=(xa.type==='time'?selectTimeTicks:selectNumericTicks)(scoped.x,{nice:false,targetCount:xa.ticks?.targetCount??6});if(xt.status==='invalid')return xt;}
      const interval=xt&&'interval' in xt.value?xt.value.interval:null;
      const scales=planLineViewportScales(input.axes,plot,xt?.value.domain??domains.value.x,yt.value.domain,view);if(scales.status==='invalid')return scales;
      let p: PlanLineProjection<unknown>;const series:PlanSeries[]=[],observations:PlanObservation[]=[];
      const layers=emptyLayers();
      if(spec.family==='line'){
        const projected=projectPlanLine(data,state,plot,xt?.value.domain??domains.value.x,yt.value.domain,scales.value);if(projected.status==='invalid')return projected;p=projected.value;
      }else{
        const projected=projectLine(data,state,plot,xt?.value.domain??domains.value.x,yt.value.domain,scales.value);if(projected.status==='invalid')return projected;p=projected.value;
        const painted=spec.family==='area'?areaScene(projected.value,defaultPalette('light',false),layers,new Map()):splineScene(projected.value,defaultPalette('light',false),layers,new Map());if(painted.status==='invalid')return painted;
      }
      for(const s of p.series){
        const color=legend.find(item=>item.id===s.series.spec.id)!.color;
        const key=seriesKey(s.series.spec.id),outline=layers.marks.find(mark=>mark.type==='path'&&mark.key===key);
        const areaCommands=layers.marks.flatMap(mark=>mark.type==='path'&&mark.key.startsWith(key+'|area:')?mark.commands:[]);
        const commands=outline?.type==='path'?outline.commands:s.commands;
        const baseline=p.mapY(0);
        if(spec.family==='areaspline'&&(baseline===null||!Number.isFinite(baseline)))return invalidPlan('UNREPRESENTABLE_GEOMETRY','area.baseline');
        const fill=spec.family==='areaspline'?splineAreaCommands(commands,Math.max(plot.y,Math.min(plot.y+plot.height,baseline!))):areaCommands;
        series.push({id:s.series.spec.id,name:s.series.spec.name,color,commands,...(filled?{areaCommands:fill}:{})});
        const metadata=spec.family==='line'&&data.nonnullCount>2048&&s.eligible.length?lineObservationMetadata(s.series,xa.type):undefined;
        for(const point of s.eligible){
          const label=data.labels.get(String(point.point.x))??formatAxis(point.point.x,xa.type,interval,data.labels);
          const id=metadata?.ids[point.index]??Object.freeze({seriesId:s.series.spec.id,pointId:point.point.id}),groupKey=metadata?.keys[point.index]??JSON.stringify([xa.type,point.point.x]);
          if(metadata){metadata.ids[point.index]=id;metadata.keys[point.index]=groupKey;}
          // All children are owned immutable identities or primitives. Freeze
          // here rather than allocating traversal arrays for every tiny record.
          const group=Object.freeze({key:groupKey,label,coordinate:point.x});
          observations.push(Object.freeze({id,label,seriesName:s.series.spec.name,value:point.point.y!,x:point.x,y:point.y,color,group}));
        }
      }
      const values=xa.type==='category'?xa.values.map(c=>c.id):(xt?.value.ticks??[]);
      const labels=values.flatMap(v=>{const x=p.mapX(v);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:formatAxis(v,xa.type,interval,data.labels),...(typeof v==='number'?{value:v,type:xa.type==='time'?'time' as const:'number' as const}:{})}];});
      return finish({...base,series,observations,labels,grid:yt.value.ticks.map(v=>({y:p.mapY(v)!,label:String(v),value:v,type:'number' as const})),...(view?{viewport:planViewportState(view,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},input.axes,plot)!}:{})},references===undefined&&checkedBands.value===undefined||!p.series.some(series=>series.series.valid.length>0)?undefined:{plot,domains:{x:xt?.value.domain??domains.value.x,y:yt.value.domain},mapX:p.mapX,mapY:p.mapY,bandSourceAxes:input.axes,...(xa.type==='category'?{categories:referenceCategories(xa.values,plot,p.mapX)}:{})});
    }
    const stacking=ownedOptions.stacking;
    const referenceInput=references===undefined?spec:{...spec,references};
    const checked=stacking?validateStacked({...referenceInput,family:'stacked',stacking}):validateColumn(referenceInput);if(checked.status==='invalid')return checked;
    const input=checked.value,data=normalizeColumn(input),domain=stacking?stackedDomain(data,state,stacking):columnDomain(data,state),legend=planLegend(input.series,palette,hidden);
    if(domain.status==='invalid')return domain;
    if(hidden.some(id=>!input.series.some(s=>s.id===id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
    // A normalized percentage-axis caption is not a unit of the raw values.
    const base={schema:'nc-plan/1' as const,family:input.orientation==='horizontal'?'bar' as const:'column' as const,width,height,title:input.title,description:input.description??'',unit:spec.axes.y.title??'',legend};
    if(!domain.value)return finish({...base,series:[],observations:[],labels:[],grid:[]});
    let ticks=selectNumericTicks(domain.value,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;
    const prepared=preparePlanViewport(input.axes,{x:null,y:ticks.value.domain},ownedOptions.viewport);if(prepared.status==='invalid')return prepared;
    const view=prepared.value,scoped=withViewportDomains({x:null,y:ticks.value.domain},view);
    if(view?.value.y){ticks=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;}
    const window=view?.value.x?viewportCategoryWindow(view.value.x)??undefined:undefined;
    const stacked=stacking?projectStacked(data,state,plot,ticks.value.domain,stacking,window):null;
    const projected=stacked??projectColumn(data,state,plot,ticks.value.domain,window);if(projected.status==='invalid')return projected;
    const p=projected.value,series:PlanSeries[]=[],observations:PlanObservation[]=[];
    if(stacked?.status==='ok'&&stacking==='percent')for(const category of stacked.value.stack.categories.values()){
      if(!category.complete&&p.bands.center(category.id)!==null)return invalidPlan('INCOMPLETE_PERCENT_CATEGORY','series','Percent stacking requires a known value for every visible series in each displayed category. Category '+category.id+' has a missing value; use sum stacking or complete the data without treating null as zero.');
    }
    const percentages=new Map<string,number>();if(stacked?.status==='ok')for(const row of stacked.value.stack.series)for(const segment of row.segments)if(segment.percentage!==null)percentages.set(JSON.stringify([segment.seriesId,segment.point.id]),segment.percentage);
    for(const s of data.series){
      if(hidden.includes(s.spec.id))continue;
      const color=legend.find(item=>item.id===s.spec.id)!.color,rects=p.rects.filter(r=>r.series.spec.id===s.spec.id);
      series.push({id:s.spec.id,name:s.spec.name,color,bars:rects.map(r=>({pointId:r.point.id,x:r.x,y:r.y,width:r.width,height:r.height}))});
      const byPoint=new Map(rects.map(rect=>[rect.point.id,rect]));
      for(const point of s.points){
        const rect=byPoint.get(point.id),coordinate=p.bands.center(point.x);
        // An undefined percent total has no segment geometry. Preserve an
        // actual zero observation without inventing a percentage or a bar.
        const semanticZero=stacking==='percent'&&point.y===0&&coordinate!==null&&ticks.value.domain[0]<=0&&ticks.value.domain[1]>=0;
        if(!rect&&!semanticZero)continue;
        const label=data.labels.get(point.x)??point.x,percentage=percentages.get(JSON.stringify([s.spec.id,point.id]));
        const anchor=rect?.anchor??(p.horizontal?{x:p.mapValue(0)!,y:coordinate!}:{x:coordinate!,y:p.mapValue(0)!});
        observations.push({id:{seriesId:s.spec.id,pointId:point.id},label,seriesName:s.spec.name,value:point.y!,x:anchor.x,y:anchor.y,color,...(percentage===undefined?{}:{percentage}),group:{key:JSON.stringify(['category',point.x]),label,coordinate:coordinate!}});
      }
    }
    const labels=p.horizontal?ticks.value.ticks.map(v=>({x:p.mapValue(v)!,label:String(v),value:v,type:'number' as const})):input.axes.x.values.flatMap(c=>{const x=p.bands.center(c.id);return x===null?[]:[{x,label:c.label??c.id}];});
    const yLabels=p.horizontal?input.axes.x.values.flatMap(c=>{const y=p.bands.center(c.id);return y===null?[]:[{id:c.id,y,label:c.label??c.id}];}):undefined;
    const annotations=stacked?.status==='ok'&&stacking?planStackLabels(stacked.value.stack.categories.values(),stacking,ticks.value.domain,p.bands.center,p.mapValue,p.horizontal):undefined;
    return finish({...base,series,observations,labels,...(annotations?{annotations}:{}),grid:p.horizontal?[]:ticks.value.ticks.map(v=>({y:p.mapValue(v)!,label:String(v),value:v,type:'number' as const})),...(yLabels?{yLabels}:{}),...(view?{viewport:planViewportState(view,{x:null,y:ticks.value.domain},input.axes,plot)!}:{})},references===undefined&&checkedBands.value===undefined||!data.series.some(series=>!hidden.includes(series.spec.id)&&series.valid.length>0)?undefined:{plot,domains:{x:null,y:ticks.value.domain},mapY:p.mapValue,horizontal:p.horizontal,bandSourceAxes:input.axes,categorySlot:id=>{const band=p.bands.band(id);return band?[band.start,band.end]:null;}});
  }catch(error){return invalidPlan(error instanceof Error?error.message:'UNREADABLE_INPUT','spec');}
}
