import {array,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {finiteExtent,normalizeNumericDomain,type Domain} from '../internal/math/domain.js';
import {createLinearScale} from '../internal/math/linear.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {formatAxis} from '../internal/axes/plan.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {validatePlanReferences,withPlanReferences} from './references.js';
import {parseTemporalAxis} from './temporal-axis.js';
import {freezePlan} from './input.js';
import {contourSegments} from './contour-geometry.js';
import {clipContourSegment} from './contour-clip.js';
import type {PlanOptions,PlanSeries,PlanCommand,PlanAnnotation} from '../public/plan-types.js';
import type {PlanContourSpec,PlanContourAxis,PlanContourGrid,PlanContourLevel,PlanContourObservation,PlanContourFrame,PlanContourResult} from '../public/contour-types.js';

function axis(value:unknown,path:string):PlanContourAxis{
  const parsed=parseTemporalAxis(value,path);if(parsed.type!=='linear')fail(path+'.type','CONTOUR_LINEAR_AXIS_ONLY');return parsed;
}
function countMissingContourCells(grid:PlanContourGrid):number{
  let missing=0;const columns=grid.x.length;
  for(let row=0;row<grid.y.length-1;row++)for(let column=0;column<columns-1;column++){
    const at=row*columns+column;if(grid.values[at]===null||grid.values[at+1]===null||grid.values[at+columns]===null||grid.values[at+columns+1]===null)missing++;
  }
  return missing;
}
function validate(spec:PlanContourSpec){
  const s=record(spec,['family','title','description','axes','grid','contour'],['family','title','axes','grid','contour'],'spec');
  if(s.family!=='contour')fail('spec.family');
  const a=record(s.axes,['x','y'],['x','y'],'spec.axes'),axes={x:axis(a.x,'spec.axes.x'),y:axis(a.y,'spec.axes.y')};
  const g=record(s.grid,['id','x','y','ids','values','unit'],['id','x','y','ids','values'],'spec.grid');
  const coordinates=(value:unknown,path:string)=>{
    const result=array(value,64,path).map((v,i)=>number(v,path+'['+i+']'));
    if(result.length<2||result.some((v,i)=>i>0&&v<=result[i-1]!))fail(path,'CONTOUR_COORDINATES_MUST_INCREASE');return result;
  };
  const x=coordinates(g.x,'spec.grid.x'),y=coordinates(g.y,'spec.grid.y'),size=x.length*y.length;
  const ids=array(g.ids,4096,'spec.grid.ids').map((v,i)=>text(v,'spec.grid.ids['+i+']',128));
  const values=array(g.values,4096,'spec.grid.values').map((v,i)=>v===null?null:number(v,'spec.grid.values['+i+']'));
  if(ids.length!==size||values.length!==size)fail('spec.grid','CONTOUR_GRID_SHAPE');
  if(new Set(ids).size!==ids.length)fail('spec.grid.ids','DUPLICATE_ID');
  const grid:PlanContourGrid={id:text(g.id,'spec.grid.id',128),x,y,ids,values,...(g.unit===undefined?{}:{unit:text(g.unit,'spec.grid.unit',64,true)})};
  const c=record(s.contour,['levels','segmentBudget'],['levels'],'spec.contour'),palette=defaultPalette('light',false).series;
  const levels:Readonly<(PlanContourLevel&{name:string;color:string})>[] = array(c.levels,8,'spec.contour.levels').map((input,index)=>{
    const path='spec.contour.levels['+index+']',level=record(input,['id','value','name','color'],['id','value'],path),value=number(level.value,path+'.value');
    return {id:text(level.id,path+'.id',128),value,name:level.name===undefined?String(value):text(level.name,path+'.name',256),color:level.color===undefined?palette[index%palette.length]!:color(level.color,path+'.color')};
  });
  if(levels.length<1||levels.some((level,i)=>i>0&&level.value<=levels[i-1]!.value))fail('spec.contour.levels','CONTOUR_LEVELS_MUST_INCREASE');
  if(new Set(levels.map(level=>level.id)).size!==levels.length)fail('spec.contour.levels','DUPLICATE_ID');
  const segmentBudget=c.segmentBudget===undefined?8192:number(c.segmentBudget,'spec.contour.segmentBudget',1,32768);
  if(!Number.isInteger(segmentBudget))fail('spec.contour.segmentBudget','CONTOUR_SEGMENT_BUDGET');
  return {title:text(s.title,'spec.title',512,true),description:s.description===undefined?'':text(s.description,'spec.description',2048,true),axes,grid,levels,segmentBudget};
}
function initialDomain(axis:PlanContourAxis,coordinates:readonly number[],target:number):Domain{
  const domain=normalizeNumericDomain(finiteExtent(coordinates),{includeZero:axis.includeZero??false,...(axis.domain?{explicit:axis.domain}:{})});
  if(domain.status==='invalid')fail(domain.diagnostic.path,domain.diagnostic.reason,domain.diagnostic.code);
  if(domain.status==='empty')fail('spec.grid','CONTOUR_GRID_SHAPE');
  const ticks=selectNumericTicks(domain.domain,{targetCount:target,nice:axis.domain?false:axis.nice??false});
  if(ticks.status==='invalid')fail(ticks.diagnostic.path,ticks.diagnostic.reason,ticks.diagnostic.code);
  return ticks.value.domain;
}

/** One rectilinear field, one Cartesian frame, source-preserving isolines. */
export function planContour(spec:PlanContourSpec,options:PlanOptions):PlanContourResult{
  try{
    const {title,description,axes,grid,levels,segmentBudget}=validate(spec),{width,height}=options;
    const hidden=new Set(options.hiddenSeriesIds??[]),levelIds=new Set(levels.map(level=>level.id));
    if([...hidden].some(id=>!levelIds.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    const targetX=Math.max(2,Math.min(8,Math.floor(width/72))),targetY=Math.max(2,Math.min(8,Math.floor(height/48)));
    const initial={x:initialDomain(axes.x,grid.x,targetX),y:initialDomain(axes.y,grid.y,targetY)};
    const view=preparePlanViewport(axes,initial,options.viewport);if(view.status==='invalid')return view;
    const scoped=withViewportDomains(initial,view.value),xDomain=scoped.x??initial.x,yDomain=scoped.y??initial.y;
    const xScale=createLinearScale(xDomain,axes.x.reversed?[width,0]:[0,width],false),yScale=createLinearScale(yDomain,axes.y.reversed?[0,height]:[height,0],false);
    if(xScale.status==='invalid')return xScale;if(yScale.status==='invalid')return yScale;
    const visible=levels.filter(level=>!hidden.has(level.id));
    // Hidden levels retain source diagnostics without calculating unused geometry.
    const geometry=visible.length?contourSegments(grid,visible.map(level=>level.value),segmentBudget):{status:'ready' as const,segments:[],skippedMissingCells:countMissingContourCells(grid)};
    if(geometry.status==='budget'&&visible.length)fail('spec.contour.segmentBudget','CONTOUR_SEGMENT_BUDGET','INVALID_CONFIG');
    const byValue=new Map(visible.map(level=>[level.value,level])),commands=new Map<string,PlanCommand[]>(),observations:PlanContourObservation[]=[],ordinals=new Map<string,number>();
    const labelCandidates=new Map<string,Readonly<{x:number;y:number;length:number;text:string}>>();
    if(geometry.status==='ready'&&visible.length)for(const segment of geometry.segments){
      const level=byValue.get(segment.level)!;if(!level)continue;
      const key=JSON.stringify([level.id,segment.cell]),ordinal=ordinals.get(key)??0;ordinals.set(key,ordinal+1);
      const clipped=clipContourSegment(segment,xDomain,yDomain);if(!clipped)continue;
      const sx=xScale.value.map(clipped[0].x),sy=yScale.value.map(clipped[0].y),ex=xScale.value.map(clipped[1].x),ey=yScale.value.map(clipped[1].y);
      if(sx===null||sy===null||ex===null||ey===null)fail('options.viewport','UNREPRESENTABLE_CONTOUR_VIEWPORT');
      const start={x:Math.max(0,Math.min(width,sx)),y:Math.max(0,Math.min(height,sy))},end={x:Math.max(0,Math.min(width,ex)),y:Math.max(0,Math.min(height,ey))};
      if(start.x===end.x&&start.y===end.y)continue;
      const path=commands.get(level.id)??[];path.push({type:'M',...start},{type:'L',...end});commands.set(level.id,path);
      const row=Math.floor(segment.cell/grid.x.length),column=segment.cell%grid.x.length,indices=[segment.cell,segment.cell+1,segment.cell+1+grid.x.length,segment.cell+grid.x.length] as const;
      const x=start.x/2+end.x/2,y=start.y/2+end.y/2,length=Math.hypot(end.x-start.x,end.y-start.y);
      observations.push({id:{seriesId:level.id,pointId:JSON.stringify([grid.id,row,column,ordinal])},label:String(level.value),seriesName:level.name,value:level.value,x,y,color:level.color,contour:{type:'isoline',levelId:level.id,level:level.value,gridId:grid.id,row,column,sourceIds:[grid.ids[indices[0]]!,grid.ids[indices[1]]!,grid.ids[indices[2]]!,grid.ids[indices[3]]!],sourceValues:[grid.values[indices[0]]!,grid.values[indices[1]]!,grid.values[indices[2]]!,grid.values[indices[3]]!],sourceStart:segment.start,sourceEnd:segment.end,start,end}});
      if(length>(labelCandidates.get(level.id)?.length??0))labelCandidates.set(level.id,{x,y,length,text:String(level.value)});
    }
    const series:PlanSeries[]=visible.map(level=>{const path=commands.get(level.id);return {id:level.id,name:level.name,color:level.color,...(path?.length?{commands:path}:{})};});
    const annotations:PlanAnnotation[]=[];
    for(const level of visible){const label=labelCandidates.get(level.id);if(!label)continue;const labelWidth=Math.min(120,label.length);if(label.length>=Math.max(24,label.text.length*7)&&label.x>=labelWidth/2&&label.x+labelWidth/2<=width&&label.y>=9&&label.y+9<=height)annotations.push({x:label.x,y:label.y,text:label.text,role:'value',box:{width:labelWidth,height:18,seriesId:level.id}});}
    const xTicks=selectNumericTicks(xDomain,{targetCount:targetX,nice:false}),yTicks=selectNumericTicks(yDomain,{targetCount:targetY,nice:false});
    if(xTicks.status==='invalid')return xTicks;if(yTicks.status==='invalid')return yTicks;
    const samples=grid.ids.map((id,i)=>({id,x:grid.x[i%grid.x.length]!,y:grid.y[Math.floor(i/grid.x.length)]!,value:grid.values[i]!})),missingCells=geometry.skippedMissingCells;
    const contour={method:'marching-squares-bilinear' as const,gridId:grid.id,columns:grid.x.length,rows:grid.y.length,missingCells,knownSamples:grid.values.filter(value=>value!==null).length,segmentCount:visible.length&&geometry.status==='ready'?geometry.segments.length:0,visibleSegments:observations.length,segmentBudget,samples,levels:levels.map(level=>({id:level.id,value:level.value})),...(!observations.length?{emptyReason:!visible.length?'hidden' as const:missingCells===(grid.x.length-1)*(grid.y.length-1)?'missing' as const:geometry.status==='ready'&&geometry.segments.length?'outsideViewport' as const:'noCrossings' as const}:{})};
    const plot={x:0,y:0,width,height},viewport=planViewportState(view.value,{x:xDomain,y:yDomain},axes,plot),references=validatePlanReferences(options.references,spec);
    if(references.status==='invalid')return references;
    const frame:PlanContourFrame={schema:'nc-plan/1',family:'contour',title,description,unit:grid.unit??'',width,height,legend:levels.map(level=>({id:level.id,name:level.name,color:level.color,visible:!hidden.has(level.id)})),series,observations,contour,annotations,grid:yTicks.value.ticks.map(value=>({y:yScale.value.map(value)!,label:formatAxis(value,'linear',null,new Map()),value,type:'number' as const})),labels:xTicks.value.ticks.map(value=>({x:xScale.value.map(value)!,label:formatAxis(value,'linear',null,new Map()),value,type:'number' as const})),...(viewport?{viewport}:{})};
    const withReferences=withPlanReferences(frame,references.value,{plot,domains:{x:xDomain,y:yDomain},mapX:value=>typeof value==='number'?xScale.value.map(value):null,mapY:yScale.value.map});
    return freezePlan({status:observations.length?'ok' as const:'empty' as const,frame:{...withReferences,family:'contour' as const,observations,contour}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:error instanceof Error?error.message:'BAD_CONTOUR',path:'spec',message:error instanceof Error?error.message:'BAD_CONTOUR'}};}
}
