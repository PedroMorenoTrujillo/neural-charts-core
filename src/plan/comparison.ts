import {array,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {planRanges} from './ranges.js';
import {freezePlan} from './input.js';
import type {PlanCircle,PlanColumnPyramidSpec,PlanCommand,PlanDumbbellSpec,PlanFrame,PlanLollipopSpec,PlanObservation,PlanOptions,PlanRangeSpec,PlanReference,PlanResult,PlanSeries} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Point=Readonly<{id:string;x:string|number;low:number|null;high:number|null;value?:number}>;
const key=(seriesId:string,pointId:string)=>JSON.stringify([seriesId,pointId]);

/** Intersect a triangle with the rectangular plot. All cuts keep actual edge
 * intersections; a clipped triangle is never replaced by its bounding box. */
function clipTriangle(input:readonly Vertex[],plot:Readonly<{x:number;y:number;width:number;height:number}>):readonly Vertex[]{
  let points=[...input];
  for(const [axis,bound,lower]of [['x',plot.x,true],['x',plot.x+plot.width,false],['y',plot.y,true],['y',plot.y+plot.height,false]] as const){
    const result:Vertex[]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i]!,b=points[(i+1)%points.length]!,insideA=lower?a[axis]>=bound:a[axis]<=bound,insideB=lower?b[axis]>=bound:b[axis]<=bound;
      if(insideA)result.push(a);
      if(insideA!==insideB){
        const difference=b[axis]-a[axis],offset=bound-a[axis],t=Number.isFinite(difference)&&Number.isFinite(offset)?offset/difference:(bound/2-a[axis]/2)/(b[axis]/2-a[axis]/2);
        result.push(axis==='x'?{x:bound,y:a.y*(1-t)+b.y*t}:{x:a.x*(1-t)+b.x*t,y:bound});
      }
    }
    points=result.filter((p,i)=>i===0||p.x!==result[i-1]!.x||p.y!==result[i-1]!.y);
    if(points.length>1&&points[0]!.x===points.at(-1)!.x&&points[0]!.y===points.at(-1)!.y)points.pop();
  }
  const origin=points[0];let area=0;
  if(origin)for(let i=1;i+1<points.length;i++)area+=(points[i]!.x-origin.x)*(points[i+1]!.y-origin.y)-(points[i]!.y-origin.y)*(points[i+1]!.x-origin.x);
  return Math.abs(area)>0?points:[];
}

/** Genuine stems/endpoints or signed triangular columns. Scalar Y is never
 * replaced by the adapter's [min(0,Y),max(0,Y)] interval in public semantics. */
