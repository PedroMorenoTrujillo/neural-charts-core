import type {Domain} from '../internal/math/domain.js';
/** A local logarithmic coordinate preserves adjacent large doubles which can
 * have identical absolute Math.log values. Large ratios never divide first. */
export function logDistance(from:number,to:number):number{
 if(!(from>0&&to>0&&Number.isFinite(from)&&Number.isFinite(to)))throw Error('NONPOSITIVE_LOG_VALUE');
 if(from===to)return 0;
 const delta=to-from,ratio=delta/from;
 return Number.isFinite(ratio)&&ratio>-1?Math.log1p(ratio):Math.log(to)-Math.log(from);
}
export function logValue(origin:number,coordinate:number):number{
 const direct=Math.abs(coordinate)<.5?origin+origin*Math.expm1(coordinate):origin*Math.exp(coordinate);
 const value=Number.isFinite(direct)&&direct>0?direct:Math.exp(Math.log(origin)+coordinate);
 if(!Number.isFinite(value)||value<=0)throw Error('UNREPRESENTABLE_LOG_VALUE');return value;
}
export function checkedLogDomain(value:unknown):Domain{
 if(!Array.isArray(value)||value.length!==2||!value.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||value[0]>=value[1])throw Error('BAD_LOG_DOMAIN');
 return [value[0],value[1]];
}
export function logDomain(values:readonly number[],explicit:Domain|undefined,nice:boolean):Domain|null{
 if(explicit)return checkedLogDomain(explicit);
 if(!values.length)return null;
 let low=Infinity,high=0;for(const value of values){if(!(value>0&&Number.isFinite(value)))throw Error('NONPOSITIVE_LOG_VALUE');low=Math.min(low,value);high=Math.max(high,value);}
 if(low===high){low=Math.max(Number.MIN_VALUE,low/Math.sqrt(10));high=Math.min(Number.MAX_VALUE,high*Math.sqrt(10));}
 if(nice){const a=10**Math.floor(Math.log10(low)),b=10**Math.ceil(Math.log10(high));if(a>0&&Number.isFinite(a))low=a;if(b>0&&Number.isFinite(b))high=b;}
 return checkedLogDomain([low,high]);
}
/** At most target+2 ticks. Values remain original finite positive numbers. */
export function logTicks(domain:Domain,target=5):readonly number[]{
 const [low,high]=checkedLogDomain(domain),span=logDistance(low,high),count=Math.max(2,Math.min(12,Math.round(target))),start=Math.ceil(Math.log10(low)),end=Math.floor(Math.log10(high));
 if(end>=start&&end-start<=2*(count-1)){
  const step=Math.max(1,Math.ceil((end-start+1)/count)),ticks:number[]=[];
  for(let exponent=start;exponent<=end;exponent+=step){const value=10**exponent;if(value>=low&&value<=high&&Number.isFinite(value)&&value>0)ticks.push(value);}
  if(ticks.length>=2)return ticks;
 }
 const values=[low];for(let i=1;i<count-1;i++){const value=logValue(low,span*i/(count-1));if(value>values.at(-1)!&&value<high)values.push(value);}if(high!==values.at(-1))values.push(high);return values;
}
