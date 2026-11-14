import { invalidPlan } from './diagnostics.js';
import {validateMixed} from '../mixed/validate.js';
import {normalizeMixed} from '../mixed/data.js';
import {mixedStackDomain} from './mixed-stack.js';
import {projectStacked} from '../stacked/geometry.js';
import {planStackLabels} from './stack-labels.js';
import {createMixedCategoryFrame} from '../mixed/frame.js';
import {projectMixed} from '../mixed/geometry.js';
import {mixedScene} from '../mixed/scene.js';
import {projectColumn} from '../column/geometry.js';
import {seriesKey} from '../line/normalize.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {emptyLayers} from '../internal/axes/scene.js';
import type {AxesPlan} from '../internal/axes/plan.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {preparePlanViewport,planViewportState,planLineViewportScales} from './viewport.js';
import {withPlanReferences,referenceCategories} from './references.js';
import {freezePlan} from './input.js';
import {planMixed} from './mixed.js';
import type {MixedChartSpec} from '../public/mixed-types.js';
import type {PlanMixedSpec,PlanOptions,PlanReference,PlanResult,PlanSeries,PlanObservation,PlanMixedAxesLayout,PlanFrame} from '../public/plan-types.js';

/** Independent value scales inside one coordinated category/column-placement owner. */
export function planMixedAxes(spec:PlanMixedSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  if(!spec.axes||!Array.isArray(spec.series)||spec.series.some(s=>!s||s.yAxis!==undefined&&s.yAxis!=='primary'&&s.yAxis!=='secondary'))return invalidPlan('BAD_MIXED_AXIS_ASSIGNMENT','series.yAxis');
  const {secondaryY,...axes}=spec.axes,series=spec.series.map(({yAxis,...s})=>s),clean={...spec,axes,series};
  if(secondaryY===undefined){if(spec.series.some(s=>s.yAxis==='secondary'))return invalidPlan('MISSING_SECONDARY_AXIS','axes.secondaryY');return planMixed(clean,options,references);}
  // Validate all source identities and type-specific options before partitioning.
  // Explicit Y domains are checked on their own assigned series, never against
  // unrelated columns on another value scale.
  const {domain,...schemaY}=axes.y;
  const schema=validateMixed({...clean,axes:{...axes,y:schemaY}});if(schema.status==='invalid')return schema;
  if(options.stacking&&!schema.value.series.some(s=>s.type==='column'))return invalidPlan('STACKING_REQUIRES_COLUMNS','options.stacking');
  if(schema.value.axes.x.values.length>64)return invalidPlan('LABEL_LIMIT','axes.x.values');
  const assignment=new Map(spec.series.map(s=>[s.id,s.yAxis??'primary'])),ids=new Set(schema.value.series.map(s=>s.id)),hidden=options.hiddenSeriesIds??[];
  if(hidden.some(id=>!ids.has(id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
  const primarySeries=series.filter(s=>assignment.get(s.id)==='primary'),secondarySeries=series.filter(s=>assignment.get(s.id)==='secondary');
  if(!primarySeries.length||!secondarySeries.length)return invalidPlan('MIXED_AXES_REQUIRE_BOTH_GROUPS','series.yAxis');
  const primary=validateMixed({...clean,series:primarySeries}),secondary=validateMixed({...clean,axes:{...axes,y:secondaryY},series:secondarySeries});
  if(primary.status==='invalid')return primary;if(secondary.status==='invalid')return secondary;
  const inputs=[primary.value,secondary.value],data=inputs.map(normalizeMixed),state={hiddenSeriesIds:[...hidden]},full:((readonly[number,number])|null)[]=[];
  for(const [index,d]of data.entries()){
    let domains=mixedStackDomain(d,state,options.stacking);if(domains.status==='invalid')return domains;
    if(!domains.value.y&&inputs[index]!.series.every(s=>hidden.includes(s.id))){domains=mixedStackDomain(d,{hiddenSeriesIds:[]},options.stacking);if(domains.status==='invalid')return domains;}
    if(!domains.value.y){full.push(null);continue;}
    const y=inputs[index]!.axes.y,t=selectNumericTicks(domains.value.y,{nice:y.nice??!y.domain,targetCount:y.ticks?.targetCount??5});if(t.status==='invalid')return t;full.push(t.value.domain);
  }
  const {width,height}=options,plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false);
  const legend=schema.value.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette.series[i%palette.series.length]!,visible:!hidden.includes(s.id)})),byId=new Map(legend.map(l=>[l.id,l]));
  const base={schema:'nc-plan/1' as const,family:'mixed' as const,width,height,title:schema.value.title,description:schema.value.description??'',unit:primary.value.axes.y.title??'',legend};
  if(!full[0]&&options.viewport?.axes!=='x'&&options.viewport!==undefined)return invalidPlan('PRIMARY_DOMAIN_REQUIRED_FOR_Y_VIEWPORT','axes.y');
  const prepared=preparePlanViewport(primary.value.axes,{x:null,y:full[0]!},options.viewport);if(prepared.status==='invalid')return prepared;
  const view=prepared.value,scoped=withViewportDomains({x:null,y:full[0]!},view),displayed=[scoped.y,full[1]!];
  if(view?.value.y&&scoped.y&&full[0]&&full[1]){
    const a=createLinearScale(full[0],primary.value.axes.y.reversed?[0,1]:[1,0],false),b=createLinearScale(full[1],secondary.value.axes.y.reversed?[0,1]:[1,0],false);if(a.status==='invalid')return a;if(b.status==='invalid')return b;
    const first=b.value.invert(a.value.map(scoped.y[0])!),last=b.value.invert(a.value.map(scoped.y[1])!);
    if(first===null||last===null||first===last)return invalidPlan('UNREPRESENTABLE_SECONDARY_VIEWPORT','viewport.y');displayed[1]=[Math.min(first,last),Math.max(first,last)];
  }
  const mixedAxes:PlanMixedAxesLayout={mode:'dual-y',primary:{domain:full[0]!,displayed:displayed[0]!,reversed:primary.value.axes.y.reversed??false},secondary:{domain:full[1]!,displayed:displayed[1]!,reversed:secondary.value.axes.y.reversed??false},series:schema.value.series.map(s=>({id:s.id,yAxis:assignment.get(s.id)!}))};
  if(full.every(d=>d===null))return freezePlan({status:'empty',frame:withPlanReferences({...base,mixedAxes,series:[],observations:[],labels:[],grid:[]},references,undefined,options.referenceBands)});
  const window=view?.value.x?viewportCategoryWindow(view.value.x)??undefined:undefined,all=primary.value.axes.x.values;
  const first=window?all.findIndex(c=>c.id===window.firstId):0,last=window?all.findIndex(c=>c.id===window.lastId):all.length-1,visible=all.slice(first,last+1);
  const shared=createMixedCategoryFrame(visible.map(c=>c.id),plot,spec.groupGap);if(shared.status==='invalid')return shared;
  // The original column owner allocates every visible series slot once, across
  // both value axes. Its temporary Y is irrelevant; only X/width are consumed.
  const globalData=normalizeMixed(schema.value),slots=options.stacking?undefined:projectColumn(globalData.column,state,plot,[0,1],window,{bands:shared.value.bands,mapValue:()=>plot.y+plot.height});if(slots?.status==='invalid')return slots;
  const stackAxes=data.flatMap((d,i)=>d.column.series.some(s=>!hidden.includes(s.spec.id))?[i]:[]),annotations:NonNullable<PlanFrame['annotations']>[number][]=[];
  const paint:PlanSeries[]=[],observations:PlanObservation[]=[],grids:Readonly<{y:number;label:string}>[][]=[[],[]];
  let primaryMap:((v:number)=>number|null)|undefined,secondaryMap:((v:number)=>number|null)|undefined,categoryMap:(v:string|number)=>number|null=v=>typeof v==='string'?shared.value.points.center(v):null;
  for(const [index,d]of data.entries()){
    const domain=displayed[index];if(!domain)continue;const input=inputs[index]!,ticks=selectNumericTicks(domain,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;
    const y=createLinearScale(domain,input.axes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false);if(y.status==='invalid')return y;
    const extended=planLineViewportScales(input.axes,plot,null,domain,view);if(extended.status==='invalid')return extended;
    const maps=extended.value??{mapX:categoryMap,mapY:y.value.map};categoryMap=maps.mapX;if(index===0)primaryMap=maps.mapY;else secondaryMap=maps.mapY;
    const axisPlan:AxesPlan={plot,tooSmall:false,...maps,x:{domain:null,ticks:visible.map(c=>c.id),labels:[],interval:null,target:6},y:{domain,ticks:ticks.value.ticks,labels:[],interval:null,target:5},xTitle:null,yTitle:null,font:{family:'sans-serif',size:12,weight:400},direction:'ltr'};
    const stacked=options.stacking&&d.column.series.length?projectStacked(d.column,state,plot,domain,options.stacking,window):undefined;if(stacked?.status==='invalid')return stacked;
    if(stacked?.status==='ok'&&options.stacking==='percent')for(const row of stacked.value.stack.categories.values())if(!row.complete&&shared.value.points.center(row.id)!==null)return invalidPlan('INCOMPLETE_PERCENT_CATEGORY','series');
    const stackSlot=(category:string)=>{const band=shared.value.bands.band(category);if(!band)return null;const count=Math.max(1,stackAxes.length),slot=band.width/count,width=Math.min(slot*(count>1?1-(input.barGap??.12):1),input.maxBarWidth??Infinity);return {x:band.start+Math.max(0,stackAxes.indexOf(index))*slot+(slot-width)/2,width};};
    if(stacked?.status==='ok'&&options.stacking)annotations.push(...planStackLabels(stacked.value.stack.categories.values(),options.stacking,domain,id=>{const slot=stackSlot(id);return slot?slot.x+slot.width/2:null},maps.mapY));
    const projected=projectMixed(d,state,axisPlan,shared.value,window,stacked?.status==='ok'?stacked.value:undefined,options.stacking==='percent');if(projected.status==='invalid')return projected;
    const p=projected.value,layers=emptyLayers(),scene=mixedScene(p,palette,layers,new Map());if(scene.status==='invalid')return scene;
    const percentages=new Map<string,number>();if(stacked?.status==='ok')for(const s of stacked.value.stack.series)for(const segment of s.segments)if(segment.percentage!==null)percentages.set(JSON.stringify([s.id,segment.point.id]),segment.percentage);
    const bars=new Map<string,Readonly<{pointId:string;x:number;y:number;width:number;height:number}>>();
    for(const s of p.line.series){const id=s.series.spec.id,color=byId.get(id)!.color,key=seriesKey(id),type=d.kinds.get(id);
      if(type==='column'){const rects=(p.column?.rects??[]).filter(r=>r.series.spec.id===id).map(r=>{const slot=options.stacking?stackSlot(r.point.x):slots?.status==='ok'?slots.value.byId.get(r.key):undefined;if(!slot)throw Error('Missing coordinated column slot');const bar={pointId:r.point.id,x:slot.x,y:r.y,width:slot.width,height:r.height};bars.set(JSON.stringify([id,r.point.id]),bar);return bar;});paint.push({id,name:s.series.spec.name,color,bars:rects});}
      else paint.push({id,name:s.series.spec.name,color,commands:s.commands,...(type==='area'?{areaCommands:layers.marks.flatMap(mark=>mark.type==='path'&&mark.key.startsWith(key+'|area:')?mark.commands:[])}:{})});
    }
    for(const row of p.index.targets)for(const target of row){const s=target.series.series.spec,point=target.point,percentage=percentages.get(JSON.stringify([s.id,point.point.id])),zeroSlot=options.stacking&&d.kinds.get(s.id)==='column'?stackSlot(String(point.point.x)):null,label=d.line.labels.get(String(point.point.x))??String(point.point.x),bar=bars.get(JSON.stringify([s.id,point.point.id]));observations.push({id:{seriesId:s.id,pointId:point.point.id},label,seriesName:s.name,value:point.point.y!,...(percentage===undefined?{}:{percentage}),valueAxis:index===0?'primary':'secondary',x:bar?bar.x+bar.width/2:zeroSlot?zeroSlot.x+zeroSlot.width/2:point.x,y:point.y,color:byId.get(s.id)!.color,group:{key:JSON.stringify(['category',point.point.x]),label,coordinate:maps.mapX(point.point.x)!}});}
    grids[index]=ticks.value.ticks.map(v=>({y:maps.mapY(v)!,label:String(v),value:v,type:'number' as const}));
  }
  const rank=(id:string)=>globalData.kinds.get(id)==='area'?0:globalData.kinds.get(id)==='column'?1:2,order=new Map(schema.value.series.map((s,i)=>[s.id,i]));paint.sort((a,b)=>rank(a.id)-rank(b.id)||order.get(a.id)!-order.get(b.id)!);observations.sort((a,b)=>order.get(a.id.seriesId)!-order.get(b.id.seriesId)!);
  const frame={...base,mixedAxes,...(options.stacking?{annotations}:{}),series:paint,observations,labels:visible.map(c=>({x:categoryMap(c.id)!,label:c.label??c.id})),grid:grids[0]!,...(full[1]?{secondaryGrid:grids[1]!}:{}),...(view?{viewport:planViewportState(view,{x:null,y:displayed[0]!},primary.value.axes,plot)!}:{})};
  return freezePlan({status:observations.length?'ok':'empty',frame:withPlanReferences(frame,references,{plot,domains:{x:null,y:displayed[0]!},mapX:categoryMap,...(primaryMap?{mapY:primaryMap}:{}),...(secondaryMap?{secondaryY:{domain:displayed[1]!,map:secondaryMap}}:{}),bandSourceAxes:primary.value.axes,categories:referenceCategories(all,plot,categoryMap)},options.referenceBands)});
}
