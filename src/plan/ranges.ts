import {array,choice,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {formatAxis} from '../internal/axes/plan.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {selectTimeTicks} from '../internal/math/time.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {MAX_PATH_COMMANDS} from '../internal/geometry/path.js';
import {validateLine} from '../line/validate.js';
import {normalizeLine,lineDomains} from '../line/normalize.js';
import {projectLine} from '../line/geometry.js';
import {monotoneCubics} from '../spline/interpolate.js';
import type {CubicSegment} from '../spline/interpolate.js';
import {preparePlanViewport,planLineViewportScales,planViewportState} from './viewport.js';
import {referenceCategories,withPlanReferences} from './references.js';
import {freezePlan} from './input.js';
import type {PlanBar,PlanCommand,PlanFrame,PlanObservation,PlanOptions,PlanRangeSpec,PlanReference,PlanResult,PlanSeries} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Pair=Readonly<{top:Vertex;bottom:Vertex}>;
/** Internal owner handoff only; never exported from the public plan entry. */
export interface RangeGlyphContext {
  readonly plot:Readonly<{x:number;y:number;width:number;height:number}>;
  readonly yDomain:readonly[number,number];
  readonly mapX:(value:string|number)=>number|null;
  readonly mapY:(value:number)=>number|null;
  readonly slots:readonly Readonly<{seriesId:string;pointId:string;left:number;right:number;center:number;width:number}>[];
}
export type RangeGlyphTransform=(frame:PlanFrame,context:RangeGlyphContext)=>PlanFrame;
const blend=(a:Vertex,b:Vertex):Vertex=>({x:a.x/2+b.x/2,y:a.y/2+b.y/2});
const split=(s:CubicSegment):readonly [CubicSegment,CubicSegment]=>{
  const ab=blend(s.a,s.b),bc=blend(s.b,s.c),cd=blend(s.c,s.d),abc=blend(ab,bc),bcd=blend(bc,cd),mid=blend(abc,bcd);
  return [{a:s.a,b:ab,c:abc,d:mid},{a:mid,b:bcd,c:cd,d:s.d}];
};
const flat=(s:CubicSegment):boolean=>{
  const dx=s.d.x-s.a.x,dy=s.d.y-s.a.y,length=Math.hypot(dx,dy);
  return length===0?Math.max(Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),Math.hypot(s.c.x-s.a.x,s.c.y-s.a.y))<=.2:
    Math.max(Math.abs((s.b.x-s.a.x)*dy-(s.b.y-s.a.y)*dx),Math.abs((s.c.x-s.a.x)*dy-(s.c.y-s.a.y)*dx))/length<=.2;
};

/** Paired subdivision shares each parameter/X sample; no sampled boundary can cross. */
function smoothPairs(points:readonly Pair[],parameters:readonly number[]|undefined,budget:number):readonly Pair[]{
  const top=monotoneCubics(points.map(p=>p.top),parameters),bottom=monotoneCubics(points.map(p=>p.bottom),parameters);
  if(top.status==='invalid')throw new ValidationFailure(top.diagnostic);if(bottom.status==='invalid')throw new ValidationFailure(bottom.diagnostic);
  const output:Pair[]=[points[0]!];
  for(let i=0;i<top.value.length;i++){
    const a=top.value[i]!,b=bottom.value[i]!;
    // Bernstein weights are nonnegative. Ordered control pairs therefore keep
    // the entire cubic ribbon ordered, including between source observations.
    const bound=(u:Vertex,l:Vertex):Pair=>u.y<=l.y?{top:u,bottom:l}:{top:{x:u.x,y:u.y/2+l.y/2},bottom:{x:l.x,y:u.y/2+l.y/2}};
    const first=bound(a.b,b.b),last=bound(a.c,b.c);
    const stack:{top:CubicSegment;bottom:CubicSegment;depth:number}[]=[{top:{...a,b:first.top,c:last.top},bottom:{...b,b:first.bottom,c:last.bottom},depth:0}];
    while(stack.length){
      const item=stack.pop()!;
      if(flat(item.top)&&flat(item.bottom)){
        if(output.length>=budget)fail('series.data','RESOURCE_LIMIT');output.push({top:item.top.d,bottom:item.bottom.d});continue;
      }
      if(item.depth>=24)fail('series.data','UNREPRESENTABLE_RANGE_SPLINE');
      const t=split(item.top),l=split(item.bottom);
      stack.push({top:t[1],bottom:l[1],depth:item.depth+1},{top:t[0],bottom:l[0],depth:item.depth+1});
    }
  }
  return output;
}

