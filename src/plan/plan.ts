import {planWordCloud} from './wordcloud.js';
import {planPictorial} from './pictorial.js';
import {planTilemap} from './tilemap.js';
import {planDependencyWheel} from './dependencywheel.js';
import {planArcDiagram} from './arcdiagram.js';
import {planChord} from './chord.js';
import {planBullet} from './bullet.js';
import {planVariwide} from './variwide.js';
import {planXRange} from './xrange.js';
import {planTimeline} from './timeline.js';
import {planDirectional} from './directional.js';
import {planFunnel} from './funnel.js';
import {planNetworkPacking} from './network-packing.js';
import {planSankey} from './sankey.js';
import {planHierarchy} from './hierarchy.js';
import {planParts} from './parts.js';
import {planComparison} from './comparison.js';
import {planStatisticalRanges} from './statistical-ranges.js';
import {planStreamgraph} from './streamgraph.js';
import {planRanges} from './ranges.js';
import {planStatistics} from './statistics.js';
import {splineAreaCommands} from './areaspline.js';
import {planPareto} from './pareto.js';
import {planPolar} from './polar.js';
import {planWaterfall} from './waterfall.js';
import {planStackLabels} from './stack-labels.js';
import {planTreemap} from './treemap.js';
import {planMixed} from './mixed.js';
import {areaScene} from '../area/scene.js';
import {planStackedArea} from './stacked-area.js';
import {splineScene} from '../spline/scene.js';
import {emptyLayers} from '../internal/axes/scene.js';
import {seriesKey} from '../line/normalize.js';
import {validateLine} from '../line/validate.js';
import {normalizeLine,lineDomains} from '../line/normalize.js';
import {projectLine} from '../line/geometry.js';
import {validateColumn} from '../column/validate.js';
import {normalizeColumn,columnDomain} from '../column/normalize.js';
import {projectColumn} from '../column/geometry.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks} from '../internal/math/time.js';
import {formatAxis} from '../internal/axes/plan.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import type {PlanSpec,PlanOptions,PlanResult,PlanFrame,PlanSeries,PlanObservation,PlanLegendItem} from '../public/plan-types.js';
import {ownPlanInput,freezePlan} from './input.js';
import {planAdditional} from './additional.js';
import {validateStacked} from '../stacked/validate.js';
import {stackedDomain,projectStacked} from '../stacked/geometry.js';
import {preparePlanViewport,planViewportState,planLineViewportScales} from './viewport.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {viewportCategoryWindow} from '../internal/interaction/viewport.js';
import {validatePlanReferences,withPlanReferences,referenceCategories,type PlanReferenceContext} from './references.js';

const bad=(reason:string,path:string,message=reason):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message}});
const legendFor=(items:readonly Readonly<{id:string;name:string;color?:string}>[],palette:readonly string[],hidden:readonly string[]):readonly PlanLegendItem[]=>
  items.map((item,i)=>({id:item.id,name:item.name,color:item.color??palette[i%palette.length]!,visible:!hidden.includes(item.id)}));

