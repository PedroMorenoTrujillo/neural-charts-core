export type NullableValues=readonly(number|null)[];
export function movingAverage(values:NullableValues,period:number,mode:'simple'|'exponential'|'wilder'='simple'):(number|null)[]{
  const out:(number|null)[]=Array(values.length).fill(null);let count=0,mean=0,previous:number|null=null;
  for(let i=0;i<values.length;i++){const v=values[i];if(v===null||v===undefined){count=0;mean=0;previous=null;continue;}
    if(count<period){count++;mean+=(v-mean)/count;if(count===period)out[i]=previous=mean;continue;}
    if(mode==='simple'){const old=values[i-period]!;mean+=(v-old!)/period;out[i]=mean;}
    else {previous=previous!+(v-previous!)*(mode==='wilder'?1/period:2/(period+1));out[i]=previous;}
  }return out;
}
export function weightedAverage(values:NullableValues,period:number):(number|null)[]{
  const out:(number|null)[]=Array(values.length).fill(null),denominator=period*(period+1)/2;let count=0,sum=0,weighted=0;
  for(let i=0;i<values.length;i++){const v=values[i];if(v===null||v===undefined){count=0;sum=weighted=0;continue;}if(count<period){count++;sum+=v;weighted+=v*count;if(count===period)out[i]=weighted/denominator;}else {weighted=weighted-sum+v*period;sum+=v-values[i-period]!;out[i]=weighted/denominator;}}return out;
}
/** Monotonic deque, each observation enters/leaves once. Latest equal extreme wins. */
export function extrema(values:NullableValues,period:number,maximum:boolean):{values:(number|null)[];indices:(number|null)[]}{
  const out:(number|null)[]=Array(values.length).fill(null),indices:(number|null)[]=Array(values.length).fill(null),deque:number[]=[];let head=0,start=0;
  for(let i=0;i<values.length;i++){const v=values[i];if(v===null||v===undefined){deque.length=0;head=0;start=i+1;continue;}while(deque.length>head&&(maximum?values[deque.at(-1)!]!<=v:values[deque.at(-1)!]!>=v))deque.pop();deque.push(i);while(head<deque.length&&deque[head]!<=i-period)head++;if(i-start+1>=period){indices[i]=deque[head]!;out[i]=values[deque[head]!]!;}if(head>1024&&head*2>deque.length){deque.splice(0,head);head=0;}}return {values:out,indices};
}
export function rollingDeviation(values:NullableValues,period:number):(number|null)[]{
  if(period===1)return values.map(value=>value===null?null:0);
  const out:(number|null)[]=Array(values.length).fill(null);let count=0,mean=0,m2=0;
  for(let i=0;i<values.length;i++){const v=values[i];if(v===null||v===undefined){count=0;mean=m2=0;continue;}if(count===period){const old=values[i-period]!,nextMean=mean+(mean-old!)/(period-1);m2-=(old!-mean)*(old!-nextMean);mean=nextMean;count--;}
    count++;const delta=v-mean;mean+=delta/count;m2+=delta*(v-mean);if(count===period)out[i]=Math.sqrt(Math.max(0,m2/(period-1||1)));}return out;
}
/** Absolute deviation about each rolling mean, O(n log n) using a Fenwick tree. */
export function meanAbsoluteDeviation(values:NullableValues,period:number):(number|null)[]{
  const coordinates=[...new Set(values.filter((v):v is number=>v!==null))].sort((a,b)=>a-b),ranks=new Map(coordinates.map((v,i)=>[v,i+1])),counts=Array(coordinates.length+1).fill(0) as number[],sums=Array(coordinates.length+1).fill(0) as number[],out:(number|null)[]=Array(values.length).fill(null);
  const add=(value:number,direction:number)=>{for(let k=ranks.get(value)!;k<counts.length;k+=k&-k){counts[k]!+=direction;sums[k]!+=value*direction;}};
  const prefix=(rank:number)=>{let count=0,sum=0;for(let k=rank;k>0;k-=k&-k){count+=counts[k]!;sum+=sums[k]!;}return {count,sum};};
  let count=0,sum=0,start=0;
  for(let i=0;i<values.length;i++){const value=values[i];if(value===null||value===undefined){for(let j=start;j<i;j++)if(values[j]!==null)add(values[j]!, -1);count=0;sum=0;start=i+1;continue;}add(value,1);sum+=value;count++;if(count>period){const old=values[i-period]!;add(old!,-1);sum-=old!;count--;start=i-period+1;}if(count===period){const mean=sum/period;let lo=0,hi=coordinates.length;while(lo<hi){const mid=(lo+hi)>>>1;if(coordinates[mid]!<=mean)lo=mid+1;else hi=mid;}const lower=prefix(lo);out[i]=(mean*lower.count-lower.sum+(sum-lower.sum)-mean*(period-lower.count))/period;}}return out;
}
export function regression(values:NullableValues,period:number,coordinates?:readonly number[]):{fit:(number|null)[];slope:(number|null)[];intercept:(number|null)[]}{
  if(coordinates){const fit:(number|null)[]=Array(values.length).fill(null),slope=[...fit],intercept=[...fit];let n=0,sx=0,sy=0,sxx=0,sxy=0;for(let i=0;i<values.length;i++){const v=values[i],x=coordinates[i]!;if(v===null||v===undefined){n=0;sx=sy=sxx=sxy=0;continue;}if(n===period){const j=i-period,old=values[j]!,ox=coordinates[j]!;sx-=ox;sy-=old!;sxx-=ox*ox;sxy-=ox*old!;n--;}n++;sx+=x;sy+=v;sxx+=x*x;sxy+=x*v;if(n===period){const d=n*sxx-sx*sx,m=d?(n*sxy-sx*sy)/d:0,b=(sy-m*sx)/n;fit[i]=b+m*x;slope[i]=m;intercept[i]=b+m*coordinates[i-period+1]!;}}return {fit,slope,intercept};}
  const fit:(number|null)[]=Array(values.length).fill(null),slope=[...fit],intercept=[...fit],sx=period*(period-1)/2,sxx=period*(period-1)*(2*period-1)/6,denominator=period*sxx-sx*sx;let n=0,sy=0,sxy=0;
  for(let i=0;i<values.length;i++){const v=values[i];if(v===null||v===undefined){n=0;sy=sxy=0;continue;}if(n<period){sxy+=n*v;sy+=v;n++;}else {const old=values[i-period]!;sxy-=sy-old!;sxy+=(period-1)*v;sy+=v-old!;}if(n===period){const m=denominator?(period*sxy-sx*sy)/denominator:0,b=(sy-m*sx)/period;slope[i]=m;intercept[i]=b;fit[i]=b+m*(period-1);}}return {fit,slope,intercept};
}