export function planComparison(spec:PlanLollipopSpec|PlanDumbbellSpec|PlanColumnPyramidSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  try{
    const input=record(spec,['family','title','description','axes','series','groupGap','barGap','maxBarWidth','markerRadius'],['family','title','axes','series'],'spec');
    const dumbbell=input.family==='dumbbell',pyramid=input.family==='columnpyramid';if(!dumbbell&&!pyramid&&input.family!=='lollipop')fail('family');
    if(pyramid&&Object.hasOwn(input,'markerRadius'))fail('markerRadius','ENDPOINT_MARKER_OPTION_ONLY');
    const radius=Object.hasOwn(input,'markerRadius')?number(input.markerRadius,'markerRadius',1,16):4;
    const axes=record(input.axes,['x','y'],['x','y'],'axes');
    const y=record(axes.y,['type','domain','nice','includeZero','reversed','title','grid','ticks','labels'],['type'],'axes.y');
    if(!dumbbell){
      if(y.includeZero===false)fail('axes.y.includeZero','ZERO_BASELINE_REQUIRED');
      if(Object.hasOwn(y,'domain')){const domain=array(y.domain,2,'axes.y.domain');if(domain.length!==2||number(domain[0],'axes.y.domain[0]')>0||number(domain[1],'axes.y.domain[1]')<0)fail('axes.y.domain','ZERO_BASELINE_REQUIRED');}
    }
    let count=0;const originals=new Map<string,Point>(),seriesIds=new Set<string>();
    const series=array(input.series,16,'series').map((raw,i)=>{
      const path='series['+i+']',s=record(raw,['id','name','color','data'],['id','name','data'],path),id=text(s.id,path+'.id',64),name=text(s.name,path+'.name');
      if(seriesIds.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');seriesIds.add(id);const pointIds=new Set<string>();
      const data=array(s.data,10000,path+'.data').map((raw,j):Point=>{
        if(++count>10000)fail('series.data','RESOURCE_LIMIT');
        const fields=dumbbell?['low','high']:['y'],pp=path+'.data['+j+']',p=record(raw,['id','x',...fields],['id','x',...fields],pp),pid=text(p.id,pp+'.id',64);
        if(pointIds.has(pid))fail(pp+'.id','DUPLICATE_POINT_ID');pointIds.add(pid);if(typeof p.x!=='string'&&typeof p.x!=='number')fail(pp+'.x');
        let point:Point;
        if(dumbbell){
          if((p.low===null)!==(p.high===null))fail(pp,'COMPLETE_RANGE_OR_NULL_PAIR_REQUIRED');
          const low=p.low===null?null:number(p.low,pp+'.low'),high=p.high===null?null:number(p.high,pp+'.high');if(low!==null&&high!==null&&low>high)fail(pp,'INVERTED_RANGE');point={id:pid,x:p.x as string|number,low,high};
        }else{const value=p.y===null?null:number(p.y,pp+'.y');point={id:pid,x:p.x as string|number,low:value===null?null:Math.min(0,value),high:value===null?null:Math.max(0,value),...(value===null?{}:{value})};}
        originals.set(key(id,pid),point);return point;
      });
      return {id,name,...(Object.hasOwn(s,'color')?{color:color(s.color,path+'.color')}:{}),data:data.map(p=>({id:p.id,x:p.x,low:p.low,high:p.high}))};
    });
    // planRanges validates the correlated axes/X tuple after this structural
    // adaptation; the record boundary intentionally retains unknown values.
    const adapted={family:'columnrange',title:input.title,...(Object.hasOwn(input,'description')?{description:input.description}:{}),axes:{x:axes.x,y:dumbbell||Object.hasOwn(y,'domain')?y:{...y,includeZero:true}},series,...Object.fromEntries(['groupGap','barGap','maxBarWidth'].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]))} as unknown as PlanRangeSpec;
    const planned=planRanges(adapted,options,references,(frame,context):PlanFrame=>{
      const {plot,mapY,slots}=context,left=plot.x,right=plot.x+plot.width,top=plot.y,bottom=plot.y+plot.height;
      const positions=new Map(slots.map(slot=>[key(slot.seriesId,slot.pointId),slot])),paint=new Map<string,{commands:PlanCommand[];circles:PlanCircle[]}>(),observations:PlanObservation[]=[];
      let primitiveCount=0;
      for(const s of frame.series)paint.set(s.id,{commands:[],circles:[]});
      for(const observation of frame.observations){
        const id=key(observation.id.seriesId,observation.id.pointId),source=originals.get(id)!,slot=positions.get(id)!,glyph=paint.get(observation.id.seriesId)!,x=slot.center;
        const a=mapY(dumbbell?source.low!:0)!,b=mapY(dumbbell?source.high!:source.value!)!;
        let hit:PlanObservation['hit'],stem:PlanObservation['stem'];
        if(pyramid){
          const vertices=clipTriangle([{x:x-slot.width/2,y:a},{x:x+slot.width/2,y:a},{x,y:b}],plot);
          if(vertices.length){if(vertices.length>6)fail('series.data','UNREPRESENTABLE_TRIANGLE');glyph.commands.push(...vertices.map((p,i):PlanCommand=>({type:i?'L':'M',...p})),{type:'Z'});hit={type:'polygon',vertices};}
        }else{
          let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
          const include=(x1:number,y1:number,x2:number,y2:number)=>{minX=Math.min(minX,x1);maxX=Math.max(maxX,x2);minY=Math.min(minY,y1);maxY=Math.max(maxY,y2);};
          if(x>=left&&x<=right&&Math.max(a,b)>=top&&Math.min(a,b)<=bottom){const first=Math.max(top,Math.min(bottom,a)),last=Math.max(top,Math.min(bottom,b));if(first!==last){glyph.commands.push({type:'M',x,y:first},{type:'L',x,y:last});stem={x,startY:first,endY:last};include(x-1,Math.min(first,last),x+1,Math.max(first,last));}}
          const endpoint=(y:number)=>{if(x<left||x>right||y<top||y>bottom)return;if(++primitiveCount>10000)fail('series.data','RESOURCE_LIMIT');glyph.circles.push({pointId:source.id,cx:x,cy:y,radius});include(x-radius,y-radius,x+radius,y+radius);};
          if(dumbbell){endpoint(a);if(b!==a)endpoint(b);}else endpoint(b);
          minX=Math.max(left,minX);maxX=Math.min(right,maxX);minY=Math.max(top,minY);maxY=Math.min(bottom,maxY);
          if(maxX>minX&&maxY>minY)hit={type:'polygon',vertices:[{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}]};
        }
        const {hit:_hit,lowValue:_low,highValue:_high,...semantic}=observation;
        observations.push({...semantic,value:dumbbell?observation.value:source.value!,x:Math.max(left,Math.min(right,x)),y:Math.max(top,Math.min(bottom,dumbbell?a/2+b/2:b)),...(dumbbell?{lowValue:source.low!,highValue:source.high!}:{}),...(stem?{stem}:{}),...(hit?{hit}:{})});
      }
      const shapes:PlanSeries[]=frame.series.map(s=>({id:s.id,name:s.name,color:s.color,commands:paint.get(s.id)!.commands,...(pyramid?{fill:true}:{circles:paint.get(s.id)!.circles})}));
      return {...frame,family:dumbbell?'dumbbell':pyramid?'columnpyramid':'lollipop',series:shapes,observations};
    });
    return planned.status==='invalid'?planned:freezePlan({...planned,frame:{...planned.frame,family:dumbbell?'dumbbell':pyramid?'columnpyramid':'lollipop'}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
