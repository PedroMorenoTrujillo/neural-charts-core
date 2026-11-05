import {array,choice,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {freezePlan} from './input.js';
import type {PlanBellcurveSpec,PlanColumnSpec,PlanDistributionSummary,PlanFrame,PlanHistogramSpec,PlanLineSpec,PlanOptions,PlanResult} from '../public/plan-types.js';

type Projection=(spec:PlanColumnSpec|PlanLineSpec,options:PlanOptions)=>PlanResult;
type Bin=Readonly<{id:string;from:number;to:number;count:number;label:string}>;

/** Compensated accumulation over bounded, scaled terms. */
function sum(values:readonly number[]):number{
  let total=0,correction=0;
  for(const value of values){const adjusted=value-correction,next=total+adjusted;correction=(next-total)-adjusted;total=next;}
  return total;
}

/** Shift before scaling so a large common offset does not erase variance. */
function describe(samples:readonly number[]):PlanDistributionSummary{
  const sampleCount=samples.length;
  if(!sampleCount)return {derived:true,sampleCount};
  let scale=0;
  for(const value of samples)scale=Math.max(scale,Math.abs(value));
  if(!scale)return {derived:true,sampleCount,mean:0,...(sampleCount>1?{sampleStandardDeviation:0}:{})};
  const origin=samples[0]!;
  const offsets=samples.map(value=>{const difference=value-origin;return Number.isFinite(difference)?difference/scale:value/scale-origin/scale;});
  const meanOffset=sum(offsets)/sampleCount;
  const mean=Math.max(-1,Math.min(1,origin/scale+meanOffset))*scale;
  if(sampleCount===1)return {derived:true,sampleCount,mean};
  const variance=sum(offsets.map(value=>(value-meanOffset)**2))/(sampleCount-1);
  const sampleStandardDeviation=Math.sqrt(variance)*scale;
  if(!Number.isFinite(mean)||!Number.isFinite(sampleStandardDeviation))fail('samples','STATISTICS_OVERFLOW');
  return {derived:true,sampleCount,mean,sampleStandardDeviation};
}

/** Shared within planning owners; not a separate public package API. */
export {describe as describeNumericSamples};

function integer(value:unknown,path:string,minimum:number,maximum:number):number{
  const checked=number(value,path,minimum,maximum);
  if(!Number.isInteger(checked))fail(path,'EXPECTED_INTEGER');
  return checked;
}

function edges(minimum:number,maximum:number,count:number):number[]{
  const span=maximum-minimum;
  return Array.from({length:count+1},(_,index)=>{
    if(!index)return minimum;
    if(index===count)return maximum;
    const fraction=index/count;
    return Number.isFinite(span)?minimum+span*fraction:minimum*(1-fraction)+maximum*fraction;
  });
}

function histogram(samples:readonly number[],requested:number|undefined):readonly Bin[]{
  if(!samples.length)return [];
  let minimum=samples[0]!,maximum=minimum;
  for(const value of samples){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
  let boundaries:number[];
  if(minimum===maximum){
    // A constant source is one bin. Keep its finite endpoints distinct even
    // at Number.MAX_VALUE, where adding a conventional padding overflows.
    const padding=Math.max(.5,Math.abs(minimum)*.01);
    const lower=minimum-padding,upper=minimum+padding;
    boundaries=[Number.isFinite(lower)?lower:minimum,Number.isFinite(upper)?upper:maximum];
    if(boundaries[0]===boundaries[1])fail('samples','UNREPRESENTABLE_BINS');
  }else{
    let count=requested??Math.min(64,Math.ceil(Math.log2(samples.length))+1);
    boundaries=edges(minimum,maximum,count);
    while(boundaries.some((value,index)=>index>0&&value<=boundaries[index-1]!)){
      if(requested!==undefined)fail('binCount','UNREPRESENTABLE_BINS');
      count=Math.max(1,Math.floor(count/2));boundaries=edges(minimum,maximum,count);
    }
  }
  const counts=Array<number>(boundaries.length-1).fill(0);
  for(const value of samples){
    // First boundary greater than the sample: internal boundaries belong to
    // the following bin; the final maximum belongs to the final bin.
    let low=1,high=boundaries.length-1;
    while(low<high){const middle=(low+high)>>>1;if(value<boundaries[middle]!)high=middle;else low=middle+1;}
    const index=Math.min(counts.length-1,low-1);counts[index]=counts[index]!+1;
  }
  return counts.map((count,index)=>({id:'bin-'+index,from:boundaries[index]!,to:boundaries[index+1]!,count,label:'['+boundaries[index]+', '+boundaries[index+1]+(index===counts.length-1?']':')')}));
}

/** Numeric ticks sit on projected bin edges; exact interval text stays in detail. */
function histogramLabels(bins:readonly Bin[],frame:PlanFrame):PlanFrame['labels']{
  const bars=frame.series.find(series=>series.id==='distribution')?.bars;
  if(!bars?.length||!bins.length)return [];
  const byId=new Map(bars.map(bar=>[bar.pointId,bar]));
  const limit=Math.max(2,Math.min(8,Math.floor((frame.width-32)/64)+1));
  const segments=Math.min(bins.length,limit-1);
  const selected=Array.from({length:segments+1},(_,index)=>Math.round(index*bins.length/segments));
  const ticks=selected.map(index=>{
    const final=index===bins.length,bin=bins[final?index-1:index]!,bar=byId.get(bin.id);
    return bar?{x:bar.x+(final?bar.width:0),value:final?bin.to:bin.from}:undefined;
  }).filter((tick):tick is {x:number;value:number}=>tick!==undefined);
  const compact=ticks.map(tick=>{const rounded=Number(tick.value.toPrecision(4));return Number.isFinite(rounded)?String(rounded):String(tick.value);});
  const collide=new Set(compact).size!==compact.length;
  return ticks.map((tick,index)=>({x:tick.x,label:collide?String(tick.value):compact[index]!}));
}

/**
 * Distribution derivation is isolated here. Existing column/line owners still
 * own domains, scales, ticks, projection and touch coordinates. All generated
 * observations are explicitly derived; the summary describes the raw source.
 */
export function planStatistics(spec:PlanHistogramSpec|PlanBellcurveSpec,options:PlanOptions,project:Projection):PlanResult{
  try{
    const input=record(spec,['family','title','description','samples','binCount','intervals','standardDeviations'],['family','title','samples'],'spec');
    const family=choice(input.family,['histogram','bellcurve'],'family');
    const title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',2048):undefined;
    if(family==='histogram'&&(Object.hasOwn(input,'intervals')||Object.hasOwn(input,'standardDeviations')))fail('spec','UNSUPPORTED_DISTRIBUTION_OPTION');
    if(family==='bellcurve'&&Object.hasOwn(input,'binCount'))fail('spec','UNSUPPORTED_DISTRIBUTION_OPTION');
    const samples=array(input.samples,10000,'samples').map((value,index)=>number(value,'samples['+index+']'));
    const binCount=Object.hasOwn(input,'binCount')?integer(input.binCount,'binCount',1,64):undefined;
    const intervals=Object.hasOwn(input,'intervals')?integer(input.intervals,'intervals',16,256):64;
    const standardDeviations=Object.hasOwn(input,'standardDeviations')?number(input.standardDeviations,'standardDeviations',1,6):3;
    const opts=record(options,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
    number(opts.width,'options.width',64,10000);number(opts.height,'options.height',64,10000);
    for(const key of ['stacking','viewport','references'])if(Object.hasOwn(opts,key))fail('options.'+key,'UNSUPPORTED_'+key.toUpperCase());
    const distribution=describe(samples),common={title,...(description!==undefined?{description}:{})};
    let result:PlanResult,bins:readonly Bin[]=[];
    const densityX=new Map<string,number>();
    if(family==='histogram'){
      bins=histogram(samples,binCount);
      const transformed:PlanColumnSpec={family:'column',...common,groupGap:0,barGap:0,axes:{x:{type:'category',values:bins.map(bin=>({id:bin.id,label:bin.label}))},y:{type:'linear'}},series:[{id:'distribution',name:'Frequency',data:bins.map(bin=>({id:bin.id,x:bin.id,y:bin.count}))}]};
      result=project(transformed,options);
    }else{
      const data:Readonly<{id:string;x:number;y:number}>[]=[];
      const {mean,sampleStandardDeviation}=distribution;
      if(mean!==undefined&&sampleStandardDeviation!==undefined&&sampleStandardDeviation>0){
        let previous=-Infinity;
        for(let index=0;index<=intervals;index++){
          const z=-standardDeviations+2*standardDeviations*index/intervals;
          const x=mean+z*sampleStandardDeviation,y=Math.exp(-z*z/2)/sampleStandardDeviation/Math.sqrt(2*Math.PI);
          if(!Number.isFinite(x)||!Number.isFinite(y))fail('samples','DISTRIBUTION_OVERFLOW');
          if(x<=previous)fail('samples','DISTRIBUTION_PRECISION');
          const id='density-'+index;data.push({id,x,y});densityX.set(id,x);previous=x;
        }
      }
      const transformed:PlanLineSpec={family:'line',...common,axes:{x:{type:'linear'},y:{type:'linear',includeZero:true}},series:[{id:'distribution',name:'Density',data}]};
      result=project(transformed,options);
    }
    if(result.status==='invalid')return result;
    const bounds=new Map(bins.map(bin=>[bin.id,bin]));
    return freezePlan({status:result.status,frame:{...result.frame,family,distribution,...(family==='histogram'?{labels:histogramLabels(bins,result.frame)}:{}),observations:result.frame.observations.map(observation=>{if(family==='histogram'){const bin=bounds.get(observation.id.pointId)!;return {...observation,lowValue:bin.from,highValue:bin.to};}return {...observation,xValue:densityX.get(observation.id.pointId)!};})}});
  }catch(error){
    return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};
  }
}
