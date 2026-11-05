import {array,choice,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {ownPlanInput,freezePlan} from './input.js';
import type {PlanCommand} from '../public/plan-types.js';
import {fillBand,presetMesh,validateMesh,signedArea} from './pictorial-geometry.js';
import type {Mesh,Vertex,FilledBand} from './pictorial-geometry.js';
import type {PlanPictorialSpec,PlanPictorialOptions,PlanPictorialResult,PlanPictorialFrame,PlanPictorialObservation,PlanPictorialSummary,PlanPictorialGlyph,PlanPictorialGlyphId,PlanPictorialFill,PlanPictorialSeries,PlanPictorialPoint} from '../public/pictorial-types.js';

function validate(input:PlanPictorialSpec):{spec:PlanPictorialSpec;mesh:Mesh} {
  const source=record(input,['family','title','description','axes','series','pictorial'],['family','title','axes','series'],'spec');
  choice(source.family,['pictorial'],'spec.family');
  const axes=record(source.axes,['x','y'],['x','y'],'spec.axes'),x=record(axes.x,['type','values'],['type','values'],'spec.axes.x'),y=record(axes.y,['type','domain','unit'],['type'],'spec.axes.y');
  choice(x.type,['category'],'spec.axes.x.type');choice(y.type,['linear'],'spec.axes.y.type');
  const categoryIds=new Set<string>();
  const categories=array(x.values,32,'spec.axes.x.values').map((item,index)=>{
    const path='spec.axes.x.values['+index+']',row=record(item,['id','label'],['id','label'],path),id=text(row.id,path+'.id',128);
    if(categoryIds.has(id))fail(path+'.id','DUPLICATE_ID');categoryIds.add(id);
    return{id,label:text(row.label,path+'.label',256,true)};
  });
  let domain:readonly [0,number]|undefined;
  if(y.domain!==undefined){const d=array(y.domain,2,'spec.axes.y.domain');if(d.length!==2||number(d[0],'spec.axes.y.domain[0]')!==0)fail('spec.axes.y.domain','ZERO_BASELINE_REQUIRED');const max=number(d[1],'spec.axes.y.domain[1]',Number.MIN_VALUE);domain=[0,max];}
  const seriesIds=new Set<string>();let count=0;
  const series=array(source.series,8,'spec.series').map((item,index):PlanPictorialSeries=>{
    const path='spec.series['+index+']',row=record(item,['id','name','color','data'],['id','name','data'],path),id=text(row.id,path+'.id',128);
    if(seriesIds.has(id))fail(path+'.id','DUPLICATE_ID');seriesIds.add(id);
    const ids=new Set<string>(),seenCategories=new Set<string>();
    const data=array(row.data,64,path+'.data').map((item,pointIndex):PlanPictorialPoint=>{
      if(++count>64)fail(path+'.data','POINT_LIMIT');
      const at=path+'.data['+pointIndex+']',point=record(item,['id','x','y'],['id','x','y'],at),id=text(point.id,at+'.id',128),x=text(point.x,at+'.x',128);
      if(ids.has(id))fail(at+'.id','DUPLICATE_ID');ids.add(id);
      if(seenCategories.has(x))fail(at+'.x','DUPLICATE_CATEGORY');seenCategories.add(x);
      if(!categoryIds.has(x))fail(at+'.x','UNKNOWN_CATEGORY');
      return{id,x,y:point.y===null?null:number(point.y,at+'.y',0)};
    });
    const palette=defaultPalette('light',false).series;
    return{id,name:text(row.name,path+'.name',256,true),color:row.color===undefined?palette[index%palette.length]!:color(row.color,path+'.color'),data};
  });
  let mesh:Mesh=presetMesh('person'),gap=8,background=true;
  if(source.pictorial!==undefined){
    const layout=record(source.pictorial,['shape','gap','background'],[],'spec.pictorial');
    if(layout.gap!==undefined)gap=number(layout.gap,'spec.pictorial.gap',0,64);
    if(layout.background!==undefined){if(typeof layout.background!=='boolean')fail('spec.pictorial.background');background=layout.background;}
    if(layout.shape!==undefined){
      const shape=record(layout.shape,['type','name','mesh'],['type'],'spec.pictorial.shape');
      const type=choice(shape.type,['preset','mesh'],'spec.pictorial.shape.type');
      if(type==='preset'){if(shape.mesh!==undefined)fail('spec.pictorial.shape.mesh','INCOMPATIBLE_OPTION');mesh=presetMesh(choice(shape.name,['person','bottle','heart'],'spec.pictorial.shape.name'));}
      else{
        if(shape.name!==undefined)fail('spec.pictorial.shape.name','INCOMPATIBLE_OPTION');
        const m=record(shape.mesh,['id','aspectRatio','vertices','triangles'],['id','aspectRatio','vertices','triangles'],'spec.pictorial.shape.mesh');
        const vertices=array(m.vertices,192,'spec.pictorial.shape.mesh.vertices').map((v,i)=>{const at='spec.pictorial.shape.mesh.vertices['+i+']',p=record(v,['x','y'],['x','y'],at);return{x:number(p.x,at+'.x',0,1),y:number(p.y,at+'.y',0,1)};});
        const triangles=array(m.triangles,64,'spec.pictorial.shape.mesh.triangles').map((t,i)=>{const at='spec.pictorial.shape.mesh.triangles['+i+']',a=array(t,3,at);if(a.length!==3)fail(at);return[number(a[0],at+'[0]'),number(a[1],at+'[1]'),number(a[2],at+'[2]')] as const;});
        try{mesh=validateMesh({id:text(m.id,'spec.pictorial.shape.mesh.id',128),aspectRatio:number(m.aspectRatio,'spec.pictorial.shape.mesh.aspectRatio'),vertices,triangles});}catch(error){fail('spec.pictorial.shape.mesh',error instanceof Error?error.message:'BAD_MESH');}
      }
    }
  }
  const spec:PlanPictorialSpec={family:'pictorial',title:text(source.title,'spec.title',512,true),...(source.description===undefined?{}:{description:text(source.description,'spec.description',2048,true)}),axes:{x:{type:'category',values:categories},y:{type:'linear',...(domain?{domain}:{}),...(y.unit===undefined?{}:{unit:text(y.unit,'spec.axes.y.unit',64,true)})}},series,pictorial:{shape:{type:'mesh',mesh},gap,background}};
  return{spec,mesh};
}

function options(input:PlanPictorialOptions,ids:ReadonlySet<string>){
  const source=record(input,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
  if(source.viewport!==undefined)fail('options.viewport','VIEWPORT_UNSUPPORTED');
  if(source.references!==undefined)fail('options.references','REFERENCES_UNSUPPORTED');
  const hidden=new Set<string>();
  for(const id of source.hiddenSeriesIds===undefined?[]:array(source.hiddenSeriesIds,8,'options.hiddenSeriesIds')){const value=text(id,'options.hiddenSeriesIds',128);if(hidden.has(value))fail('options.hiddenSeriesIds','DUPLICATE_ID');if(!ids.has(value))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');hidden.add(value);}
  const mode:'grouped'|'sum'|'percent'=source.stacking===undefined?'grouped':choice(source.stacking,['sum','percent'],'options.stacking');
  return{width:number(source.width,'options.width',1,10000),height:number(source.height,'options.height',1,10000),hidden,mode};
}

/** UTF-16 length-prefixed tuples retain lone surrogates and every possible delimiter. */
function tuple(parts:readonly string[]):string{return parts.map(p=>p.length+':'+p).join('');}
function commands(loops:readonly (readonly Vertex[])[],map:(v:Vertex)=>Vertex):PlanCommand[]{
  return loops.flatMap(loop=>loop.length<3?[]:[{type:'M' as const,...map(loop[0]!)},...loop.slice(1).map(p=>({type:'L' as const,...map(p)})),{type:'Z' as const}]);
}
function total(values:readonly number[]):{value:number|null;status:'known'|'overflow'}{
  let value=0;for(const n of values){value+=n;if(!Number.isFinite(value))return{value:null,status:'overflow'};}return{value,status:'known'};
}

export function planPictorial(input:PlanPictorialSpec,inputOptions:PlanPictorialOptions):PlanPictorialResult {
  try{
    const {spec,mesh}=validate(ownPlanInput(input) as PlanPictorialSpec),opts=options(ownPlanInput(inputOptions) as PlanPictorialOptions,new Set(spec.series.map(s=>s.id)));
    if(opts.mode==='percent'&&spec.axes.y.domain!==undefined)fail('spec.axes.y.domain','PERCENT_DOMAIN_UNSUPPORTED');
    const categories=spec.axes.x.values,visible=spec.series.filter(s=>!opts.hidden.has(s.id));
    const rows=new Map(spec.series.map(s=>[s.id,new Map(s.data.map(p=>[p.x,p]))]));
    const originalTotals=new Map(categories.map(c=>[c.id,total(spec.series.flatMap(s=>{const p=rows.get(s.id)!.get(c.id);return p?.y===null||p===undefined?[]:[p.y];}))]));
    if(opts.mode==='sum'&&[...originalTotals.values()].some(t=>t.status==='overflow'))fail('spec.series','TOTAL_OVERFLOW');
    const allValues=spec.series.flatMap(s=>s.data.flatMap(p=>p.y===null?[]:[p.y]));
    const originalMax=opts.mode==='sum'?Math.max(0,...[...originalTotals.values()].map(t=>t.value??0)):Math.max(0,...allValues);
    const positive=originalMax>0,explicit=spec.axes.y.domain?.[1];
    let capacityRoundoff:Readonly<{maxExcess:number;tolerance:number}>|undefined;
    if(explicit!==undefined&&originalMax>explicit){
      if(opts.mode!=='sum')fail('spec.axes.y.domain','SOURCE_EXCEEDS_CAPACITY');
      for(const category of categories){
        const value=originalTotals.get(category.id)!.value!;if(value<=explicit)continue;
        const count=spec.series.filter(s=>{const p=rows.get(s.id)!.get(category.id);return p!==undefined&&p.y!==null&&p.y>0;}).length;
        const gamma=(count-1)*Number.EPSILON/(1-(count-1)*Number.EPSILON),tolerance=gamma*Math.max(value,explicit),excess=value-explicit;
        if(excess>tolerance)fail('spec.axes.y.domain','SOURCE_EXCEEDS_CAPACITY');
        if(!capacityRoundoff||excess>capacityRoundoff.maxExcess)capacityRoundoff={maxExcess:excess,tolerance};
      }
    }
    const capacity=opts.mode==='percent'?(positive?100:null):explicit??(positive?originalMax:null),layoutCapacity=capacity??(opts.mode==='percent'?100:1);
    const left=Math.min(54,opts.width*.18),top=Math.min(18,opts.height*.1),right=Math.min(12,opts.width*.05),bottom=Math.min(46,opts.height*.2);
    const plot={x:left,y:top,width:opts.width-left-right,height:opts.height-top-bottom};
    const slot=plot.width/Math.max(1,categories.length),slotsPerCategory=opts.mode==='grouped'?Math.max(1,visible.length):1;
    const subslot=slot/slotsPerCategory,gap=Math.min(spec.pictorial!.gap!,subslot*.5),glyphHeight=Math.min(plot.height,Math.max(Number.MIN_VALUE,subslot-gap)/mesh.aspectRatio),glyphWidth=glyphHeight*mesh.aspectRatio;
    const baseline=plot.y+plot.height,glyphTop=baseline-glyphHeight;
    const full=fillBand(mesh,0,1),bandCache=new Map<string,FilledBand>([['0:1',full]]),glyphs:PlanPictorialGlyph[]=[],observations:PlanPictorialObservation[]=[],summary:PlanPictorialSummary[]=[];
    const filled=new Map(spec.series.map(s=>[s.id,[] as PlanPictorialFill[]]));
    const catState=new Map<string,{incomplete:boolean;total:number|null;totalStatus:'known'|'overflow';max:number;scaledTotal:number}>();
    for(const category of categories){
      const members=visible.map(s=>rows.get(s.id)!.get(category.id)),values=members.flatMap(p=>p===undefined||p.y===null?[]:[p.y]),sum=total(values),max=Math.max(0,...values);
      catState.set(category.id,{incomplete:members.some(p=>p===undefined||p.y===null),total:sum.value,totalStatus:sum.status,max,scaledTotal:max>0?values.reduce((s,v)=>s+v/max,0):0});
    }
    for(let ci=0;ci<categories.length;ci++){
      const category=categories[ci]!,state=catState.get(category.id)!,stackedGlyphId:PlanPictorialGlyphId={type:'stacked',categoryId:category.id};let cumulative=0;
      for(let si=0;si<visible.length;si++){
        const source=visible[si]!,point=rows.get(source.id)!.get(category.id),glyphId:PlanPictorialGlyphId=opts.mode==='grouped'?{type:'grouped',categoryId:category.id,seriesId:source.id}:stackedGlyphId;
        const gx=plot.x+ci*slot+(opts.mode==='grouped'?si*subslot:0)+(subslot-glyphWidth)/2;
        const map=(v:Vertex):Vertex=>({x:gx+v.x*glyphWidth,y:glyphTop+v.y*glyphHeight});
        if(opts.mode==='grouped'||si===0)glyphs.push({id:glyphId,shapeId:mesh.id,categoryId:category.id,bounds:{x:gx,y:glyphTop,width:glyphWidth,height:glyphHeight},backgroundCommands:spec.pictorial!.background?commands(full.loops,map):[]});
        if(!point||point.y===null)continue;
        const fraction=opts.mode==='percent'?(state.max>0?point.y/state.max/state.scaledTotal:0):point.y/layoutCapacity,low=opts.mode==='grouped'?0:cumulative,high=Math.min(1,low+fraction);
        if(opts.mode!=='grouped')cumulative=high;
        const bandKey=low+':'+high;let band=bandCache.get(bandKey);
        if(!band){band=fillBand(mesh,low,high);bandCache.set(bandKey,band);}
        const pieces=band.pieces.map(p=>p.map(map)),paint=commands(band.loops,map);
        const noInk=point.y>0&&(!paint.length||!pieces.some(p=>signedArea(p)>0)),status=point.y===0?'zero':noInk?'noInk':'displayed';
        if(status==='displayed')filled.get(source.id)!.push({pointId:point.id,glyphId,shapeId:mesh.id,commands:paint});
        const largest=pieces.reduce<readonly Vertex[]>((a,p)=>signedArea(p)>signedArea(a)?p:a,[]),anchor=largest.length?{x:largest.reduce((s,p)=>s+p.x,0)/largest.length,y:largest.reduce((s,p)=>s+p.y,0)/largest.length}:{x:gx+glyphWidth/2,y:baseline};
        observations.push({id:{seriesId:source.id,pointId:point.id},label:category.label,seriesName:source.name,value:point.y,x:anchor.x,y:anchor.y,color:source.color!,...(status==='displayed'?{hit:{type:'compoundPolygon' as const,polygons:pieces}}:{}),...(opts.mode==='percent'?{percentage:fraction*100}:{}),pictorial:{categoryId:category.id,glyphId,shapeId:mesh.id,status,low,high,capacity,total:state.total,totalStatus:state.totalStatus,incomplete:state.incomplete}});
      }
    }
    const observationsById=new Map(observations.map(o=>[tuple([o.id.seriesId,o.id.pointId]),o]));
    for(const source of spec.series)for(const point of source.data){const visible=!opts.hidden.has(source.id),o=observationsById.get(tuple([source.id,point.id])),state=catState.get(point.x)!;summary.push({id:{seriesId:source.id,pointId:point.id},categoryId:point.x,y:point.y,visible,status:!visible?'hidden':point.y===null?'null':o!.pictorial.status,low:o?.pictorial.low??null,high:o?.pictorial.high??null,total:state.total,totalStatus:state.totalStatus,incomplete:state.incomplete,...(o?.percentage===undefined?{}:{percentage:o.percentage})});}
    const visiblePositive=visible.some(s=>s.data.some(p=>p.y!==null&&p.y>0));
    const emptyReason=spec.series.every(s=>s.data.length===0)?'noSource':!visible.length?'hidden':!visiblePositive?'noPositiveValues':undefined;
    const frame:PlanPictorialFrame={schema:'nc-plan/1',family:'pictorial',title:spec.title,description:spec.description??'',unit:spec.axes.y.unit??'',width:opts.width,height:opts.height,
      legend:spec.series.map(s=>({id:s.id,name:s.name,color:s.color!,visible:!opts.hidden.has(s.id)})),series:visible.map(s=>({id:s.id,name:s.name,color:s.color!,pictorialFills:filled.get(s.id)!})),observations,grid:[],labels:categories.map((c,i)=>({x:plot.x+(i+.5)*slot,label:c.label})),
      pictorialGlyphs:glyphs,pictorialData:summary,pictorialLayout:{mode:opts.mode,capacity,layoutCapacity,capacitySource:explicit!==undefined?'domain':positive?'source':'none',...(capacityRoundoff?{capacityRoundoff}:{}),...(emptyReason?{emptyReason}:{})}};
    return freezePlan({status:visiblePositive?'ok':'empty',frame});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:error instanceof Error?error.message:'BAD_SPEC'}};}
}