/** True two-boundary intervals. The scalar value is only a compatible midpoint;
 * lowValue/highValue retain the original endpoints for tooltip/accessibility. */
export function planRanges(spec:PlanRangeSpec,options:PlanOptions,references?:readonly PlanReference[],transform?:RangeGlyphTransform,renderSeriesIds?:ReadonlySet<string>):PlanResult{
  try{
    const input=record(spec,['family','title','description','axes','series','groupGap','barGap','maxBarWidth'],['family','title','axes','series'],'spec');
    const family=choice(input.family,['arearange','areasplinerange','columnrange'],'family'),columns=family==='columnrange';
    const title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',4096,true):'';
    if(!columns&&['groupGap','barGap','maxBarWidth'].some(key=>Object.hasOwn(input,key)))fail('spec','COLUMN_RANGE_LAYOUT_ONLY');
    const groupGap=Object.hasOwn(input,'groupGap')?number(input.groupGap,'groupGap',0,.95):.2;
    const barGap=Object.hasOwn(input,'barGap')?number(input.barGap,'barGap',0,1):.2;
    const maxBarWidth=Object.hasOwn(input,'maxBarWidth')?number(input.maxBarWidth,'maxBarWidth',.25,1024):Infinity;
    const opts=record(options,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
    const width=number(opts.width,'options.width',64,10000),height=number(opts.height,'options.height',64,10000),plot={x:16,y:14,width:width-32,height:height-28};
    if(Object.hasOwn(opts,'stacking'))fail('options.stacking','UNSUPPORTED_STACKING');
    const hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,16,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];
    if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const ids=new Set<string>(),palette=defaultPalette('light',false).series;let count=0;
    const source=array(input.series,16,'series').map((raw,i)=>{
      const path='series['+i+']',s=record(raw,['id','name','color','data'],['id','name','data'],path),id=text(s.id,path+'.id',64),name=text(s.name,path+'.name');
      if(ids.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');ids.add(id);
      const pointIds=new Set<string>();
      const data=array(s.data,10000,path+'.data').map((raw,j)=>{
        if(++count>10000)fail('series.data','RESOURCE_LIMIT');
        const pp=path+'.data['+j+']',p=record(raw,['id','x','low','high'],['id','x','low','high'],pp),pid=text(p.id,pp+'.id',64);
        if(pointIds.has(pid))fail(pp+'.id','DUPLICATE_POINT_ID');pointIds.add(pid);
        if(typeof p.x!=='string'&&typeof p.x!=='number')fail(pp+'.x');
        if((p.low===null)!==(p.high===null))fail(pp,'COMPLETE_RANGE_OR_NULL_PAIR_REQUIRED');
        const low=p.low===null?null:number(p.low,pp+'.low'),high=p.high===null?null:number(p.high,pp+'.high');
        if(low!==null&&high!==null&&low>high)fail(pp,'INVERTED_RANGE');
        return {id:pid,x:p.x as string|number,low,high};
      });
      return {id,name,color:Object.hasOwn(s,'color')?color(s.color,path+'.color'):palette[i%palette.length]!,data,index:i};
    });
    if(hidden.some(id=>!ids.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    // Existing line owners validate correlated X/axis semantics, ordering and
    // duplicate X. Two private surrogate series make the shared Y domain include
    // both endpoints, without replacing a range by either endpoint or by zero.
    const surrogate={family:'line',title,...(description?{description}:{}),axes:input.axes,...(references?{references}:{}),series:source.flatMap(s=>
      ['low','high'].map(side=>({id:s.index+side,name:s.name,color:s.color,
        data:s.data.map((p,i)=>({id:String(i),x:p.x,y:side==='low'?p.low:p.high}))})))
    };
    const checked=validateLine(surrogate);if(checked.status==='invalid')return checked;
    const validated=checked.value,xa=validated.axes.x;
    if(xa.kind==='category'&&xa.values.length>64)fail('axes.x.values','LABEL_LIMIT');
    const hiddenSeriesIds=source.filter(s=>hidden.includes(s.id)).flatMap(s=>[s.index+'low',s.index+'high']),state={hiddenSeriesIds};
    const normalized=normalizeLine(validated),domains=lineDomains(normalized,state);if(domains.status==='invalid')return domains;
    let initialX=domains.value.x;
    // Automatic continuous column frames need half a source interval at each
    // edge, otherwise grouped outer glyphs fall outside the frame entirely.
    // Only explicit axis domains suppress this GLOBAL padding. Requested X
    // windows are applied afterwards, without changing their crop boundaries.
    if(columns&&xa.kind!=='category'&&!xa.domain&&initialX){
      const xs=[...new Set(source.flatMap(s=>s.data.map(p=>p.x as number)))].sort((a,b)=>a-b);
      if(xs.length>1){
        let halfStep=Infinity;
        for(let i=1;i<xs.length;i++){const difference=xs[i]!-xs[i-1]!,half=Number.isFinite(difference)?difference/2:xs[i]!/2-xs[i-1]!/2;if(half>0)halfStep=Math.min(halfStep,half);}
        const first=xs[0]!-halfStep,last=xs[xs.length-1]!+halfStep;
        if(!Number.isFinite(first)||!Number.isFinite(last)||first>=xs[0]!||last<=xs[xs.length-1]!)fail('axes.x','UNREPRESENTABLE_GROUPED_DOMAIN');
        initialX=[first,last];
      }
    }
    const legend=source.map(s=>({id:s.id,name:s.name,color:s.color,visible:!hidden.includes(s.id)}));
    const base={schema:'nc-plan/1' as const,family,title,description,unit:validated.axes.y.title??'',width,height,legend};
    const finish=(frame:PlanFrame,context?:Parameters<typeof withPlanReferences>[2]):PlanResult=>freezePlan({status:frame.observations.length?'ok':'empty',frame:withPlanReferences(frame,references,context)});
    if(!domains.value.y)return finish({...base,series:[],observations:[],grid:[],labels:[]});
    let yt=selectNumericTicks(domains.value.y,{nice:validated.axes.y.nice??!validated.axes.y.domain,targetCount:validated.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;
    let xt=xa.kind==='category'||!initialX?null:(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(initialX,{nice:xa.nice??false,targetCount:xa.ticks?.targetCount??6});if(xt?.status==='invalid')return xt;
    const prepared=preparePlanViewport(validated.axes,{x:xt?.value.domain??initialX,y:yt.value.domain},options.viewport);if(prepared.status==='invalid')return prepared;
    const view=prepared.value,scoped=withViewportDomains({x:xt?.value.domain??initialX,y:yt.value.domain},view);
    if(view?.value.y){yt=selectNumericTicks(scoped.y!,{nice:false,targetCount:validated.axes.y.ticks?.targetCount??5});if(yt.status==='invalid')return yt;}
    if(view?.value.x&&xa.kind!=='category'&&scoped.x){xt=(xa.kind==='time'?selectTimeTicks:selectNumericTicks)(scoped.x,{nice:false,targetCount:xa.ticks?.targetCount??6});if(xt.status==='invalid')return xt;}
    const scales=planLineViewportScales(validated.axes,plot,xt?.value.domain??initialX,yt.value.domain,view);if(scales.status==='invalid')return scales;
    const projected=projectLine(normalized,state,plot,xt?.value.domain??initialX,yt.value.domain,scales.value);if(projected.status==='invalid')return projected;
    const p=projected.value,interval=xt&&'interval' in xt.value?xt.value.interval:null,series:PlanSeries[]=[],observations:PlanObservation[]=[];
    const visible=source.filter(s=>!hidden.includes(s.id));
    const positions=[...new Set((xa.kind==='category'?xa.values.map(v=>v.id):source.flatMap(s=>s.data.map(v=>v.x))).map(x=>p.mapX(x)).filter((x):x is number=>x!==null))].sort((a,b)=>a-b);
    let step=plot.width;for(let i=1;i<positions.length;i++){const delta=positions[i]!-positions[i-1]!;if(delta>0)step=Math.min(step,delta);}
    const m=visible.length,slot=m?Math.min(step*(1-groupGap)/(m+(m-1)*barGap),maxBarWidth):0,slotGap=slot*barGap,groupWidth=m*slot+(m-1)*slotGap;
    let budget=MAX_PATH_COMMANDS;const slots:{seriesId:string;pointId:string;left:number;right:number;center:number;width:number}[]=[];
    for(const [si,s]of visible.entries()){
      if(renderSeriesIds&&!renderSeriesIds.has(s.id))continue;
      const commands:PlanCommand[]=[],areaCommands:PlanCommand[]=[],bars:PlanBar[]=[];
      let run:{point:typeof s.data[number];pair:Pair}[]=[];
      const flush=()=>{
        if(!run.length)return;
        let pairs:readonly Pair[]=run.map(v=>v.pair);
        if(family==='areasplinerange'&&run.length>1)pairs=smoothPairs(pairs,xa.kind==='category'?undefined:run.map(v=>v.point.x as number),Math.floor(budget/4));
        const top=pairs.map(v=>v.top),bottom=pairs.map(v=>v.bottom);
        if(run.length===1)commands.push({kind:'M',...top[0]!},{kind:'L',...bottom[0]!});
        else{
          commands.push(...top.map((v,i):PlanCommand=>({kind:i?'L':'M',...v})),...bottom.map((v,i):PlanCommand=>({kind:i?'L':'M',...v})));
          areaCommands.push(...top.map((v,i):PlanCommand=>({kind:i?'L':'M',...v})),...[...bottom].reverse().map((v):PlanCommand=>({kind:'L',...v})),{kind:'Z'});
        }
        budget-=pairs.length*(run.length>1?4:2)+1;if(budget<0)fail('series.data','RESOURCE_LIMIT');run=[];
      };
      for(const point of s.data){
        if(point.low===null||point.high===null){flush();continue;}
        const x=p.mapX(point.x)!,lowY=p.mapY(point.low)!,highY=p.mapY(point.high)!,top=Math.min(lowY,highY),bottom=Math.max(lowY,highY);
        if(!columns)run.push({point,pair:{top:{x,y:top},bottom:{x,y:bottom}}});
        const low=Math.max(plot.y,top),high=Math.min(plot.y+plot.height,bottom);
        if(x<plot.x||x>plot.x+plot.width||low>high)continue;
        let anchorX=x,anchorY=low/2+high/2,hit:PlanObservation['hit'];
        if(columns){
          const left=Math.max(plot.x,x-groupWidth/2+si*(slot+slotGap)),right=Math.min(plot.x+plot.width,x-groupWidth/2+si*(slot+slotGap)+slot);
          if(right<=left)continue;
          anchorX=left/2+right/2;
          slots.push({seriesId:s.id,pointId:point.id,left,right,center:x-groupWidth/2+si*(slot+slotGap)+slot/2,width:slot});
          if(high>low){bars.push({pointId:point.id,x:left,y:low,width:right-left,height:high-low});hit={kind:'polygon',vertices:[{x:left,y:low},{x:right,y:low},{x:right,y:high},{x:left,y:high}]};}
          else commands.push({kind:'M',x:left,y:low},{kind:'L',x:right,y:low});
        }
        const label=normalized.labels.get(String(point.x))??formatAxis(point.x,xa.kind,interval,normalized.labels);
        observations.push({id:{seriesId:s.id,pointId:point.id},label,seriesName:s.name,value:point.low/2+point.high/2,lowValue:point.low,highValue:point.high,x:anchorX,y:anchorY,color:s.color,...(typeof point.x==='number'?{xValue:point.x}:{}),group:{key:JSON.stringify([xa.kind,point.x]),label,coordinate:x},...(hit?{hit}:{})});
      }
      flush();series.push({id:s.id,name:s.name,color:s.color,...(columns?{bars,...(commands.length?{commands}:{})}:{commands,areaCommands})});
    }
    const values=xa.kind==='category'?xa.values.map(c=>c.id):xt?.value.ticks??[],labels=values.flatMap(v=>{const x=p.mapX(v);return x===null||x<plot.x||x>plot.x+plot.width?[]:[{x,label:formatAxis(v,xa.kind,interval,normalized.labels)}];});
    const frame:PlanFrame={...base,series,observations,labels,grid:yt.value.ticks.map(v=>({y:p.mapY(v)!,label:String(v)})),...(view?{viewport:planViewportState(view,{x:xt?.value.domain??initialX,y:yt.value.domain},validated.axes,plot)!}:{})};
    return finish(transform?transform(frame,{plot,yDomain:yt.value.domain,mapX:p.mapX,mapY:p.mapY,slots}):frame,{plot,domains:{x:xt?.value.domain??initialX,y:yt.value.domain},mapX:p.mapX,mapY:p.mapY,...(xa.kind==='category'?{categories:referenceCategories(xa.values,plot,p.mapX)}:{})});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
