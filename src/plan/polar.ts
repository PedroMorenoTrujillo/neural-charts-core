import {validateLine} from '../line/validate.js';
import {validateRadial} from '../radial/validate.js';
import {finiteExtent,normalizeNumericDomain} from '../internal/math/domain.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanRadarSpec,PlanPolarSpec,PlanOptions,PlanResult,PlanCommand,PlanSeries,PlanObservation,PlanPolarGrid} from '../public/plan-types.js';

/** Radial coordinates are calculated once in Core; hosts consume closed geometry. */
export function planPolar(spec:PlanRadarSpec|PlanPolarSpec,options:PlanOptions):PlanResult{
  const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}}),radar=spec.family==='radar',hidden=options.hiddenSeriesIds??[],palette=defaultPalette('light',false).series;
  let categories:readonly Readonly<{id:string;label?:string}>[],maximum:number,domain:readonly[number,number]|undefined;
  if(radar){
    if(!Array.isArray(spec.series)||spec.series.length>16||spec.series.some(s=>Object.keys(s).some(k=>!['id','name','color','data'].includes(k))))return bad('BAD_RADAR_SERIES','series');
    const checked=validateLine({...spec,family:'line'});if(checked.status==='invalid')return checked;
    if(spec.axes.x.kind!=='category'||spec.axes.x.values.length<3||spec.axes.x.values.length>32)return bad('RADAR_CATEGORY_LIMIT','axes.x');
    if(spec.series.reduce((n,s)=>n+s.data.length,0)>512)return bad('RADAR_INPUT_LIMIT','series');
    if(spec.series.some(s=>s.data.some((p:PlanRadarSpec['series'][number]['data'][number])=>p.y!==null&&p.y<0)))return bad('NONNEGATIVE_RADIUS_REQUIRED','series.data.y');
    if(hidden.some(id=>!spec.series.some(s=>s.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
    categories=spec.axes.x.values;maximum=Math.max(0,...spec.series.filter(s=>!hidden.includes(s.id)).flatMap(s=>s.data.flatMap((p:PlanRadarSpec['series'][number]['data'][number])=>p.y===null?[]:[p.y])));domain=spec.axes.y.domain;
    if(Object.keys(spec.axes.x).some(k=>!['kind','values','title'].includes(k))||Object.keys(spec.axes.y).some(k=>!['kind','domain','title','nice','ticks'].includes(k)))return bad('UNKNOWN_RADIAL_AXIS_OPTION','axes');
    if(spec.series.some(s=>new Set(s.data.map((p:PlanRadarSpec['series'][number]['data'][number])=>p.x)).size!==s.data.length))return bad('DUPLICATE_RADIAL_CATEGORY','series.data.x');
  }else{
    const {domain:_domain,radiusScale:_scale,...pie}=spec,checked=validateRadial({...pie,family:'pie'},'pie');if(checked.status==='invalid')return checked;
    if(spec.data.length<1||spec.data.length>16)return bad('POLAR_CATEGORY_LIMIT','data');
    if(hidden.some(id=>!spec.data.some(p=>p.id===id)))return bad('UNKNOWN_SERIES','options.hiddenSeriesIds');
    if(spec.radiusScale!==undefined&&!['linear','area'].includes(spec.radiusScale))return bad('BAD_RADIUS_SCALE','radiusScale');
    categories=spec.data.map(p=>({id:p.id,label:p.label}));maximum=Math.max(0,...spec.data.filter(p=>!hidden.includes(p.id)).flatMap(p=>p.value===null?[]:[p.value]));domain=spec.domain;
  }
  if(domain&&(domain[0]!==0||!Number.isFinite(domain[1])||domain[1]<=0))return bad('RADIAL_DOMAIN_STARTS_AT_ZERO','domain');
  const normalized=normalizeNumericDomain(finiteExtent([0,maximum]),{includeZero:true,...(domain?{explicit:domain}:{})});if(normalized.status==='invalid')return normalized;if(normalized.status==='empty')return bad('EMPTY_DOMAIN','domain');
  const ticks=selectNumericTicks([0,domain?.[1]??(maximum||1)],{nice:radar?(spec.axes.y.nice??!domain):!domain,targetCount:radar?(spec.axes.y.ticks?.targetCount??5):5});if(ticks.status==='invalid')return ticks;
  const {width,height}=options,cx=width/2,cy=height/2,radius=Math.max(8,Math.min(width,height)/2-44),scale=createLinearScale(ticks.value.domain,[0,radius],false);if(scale.status==='invalid')return scale;
  const map=(value:number)=>!radar&&spec.radiusScale==='area'?Math.sqrt(value/ticks.value.domain[1])*radius:scale.value.map(value)!;
  const vertex=(r:number,i:number)=>({x:cx+Math.sin(i/categories.length*Math.PI*2)*r,y:cy-Math.cos(i/categories.length*Math.PI*2)*r});
  const polygon=(r:number):PlanCommand[]=>[...categories.map((_,i):PlanCommand=>({kind:i?'L':'M',...vertex(r,i)})),{kind:'Z'}];
  const grid:PlanPolarGrid={cx,cy,radius,rings:ticks.value.ticks.filter(v=>v>=0).map(v=>({radius:map(v),label:String(v),...(radar?{commands:polygon(map(v))}:{})})),spokes:categories.map((c,i)=>({id:c.id,label:c.label??c.id,...vertex(radius,i)}))};
  const legend=radar?spec.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.includes(s.id)})):spec.data.map((p,i)=>({id:p.id,name:p.label,color:p.color??palette[i%palette.length]!,visible:!hidden.includes(p.id)}));
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  if(radar)for(const [si,s]of spec.series.entries()){
    if(hidden.includes(s.id))continue;
    const color=legend[si]!.color,points=new Map(s.data.map(p=>[p.x,p])),known=categories.map((c,i)=>{const p=points.get(c.id);if(!p||p.y===null||p.y<0||p.y>ticks.value.domain[1])return null;const point=vertex(map(p.y),i);observations.push({id:{seriesId:s.id,pointId:p.id},label:c.label??c.id,seriesName:s.name,value:p.y,...point,color,hit:{kind:'circle',cx:point.x,cy:point.y,radius:5}});return point;});
    const complete=known.every(p=>p!==null),commands:PlanCommand[]=[];
    if(complete){for(const [i,p]of known.entries())commands.push({kind:i?'L':'M',...p!});commands.push({kind:'Z'});}
    else for(let i=0;i<known.length;i++){const a=known[i],b=known[(i+1)%known.length];if(a&&b)commands.push({kind:'M',...a},{kind:'L',...b});}
    series.push({id:s.id,name:s.name,color,commands,...(complete?{areaCommands:commands}:{})});
  }else for(const [i,p]of spec.data.entries()){
    if(hidden.includes(p.id)||p.value===null||p.value>ticks.value.domain[1])continue;
    const color=legend[i]!.color,r=map(p.value),start=(i-.5)/categories.length*Math.PI*2,end=(i+.5)/categories.length*Math.PI*2,a=vertex(r,i-.5),b=vertex(r,i+.5),mid=(start+end)/2;
    // A complete circle needs two arcs; coincident endpoints are a no-op in
    // several native SVG backends, even if a browser tolerates roundoff.
    const commands:PlanCommand[]=r<=0?[]:categories.length===1?[
      {kind:'M',x:cx,y:cy-r},{kind:'A',radius:r,largeArc:0,sweep:1,x:cx,y:cy+r},
      {kind:'A',radius:r,largeArc:0,sweep:1,x:cx,y:cy-r},{kind:'Z'},
    ]:[{kind:'M',x:cx,y:cy},{kind:'L',...a},{kind:'A',radius:r,largeArc:end-start>Math.PI?1:0,sweep:1,...b},{kind:'Z'}];
    series.push({id:p.id,name:p.label,color,commands,fill:true});observations.push({id:{seriesId:p.id,pointId:p.id},label:p.label,seriesName:spec.title,value:p.value,x:cx+Math.sin(mid)*r*.65,y:cy-Math.cos(mid)*r*.65,color,...(r>0?{hit:{kind:'sector' as const,cx,cy,radius:r,innerRadius:0,start,end}}:{})});
  }
  return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:spec.family,title:spec.title,description:spec.description??'',unit:radar?spec.axes.y.title??'':'',width,height,legend,series,observations,grid:[],labels:[],polarGrid:grid}});
}
