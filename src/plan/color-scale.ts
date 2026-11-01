import type {PlanColorAxisSpec as ValueColorScale,PlanValueColor as ValueColor,PlanValueColorMapping as ValueColorMapping} from '../public/color-axis-types.js';
import {array,choice,color,fail,number,record,text} from '../internal/data/validation.js';

/** Input has already passed the caller's public JSON ownership boundary. */
export function validateColorAxis(input:unknown,path='spec.colorAxis'):ValueColorScale {
  if(input===undefined)return{kind:'continuous',stops:[{at:0,color:'#E8F0FE'},{at:1,color:'#245DC1'}],missingColor:'#CBD5E1'};
  const source=record(input,['kind','domain','stops','classes','missingColor','unclassifiedColor'],['kind','missingColor'],path);
  const kind=choice(source.kind,['continuous','classes'],path+'.kind'),missingColor=color(source.missingColor,path+'.missingColor');
  if(kind==='continuous'){
    if(source.classes!==undefined||source.unclassifiedColor!==undefined)fail(path,'INCOMPATIBLE_COLOR_AXIS_OPTION');
    const stops=array(source.stops,8,path+'.stops').map((item,i)=>{const at=path+'.stops['+i+']',row=record(item,['at','color'],['at','color'],at);return{at:number(row.at,at+'.at',0,1),color:color(row.color,at+'.color')};});
    let domain:readonly [number,number]|undefined;
    if(source.domain!==undefined){const d=array(source.domain,2,path+'.domain');if(d.length!==2)fail(path+'.domain');domain=[number(d[0],path+'.domain[0]'),number(d[1],path+'.domain[1]')];}
    return{kind,stops,missingColor,...(domain===undefined?{}:{domain})};
  }
  if(source.domain!==undefined||source.stops!==undefined)fail(path,'INCOMPATIBLE_COLOR_AXIS_OPTION');
  const classes=array(source.classes,16,path+'.classes').map((item,i)=>{
    const at=path+'.classes['+i+']',row=record(item,['id','label','minInclusive','maxExclusive','color'],['id','label','color'],at);
    return{id:text(row.id,at+'.id',128),label:text(row.label,at+'.label',256,true),color:color(row.color,at+'.color'),...(row.minInclusive===undefined?{}:{minInclusive:number(row.minInclusive,at+'.minInclusive')}),...(row.maxExclusive===undefined?{}:{maxExclusive:number(row.maxExclusive,at+'.maxExclusive')})};
  });
  return{kind,classes,missingColor,unclassifiedColor:color(source.unclassifiedColor,path+'.unclassifiedColor')};
}

const validColor=(value:string)=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
const channel=(color:string,at:number)=>Number.parseInt(color.slice(at,at+2),16);
function interpolate(a:string,b:string,t:number):string {
  return '#'+[1,3,5].map(at=>Math.round(channel(a,at)+(channel(b,at)-channel(a,at))*t).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function domainOf(values:readonly (number|null)[]):readonly [number,number]|null {
  let min=Infinity,max=-Infinity;
  for(const value of values)if(value!==null){min=Math.min(min,value);max=Math.max(max,value);}
  return min===Infinity?null:[min,max];
}
/** Public entry must own JSON first. Never replace an original numeric value. */
export function mapValueColors(values:readonly (number|null)[],scale:ValueColorScale):ValueColorMapping {
  if(values.length>4096||values.some(value=>value!==null&&!Number.isFinite(value))||!validColor(scale.missingColor))throw new RangeError('Invalid color source');
  if(scale.kind==='continuous'){
    if(scale.stops.length<2||scale.stops.length>8)throw new RangeError('Invalid color stops');
    for(let i=0;i<scale.stops.length;i++){
      const stop=scale.stops[i]!;
      if(!Number.isFinite(stop.at)||stop.at<0||stop.at>1||!validColor(stop.color)||(i>0&&stop.at<=scale.stops[i-1]!.at))throw new RangeError('Invalid color stops');
    }
    if(scale.stops[0]!.at!==0||scale.stops.at(-1)!.at!==1)throw new RangeError('Color stops must cover zero to one');
    const supplied=scale.domain;
    if(supplied&&(supplied.length!==2||!supplied.every(Number.isFinite)||supplied[0]>=supplied[1]))throw new RangeError('Invalid color domain');
    const domain=supplied?[supplied[0],supplied[1]] as const:domainOf(values);
    const mapped=values.map((value):ValueColor=>{
      if(value===null)return Object.freeze({kind:'missing',color:scale.missingColor});
      if(!domain)throw new Error('Known value has no inferred domain');
      const [min,max]=domain;
      // Ordinary spans preserve subnormal values; halves handle finite ±MAX_VALUE.
      const span=max-min;
      const raw=min===max?.5:Number.isFinite(span)?(value-min)/span:(value/2-min/2)/(max/2-min/2);
      const ratio=Math.max(0,Math.min(1,raw));
      let index=1;
      while(index<scale.stops.length-1&&scale.stops[index]!.at<ratio)index++;
      const a=scale.stops[index-1]!,b=scale.stops[index]!;
      return Object.freeze({kind:'continuous',value,ratio,clamped:value<min||value>max,
        color:interpolate(a.color,b.color,(ratio-a.at)/(b.at-a.at))});
    });
    return Object.freeze({values:Object.freeze(mapped),domain:domain?Object.freeze(domain):null,classes:Object.freeze([])});
  }
  if(scale.kind!=='classes'||!validColor(scale.unclassifiedColor)||scale.classes.length<1||scale.classes.length>16)throw new RangeError('Invalid color classes');
  const ids=new Set<string>();let previousMax=-Infinity;
  const classes=scale.classes.map((entry,index)=>{
    const min=entry.minInclusive??-Infinity,max=entry.maxExclusive??Infinity;
    if(typeof entry.id!=='string'||!entry.id||entry.id.length>128||ids.has(entry.id)||
      typeof entry.label!=='string'||entry.label.length>256||!validColor(entry.color)||
      (entry.minInclusive!==undefined&&!Number.isFinite(entry.minInclusive))||
      (entry.maxExclusive!==undefined&&!Number.isFinite(entry.maxExclusive))||min>=max||min<previousMax||
      (index>0&&entry.minInclusive===undefined)||(index<scale.classes.length-1&&entry.maxExclusive===undefined))throw new RangeError('Invalid or overlapping color classes');
    ids.add(entry.id);previousMax=max;
    return Object.freeze({id:entry.id,label:entry.label,color:entry.color,
      ...(entry.minInclusive===undefined?{}:{minInclusive:entry.minInclusive}),
      ...(entry.maxExclusive===undefined?{}:{maxExclusive:entry.maxExclusive})});
  });
  const mapped=values.map((value):ValueColor=>{
    if(value===null)return Object.freeze({kind:'missing',color:scale.missingColor});
    const found=classes.find(entry=>value>=(entry.minInclusive??-Infinity)&&value<(entry.maxExclusive??Infinity));
    return found?Object.freeze({kind:'class',value,classId:found.id,color:found.color}):Object.freeze({kind:'unclassified',value,color:scale.unclassifiedColor});
  });
  return Object.freeze({values:Object.freeze(mapped),domain:null,classes:Object.freeze(classes)});
}
