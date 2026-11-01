import type {StackCategory,StackPoint} from '../stacked/stack.js';
import type {PlanAnnotation} from '../public/plan-types.js';

/** Exposes already calculated totals and their projected anchors; never resums data. */
export function planStackLabels(rows:Iterable<StackCategory<StackPoint>>,mode:'sum'|'percent',domain:readonly[number,number],coordinate:(id:string)=>number|null,mapValue:(value:number)=>number|null,horizontal=false):readonly PlanAnnotation[]{
  const labels:PlanAnnotation[]=[];
  for(const row of rows){
    if(!row.complete)continue;
    const center=coordinate(row.id);if(center===null)continue;
    const totals=mode==='percent'?(row.percentageDefined?[{value:100,sign:'positive' as const}]:[]):[...(row.positive!==null&&row.positive>0?[{value:row.positive,sign:'positive' as const}]:[]),...(row.negative<0?[{value:row.negative,sign:'negative' as const}]:[])];
    for(const total of totals){
      if(total.value<domain[0]||total.value>domain[1]||labels.length>=64)continue;
      const endpoint=mapValue(total.value);if(endpoint===null)continue;
      labels.push({x:horizontal?endpoint:center,y:horizontal?center:endpoint,text:String(total.value),role:'label',stackTotal:{...total,...(mode==='percent'?{percentage:true as const}:{})}});
    }
  }
  return labels;
}