/** Pure data-to-geometry planning. Never creates a host, schedules work or accesses DOM. */
export function planChart(value:PlanSpec,options:PlanOptions):PlanResult {
  try{
    const ownedOptions=ownPlanInput(options) as PlanOptions;
    if(!ownedOptions||typeof ownedOptions!=='object'||Object.keys(ownedOptions).some(key=>!['width','height','hiddenSeriesIds','stacking','viewport','references','wordcloudText'].includes(key)))return bad('UNKNOWN_OPTION','options');
    const {width,height}=ownedOptions,hidden=ownedOptions.hiddenSeriesIds??[];
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<64||height<64||width>10000||height>10000)return bad('BAD_VIEWPORT','options');
    if(!Array.isArray(hidden)||hidden.length>16||hidden.some(id=>typeof id!=='string'||!id||id.length>256)||new Set(hidden).size!==hidden.length)return bad('BAD_VISIBILITY','options.hiddenSeriesIds');
    const spec=ownPlanInput(value) as PlanSpec;
    if(!spec||typeof spec!=='object'||!['tilemap','pictorial','wordcloud','dependencywheel','arcdiagram','chord','bullet','variwide','xrange','timeline','sankey','vector','windbarb','networkgraph','packedbubble','sunburst','treegraph','organization','variablepie','item','polygon','lollipop','dumbbell','columnpyramid','boxplot','errorbar','streamgraph','arearange','areasplinerange','columnrange','histogram','bellcurve','areaspline','funnel','pyramid','pareto','radar','polar','waterfall','treemap','mixed','line','area','spline','scatter','column','pie','donut','gauge','bubble'].includes(spec.family))return bad('UNSUPPORTED_FAMILY','family');
    if(ownedOptions.stacking!==undefined&&(!['column','area','pictorial'].includes(spec.family)||!['sum','percent'].includes(ownedOptions.stacking)))return bad('BAD_STACK_MODE','options.stacking');
    if(ownedOptions.wordcloudText!==undefined&&spec.family!=='wordcloud')return bad('UNSUPPORTED_TEXT_MEASUREMENTS','options.wordcloudText');
    if(spec.family==='wordcloud')return planWordCloud(spec,ownedOptions);
    if(spec.family==='pictorial')return planPictorial(spec,ownedOptions);
    if(spec.family==='tilemap')return planTilemap(spec,ownedOptions);
    if(spec.family==='dependencywheel')return planDependencyWheel(spec,ownedOptions);
    if(spec.family==='arcdiagram')return planArcDiagram(spec,ownedOptions);
    if(spec.family==='chord')return planChord(spec,ownedOptions);
    if(spec.family==='bullet')return planBullet(spec,ownedOptions);
    if(spec.family==='variwide')return planVariwide(spec,ownedOptions);
    if(spec.family==='xrange')return planXRange(spec,ownedOptions);
    if(spec.family==='timeline')return planTimeline(spec,ownedOptions);
    if(spec.family==='sankey')return planSankey(spec,ownedOptions);
    if(ownedOptions.viewport!==undefined&&!['vector','windbarb','networkgraph','packedbubble','treegraph','organization','polygon','lollipop','dumbbell','columnpyramid','boxplot','errorbar','streamgraph','arearange','areasplinerange','columnrange','areaspline','pareto','waterfall','mixed','line','area','spline','scatter','column','bubble'].includes(spec.family))return bad('UNSUPPORTED_VIEWPORT','options.viewport');
    const checkedReferences=validatePlanReferences(ownedOptions.references,spec);if(checkedReferences.status==='invalid')return checkedReferences;
    const references=checkedReferences.value;
    const common=['family','title','description'];
    const allowed=spec.family==='funnel'?[...common,'data','neckWidth','neckHeight','reversed']:spec.family==='pyramid'?[...common,'data','reversed']:spec.family==='pareto'?[...common,'data']:spec.family==='radar'?[...common,'axes','series']:spec.family==='polar'?[...common,'data','domain','radiusScale']:spec.family==='waterfall'?[...common,'axes','series','startValue','groupGap','maxBarWidth']:spec.family==='treemap'?[...common,'root']:spec.family==='mixed'?[...common,'axes','series','groupGap','barGap','maxBarWidth']:['line','area','spline','scatter','bubble'].includes(spec.family)?[...common,'axes','series']:spec.family==='column'?[...common,'axes','series','orientation','groupGap','barGap','maxBarWidth']:spec.family==='gauge'?[...common,'value','domain','preset','unit','color','bands','target']:[...common,'data',...(spec.family==='donut'?['holeRatio']:[])];
    const extra=spec.family==='vector'?['axes','series','unit']:spec.family==='windbarb'?['axes','series']:spec.family==='packedbubble'?['series','splitSeries']:spec.family==='networkgraph'?['nodes','links','groups']:spec.family==='sunburst'?['root']:spec.family==='treegraph'||spec.family==='organization'?['nodes','links','groups']:spec.family==='variablepie'?['data','zDomain','minRadiusRatio','radiusScale']:spec.family==='item'?['data','columns']:spec.family==='polygon'?['axes','series']:['lollipop','dumbbell','columnpyramid'].includes(spec.family)?['axes','series','groupGap','barGap','maxBarWidth',...(spec.family==='columnpyramid'?[]:['markerRadius'])]:spec.family==='boxplot'?[...common,'axes','series','groupGap','barGap','maxBarWidth','whiskerWidth']:spec.family==='errorbar'?[...common,'axes','series','groupGap','barGap','maxBarWidth','capWidth']:spec.family==='histogram'?['samples','binCount']:spec.family==='bellcurve'?['samples','intervals','standardDeviations']:spec.family==='columnrange'?['axes','series','groupGap','barGap','maxBarWidth']:['lollipop','dumbbell','columnpyramid','boxplot','errorbar','streamgraph','arearange','areasplinerange','areaspline'].includes(spec.family)?['axes','series']:null;
    if(Object.keys(spec).some(key=>!(extra?[...common,...extra]:allowed).includes(key)))return bad('UNKNOWN_OPTION','spec');
    if(spec.family==='vector'||spec.family==='windbarb')return planDirectional(spec,ownedOptions,references);
    if(spec.family==='networkgraph'||spec.family==='packedbubble')return planNetworkPacking(spec,ownedOptions);
    if(spec.family==='sunburst'||spec.family==='treegraph'||spec.family==='organization')return planHierarchy(spec,ownedOptions);
    if(spec.family==='variablepie'||spec.family==='item'||spec.family==='polygon')return planParts(spec,ownedOptions,references);
    if(spec.family==='lollipop'||spec.family==='dumbbell'||spec.family==='columnpyramid')return planComparison(spec,ownedOptions,references);
    if(spec.family==='boxplot'||spec.family==='errorbar')return planStatisticalRanges(spec,ownedOptions,references);
    if(spec.family==='streamgraph')return planStreamgraph(spec,ownedOptions,references);
    if(spec.family==='histogram'||spec.family==='bellcurve')return planStatistics(spec,ownedOptions,planChart);
    if(spec.family==='arearange'||spec.family==='areasplinerange'||spec.family==='columnrange')return planRanges(spec,ownedOptions,references);
    if(spec.family==='funnel'||spec.family==='pyramid')return planFunnel(spec,ownedOptions);
    if(spec.family==='pareto')return planPareto(spec,ownedOptions);
    if(spec.family==='radar'||spec.family==='polar')return planPolar(spec,ownedOptions);
    if(spec.family==='waterfall')return planWaterfall(spec,ownedOptions,references);
    if(spec.family==='treemap')return planTreemap(spec,ownedOptions);
    if(spec.family==='mixed')return planMixed(spec,ownedOptions,references);
    if(spec.family==='area'&&ownedOptions.stacking)return planStackedArea(spec,ownedOptions,references);
    if(spec.family!=='line'&&spec.family!=='area'&&spec.family!=='areaspline'&&spec.family!=='spline'&&spec.family!=='column')return planAdditional(spec,width,height,hidden,ownedOptions.viewport,references);
    if(!Array.isArray(spec.series)||spec.series.length>16||spec.series.reduce((n,s)=>n+(Array.isArray(s?.data)?s.data.length:10001),0)>10000)return bad('INPUT_LIMIT','series');
    if(spec.axes?.x?.kind==='category'&&Array.isArray(spec.axes.x.values)&&spec.axes.x.values.length>64)return bad('LABEL_LIMIT','axes.x.values');
    const state={hiddenSeriesIds:[...hidden]},plot={x:16,y:14,width:width-32,height:height-28},palette=defaultPalette('light',false).series;
    const finish=(frame:PlanFrame,context?:PlanReferenceContext):PlanResult=>freezePlan({status:frame.observations.length?'ok':'empty',frame:withPlanReferences(frame,references,context)});
    if(spec.family==='line'||spec.family==='area'||spec.family==='areaspline'||spec.family==='spline'){
      const filled=spec.family==='area'||spec.family==='areaspline';
      if(filled&&Object.getOwnPropertyDescriptor(spec.axes.y,'includeZero')?.value===false)return bad('AREA_REQUIRES_ZERO','axes.y.includeZero');
      if((spec.family==='spline'||spec.family==='areaspline')&&spec.series.some(s=>s.curve!==undefined))return bad('SPLINE_HAS_FIXED_CURVE','series.curve');
      const lineSpec={...spec,family:'line' as const,...(filled?{axes:{...spec.axes,y:{...spec.axes.y,includeZero:true}}}:{})};
      const checked=validateLine(references===undefined?lineSpec:{...lineSpec,references});if(checked.status==='invalid')return checked;
      const input=checked.value,data=normalizeLine(input),domains=lineDomains(data,state),legend=legendFor(input.series,palette,hidden);
      if(domains.status==='invalid')return domains;
      if(hidden.some(id=>!input.series.some(s=>s.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
      const base={schema:'nc-plan/1' as const,family:spec.family,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
      if(!domains.value.y)return finish({...base,series:[],observations:[],labels:[],grid:[]});
      let yt=selectNumericTicks(domains.value.y,{nice:input.axes.y.nice??!input.axes.y.domain,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
      const xa=input.axes.x;let xt=xa.kind==='category'||!domains.value.x?null:(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(domains.value.x,{nice:xa.nice??false,targetCount:xa.ticks?.targetCount??6});if(xt?.status==='invalid')return xt;
      const prepared=preparePlanViewport(input.axes,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},ownedOptions.viewport);if(prepared.status==='invalid')return prepared;
      const view=prepared.value,scoped=withViewportDomains({x:xt?.value.domain??domains.value.x,y:yt.value.domain},view);
      if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:input.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
      if(view?.value.x&&xa.kind!=='category'&&scoped.x){xt=(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(scoped.x,{nice:false,targetCount:xa.ticks?.targetCount??6});if(xt.status==='invalid')return xt;}
      const interval=xt&&'interval' in xt.value?xt.value.interval:null;
      const scales=planLineViewportScales(input.axes,plot,xt?.value.domain??domains.value.x,yt.value.domain,view);if(scales.status==='invalid')return scales;
      const projected=projectLine(data,state,plot,xt?.value.domain??domains.value.x,yt.value.domain,scales.value);if(projected.status==='invalid')return projected;
      const p=projected.value,series:PlanSeries[]=[],observations:PlanObservation[]=[];
      const layers=emptyLayers();
      if(spec.family==='area'||spec.family==='spline'||spec.family==='areaspline'){const painted=spec.family==='area'?areaScene(p,defaultPalette('light',false),layers,new Map()):splineScene(p,defaultPalette('light',false),layers,new Map());if(painted.status==='invalid')return painted;}
      for(const s of p.series){
        const color=legend.find(item=>item.id===s.series.spec.id)!.color;
        const key=seriesKey(s.series.spec.id),outline=layers.marks.find(mark=>mark.kind==='path'&&mark.key===key);
        const areaCommands=layers.marks.flatMap(mark=>mark.kind==='path'&&mark.key.startsWith(key+'|area:')?mark.commands:[]);
        const commands=outline?.kind==='path'?outline.commands:s.commands;
        const baseline=p.mapY(0);
        if(spec.family==='areaspline'&&(baseline===null||!Number.isFinite(baseline)))return bad('UNREPRESENTABLE_GEOMETRY','area.baseline');
        const fill=spec.family==='areaspline'?splineAreaCommands(commands,Math.max(plot.y,Math.min(plot.y+plot.height,baseline!))):areaCommands;
        series.push({id:s.series.spec.id,name:s.series.spec.name,color,commands,...(filled?{areaCommands:fill}:{})});
        for(const point of s.eligible){const label=data.labels.get(String(point.point.x))??formatAxis(point.point.x,xa.kind,interval,data.labels);observations.push({id:{seriesId:s.series.spec.id,pointId:point.point.id},label,seriesName:s.series.spec.name,value:point.point.y!,x:point.x,y:point.y,color,group:{key:JSON.stringify([xa.kind,point.point.x]),label,coordinate:point.x}});}
      }
      const values=xa.kind==='category'?xa.values.map(c=>c.id):(xt?.value.ticks??[]);
      const labels=values.flatMap(v=>{const x=p.mapX(v);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:formatAxis(v,xa.kind,interval,data.labels)}];});
      return finish({...base,series,observations,labels,grid:yt.value.ticks.map(v=>({y:p.mapY(v)!,label:String(v)})),...(view?{viewport:planViewportState(view,{x:xt?.value.domain??domains.value.x,y:yt.value.domain},input.axes,plot)!}:{})},references===undefined||!p.series.some(series=>series.series.valid.length>0)?undefined:{plot,domains:{x:xt?.value.domain??domains.value.x,y:yt.value.domain},mapX:p.mapX,mapY:p.mapY,...(xa.kind==='category'?{categories:referenceCategories(xa.values,plot,p.mapX)}:{})});
    }
    const stacking=ownedOptions.stacking;
    const referenceInput=references===undefined?spec:{...spec,references};
    const checked=stacking?validateStacked({...referenceInput,family:'stacked',stacking}):validateColumn(referenceInput);if(checked.status==='invalid')return checked;
    const input=checked.value,data=normalizeColumn(input),domain=stacking?stackedDomain(data,state,stacking):columnDomain(data,state),legend=legendFor(input.series,palette,hidden);
    if(domain.status==='invalid')return domain;
    if(hidden.some(id=>!input.series.some(s=>s.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
    const base={schema:'nc-plan/1' as const,family:input.orientation==='horizontal'?'bar' as const:'column' as const,width,height,title:input.title,description:input.description??'',unit:input.axes.y.title??'',legend};
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
      if(!category.complete&&p.bands.center(category.id)!==null)return bad('INCOMPLETE_PERCENT_CATEGORY','series','Percent stacking requires a known value for every visible series in each displayed category. Category '+category.id+' has a missing value; use sum stacking or complete the data without treating null as zero.');
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
    const labels=p.horizontal?ticks.value.ticks.map(v=>({x:p.mapValue(v)!,label:String(v)})):input.axes.x.values.flatMap(c=>{const x=p.bands.center(c.id);return x===null?[]:[{x,label:c.label??c.id}];});
    const yLabels=p.horizontal?input.axes.x.values.flatMap(c=>{const y=p.bands.center(c.id);return y===null?[]:[{id:c.id,y,label:c.label??c.id}];}):undefined;
    const annotations=stacked?.status==='ok'&&stacking?planStackLabels(stacked.value.stack.categories.values(),stacking,ticks.value.domain,p.bands.center,p.mapValue,p.horizontal):undefined;
    return finish({...base,series,observations,labels,...(annotations?{annotations}:{}),grid:p.horizontal?[]:ticks.value.ticks.map(v=>({y:p.mapValue(v)!,label:String(v)})),...(yLabels?{yLabels}:{}),...(view?{viewport:planViewportState(view,{x:null,y:ticks.value.domain},input.axes,plot)!}:{})},references===undefined||!data.series.some(series=>!hidden.includes(series.spec.id)&&series.valid.length>0)?undefined:{plot,domains:{x:null,y:ticks.value.domain},mapY:p.mapValue,horizontal:p.horizontal});
  }catch(error){return bad(error instanceof Error?error.message:'UNREADABLE_INPUT','spec');}
}
