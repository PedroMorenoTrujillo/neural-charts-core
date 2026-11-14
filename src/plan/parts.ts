import { readPlanTitle, readPlotSize } from './plan-presentation.js';
import { planningFailure } from './diagnostics.js';
import {array,choice,color,fail,number,record,text} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {formatAxis} from '../internal/axes/plan.js';
import {validateLine} from '../line/validate.js';
import {planRanges} from './ranges.js';
import {withPlanReferences} from './references.js';
import {freezePlan} from './input.js';
import type {PlanCircle,PlanCommand,PlanFrame,PlanItemSpec,PlanObservation,PlanOptions,PlanPolygonSpec,PlanRangeSpec,PlanReference,PlanResult,PlanSeries,PlanVariablePieSpec} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Plot=Readonly<{x:number;y:number;width:number;height:number}>;
const fraction=(value:number,a:number,b:number):number=>Number.isFinite(b-a)&&Number.isFinite(value-a)?(value-a)/(b-a):(value/2-a/2)/(b/2-a/2);
const interpolate=(a:Vertex,b:Vertex,t:number):Vertex=>({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t});

function area(points:readonly Vertex[]):number{
  const origin=points[0];let sum=0,correction=0;
  if(origin)for(let i=1;i+1<points.length;i++){const a=points[i]!,b=points[i+1]!,term=(a.x-origin.x)*(b.y-origin.y)-(a.y-origin.y)*(b.x-origin.x)-correction,next=sum+term;correction=(next-sum)-term;sum=next;}
  return sum;
}
function clipPolygon(input:readonly Vertex[],plot:Plot):readonly Vertex[]{
  let points=[...input];
  for(const [axis,bound,lower]of [['x',plot.x,true],['x',plot.x+plot.width,false],['y',plot.y,true],['y',plot.y+plot.height,false]] as const){
    const result:Vertex[]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i]!,b=points[(i+1)%points.length]!,insideA=lower?a[axis]>=bound:a[axis]<=bound,insideB=lower?b[axis]>=bound:b[axis]<=bound;
      if(insideA)result.push(a);
      if(insideA!==insideB){const v=interpolate(a,b,fraction(bound,a[axis],b[axis]));result.push(axis==='x'?{x:bound,y:v.y}:{x:v.x,y:bound});}
    }
    if(result.length>160000)fail('series.data','RESOURCE_LIMIT');
    points=result.filter((p,i)=>i===0||p.x!==result[i-1]!.x||p.y!==result[i-1]!.y);
    if(points.length>1&&points[0]!.x===points.at(-1)!.x&&points[0]!.y===points.at(-1)!.y)points.pop();
  }
  return area(points)!==0?points:[];
}
function clipEdge(a:Vertex,b:Vertex,plot:Plot):readonly [Vertex,Vertex]|null{
  let first=0,last=1;
  for(const [axis,minimum,maximum]of [['x',plot.x,plot.x+plot.width],['y',plot.y,plot.y+plot.height]] as const){
    if(a[axis]===b[axis]){if(a[axis]<minimum||a[axis]>maximum)return null;continue;}
    const t1=fraction(minimum,a[axis],b[axis]),t2=fraction(maximum,a[axis],b[axis]);first=Math.max(first,Math.min(t1,t2));last=Math.min(last,Math.max(t1,t2));if(last<=first)return null;
  }
  const clamp=(p:Vertex):Vertex=>({x:Math.max(plot.x,Math.min(plot.x+plot.width,p.x)),y:Math.max(plot.y,Math.min(plot.y+plot.height,p.y))});
  const start=clamp(interpolate(a,b,first)),end=clamp(interpolate(a,b,last));return start.x===end.x&&start.y===end.y?null:[start,end];
}

/** Strict simple-polygon validation in translated, independently scaled axes.
 * Ambiguous near-collinear intersections are rejected conservatively. A finite
 * candidate budget bounds pathological sweeps without accepting unchecked data.
 */
