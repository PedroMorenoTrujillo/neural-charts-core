import {validateStacked} from '../stacked/validate.js';
import {normalizeColumn} from '../column/normalize.js';
import {stackedDomain,projectStacked} from '../stacked/geometry.js';
import {createCategoryFrame,createBandScale} from '../internal/math/category.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {withPlanReferences} from './references.js';
import {planStackLabels} from './stack-labels.js';
import {freezePlan} from './input.js';
import type {PlanColumnSpec,PlanOptions,PlanReference,PlanResult,PlanSeries,PlanObservation,PlanAnnotation,PlanStackGroup,PlanStackGroupsLayout} from '../public/plan-types.js';

/** One category frame, value scale and nested group slots. Original stack mathematics is reused. */
export function planGroupedStacks(spec:PlanColumnSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}}),mode=options.stacking;
  if(mode!=='sum'&&mode!=='percent'||!Array.isArray(options.stackGroups)||options.stackGroups.length<1||options.stackGroups.length>8)return bad('STACK_GROUPS_REQUIRE_STACKING','options.stackGroups');
  const checked=validateStacked({...spec,family:'stacked',stacking:mode});if(checked.status==='invalid')return checked;
  const input=checked.value,hidden=options.hiddenSeriesIds??[],state={hiddenSeriesIds:[...hidden]},sourceIds=new Set(input.series.map(s=>s.id));
  if(input.axes.x.values.length>64)return bad('LABEL_LIMIT','axes.x.values');
  if(hidden.some(id=>!sourceIds.has(id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const assigned=new Set<string>(),groupIds=new Set<string>(),groups:PlanStackGroup[]=[];
  for(const g of options.stackGroups){
    if(!g||Object.keys(g).some(k=>!['id','label','seriesIds'].includes(k))||typeof g.id!=='string'||!g.id||g.id.length>64||groupIds.has(g.id)||typeof g.label!=='string'||g.label.length>200||!Array.isArray(g.seriesIds)||g.seriesIds.length<1||g.seriesIds.length>16)return bad('BAD_STACK_GROUP','options.stackGroups');
    groupIds.add(g.id);
    for(const id of g.seriesIds){if(typeof id!=='string'||!sourceIds.has(id)||assigned.has(id))return bad('STACK_GROUP_PARTITION','options.stackGroups.seriesIds');assigned.add(id);}
    groups.push({id:g.id,label:g.label,seriesIds:[...g.seriesIds]});
  }
  if(assigned.size!==sourceIds.size)return bad('STACK_GROUP_PARTITION','options.stackGroups.seriesIds');
  const partitions=groups.map(g=>normalizeColumn({...input,series:g.seriesIds.map(id=>input.series.find(s=>s.id===id)!)})),palette=defaultPalette('light',false).series;
  const {width,height}=options,plot={x:16,y:14,width:width-32,height:height-28},horizontal=input.orientation==='horizontal';
  const legend=input.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.includes(s.id)})),bySeries=new Map(legend.map(l=>[l.id,l]));
  const stackGroups:PlanStackGroupsLayout={groups,placement:'grouped',stacking:mode};
  const base={schema:'nc-plan/1' as const,family:horizontal?'bar' as const:'column' as const,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend,stackGroups};
  let low=Infinity,high=-Infinity;
  for(const data of partitions){const d=stackedDomain(data,state,mode);if(d.status==='invalid')return d;if(d.value){low=Math.min(low,d.value[0]);high=Math.max(high,d.value[1]);}}
  if(!Number.isFinite(low)||!Number.isFinite(high))return freezePlan({status:'empty',frame:withPlanReferences({...base,series:[],observations:[],labels:[],grid:[]},references)});
  let ticks=selectNumericTicks([low,high],{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;
  const fullDomain=ticks.value.domain,prepared=preparePlanViewport(input.axes,{x:null,y:fullDomain},options.viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:null,y:fullDomain},view);
  if(view?.value.y){ticks=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;}
  const window=view?.value.x?viewportCategoryWindow(view.value.x)??undefined:undefined,series:PlanSeries[]=[],observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
  const sourceGroups=groups.map(g=>g.id),slots=new Map<string,Map<string,Readonly<{start:number;width:number;center:number}>>>();
  let first:Extract<ReturnType<typeof projectStacked>,{status:'ok'}>['value']|undefined;
  for(const [index,data]of partitions.entries()){
    const projected=projectStacked(data,state,plot,ticks.value.domain,mode,window);if(projected.status==='invalid')return projected;const p=projected.value;first??=p;
    const slot=(category:string)=>{
      let known=slots.get(category);if(!known){const band=p.bands.band(category);if(!band)return null;
        const categoryFrame=createCategoryFrame(sourceGroups,[band.start,band.end],.5);if(categoryFrame.status==='invalid')return null;
        const bands=createBandScale(categoryFrame.value,groups.length===1?0:input.barGap??.2);if(bands.status==='invalid')return null;
        known=new Map();for(const id of sourceGroups){const b=bands.value.band(id)!;const width=Math.min(b.width,input.maxBarWidth??Infinity);known.set(id,{start:b.center-width/2,width,center:b.center});}slots.set(category,known);
      }return known.get(groups[index]!.id)!;
    };
    if(mode==='percent'&&data.series.some(s=>!hidden.includes(s.spec.id)))for(const c of p.stack.categories.values())if(!c.complete&&p.bands.center(c.id)!==null)return bad('INCOMPLETE_PERCENT_GROUP','series');
    const percentages=new Map<string,number>();for(const row of p.stack.series)for(const segment of row.segments)if(segment.percentage!==null)percentages.set(JSON.stringify([segment.seriesId,segment.point.id]),segment.percentage);
    for(const s of data.series){if(hidden.includes(s.spec.id))continue;const color=bySeries.get(s.spec.id)!.color,rects=p.rects.filter(r=>r.series.spec.id===s.spec.id),byPoint=new Map(rects.map(r=>[r.point.id,r]));
      const bars=rects.map(r=>{const place=slot(r.point.x)!;return {pointId:r.point.id,x:horizontal?r.x:place.start,y:horizontal?place.start:r.y,width:horizontal?r.width:place.width,height:horizontal?place.width:r.height};});
      series.push({id:s.spec.id,name:s.spec.name,color,bars});const barsById=new Map(bars.map(b=>[b.pointId,b]));
      for(const point of s.points){const rect=byPoint.get(point.id),coordinate=p.bands.center(point.x),place=slot(point.x),zero=mode==='percent'&&point.y===0&&coordinate!==null&&ticks.value.domain[0]<=0&&ticks.value.domain[1]>=0;
        if(!place||!rect&&!zero)continue;const label=data.labels.get(point.x)??point.x,percentage=percentages.get(JSON.stringify([s.spec.id,point.id])),endpoint=rect?(horizontal?rect.anchor.x:rect.anchor.y):p.mapValue(0)!;
        const bar=rect?barsById.get(point.id):undefined;
        const hit=bar&&bar.width>0&&bar.height>0?{kind:'polygon' as const,vertices:[{x:bar.x,y:bar.y},{x:bar.x+bar.width,y:bar.y},{x:bar.x+bar.width,y:bar.y+bar.height},{x:bar.x,y:bar.y+bar.height}]}:undefined;
        observations.push({id:{seriesId:s.spec.id,pointId:point.id},label,seriesName:s.spec.name,value:point.y!,x:horizontal?endpoint:place.center,y:horizontal?place.center:endpoint,color,...(hit?{hit}:{}),...(percentage===undefined?{}:{percentage}),group:{key:JSON.stringify(['category',point.x]),label,coordinate:coordinate!}});
      }
    }
    annotations.push(...planStackLabels(p.stack.categories.values(),mode,ticks.value.domain,id=>slot(id)?.center??null,p.mapValue,horizontal).slice(0,Math.max(0,64-annotations.length)));
  }
  const p=first!,order=new Map(input.series.map((s,i)=>[s.id,i]));series.sort((a,b)=>order.get(a.id)!-order.get(b.id)!);observations.sort((a,b)=>order.get(a.id.seriesId)!-order.get(b.id.seriesId)!);
  const labels=horizontal?ticks.value.ticks.map(v=>({x:p.mapValue(v)!,label:String(v)})):input.axes.x.values.flatMap(c=>{const x=p.bands.center(c.id);return x===null?[]:[{x,label:c.label??c.id}];});
  const yLabels=horizontal?input.axes.x.values.flatMap(c=>{const y=p.bands.center(c.id);return y===null?[]:[{id:c.id,y,label:c.label??c.id}];}):undefined;
  const frame={...base,series,observations,labels,annotations,grid:horizontal?[]:ticks.value.ticks.map(v=>({y:p.mapValue(v)!,label:String(v)})),...(yLabels?{yLabels}:{}),...(view?{viewport:planViewportState(view,{x:null,y:ticks.value.domain},input.axes,plot)!}:{})};
  return freezePlan({status:observations.length?'ok':'empty',frame:withPlanReferences(frame,references,{plot,domains:{x:null,y:ticks.value.domain},mapY:p.mapValue,horizontal})});
}
