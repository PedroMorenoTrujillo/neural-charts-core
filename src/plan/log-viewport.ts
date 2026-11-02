import type {PlanViewportState,PlanViewportValue,PlanViewportIntent,PlanViewportResult,PlanViewportAxis} from '../public/plan-types.js';
import type {Domain} from '../internal/math/domain.js';
import {checkedLogDomain,logDistance,logValue} from './log-scale.js';
type Transformer=(state:PlanViewportState,intent:PlanViewportIntent)=>PlanViewportResult;
type MutableWindow={-readonly [K in keyof PlanViewportValue]:Exclude<PlanViewportValue[K],undefined>};
export function transformLogViewport(state:PlanViewportState,intent:PlanViewportIntent,transform:Transformer):PlanViewportResult{
 try{
  const bounds={...state.bounds},displayed={...state.displayed},value:MutableWindow={...state.value};
  const originals=new Map<'x'|'y',Readonly<{domain:Domain;origin:number;encoded:Domain;shown:Domain;shownHigh:number}>>();
  for(const axis of ['x','y'] as const){const current=bounds[axis];if(current.kind!=='log')continue;
   if(Object.keys(current).some(key=>!['kind','base','domain'].includes(key))||current.base!==10)throw Error('BAD_LOG_VIEWPORT_AXIS');
   const domain=checkedLogDomain(current.domain),shown=checkedLogDomain(displayed[axis]),expected=value[axis]===undefined?domain:checkedLogDomain(value[axis]);
   if(shown[0]!==expected[0]||shown[1]!==expected[1])throw Error('INCONSISTENT_LOG_VIEWPORT');
   const origin=shown[0],encoded:Domain=[logDistance(origin,domain[0]),logDistance(origin,domain[1])];originals.set(axis,{domain,origin,encoded,shown,shownHigh:logDistance(origin,shown[1])});
   bounds[axis]={kind:'linear',domain:encoded};
   const encode=(raw:unknown):Domain=>{const pair=checkedLogDomain(raw);if(pair[0]<domain[0]||pair[1]>domain[1])throw Error('LOG_WINDOW_OUTSIDE_DOMAIN');return [logDistance(origin,pair[0]),logDistance(origin,pair[1])];};
   if(displayed[axis])displayed[axis]=encode(displayed[axis]);else throw Error('BAD_LOG_DISPLAYED_DOMAIN');
   if(value[axis]!==undefined)value[axis]=encode(value[axis]);
  }
  const result=transform({...state,bounds,displayed,value},intent);if(result.status==='invalid')return result;
  const decoded:MutableWindow={...result.value};
  for(const [axis,{domain,origin,encoded,shown,shownHigh}]of originals){const raw=decoded[axis];if(raw===undefined)continue;if(!Array.isArray(raw))throw Error('BAD_LOG_VIEWPORT_AXIS');
   const convert=(local:number)=>local<=encoded[0]?domain[0]:local>=encoded[1]?domain[1]:local===0?shown[0]:local===shownHigh?shown[1]:Math.max(domain[0],Math.min(domain[1],logValue(origin,local)));
   decoded[axis]=checkedLogDomain([convert(raw[0]),convert(raw[1])]);
  }
  return {status:'ok',value:decoded};
 }catch(error){return {status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_LOG_VIEWPORT',path:'viewport',message:error instanceof Error?error.message:'Invalid log viewport.'}};}
}
export function logViewportAxis(domain:Domain):PlanViewportAxis{return {kind:'log',base:10,domain};}