function validatePolygon(points:readonly Vertex[],path:string):void{
  if(points.length<3)fail(path,'POLYGON_REQUIRES_THREE_VERTICES');
  const origin=points[0]!;let sx=0,sy=0;
  for(const p of points){const dx=p.x-origin.x,dy=p.y-origin.y;sx=Math.max(sx,Number.isFinite(dx)?Math.abs(dx):Math.max(Math.abs(p.x),Math.abs(origin.x)));sy=Math.max(sy,Number.isFinite(dy)?Math.abs(dy):Math.max(Math.abs(p.y),Math.abs(origin.y)));}
  if(sx===0||sy===0)fail(path,'DEGENERATE_POLYGON');
  const coordinate=(value:number,start:number,scale:number)=>Number.isFinite(value-start)?(value-start)/scale:value/scale-start/scale;
  const normalized=points.map(p=>({x:coordinate(p.x,origin.x,sx),y:coordinate(p.y,origin.y,sy)}));
  const signedArea=area(normalized);if(!Number.isFinite(signedArea)||Math.abs(signedArea)<=Number.EPSILON*32)fail(path,'DEGENERATE_POLYGON');
  const orient=(a:Vertex,b:Vertex,c:Vertex):number=>{const u=(b.x-a.x)*(c.y-a.y),v=(b.y-a.y)*(c.x-a.x),d=u-v;return Math.abs(d)<=Number.EPSILON*32*(Math.abs(u)+Math.abs(v))?0:Math.sign(d);};
  for(let i=0;i<normalized.length;i++){
    const a=normalized[(i+normalized.length-1)%normalized.length]!,b=normalized[i]!,c=normalized[(i+1)%normalized.length]!;
    if(orient(a,b,c)===0&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)<0)fail(path,'SELF_INTERSECTING_POLYGON');
  }
  const edges=normalized.map((a,i)=>{const b=normalized[(i+1)%normalized.length]!;return {a,b,index:i,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};}).sort((a,b)=>a.minX-b.minX||a.minY-b.minY);
  let active:typeof edges=[],checks=0;
  const on=(a:Vertex,b:Vertex,c:Vertex)=>c.x>=Math.min(a.x,b.x)-1e-14&&c.x<=Math.max(a.x,b.x)+1e-14&&c.y>=Math.min(a.y,b.y)-1e-14&&c.y<=Math.max(a.y,b.y)+1e-14;
  for(const edge of edges){
    active=active.filter(other=>other.maxX>=edge.minX-1e-14);
    for(const other of active){
      if(++checks>2000000)fail(path,'RESOURCE_LIMIT');
      const distance=Math.abs(edge.index-other.index);if(distance===1||distance===points.length-1||other.maxY<edge.minY-1e-14||edge.maxY<other.minY-1e-14)continue;
      const a=orient(edge.a,edge.b,other.a),b=orient(edge.a,edge.b,other.b),c=orient(other.a,other.b,edge.a),d=orient(other.a,other.b,edge.b);
      if(a*b<0&&c*d<0||a===0&&on(edge.a,edge.b,other.a)||b===0&&on(edge.a,edge.b,other.b)||c===0&&on(other.a,other.b,edge.a)||d===0&&on(other.a,other.b,edge.b))fail(path,'SELF_INTERSECTING_POLYGON');
    }
    active.push(edge);
  }
}

