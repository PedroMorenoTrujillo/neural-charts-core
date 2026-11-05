import {array,choice,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {ownPlanInput,freezePlan} from './input.js';
import {layoutTiles} from './tilemap-geometry.js';
import {mapValueColors,validateColorAxis} from './color-scale.js';
import type {PlanTilemapSpec,PlanTilemapPoint,PlanTilemapSeries,PlanTilemapOptions,PlanTilemapResult,PlanTilemapSummary,PlanTilemapObservation,PlanTilemapFrame,PlanTilemapLayout} from '../public/tilemap-types.js';
import type {PlanCellPaint,PlanCellGeometry} from '../public/cell-types.js';
import type {PlanColorAxisFrame} from '../public/color-axis-types.js';

function validate(input:PlanTilemapSpec):PlanTilemapSpec {
  const source=record(input,['family','title','description','unit','series','tileShape','pointPadding','opacity','colorAxis'],['family','title','series'],'spec');
  choice(source.family,['tilemap'],'spec.family');
  const rows=array(source.series,1,'spec.series');if(rows.length!==1)fail('spec.series','ONE_SERIES_REQUIRED');
  const row=record(rows[0],['id','name','color','data'],['id','name','data'],'spec.series[0]'),ids=new Set<string>(),coordinates=new Set<string>();
  const data=array(row.data,2048,'spec.series[0].data').map((item,i):PlanTilemapPoint=>{
    const path='spec.series[0].data['+i+']',point=record(item,['id','x','y','value','name'],['id','x','y','value'],path),id=text(point.id,path+'.id',256);
    if(ids.has(id))fail(path+'.id','DUPLICATE_ID');ids.add(id);
    const x=number(point.x,path+'.x',-1_000_000,1_000_000),y=number(point.y,path+'.y',-1_000_000,1_000_000);
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))fail(path,'INTEGER_COORDINATES_REQUIRED');
    const key=x+','+y;if(coordinates.has(key))fail(path,'DUPLICATE_COORDINATE');coordinates.add(key);
    return{id,x,y,value:point.value===null?null:number(point.value,path+'.value'),...(point.name===undefined?{}:{name:text(point.name,path+'.name',512,true)})};
  });
  const series:PlanTilemapSeries={id:text(row.id,'spec.series[0].id',128),name:text(row.name,'spec.series[0].name',256,true),color:row.color===undefined?'#245DC1':color(row.color,'spec.series[0].color'),data};
  return{family:'tilemap',title:text(source.title,'spec.title',512,true),...(source.description===undefined?{}:{description:text(source.description,'spec.description',2048,true)}),...(source.unit===undefined?{}:{unit:text(source.unit,'spec.unit',64,true)}),series:[series],tileShape:source.tileShape===undefined?'hexagon':choice(source.tileShape,['hexagon','circle','diamond','square'],'spec.tileShape'),pointPadding:source.pointPadding===undefined?1:number(source.pointPadding,'spec.pointPadding',0,32),opacity:source.opacity===undefined?1:number(source.opacity,'spec.opacity',0,1),colorAxis:validateColorAxis(source.colorAxis)};
}
function options(input:PlanTilemapOptions,id:string){
  const source=record(input,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
  if(source.stacking!==undefined)fail('options.stacking','STACKING_UNSUPPORTED');
  if(source.viewport!==undefined)fail('options.viewport','VIEWPORT_UNSUPPORTED');
  if(source.references!==undefined)fail('options.references','REFERENCES_UNSUPPORTED');
  const hidden=source.hiddenSeriesIds===undefined?[]:array(source.hiddenSeriesIds,1,'options.hiddenSeriesIds'),ids=new Set<string>();
  for(const item of hidden){const value=text(item,'options.hiddenSeriesIds',128);if(ids.has(value))fail('options.hiddenSeriesIds','DUPLICATE_ID');if(value!==id)fail('options.hiddenSeriesIds','UNKNOWN_SERIES');ids.add(value);}
  return{width:number(source.width,'options.width',1,10000),height:number(source.height,'options.height',1,10000),hidden:ids.has(id)};
}

export function planTilemap(input:PlanTilemapSpec,inputOptions:PlanTilemapOptions):PlanTilemapResult {
  try{
    const spec=validate(ownPlanInput(input) as PlanTilemapSpec),source=spec.series[0],opts=options(ownPlanInput(inputOptions) as PlanTilemapOptions,source.id);
    const mapping=mapValueColors(source.data.map(p=>p.value),spec.colorAxis!),layout=layoutTiles(source.data,{width:opts.width,height:opts.height,shape:spec.tileShape!,padding:spec.pointPadding!});
    const colorAxis:PlanColorAxisFrame=spec.colorAxis!.type==='continuous'?{type:'continuous',domain:mapping.domain,domainSource:spec.colorAxis!.domain!==undefined?'explicit':mapping.domain===null?'none':'source',stops:spec.colorAxis!.stops,missingColor:spec.colorAxis!.missingColor}:{type:'classes',classes:mapping.classes,missingColor:spec.colorAxis!.missingColor,unclassifiedColor:spec.colorAxis!.unclassifiedColor};
    const cells:PlanCellPaint[]=[],observations:PlanTilemapObservation[]=[],summary:PlanTilemapSummary[]=[];
    let knownCount=0,omittedCount=0;
    for(let i=0;i<source.data.length;i++){
      const point=source.data[i]!,tile=layout.tiles[i]!,paint=mapping.values[i]!,visible=!opts.hidden,geometryDecision=opts.hidden?'hidden':tile.omitted||spec.opacity===0?'noInk':'painted';
      if(point.value!==null)knownCount++;
      if(geometryDecision==='noInk')omittedCount++;
      let observed=false;
      if(geometryDecision==='painted'){
        const geometry:PlanCellGeometry=spec.tileShape==='circle'?{type:'circle',cx:tile.center.x,cy:tile.center.y,radius:tile.radius!}:{type:'polygon',vertices:tile.points};
        cells.push({pointId:point.id,color:paint.color,opacity:spec.opacity!,geometry});
        if(point.value!==null&&paint.type!=='missing'){
          observed=true;
          observations.push({id:{seriesId:source.id,pointId:point.id},label:point.name??point.x+', '+point.y,seriesName:source.name,value:point.value,x:tile.center.x,y:tile.center.y,color:paint.color,hit:geometry,tilemap:{sourceX:point.x,sourceY:point.y,...(point.name===undefined?{}:{name:point.name}),color:paint}});
        }
      }
      summary.push({id:{seriesId:source.id,pointId:point.id},x:point.x,y:point.y,value:point.value,...(point.name===undefined?{}:{name:point.name}),visible,geometryDecision,color:paint,observed});
    }
    const status:PlanTilemapLayout['status']=!source.data.length?'noSource':opts.hidden?'allHidden':!knownCount?'allMissing':!observations.length?'noInk':'ready';
    const frame:PlanTilemapFrame={schema:'nc-plan/1',family:'tilemap',title:spec.title,description:spec.description??'',unit:spec.unit??'',width:opts.width,height:opts.height,
      legend:[{id:source.id,name:source.name,color:source.color!,visible:!opts.hidden}],series:opts.hidden?[]:[{id:source.id,name:source.name,color:source.color!,cells}],observations,grid:[],labels:[],colorAxis,tilemapData:summary,
      tilemapLayout:{status,shape:spec.tileShape!,sourceCount:source.data.length,knownCount,missingCount:source.data.length-knownCount,paintedCellCount:cells.length,observedCellCount:observations.length,omittedCellCount:omittedCount,scale:layout.scale,bounds:layout.bounds}};
    return freezePlan({status:observations.length?'ok':'empty',frame});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:error instanceof Error?error.message:'BAD_SPEC'}};}
}
