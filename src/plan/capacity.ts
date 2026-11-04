import type {PlanOptions} from '../public/plan-types.js';
export const MAX_PLAN_CATEGORIES = 10000;
/** Existing default limits remain unchanged. Larger trusted datasets are explicit and bounded. */
export function planCapacity(value:PlanOptions['capacity']) {
  if(value!==undefined&&(!value||typeof value!=='object'||Object.keys(value).some(k=>!['points','categories'].includes(k))))throw Error('BAD_CAPACITY');
  const points=value?.points??10000,categories=value?.categories??64;
  if(!Number.isInteger(points)||points<1||points>100000||!Number.isInteger(categories)||categories<1||categories>MAX_PLAN_CATEGORIES)throw Error('BAD_CAPACITY');
  return {points,categories,nodes:Math.max(200000,points*8+categories*5),characters:Math.max(1000000,points*128)};
}