export function planParts(spec:PlanVariablePieSpec|PlanItemSpec|PlanPolygonSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  try{
    const family=choice(record(spec,['family','title','description','data','zDomain','minRadiusRatio','radiusScale','columns','axes','series'],['family'],'spec').family,['variablepie','item','polygon'],'family');
    const input=record(spec,family==='variablepie'?['family','title','description','data','zDomain','minRadiusRatio','radiusScale']:family==='item'?['family','title','description','data','columns']:['family','title','description','axes','series'],['family','title',...(family==='polygon'?['axes','series']:['data'])],'spec');
    const {title,description}=readPlanTitle(input);
    const opts=record(options,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options'),{width,height}=readPlotSize(opts),plot={x:16,y:14,width:width-32,height:height-28};
    if(Object.hasOwn(opts,'stacking'))fail('options.stacking','UNSUPPORTED_STACKING');
    const hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,16,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const palette=defaultPalette('light',false).series;
    if(family==='polygon'){
      const axes=record(input.axes,['x','y'],['x','y'],'axes'),xAxis=record(axes.x,['type','domain','nice','title','grid','ticks','labels'],['type'],'axes.x');choice(xAxis.type,['linear','time'],'axes.x.type');
      let count=0;const ids=new Set<string>();
      const polygons=array(input.series,16,'series').map((raw,i)=>{
        const path='series['+i+']',s=record(raw,['id','name','color','data'],['id','name','data'],path),id=text(s.id,path+'.id',64),name=text(s.name,path+'.name');if(ids.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');ids.add(id);
        const pointIds=new Set<string>(),coordinates=new Set<string>();
        const data=array(s.data,10000,path+'.data').map((raw,j)=>{if(++count>10000)fail('series.data','RESOURCE_LIMIT');const pp=path+'.data['+j+']',p=record(raw,['id','x','y'],['id','x','y'],pp),pid=text(p.id,pp+'.id',64),x=number(p.x,pp+'.x'),y=number(p.y,pp+'.y');if(pointIds.has(pid))fail(pp+'.id','DUPLICATE_POINT_ID');pointIds.add(pid);const key=JSON.stringify([x,y]);if(coordinates.has(key))fail(pp,'DUPLICATE_POLYGON_VERTEX');coordinates.add(key);return {id:pid,x,y};});
        if(data.length)validatePolygon(data,path+'.data');return {id,name,color:Object.hasOwn(s,'color')?color(s.color,path+'.color'):palette[i%palette.length]!,data};
      });
      if(hidden.some(id=>!ids.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
      const surrogate=polygons.map(s=>{const byX=new Map<number,{low:number;high:number}>();for(const p of s.data){const row=byX.get(p.x);if(row){row.low=Math.min(row.low,p.y);row.high=Math.max(row.high,p.y);}else byX.set(p.x,{low:p.y,high:p.y});}return {id:s.id,name:s.name,color:s.color,data:[...byX].sort((a,b)=>a[0]-b[0]).map(([x,row],i)=>({id:String(i),x,...row}))};});
      if(count===0){
        const checked=validateLine({family:'line',title,...(description?{description}:{}),axes:input.axes,series:polygons.map(s=>({id:s.id,name:s.name,color:s.color,data:[]})),...(references?{references}:{})});if(checked.status==='invalid')return checked;
        return freezePlan({status:'empty',frame:withPlanReferences({schema:'nc-plan/1',family:'polygon',title,description,unit:checked.value.axes.y.title??'',width,height,legend:polygons.map(s=>({id:s.id,name:s.name,color:s.color,visible:!hidden.includes(s.id)})),series:[],observations:[],grid:[],labels:[]},references)});
      }
      const adapted={family:'arearange',title,...(description?{description}:{}),axes:input.axes,series:surrogate} as PlanRangeSpec;
      const planned=planRanges(adapted,options,references,(frame,context):PlanFrame=>{
        const {mapX,mapY}=context,series:PlanSeries[]=[],observations:PlanObservation[]=[],labels=new Map<string,string>(),type=(spec as PlanPolygonSpec).axes.x.type;
        for(const s of polygons){
          if(hidden.includes(s.id))continue;
          const paintColor=frame.legend.find(item=>item.id===s.id)!.color;
          const vertices=s.data.map(p=>({x:mapX(p.x)!,y:mapY(p.y)!})),clipped=clipPolygon(vertices,plot),commands:PlanCommand[]=[],circles:PlanCircle[]=[];
          for(let i=0;i<vertices.length;i++){const edge=clipEdge(vertices[i]!,vertices[(i+1)%vertices.length]!,plot);if(edge)commands.push({type:'M',...edge[0]},{type:'L',...edge[1]});}
          for(const [i,p]of s.data.entries()){const v=vertices[i]!;if(v.x<plot.x||v.x>plot.x+plot.width||v.y<plot.y||v.y>plot.y+plot.height)continue;circles.push({pointId:p.id,cx:v.x,cy:v.y,radius:3});observations.push({id:{seriesId:s.id,pointId:p.id},label:formatAxis(p.x,type,null,labels),seriesName:s.name,value:p.y,xValue:p.x,x:v.x,y:v.y,color:paintColor,hit:{type:'circle',cx:v.x,cy:v.y,radius:4}});}
          const areaCommands:PlanCommand[]=clipped.length?[...clipped.map((v,i):PlanCommand=>({type:i?'L':'M',...v})),{type:'Z'}]:[];
          series.push({id:s.id,name:s.name,color:paintColor,commands,areaCommands,circles});
        }
        return {...frame,family:'polygon',series,observations};
      });
      if(planned.status==='invalid')return planned;
      const painted=planned.frame.series.some(s=>(s.commands?.length??0)>0||(s.areaCommands?.length??0)>0||(s.circles?.length??0)>0);
      return freezePlan({status:painted||planned.frame.observations.length?'ok':'empty',frame:{...planned.frame,family:'polygon'}});
    }
    if(Object.hasOwn(opts,'viewport')||Object.hasOwn(opts,'references')||references!==undefined)fail('options','NON_CARTESIAN_PARTS_OPTIONS');
    const ids=new Set<string>();
    const data=array(input.data,16,'data').map((raw,i)=>{
      const path='data['+i+']',p=record(raw,['id','label','value','color',...(family==='variablepie'?['z']:[])],['id','label','value',...(family==='variablepie'?['z']:[])],path),id=text(p.id,path+'.id',128);if(ids.has(id))fail(path+'.id','DUPLICATE_ID');ids.add(id);
      const value=number(p.value,path+'.value',0);if(family==='item'&&!Number.isSafeInteger(value))fail(path+'.value','INTEGER_UNIT_COUNT_REQUIRED');
      return {id,label:text(p.label,path+'.label',1024),value,color:Object.hasOwn(p,'color')?color(p.color,path+'.color'):palette[i%palette.length]!,z:family==='variablepie'?number(p.z,path+'.z',0):0};
    });
    if(hidden.some(id=>!ids.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    const visible=data.filter(p=>!hidden.includes(p.id)),legend=data.map(p=>({id:p.id,name:p.label,color:p.color,visible:!hidden.includes(p.id)})),series:PlanSeries[]=[],observations:PlanObservation[]=[];
    const base={schema:'nc-plan/1' as const,family,title,description,unit:'',width,height,legend};
    if(family==='item'){
      const totalAll=data.reduce((sum,p)=>sum+p.value,0);if(totalAll>256)fail('data','ITEM_UNIT_LIMIT');
      const total=visible.reduce((sum,p)=>sum+p.value,0),requested=Object.hasOwn(input,'columns')?number(input.columns,'columns',1,32):undefined;if(requested!==undefined&&!Number.isInteger(requested))fail('columns','INTEGER_COLUMNS_REQUIRED');
      const columns=requested??Math.max(1,Math.min(32,total||1,Math.ceil(Math.sqrt(total*plot.width/plot.height)))),rows=Math.max(1,Math.ceil(total/columns)),cellWidth=plot.width/columns,cellHeight=plot.height/rows,radius=Math.min(cellWidth,cellHeight)*.32;let unit=0;
      for(const p of visible){const circles:PlanCircle[]=[];for(let i=0;i<p.value;i++,unit++)circles.push({pointId:p.id,cx:plot.x+(unit%columns+.5)*cellWidth,cy:plot.y+(Math.floor(unit/columns)+.5)*cellHeight,radius});series.push({id:p.id,name:p.label,color:p.color,circles});observations.push({id:{seriesId:p.id,pointId:p.id},label:p.label,seriesName:title,value:p.value,x:circles[0]?.cx??width/2,y:circles[0]?.cy??height/2,color:p.color,...(total>0?{percentage:p.value/total*100}:{})});}
      return freezePlan({status:observations.length?'ok':'empty',frame:{...base,series,observations,grid:[],labels:[]}});
    }
    const minimumRatio=Object.hasOwn(input,'minRadiusRatio')?number(input.minRadiusRatio,'minRadiusRatio',0,1):.25,radiusScale=Object.hasOwn(input,'radiusScale')?choice(input.radiusScale,['area','radius'],'radiusScale'):'area';
    let zMin=Math.min(...visible.map(p=>p.z)),zMax=Math.max(...visible.map(p=>p.z));
    if(Object.hasOwn(input,'zDomain')){const domain=array(input.zDomain,2,'zDomain');if(domain.length!==2)fail('zDomain');zMin=number(domain[0],'zDomain[0]',0);zMax=number(domain[1],'zDomain[1]',0);if(zMin>=zMax||data.some(p=>p.z<zMin||p.z>zMax))fail('zDomain','BAD_Z_DOMAIN');}
    const maximum=Math.max(0,...visible.map(p=>p.value));let denominator=0,correction=0;
    for(const p of visible){const term=(maximum===0?0:p.value/maximum)-correction,next=denominator+term;correction=(next-denominator)-term;denominator=next;}
    const radius=Math.min(plot.width,plot.height)/2,cx=width/2,cy=height/2;let cursor=0,lastPositive=-1;for(const [i,p]of visible.entries())if(p.value>0)lastPositive=i;
    for(const [i,p]of visible.entries()){
      const share=denominator===0?0:(p.value/maximum)/denominator,start=cursor;cursor=i===lastPositive?Math.PI*2:Math.min(Math.PI*2,cursor+share*Math.PI*2);const end=cursor,z=zMin===zMax?1:Math.max(0,Math.min(1,fraction(p.z,zMin,zMax))),ratio=radiusScale==='area'?Math.sqrt(minimumRatio*minimumRatio+z*(1-minimumRatio*minimumRatio)):minimumRatio+z*(1-minimumRatio),r=radius*ratio;
      const vertex=(angle:number,length=r):Vertex=>({x:cx+Math.sin(angle)*length,y:cy-Math.cos(angle)*length}),a=vertex(start),b=vertex(end),mid=vertex(start/2+end/2,r*.65),painted=end>start&&r>0;
      const commands:PlanCommand[]=!painted?[]:end-start===Math.PI*2?[{type:'M',x:cx,y:cy-r},{type:'A',radius:r,largeArc:0,sweep:1,x:cx,y:cy+r},{type:'A',radius:r,largeArc:0,sweep:1,x:cx,y:cy-r},{type:'Z'}]:[{type:'M',x:cx,y:cy},{type:'L',...a},{type:'A',radius:r,largeArc:end-start>Math.PI?1:0,sweep:1,...b},{type:'Z'}];
      series.push({id:p.id,name:p.label,color:p.color,commands,fill:true});observations.push({id:{seriesId:p.id,pointId:p.id},label:p.label,seriesName:title,value:p.value,sizeValue:p.z,x:mid.x,y:mid.y,color:p.color,...(denominator>0?{percentage:share*100}:{}),...(painted?{hit:{type:'sector' as const,cx,cy,radius:r,innerRadius:0,start,end}}:{})});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{...base,series,observations,grid:[],labels:[]}});
  }catch(error){return planningFailure(error);}
}
