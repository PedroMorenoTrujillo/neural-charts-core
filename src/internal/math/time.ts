import { invalid, ok, notifyTickFallback } from '../diagnostics.js';
import type { Result, DevelopmentNoticeSink } from '../diagnostics.js';
import type { Domain, DomainPlan, Extent } from './domain.js';
import { createLinearScale } from './linear.js';
import type { LinearScale } from './linear.js';
import { enumerateUtc, isTimestamp, MAX_DATE, MIN_DATE, UTC_INTERVALS } from './utc.js';
import type { UtcInterval } from './utc.js';
export type TimeScale = LinearScale;
export type TimeTickPlan = Readonly<{ domain: Domain; ticks: readonly number[]; interval: UtcInterval | null; fallback: boolean }>;
export type TimeTickOptions = Readonly<{ targetCount?: number; nice: boolean; manual?: readonly number[] }>;
export function timeExtent(values: readonly (number | null)[]): Extent {
  let lo = Infinity, hi = -Infinity;
  for (let i=0;i<values.length;i++) {
    const v=values[i]; if(v===null)continue;
    if(!isTimestamp(v))return invalid('INVALID_NUMBER',typeof v==='number'&&Number.isFinite(v)&&!Number.isInteger(v)?'FRACTIONAL_TIMESTAMP':'OUTSIDE_DATE_RANGE',`values[${i}]`);
    lo=Math.min(lo,v);hi=Math.max(hi,v);
  }
  return lo===Infinity?{status:'empty'}:lo===hi?{status:'constant',value:lo===0?0:lo}:{status:'span',domain:Object.freeze([lo,hi])};
}
function validTimeDomain(d: Domain): boolean { return Array.isArray(d)&&d.length===2&&isTimestamp(d[0])&&isTimestamp(d[1])&&d[0]<d[1]; }
export function normalizeTimeDomain(extent: Extent, options: { readonly explicit?: Domain }): DomainPlan {
  if('explicit'in options&&!validTimeDomain(options.explicit!))return invalid('INVALID_DOMAIN','OUTSIDE_DATE_RANGE','explicit');
  if(extent.status==='invalid'||extent.status==='empty'&&!options.explicit)return extent;
  if(options.explicit)return {status:'ok',domain:Object.freeze([...options.explicit])as Domain,source:'explicit',expandedConstant:false};
  if(extent.status==='empty')return extent;
  const d:Domain=extent.status==='constant'?[Math.max(MIN_DATE,extent.value-1000),Math.min(MAX_DATE,extent.value+1000)]:extent.domain;
  if(!validTimeDomain(d))return invalid('INVALID_DOMAIN','OUTSIDE_DATE_RANGE','domain');
  return {status:'ok',domain:Object.freeze([...d])as Domain,source:'auto',expandedConstant:extent.status==='constant'};
}
export function createTimeScale(domain: Domain, range: readonly [number,number], clamp: boolean): Result<TimeScale> {
  if(!validTimeDomain(domain))return invalid('INVALID_DOMAIN','OUTSIDE_DATE_RANGE','domain');
  const s=createLinearScale(domain,range,clamp);if(s.status==='invalid')return s;
  return ok(Object.freeze({...s.value,map:(t:number)=>isTimestamp(t)?s.value.map(t):null,invert:(p:number)=>{const t=s.value.invert(p);return t!==null&&t>=MIN_DATE&&t<=MAX_DATE?t:null;}}));
}
export function selectTimeTicks(domain: Domain, options: TimeTickOptions, noticeSink?: DevelopmentNoticeSink): Result<TimeTickPlan> {
  if(!validTimeDomain(domain))return invalid('INVALID_DOMAIN','OUTSIDE_DATE_RANGE','domain');
  const target='targetCount'in options?options.targetCount:6;
  if(typeof target!=='number'||!Number.isInteger(target)||target<2||target>12)return invalid('INVALID_CONFIG','BAD_TICK_TARGET','targetCount');
  if(typeof options.nice!=='boolean'||('manual'in options&&(!Array.isArray(options.manual)||options.nice)))return invalid('INVALID_CONFIG','BAD_TICK_OPTIONS','ticks');
  const copied=Object.freeze([...domain])as Domain;
  if(options.manual){
    if(!Array.isArray(options.manual)||options.manual.length>200)return invalid('INVALID_CONFIG','RESOURCE_LIMIT','ticks');
    for(let i=0;i<options.manual.length;i++){const t=options.manual[i];if(!isTimestamp(t))return invalid('INVALID_NUMBER','OUTSIDE_DATE_RANGE',`ticks[${i}]`);if(t<domain[0]||t>domain[1]||(i>0&&t<=options.manual[i-1]!))return invalid('INVALID_CONFIG','BAD_MANUAL_TICKS',`ticks[${i}]`);}
    return ok(Object.freeze({domain:copied,ticks:Object.freeze(options.manual.map(t=>t===0?0:t)),interval:null,fallback:false}));
  }
  const ranks={year:0,month:1,week:2,day:3,hour:4,minute:5,second:6,millisecond:7};
  let best:{plan:TimeTickPlan;error:number;expansion:bigint;rank:number;step:number}|undefined;
  for(const interval of UTC_INTERVALS){
    const ticks=enumerateUtc(domain[0],domain[1],interval,options.nice);if(!ticks||ticks.length<2)continue;
    const lo=ticks[0]!,hi=ticks[ticks.length-1]!;
    if(options.nice&&(lo>domain[0]||hi<domain[1]))continue;
    const error=Math.abs(ticks.length-target),expansion=options.nice?BigInt(domain[0])-BigInt(lo)+BigInt(hi)-BigInt(domain[1]):0n,rank=ranks[interval.unit];
    if(!best||error<best.error||(error===best.error&&(expansion<best.expansion||(expansion===best.expansion&&(rank<best.rank||(rank===best.rank&&interval.step>best.step))))))best={plan:Object.freeze({domain:options.nice?Object.freeze([lo,hi]as const):copied,ticks,interval,fallback:false}),error,expansion,rank,step:interval.step};
  }
  if(best)return ok(best.plan);
  const plan=Object.freeze({domain:copied,ticks:copied,interval:null,fallback:true});
  notifyTickFallback(noticeSink);
  return ok(plan);
}
