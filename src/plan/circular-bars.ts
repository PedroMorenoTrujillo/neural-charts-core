import { invalidPlan } from './diagnostics.js';
import {validateLine} from '../line/validate.js';
import {validateRadial} from '../radial/validate.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanWindRoseSpec,PlanRadialBarSpec} from '../public/circular-bar-plan-types.js';
import type {PlanCommand,PlanOptions,PlanResult,PlanSeries,PlanObservation,PlanPolarGrid} from '../public/plan-types.js';

const tau=Math.PI*2;
type FrequencyPoint=PlanWindRoseSpec['series'][number]['data'][number];
const at=(cx:number,cy:number,r:number,a:number)=>({x:cx+Math.sin(a)*r,y:cy-Math.cos(a)*r});
/** Closed exact annular sectors, including two-arc complete circles. */
function sector(cx:number,cy:number,inner:number,outer:number,start:number,end:number):PlanCommand[]{
  if(outer<=inner||end<=start)return [];
  const arc=(r:number,a:number,sweep:0|1,largeArc:0|1):PlanCommand=>({type:'A',radius:r,sweep,largeArc,...at(cx,cy,r,a)});
  const full=end-start>=tau-1e-12;
  const commands:PlanCommand[]=[{type:'M',...at(cx,cy,outer,start)}];
  if(full)commands.push(arc(outer,start+Math.PI,1,0),arc(outer,end,1,0));
  else commands.push(arc(outer,end,1,end-start>Math.PI?1:0));
  commands.push({type:'L',...at(cx,cy,inner,end)});
  if(inner>0){if(full)commands.push(arc(inner,start+Math.PI,0,0),arc(inner,start,0,0));else commands.push(arc(inner,start,0,end-start>Math.PI?1:0));}
  commands.push({type:'Z'});return commands;
}
const ratio=(value:unknown,max:number)=>value===undefined||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max;

