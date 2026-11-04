import {array,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {validateStackedArea} from '../stacked-area/validate.js';
import {normalizeStackedArea,areaStack,stackAreaDomains} from '../stacked-area/data.js';
import type {AreaStack} from '../stacked-area/data.js';
import {stackAreaBands} from '../stacked-area/bands.js';
import {projectStackedArea} from '../stacked-area/geometry.js';
import {projectLine} from '../line/geometry.js';
import {pointKey} from '../line/normalize.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks} from '../internal/math/time.js';
import {formatAxis,type AxesPlan} from '../internal/axes/plan.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planLineViewportScales,planViewportState} from './viewport.js';
import {withPlanReferences,referenceCategories} from './references.js';
import {freezePlan} from './input.js';
import type {PlanObservation,PlanOptions,PlanReference,PlanResult,PlanSeries,PlanStreamgraphSpec} from '../public/plan-types.js';

/** Fixed silhouette stream: visible bands are displaced by -visibleTotal/2.
 * This is a centred stack, not a wiggle optimiser or a percent encoding.
 * Complete adjacent rows alone form bands; source Y remains the public value.
 */
export function planStreamgraph(spec:PlanStreamgraphSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  try{
    const input=record(spec,['family','title','description','axes','series'],['family','title','axes','series'],'spec');
    if(input.family!=='streamgraph')fail('family');
    for(const [i,s]of array(input.series,16,'series').entries())record(s,['id','name','color','data'],['id','name','data'],'series['+i+']');
    const opts=record(options,['width','height','hiddenSeriesIds','viewport','references','stacking'],['width','height'],'options');
    if(Object.hasOwn(opts,'stacking'))fail('options.stacking','STREAMGRAPH_HAS_FIXED_STACK');
    const width=number(opts.width,'options.width',64,10000),height=number(opts.height,'options.height',64,10000);
    const hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,16,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];
    if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const checked=validateStackedArea({...input,family:'stacked-area',stacking:'sum',...(references?{references}:{})});if(checked.status==='invalid')return checked;
    const validated=checked.value;
    if(hidden.some(id=>!validated.series.some(s=>s.id===id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    if(validated.axes.x.kind==='category'&&validated.axes.x.values.length>64)fail('axes.x.values','LABEL_LIMIT');
    for(const [si,s]of validated.series.entries())for(const [pi,p]of s.data.entries())if(p.y!==null&&p.y<0)fail('series['+si+'].data['+pi+'].y','NONNEGATIVE_STREAM_VALUES_REQUIRED');
    const state={hiddenSeriesIds:hidden},data=normalizeStackedArea(validated),raw=areaStack(data,state);if(raw.status==='invalid')return raw;
    const offsets=new Map([...raw.value.categories].map(([id,row])=>[id,row.complete&&row.total!==null?-row.total/2:0]));
    const shift=(segment:AreaStack<unknown>['series'][number]['segments'][number])=>{
      const offset=offsets.get(segment.point.x)!;return {...segment,base:segment.base+offset,end:segment.end+offset};
    };
    // Both views must be shifted: the projector reads per-series segments for
    // eligible anchors, while domains inspect the per-category segment rows.
    let reach=0;for(const offset of offsets.values())reach=Math.max(reach,Math.abs(offset));
    const centered:AreaStack<unknown>={...raw.value,extent:[-reach,reach],categories:new Map([...raw.value.categories].map(([id,row])=>[id,{...row,segments:row.segments.map(shift)}])),series:raw.value.series.map(s=>({...s,segments:s.segments.map(shift)}))};
    const bands=stackAreaBands(data,raw.value);if(bands.status==='invalid')return bands;
    // Band vertices may lie between X rows. Interpolate the same silhouette
    // offsets at each vertex instead of recomputing an uncentred raw stack.
    const preparedBands=bands.value.map(band=>({...band,vertices:band.vertices.map(v=>{
      const a=offsets.get(data.coordinateIds[v.left]!)!,b=offsets.get(data.coordinateIds[v.right]!)!,offset=a*(1-v.fraction)+b*v.fraction;
      return {...v,base:v.base+offset,end:v.end+offset};
    })}));
    const domains=stackAreaDomains(data,centered);if(domains.status==='invalid')return domains;
    const plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false).series;
    const legend=validated.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.includes(s.id)}));
    const base={schema:'nc-plan/1' as const,family:'streamgraph' as const,title:validated.title,description:validated.description??'',unit:validated.axes.y.title??'',width,height,legend};
    if(!domains.value.y)return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],labels:[],grid:[]},references)});
    const xa=validated.axes.x;
    let yt=selectNumericTicks(domains.value.y,{nice:validated.axes.y.nice??!validated.axes.y.domain,targetCount:validated.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
    let xt=xa.kind==='category'||!domains.value.x?null:(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(domains.value.x,{nice:xa.nice??false,targetCount:xa.ticks?.targetCount??6});if(xt?.status==='invalid')return xt;
    const prepared=preparePlanViewport(validated.axes,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},options.viewport);if(prepared.status==='invalid')return prepared;
    const view=prepared.value,scoped=withViewportDomains({x:xt?.value.domain??domains.value.x,y:yt.value.domain},view);
    if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:validated.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
    if(view?.value.x&&xa.kind!=='category'&&scoped.x){xt=(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(scoped.x,{nice:false,targetCount:xa.ticks?.targetCount??6});if(xt.status==='invalid')return xt;}
    const xDomain=xt?.value.domain??domains.value.x,yDomain=yt.value.domain,interval=xt&&'interval' in xt.value?xt.value.interval:null;
    const scales=planLineViewportScales(validated.axes,plot,xDomain,yDomain,view);if(scales.status==='invalid')return scales;
    const mapped=projectLine(data.line,state,plot,xDomain,yDomain,scales.value);if(mapped.status==='invalid')return mapped;
    const axes:AxesPlan={plot,tooSmall:false,mapX:mapped.value.mapX,mapY:mapped.value.mapY,x:{domain:xDomain,ticks:xt?.value.ticks??[],labels:[],interval,target:6},y:{domain:yDomain,ticks:yt.value.ticks,labels:[],interval:null,target:5},xTitle:null,yTitle:null,font:{family:'sans-serif',size:12,weight:400},direction:'ltr'};
    const projected=projectStackedArea(data,state,centered,axes,preparedBands);if(projected.status==='invalid')return projected;
    const p=projected.value,series:PlanSeries[]=[],observations:PlanObservation[]=[];
    for(const s of p.series){
      const color=legend.find(item=>item.id===s.series.spec.id)!.color;
      series.push({id:s.series.spec.id,name:s.series.spec.name,color,commands:s.commands,areaCommands:p.fills.get(s.series.spec.id)??[]});
      for(const point of s.eligible){
        const label=formatAxis(point.point.x,xa.kind,interval,data.line.labels),segment=p.segments.get(pointKey(s.series.spec.id,point.point.id))!;
        if(!Number.isFinite(segment.base)||!Number.isFinite(segment.end))fail('series.data','UNREPRESENTABLE_STREAM_GEOMETRY');
        observations.push({id:{seriesId:s.series.spec.id,pointId:point.point.id},label,seriesName:s.series.spec.name,value:point.point.y!,x:point.x,y:point.y,color,...(typeof point.point.x==='number'?{xValue:point.point.x}:{}),group:{key:JSON.stringify([xa.kind,point.point.x]),label,coordinate:point.x}});
      }
    }
    const values=xa.kind==='category'?xa.values.map(c=>c.id):xt?.value.ticks??[],labels=values.flatMap(value=>{const x=p.mapX(value);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:formatAxis(value,xa.kind,interval,data.line.labels),...(typeof value==='number'?{value,kind:xa.kind==='time'?'time' as const:'number' as const}:{})}];});
    const context=p.series.some(s=>s.series.valid.length>0)?{plot,domains:{x:xDomain,y:yDomain},mapX:p.mapX,mapY:p.mapY,...(xa.kind==='category'?{categories:referenceCategories(xa.values,plot,p.mapX)}:{})}:undefined;
    return freezePlan({status:observations.length?'ok':'empty',frame:withPlanReferences({...base,series,observations,labels,grid:yt.value.ticks.map(value=>({y:p.mapY(value)!,label:String(value),value:value,kind:'number' as const})),...(view?{viewport:planViewportState(view,{x:xDomain,y:yDomain},validated.axes,plot)!}:{})},references,context)});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
