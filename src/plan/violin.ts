import {finiteExtent,normalizeNumericDomain,validDomain} from '../internal/math/domain.js';
import {createLinearScale} from '../internal/math/linear.js';
import {createCategoryFrame,createBandScale} from '../internal/math/category.js';
import {selectNumericTicks} from '../internal/math/numeric-ticks.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {describeNumericSamples} from './statistics.js';
import {freezePlan} from './input.js';
import type {PlanViolinSpec,PlanViolinValue,PlanViolinGroupFrame,PlanViolinDensity} from '../public/violin-plan-types.js';
import type {PlanOptions,PlanResult,PlanSeries,PlanCommand,PlanObservation} from '../public/plan-types.js';
const bad=(reason:string,path:string):PlanResult=>({status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason,path,message:reason}});
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
function quantile(values:readonly number[],fraction:number):number{const index=(values.length-1)*fraction,lo=Math.floor(index),weight=index-lo;const value=values[lo]!*(1-weight)+values[Math.ceil(index)]!*weight;return value===0?0:value;}
interface Group extends PlanViolinGroupFrame {readonly color:string;readonly support?:readonly[number,number];readonly peak:number;}

/** Bounded compact-kernel density; original measurements are not synthetic observations. */
export function planViolin(spec:PlanViolinSpec,options:PlanOptions):PlanResult{
  if(Object.keys(spec).some(k=>!['family','title','description','groups','axes','bandwidth','resolution','normalization','gapRatio'].includes(k)))return bad('UNKNOWN_VIOLIN_OPTION','spec');
  if(!text(spec.title,200)||spec.description!==undefined&&!text(spec.description,1000)||!Array.isArray(spec.groups)||spec.groups.length>16)return bad('BAD_VIOLIN_SOURCE','spec');
  if(options.viewport!==undefined||options.references!==undefined||options.stacking!==undefined)return bad('UNSUPPORTED_VIOLIN_OPTION','options');
  const normalization=spec.normalization??'width',resolution=spec.resolution??64,gap=spec.gapRatio??.2;
  if(spec.normalization!==undefined&&!['width','area','count'].includes(spec.normalization)||spec.resolution!==undefined&&!Number.isInteger(spec.resolution)||spec.gapRatio!==undefined&&!Number.isFinite(spec.gapRatio)||!['width','area','count'].includes(normalization)||!Number.isInteger(resolution)||resolution<32||resolution>128||!Number.isFinite(gap)||gap<0||gap>.8||spec.bandwidth!==undefined&&(!Number.isFinite(spec.bandwidth)||spec.bandwidth<=0))return bad('BAD_VIOLIN_LAYOUT','spec');
  const axis=spec.axes?.y;
  if(spec.axes!==undefined&&(!spec.axes||typeof spec.axes!=='object'||Array.isArray(spec.axes)||!axis||Object.keys(spec.axes).some(k=>k!=='y'))||axis&&(typeof axis!=='object'||axis.type!=='linear'||Object.keys(axis).some(k=>!['type','domain','reversed','nice','unit'].includes(k))||axis.domain!==undefined&&!validDomain(axis.domain)||axis.reversed!==undefined&&typeof axis.reversed!=='boolean'||axis.nice!==undefined&&typeof axis.nice!=='boolean'||axis.unit!==undefined&&!text(axis.unit,64)))return bad('BAD_VIOLIN_AXIS','axes');
  const ids=new Set<string>(),hidden=new Set(options.hiddenSeriesIds??[]),groups:Group[]=[],palette=defaultPalette('light',false).series;let total=0;
  for(const [index,group]of spec.groups.entries()){
    const path='groups['+index+']';
    if(!group||typeof group!=='object'||Object.keys(group).some(k=>!['id','label','samples','color'].includes(k))||!text(group.id,128)||!group.id||ids.has(group.id)||!text(group.label,200)||!Array.isArray(group.samples)||(total+=group.samples.length)>4096||group.color!==undefined&&!/^#[\da-f]{6}$/i.test(group.color))return bad('BAD_VIOLIN_GROUP',path);
    ids.add(group.id);const values:number[]=[],sampleIds=new Set<string>();let missingCount=0;
    for(const [i,sample]of group.samples.entries()){
      if(!sample||typeof sample!=='object'||Object.keys(sample).some(k=>!['id','value'].includes(k))||!text(sample.id,128)||!sample.id||sampleIds.has(sample.id)||sample.value!==null&&!Number.isFinite(sample.value))return bad('BAD_VIOLIN_SAMPLE',path+'.samples['+i+']');
      sampleIds.add(sample.id);if(sample.value===null)missingCount++;else values.push(sample.value===0?0:sample.value);
    }
    values.sort((a,b)=>a-b);const common={id:group.id,label:group.label,visible:!hidden.has(group.id),sampleCount:values.length,missingCount,color:group.color??palette[index%palette.length]!};
    if(!values.length){groups.push({...common,density:[],peak:0});continue;}
    const minimum=values[0]!,maximum=values.at(-1)!,q1=quantile(values,.25),median=quantile(values,.5),q3=quantile(values,.75),description=describeNumericSamples(values),sigma=description.sampleStandardDeviation??0;
    const spread=q3-q1,robust=spread>0&&Number.isFinite(spread)?Math.min(sigma,spread/1.34):sigma;
    const bandwidth=spec.bandwidth??(minimum===maximum?null:robust*(2.34*Math.pow(values.length,-.2)));
    if(bandwidth!==null&&(!Number.isFinite(bandwidth)||bandwidth<=0))return bad('UNREPRESENTABLE_VIOLIN_BANDWIDTH',path);
    const summary:PlanViolinValue={derived:true,sampleCount:values.length,missingCount,minimum,q1,median,q3,maximum,mean:description.mean!,bandwidth};
    if(bandwidth===null){groups.push({...common,summary,density:[],support:[minimum,maximum],peak:0});continue;}
    const from=minimum-bandwidth,to=maximum+bandwidth;if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)return bad('UNREPRESENTABLE_VIOLIN_SUPPORT',path);
    const density:PlanViolinDensity[]=[];let peak=0;
    for(let i=0;i<=resolution;i++){
      const ratio=i/resolution,value=from*(1-ratio)+to*ratio;if(i&&value<=density.at(-1)!.value)return bad('VIOLIN_DENSITY_PRECISION',path);
      let sum=0,correction=0;
      // Sorted source samples let the compact kernel skip all measurements
      // outside its support; there is no allocation per density evaluation.
      if(i>0&&i<resolution){
        const lower=value-bandwidth,upper=value+bandwidth;let lo=0,hi=values.length;
        while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]!<lower)lo=mid+1;else hi=mid;}const first=lo;hi=values.length;
        while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]!<=upper)lo=mid+1;else hi=mid;}
        for(let j=first;j<lo;j++){const sample=values[j]!,difference=value-sample,u=Number.isFinite(difference)?difference/bandwidth:value/bandwidth-sample/bandwidth;if(Math.abs(u)>=1)continue;const kernel=.75*(1-u*u),adjusted=kernel-correction,next=sum+adjusted;correction=(next-sum)-adjusted;sum=next;}
      }
      const estimate=i===0||i===resolution?0:sum/values.length/bandwidth;if(!Number.isFinite(value)||!Number.isFinite(estimate)||estimate<0)return bad('UNREPRESENTABLE_VIOLIN_DENSITY',path);density.push({value,density:estimate});peak=Math.max(peak,estimate);
    }
    if(peak===0)return bad('VIOLIN_DENSITY_PRECISION',path);
    groups.push({...common,summary,density,support:[from,to],peak});
  }
  if([...hidden].some(id=>!ids.has(id)))return bad('UNKNOWN_HIDDEN_VIOLIN_GROUP','options.hiddenSeriesIds');
  const extent=finiteExtent(groups.flatMap(g=>g.support?[...g.support]:[])),normalized=normalizeNumericDomain(extent,{includeZero:false,...(axis?.domain?{explicit:axis.domain}:{})});if(normalized.status==='invalid')return normalized;
  if(axis?.domain&&groups.some(g=>g.support&&(g.support[0]<axis.domain![0]||g.support[1]>axis.domain![1])))return bad('VIOLIN_DOMAIN_CROPS_SUPPORT','axes.y.domain');
  const plot={x:Math.min(38,options.width*.12),y:18,width:Math.max(8,options.width-Math.min(38,options.width*.12)-12),height:Math.max(8,options.height-58)},category=createCategoryFrame(groups.map(g=>g.id),[plot.x,plot.x+plot.width],.5);if(category.status==='invalid')return category;
  const bands=createBandScale(category.value,gap);if(bands.status==='invalid')return bands;
  const tickResult=normalized.status==='ok'?selectNumericTicks(normalized.domain,{nice:axis?.nice??axis?.domain===undefined,targetCount:5}):null;if(tickResult?.status==='invalid')return tickResult;
  const scale=tickResult?createLinearScale(tickResult.value.domain,axis?.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false):null;if(scale?.status==='invalid')return scale;
  const project=(v:number)=>scale?.value.map(v)??plot.y+plot.height/2;
  const globalPeak=Math.max(0,...groups.map(g=>g.peak)),maxCount=Math.max(1,...groups.map(g=>g.sampleCount)),weightedPeak=globalPeak>0?Math.max(...groups.map(g=>g.peak/globalPeak*(g.sampleCount/maxCount))):0,observations:PlanObservation[]=[],series:PlanSeries[]=[];
  for(const group of groups){if(!group.visible||!group.summary)continue;const center=bands.value.center(group.id)!,band=bands.value.band(group.id)!,half=band.width/2,summary=group.summary,commands:PlanCommand[]=[],areaCommands:PlanCommand[]=[];
    const width=(density:number)=>half*(normalization==='width'?density/group.peak:normalization==='area'?density/globalPeak:density/globalPeak*(group.sampleCount/maxCount)/weightedPeak);
    const vertices=group.density.map(p=>({x:center-width(p.density),y:project(p.value)}));
    vertices.push(...[...group.density].reverse().slice(1,-1).map(p=>({x:center+width(p.density),y:project(p.value)})));
    if(vertices.length){areaCommands.push({type:'M',...vertices[0]!},...vertices.slice(1).map(p=>({type:'L' as const,...p})),{type:'Z'});}
    commands.push({type:'M',x:center,y:project(summary.minimum)},{type:'L',x:center,y:project(summary.maximum)},{type:'M',x:center-half*.18,y:project(summary.q1)},{type:'L',x:center+half*.18,y:project(summary.q1)},{type:'M',x:center-half*.18,y:project(summary.q3)},{type:'L',x:center+half*.18,y:project(summary.q3)});
    if(!vertices.length)commands.push({type:'M',x:center-half,y:project(summary.median)},{type:'L',x:center+half,y:project(summary.median)});
    const y=project(summary.median),id={seriesId:group.id,pointId:'summary'};
    series.push({id:group.id,name:group.label,color:group.color,commands,areaCommands,circles:[{pointId:'summary',cx:center,cy:y,radius:3}]});
    observations.push({id,label:group.label,seriesName:group.label,value:summary.median,x:center,y,color:group.color,violin:summary,hit:{type:'polygon',vertices:vertices.length?vertices:[{x:center-half,y:Math.max(plot.y,y-4)},{x:center+half,y:Math.max(plot.y,y-4)},{x:center+half,y:Math.min(plot.y+plot.height,y+4)},{x:center-half,y:Math.min(plot.y+plot.height,y+4)}]}});
  }
  return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'violin',title:spec.title,description:spec.description??'',unit:axis?.unit??'',width:options.width,height:options.height,legend:groups.map(g=>({id:g.id,name:g.label,color:g.color,visible:g.visible})),series,observations,labels:groups.map(g=>({x:bands.value.center(g.id)!,label:g.label})),grid:tickResult?.value.ticks.map(v=>({y:project(v),label:String(v),value:v,type:'number' as const}))??[],violin:{kernel:'epanechnikov',normalization,resolution,groups:groups.map(({color:_,support:__,peak:___,...g})=>g)}}});
}