/** Bounded O(categories × series), with source identities and values retained. */
export function planCircularBars(spec:PlanWindRoseSpec|PlanRadialBarSpec,options:PlanOptions):PlanResult{
  const wind=spec.family==='windrose',hidden=new Set(options.hiddenSeriesIds??[]);
  const common=['family','title','description','gapRatio'];
  if(Object.keys(spec).some(k=>![...common,...(wind?['axes','series','stacking']:['data','domain','unit','innerRadiusRatio'])].includes(k)))return invalidPlan('UNKNOWN_OPTION','spec');
  if(options.viewport!==undefined||options.references!==undefined||options.stacking!==undefined)return invalidPlan('UNSUPPORTED_RADIAL_OPTION','options');
  if(!ratio(spec.gapRatio,.5))return invalidPlan('BAD_GAP_RATIO','gapRatio');
  const palette=defaultPalette('light',false).series,gap=spec.gapRatio??.12;
  const {width,height}=options,cx=width/2,cy=height/2,inset=Math.min(44,Math.min(width,height)*.16),radius=Math.min(width,height)/2-inset;
  const series:PlanSeries[]=[],observations:PlanObservation[]=[];
  if(wind){
    if(!Array.isArray(spec.series)||spec.series.length>16)return invalidPlan('WIND_ROSE_SERIES_LIMIT','series');
    const {gapRatio:_gap,stacking:_stack,...source}=spec;
    const checked=validateLine({...source,family:'line'});if(checked.status==='invalid')return checked;
    if(spec.axes.x.type!=='category'||spec.axes.x.values.length<2||spec.axes.x.values.length>32)return invalidPlan('WIND_ROSE_CATEGORY_LIMIT','axes.x');
    if(Object.keys(spec.axes).some(k=>!['x','y'].includes(k))||Object.keys(spec.axes.x).some(k=>!['type','values','title'].includes(k))||Object.keys(spec.axes.y).some(k=>!['type','domain','title','nice','ticks'].includes(k)))return invalidPlan('UNKNOWN_RADIAL_AXIS_OPTION','axes');
    if(spec.series.some(s=>Object.keys(s).some(k=>!['id','name','color','data'].includes(k))))return invalidPlan('BAD_WIND_ROSE_SERIES','series');
    if(spec.series.reduce((n,s)=>n+s.data.length,0)>512)return invalidPlan('WIND_ROSE_INPUT_LIMIT','series');
    if(spec.series.some(s=>s.data.some((p:FrequencyPoint)=>p.y!==null&&p.y<0)))return invalidPlan('NONNEGATIVE_FREQUENCY_REQUIRED','series.data.y');
    if(spec.series.some(s=>new Set(s.data.map((p:FrequencyPoint)=>p.x)).size!==s.data.length))return invalidPlan('DUPLICATE_DIRECTION','series.data.x');
    if(spec.stacking!==undefined&&!['sum','percent'].includes(spec.stacking))return invalidPlan('BAD_STACK_MODE','stacking');
    if([...hidden].some(id=>!spec.series.some(s=>s.id===id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
    const categories=spec.axes.x.values,visible:PlanWindRoseSpec['series']=spec.series.filter(s=>!hidden.has(s.id));
    const points=visible.map(s=>new Map(s.data.map(p=>[p.x,p])));
    const totals=categories.map(c=>{let total=0,complete=true;for(const index of points){const p=index.get(c.id);if(!p||p.y===null)complete=false;else total+=p.y;}return {total,complete};});
    if(totals.some(t=>!Number.isFinite(t.total)))return invalidPlan('UNREPRESENTABLE_STACK','series');
    const percent=spec.stacking==='percent';
    if(percent&&totals.some(t=>!t.complete))return invalidPlan('INCOMPLETE_PERCENT_CATEGORY','series');
    const max=percent?100:Math.max(0,...totals.map(t=>t.total)),domain=spec.axes.y.domain;
    if(domain&&(domain[0]!==0||!Number.isFinite(domain[1])||domain[1]<=0||domain[1]<max||percent&&domain[1]!==100))return invalidPlan('RADIAL_DOMAIN_EXCLUDES_STACK','axes.y.domain');
    const ticks=selectNumericTicks(domain??[0,max||1],{nice:spec.axes.y.nice??!domain,targetCount:spec.axes.y.ticks?.targetCount??5});if(ticks.status==='invalid')return ticks;
    const scale=createLinearScale(ticks.value.domain,[0,radius],false);if(scale.status==='invalid')return scale;
    const grid:PlanPolarGrid={cx,cy,radius,rings:ticks.value.ticks.filter(v=>v>=0).map(v=>({radius:scale.value.map(v)!,label:String(v)})),spokes:categories.map((c,i)=>({id:c.id,label:c.label??c.id,...at(cx,cy,radius,i/categories.length*tau)}))};
    const legend=spec.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.has(s.id)}));
    const stacked=categories.map(()=>0);
    for(const [si,s] of visible.entries()){
      const color=legend.find(l=>l.id===s.id)!.color,commands:PlanCommand[]=[];
      for(const [ci,c] of categories.entries()){
        const p=points[si]!.get(c.id);if(!p||p.y===null)continue;
        const total=totals[ci]!,percentage=total.complete&&total.total>0?p.y/total.total*100:undefined;
        const increment=percent?(percentage??0):p.y,low=stacked[ci]!,high=low+increment;stacked[ci]=high;
        const inner=scale.value.map(low)!,outer=scale.value.map(high)!,angle=ci/categories.length*tau,half=(1-gap)*Math.PI/categories.length,start=angle-half,end=angle+half;
        commands.push(...sector(cx,cy,inner,outer,start,end));
        const anchor=at(cx,cy,(inner+outer)/2,angle);
        observations.push({id:{seriesId:s.id,pointId:p.id},label:c.label??c.id,seriesName:s.name,value:p.y,color,...anchor,...(percentage===undefined?{}:{percentage}),...(!total.complete?{incomplete:true}:{}),...(outer>inner?{hit:{type:'sector',cx,cy,radius:outer,innerRadius:inner,start,end}}:{})});
      }
      series.push({id:s.id,name:s.name,color,commands,fill:true});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:spec.family,title:spec.title,description:spec.description??'',unit:spec.axes.y.title??'',width,height,legend,series,observations,grid:[],labels:[],polarGrid:grid}});
  }
  const {domain:_domain,unit:_unit,gapRatio:_gap,innerRadiusRatio:_inner,...pie}=spec;
  const checked=validateRadial({...pie,family:'pie'},'pie');if(checked.status==='invalid')return checked;
  if(spec.data.length>16)return invalidPlan('RADIAL_BAR_INPUT_LIMIT','data');
  if(!ratio(spec.innerRadiusRatio,.8))return invalidPlan('BAD_INNER_RADIUS','innerRadiusRatio');
  if(spec.unit!==undefined&&(typeof spec.unit!=='string'||spec.unit.length>256))return invalidPlan('BAD_UNIT','unit');
  if([...hidden].some(id=>!spec.data.some(p=>p.id===id)))return invalidPlan('UNKNOWN_SERIES','options.hiddenSeriesIds');
  // Hiding a ring preserves the scale and positions of every other source item.
  const max=Math.max(0,...spec.data.flatMap(p=>p.value===null?[]:[p.value])),domain=spec.domain??[0,max||1];
  if(domain[0]!==0||!Number.isFinite(domain[1])||domain[1]<=0||domain[1]<max)return invalidPlan('RADIAL_DOMAIN_EXCLUDES_VALUE','domain');
  const angleScale=createLinearScale(domain,[0,tau],false);if(angleScale.status==='invalid')return angleScale;
  const inner=radius*(spec.innerRadiusRatio??.2),band=(radius-inner)/Math.max(1,spec.data.length),legend=spec.data.map((p,i)=>({id:p.id,name:p.label,color:p.color??palette[i%palette.length]!,visible:!hidden.has(p.id)}));
  for(const [i,p] of spec.data.entries()){
    if(hidden.has(p.id)||p.value===null)continue;
    const outer=radius-i*band-gap*band/2,low=radius-(i+1)*band+gap*band/2,end=angleScale.value.map(p.value)!,color=legend[i]!.color,commands=sector(cx,cy,low,outer,0,end),anchor=at(cx,cy,(outer+low)/2,end/2);
    series.push({id:p.id,name:p.label,color,commands,fill:true});
    observations.push({id:{seriesId:p.id,pointId:p.id},label:p.label,seriesName:spec.title,value:p.value,color,...anchor,...(end>0?{hit:{type:'sector',cx,cy,radius:outer,innerRadius:low,start:0,end}}:{})});
  }
  return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:spec.family,title:spec.title,description:spec.description??'',unit:spec.unit??'',width,height,legend,series,observations,grid:[],labels:[],polarGrid:{cx,cy,radius,rings:[],spokes:[]}}});
}
