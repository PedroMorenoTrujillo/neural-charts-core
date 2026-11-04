import type {ChartResult,ChartState} from '../public/chart-types.js';
import type {PlanScatterSpec,PlanBubbleSpec} from '../public/plan-types.js';
import {validateScatter} from '../scatter/validate.js';
import {normalizeScatter,scatterDomains} from '../scatter/data.js';

const must=<T>(result:ChartResult<T>):T=>{if(result.status==='invalid')throw result.diagnostic;return result.value;};
function fail(reason:string,path:string):never{throw {code:'INVALID_CONFIG',reason,path,message:reason};}
/** Optional generic-planner source port. Cartesian imports never retain it. */
export function prepareLogScatter(spec:PlanScatterSpec|PlanBubbleSpec,axes:unknown,state:ChartState) {
  const sizes=new Map<string,{z:number;label:string}>();let maximum=0;const hidden=state.hiddenSeriesIds;
  for(const series of spec.series){
    if(Object.keys(series).some(k=>!['id','name','color','data'].includes(k)))fail('UNKNOWN_OPTION','series');
    for(const p of series.data){
      if(Object.keys(p).some(k=>!(spec.family==='bubble'?['id','x','y','z','label']:['id','x','y']).includes(k)))fail('UNKNOWN_OPTION','series.data');
      const z='z' in p?p.z:0;if(spec.family==='bubble'&&!(typeof z==='number'&&Number.isFinite(z)&&z>=0))fail('BAD_BUBBLE_SIZE','series.data.z');
      const label='label' in p?p.label:undefined;if(label!==undefined&&(typeof label!=='string'||label.length>200))fail('BAD_BUBBLE_LABEL','series.data.label');
      sizes.set(JSON.stringify([series.id,p.id]),{z:z as number,label:label??p.id});if(!hidden.includes(series.id)&&p.x!==null&&p.y!==null)maximum=Math.max(maximum,z as number);
    }
  }
  const input=must(validateScatter({family:'scatter',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),axes,series:spec.series.map(s=>({...s,data:s.data.map((p:PlanScatterSpec['series'][number]['data'][number])=>({id:p.id,x:p.x,y:p.y}))}))}));
  const scatter=must(normalizeScatter(input)),domains=must(scatterDomains(scatter,state));
  return {scatter,domains,sourceAxes:input.axes,sizes,maximum};
}
