import {array,choice,number,record,text,fail,ValidationFailure} from '../internal/data/validation.js';
import {validateHeatmap} from '../heatmap/validate.js';
import {projectHeatmap} from '../heatmap/geometry.js';
import type {AxesPlan} from '../internal/axes/plan.js';
import {ownPlanInput,freezePlan} from './input.js';
import {mapValueColors,validateColorAxis} from './color-scale.js';
import type {PlanHeatmapAxis,PlanHeatmapSpec,PlanHeatmapCell,PlanHeatmapSummary,PlanHeatmapFrame,PlanHeatmapObservation,PlanHeatmapOptions,PlanHeatmapResult} from '../public/heatmap-plan-types.js';
import type {PlanCellPaint,PlanCellGeometry} from '../public/cell-types.js';
import type {PlanAnnotation} from '../public/plan-types.js';
import type {PlanColorAxisFrame} from '../public/color-axis-types.js';
import type {BandScale} from '../internal/math/category.js';
function bands(axis:PlanHeatmapAxis,scale:BandScale|null){return scale?axis.values.map((category,index)=>{const band=scale.band(category.id)!;return {id:category.id,index,from:Math.min(band.start,band.end),to:Math.max(band.start,band.end)};}):[];}
function axis(input:unknown,path:string):PlanHeatmapAxis {
  const a=record(input,['type','values','reversed'],['type','values'],path);choice(a.type,['category'],path+'.type');
  const values=array(a.values,64,path+'.values').map((raw,i)=>{const at=path+'.values['+i+']',v=record(raw,['id','label'],['id'],at);return {id:text(v.id,at+'.id',128),...(v.label===undefined?{}:{label:text(v.label,at+'.label',256,true)})};});
  if(a.reversed!==undefined&&typeof a.reversed!=='boolean')fail(path+'.reversed');
  return {type:'category',values,...(a.reversed===undefined?{}:{reversed:a.reversed as boolean})};
}
/** Projects the existing sparse heatmap mathematics into renderer-independent roles. */
export function planHeatmap(input:PlanHeatmapSpec,inputOptions:PlanHeatmapOptions):PlanHeatmapResult {
  try{
    const raw=record(ownPlanInput(input),['family','title','description','unit','axes','data','gapRatio','opacity','colorAxis'],['family','title','axes','data'],'spec');choice(raw.family,['heatmap'],'spec.family');
    const a=record(raw.axes,['x','y'],['x','y'],'spec.axes'),x=axis(a.x,'spec.axes.x'),y=axis(a.y,'spec.axes.y');
    const cells=array(raw.data,4096,'spec.data').map((raw,i):PlanHeatmapCell=>{const at='spec.data['+i+']',c=record(raw,['id','rowId','columnId','value'],['id','rowId','columnId','value'],at);return {id:text(c.id,at+'.id',128),rowId:text(c.rowId,at+'.rowId',128),columnId:text(c.columnId,at+'.columnId',128),value:c.value===null?null:number(c.value,at+'.value')};});
    const title=text(raw.title,'spec.title',200,true),description=raw.description===undefined?'':text(raw.description,'spec.description',1000,true),unit=raw.unit===undefined?'':text(raw.unit,'spec.unit',64,true);
    const gapRatio=raw.gapRatio===undefined?.04:number(raw.gapRatio,'spec.gapRatio',0,.5),opacity=raw.opacity===undefined?1:number(raw.opacity,'spec.opacity',0,1),scale=validateColorAxis(raw.colorAxis);
    const options=record(ownPlanInput(inputOptions),['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
    for(const key of ['stacking','viewport','references'])if(options[key]!==undefined)fail('options.'+key,'UNSUPPORTED_HEATMAP_OPTION');
    if(options.hiddenSeriesIds!==undefined&&array(options.hiddenSeriesIds,0,'options.hiddenSeriesIds').length)fail('options.hiddenSeriesIds','NO_SERIES_VISIBILITY');
    const width=number(options.width,'options.width',64,10000),height=number(options.height,'options.height',64,10000);
    const checked=validateHeatmap({family:'heatmap',title,axes:{x,y},data:cells,gapRatio});if(checked.status==='invalid')return checked;
    const data=checked.value,mapping=mapValueColors(cells.map(c=>c.value),scale);
    // The native transport allocates labels outside this plot; the existing geometry
    // consumes only this canonical plot and its tooSmall flag, not text metrics.
    const emptyAxis={domain:null,ticks:[],labels:[],interval:null,target:0} as const;
    const axes:AxesPlan={plot:{x:0,y:0,width,height},tooSmall:!x.values.length||!y.values.length,x:emptyAxis,y:emptyAxis,mapX:()=>null,mapY:()=>null,xTitle:null,yTitle:null,font:{family:'sans-serif',size:14,weight:400},direction:'ltr'};
    const projected=projectHeatmap(data,axes);if(projected.status==='invalid')return projected;
    const projection=projected.value,paint:PlanCellPaint[]=[],observations:PlanHeatmapObservation[]=[],summary:PlanHeatmapSummary[]=[],annotations:PlanAnnotation[]=[];
    const colorAxis:PlanColorAxisFrame=scale.type==='continuous'?{type:'continuous',domain:mapping.domain,domainSource:scale.domain?'explicit':mapping.domain?'source':'none',stops:scale.stops,missingColor:scale.missingColor}:{type:'classes',classes:mapping.classes,missingColor:scale.missingColor,unclassifiedColor:scale.unclassifiedColor};
    let known=0;
    for(let i=0;i<cells.length;i++){
      const cell=cells[i]!,target=projection.byId.get(cell.id),color=mapping.values[i]!,row=data.rows.get(cell.rowId)!,column=data.columns.get(cell.columnId)!,rowLabel=data.rowLabels.get(cell.rowId)!,columnLabel=data.columnLabels.get(cell.columnId)!;
      const painted=!!target&&opacity>0;
      if(cell.value!==null)known++;
      summary.push({...cell,row,column,rowLabel,columnLabel,color,painted});
      if(!painted||!target)continue;
      const geometry:PlanCellGeometry={type:'polygon',vertices:[{x:target.x,y:target.y},{x:target.x+target.width,y:target.y},{x:target.x+target.width,y:target.y+target.height},{x:target.x,y:target.y+target.height}]};
      paint.push({pointId:cell.id,color:color.color,opacity,geometry});
      if(cell.value===null||color.type==='missing')continue;
      const label=columnLabel+' · '+rowLabel;
      observations.push({id:{seriesId:'cells',pointId:cell.id},label,seriesName:title,value:cell.value,x:target.cx,y:target.cy,color:color.color,hit:geometry,heatmap:{rowId:cell.rowId,columnId:cell.columnId,rowLabel,columnLabel,color}});
      if(annotations.length<64&&target.width>=28&&target.height>=20)annotations.push({x:target.cx,y:target.cy,text:String(cell.value),role:'value',box:{width:target.width,height:target.height,seriesId:'cells'}});
    }
    const labels=x.values.map(v=>({x:projection.xScale?.band(v.id)?.center??0,label:data.columnLabels.get(v.id)!})),yLabels=y.values.map(v=>({id:v.id,y:projection.yScale?.band(v.id)?.center??0,label:data.rowLabels.get(v.id)!}));
    const frame:PlanHeatmapFrame={schema:'nc-plan/1',family:'heatmap',title,description,unit,width,height,legend:[],series:[{id:'cells',name:title,color:'#245DC1',cells:paint}],observations,annotations,grid:[],labels,yLabels,colorAxis,heatmapData:summary,heatmapLayout:{status:!cells.length?'noSource':!known?'allMissing':!observations.length?'noInk':'ready',rowCount:y.values.length,columnCount:x.values.length,sourceCount:cells.length,knownCount:known,missingCount:cells.length-known,absentCount:x.values.length*y.values.length-cells.length,paintedCellCount:paint.length,gapRatio,opacity,rows:bands(y,projection.yScale),columns:bands(x,projection.xScale)}};
    return freezePlan({status:observations.length?'ok':'empty',frame});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:error instanceof Error?error.message:'BAD_SPEC'}};}
}
