import { planningFailure } from './diagnostics.js';
import {array,color,fail,number,record,text} from '../internal/data/validation.js';
import {freezePlan} from './input.js';
import {planRanges} from './ranges.js';
import type {PlanBar,PlanBoxplotSpec,PlanCommand,PlanErrorbarSpec,PlanFrame,PlanObservation,PlanOptions,PlanRangeSpec,PlanReference,PlanResult,PlanSeries} from '../public/plan-types.js';

type Five=Readonly<{minimumValue:number;q1Value:number;medianValue:number;q3Value:number;maximumValue:number}>;
type Point=Readonly<{id:string;x:string|number;low:number|null;high:number|null;five?:Five}>;
const key=(seriesId:string,pointId:string)=>JSON.stringify([seriesId,pointId]);

/** Observed summaries only: one source record becomes one box/error interval.
 * Filled boxes encode Q1..Q3, never min..max. Whiskers/caps use real endpoints.
 * Polygon targets are the clipped glyph envelope, not filled range columns.
 */
export function planStatisticalRanges(spec:PlanBoxplotSpec|PlanErrorbarSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  try{
    const input=record(spec,['family','title','description','axes','series','groupGap','barGap','maxBarWidth','whiskerWidth','capWidth'],['family','title','axes','series'],'spec');
    const box=input.family==='boxplot';if(!box&&input.family!=='errorbar')fail('family');
    if(box&&Object.hasOwn(input,'capWidth')||!box&&Object.hasOwn(input,'whiskerWidth'))fail('spec','FAMILY_SPECIFIC_CAP_OPTION');
    const capFraction=box?(Object.hasOwn(input,'whiskerWidth')?number(input.whiskerWidth,'whiskerWidth',0,1):.5):(Object.hasOwn(input,'capWidth')?number(input.capWidth,'capWidth',0,1):1);
    let count=0;const points=new Map<string,Point>(),seriesIds=new Set<string>();
    const series=array(input.series,16,'series').map((raw,i)=>{
      const path='series['+i+']',s=record(raw,['id','name','color','data'],['id','name','data'],path),id=text(s.id,path+'.id',64),name=text(s.name,path+'.name');
      if(seriesIds.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');seriesIds.add(id);
      const pointIds=new Set<string>();
      const data=array(s.data,10000,path+'.data').map((raw,j):Point=>{
        if(++count>10000)fail('series.data','RESOURCE_LIMIT');
        const fields=box?['minimum','q1','median','q3','maximum']:['low','high'],pp=path+'.data['+j+']',p=record(raw,['id','x',...fields],['id','x',...fields],pp),pid=text(p.id,pp+'.id',64);
        if(pointIds.has(pid))fail(pp+'.id','DUPLICATE_POINT_ID');pointIds.add(pid);
        if(typeof p.x!=='string'&&typeof p.x!=='number')fail(pp+'.x');
        const empty=fields.every(field=>p[field]===null);if(!empty&&fields.some(field=>p[field]===null))fail(pp,'COMPLETE_STATISTIC_OR_NULL_TUPLE_REQUIRED');
        const values=empty?[]:fields.map(field=>number(p[field],pp+'.'+field));
        for(let k=1;k<values.length;k++)if(values[k]!<values[k-1]!)fail(pp,'UNORDERED_STATISTIC');
        const point:Point={id:pid,x:p.x as string|number,low:empty?null:values[0]!,high:empty?null:values[values.length-1]!,...(!empty&&box?{five:{minimumValue:values[0]!,q1Value:values[1]!,medianValue:values[2]!,q3Value:values[3]!,maximumValue:values[4]!}}:{})};
        points.set(key(id,pid),point);return point;
      });
      return {id,name,...(Object.hasOwn(s,'color')?{color:color(s.color,path+'.color')}:{}),data:data.map(p=>({id:p.id,x:p.x,low:p.low,high:p.high}))};
    });
    const adapted={family:'columnrange',title:input.title,...(Object.hasOwn(input,'description')?{description:input.description}:{}),axes:input.axes,series,...Object.fromEntries(['groupGap','barGap','maxBarWidth'].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]))} as PlanRangeSpec;
    const planned=planRanges(adapted,options,references,(frame,context):PlanFrame=>{
      const {plot,mapY,slots}=context,top=plot.y,bottom=plot.y+plot.height,left=plot.x,right=plot.x+plot.width;
      const ownedSeries=new Map<string,{commands:PlanCommand[];bars:PlanBar[]}>(),observations:PlanObservation[]=[];
      const bySlot=new Map(slots.map(slot=>[key(slot.seriesId,slot.pointId),slot]));
      for(const s of frame.series)ownedSeries.set(s.id,{commands:[],bars:[]});
      for(const observation of frame.observations){
        const id=key(observation.id.seriesId,observation.id.pointId),point=points.get(id)!,slot=bySlot.get(id)!;
        const paint=ownedSeries.get(observation.id.seriesId)!,x=slot.center,capLeft=Math.max(left,x-slot.width*capFraction/2),capRight=Math.min(right,x+slot.width*capFraction/2);
        const commandStart=paint.commands.length,barStart=paint.bars.length;
        const minimum=mapY(point.low!)!,maximum=mapY(point.high!)!,visibleTop=Math.max(top,Math.min(minimum,maximum)),visibleBottom=Math.min(bottom,Math.max(minimum,maximum));
        const vertical=(at:number,a:number,b:number)=>{
          if(at<left||at>right||Math.max(a,b)<top||Math.min(a,b)>bottom)return;
          const y1=Math.max(top,Math.min(bottom,a)),y2=Math.max(top,Math.min(bottom,b));if(y1!==y2)paint.commands.push({type:'M',x:at,y:y1},{type:'L',x:at,y:y2});
        };
        const horizontal=(y:number,x1:number,x2:number)=>{if(y>=top&&y<=bottom&&x2>x1)paint.commands.push({type:'M',x:x1,y},{type:'L',x:x2,y});};
        let value=observation.value,anchorY=observation.y;
        if(box){
          const five=point.five!,q1=mapY(five.q1Value)!,q3=mapY(five.q3Value)!,median=mapY(five.medianValue)!;
          const boxTop=Math.max(top,Math.min(q1,q3)),boxBottom=Math.min(bottom,Math.max(q1,q3));
          if(boxBottom>boxTop)paint.bars.push({pointId:point.id,x:slot.left,y:boxTop,width:slot.right-slot.left,height:boxBottom-boxTop});
          vertical(x,minimum,q1);vertical(x,q3,maximum);
          vertical(x-slot.width/2,q1,q3);vertical(x+slot.width/2,q1,q3);horizontal(q1,slot.left,slot.right);if(q3!==q1)horizontal(q3,slot.left,slot.right);horizontal(median,slot.left,slot.right);
          value=five.medianValue;anchorY=Math.max(top,Math.min(bottom,median));
        }else vertical(x,minimum,maximum);
        if(capFraction>0){horizontal(minimum,capLeft,capRight);if(maximum!==minimum)horizontal(maximum,capLeft,capRight);}
        let targetLeft=box?slot.left:capLeft,targetRight=box?slot.right:capRight,targetTop=visibleTop,targetBottom=visibleBottom;
        const painted=paint.commands.length>commandStart||paint.bars.length>barStart;
        // A real horizontal/vertical stroke has a finite selectable envelope.
        // Only collapsed painted dimensions gain a one-unit stroke margin;
        // fully invisible zero intervals never acquire an invented target.
        if(painted&&targetRight<=targetLeft){targetLeft=Math.max(left,x-1);targetRight=Math.min(right,x+1);}
        if(painted&&targetBottom<=targetTop){targetTop=Math.max(top,visibleTop-1);targetBottom=Math.min(bottom,visibleBottom+1);}
        const hit:PlanObservation['hit']=painted&&targetBottom>targetTop&&targetRight>targetLeft?{type:'polygon',vertices:[{x:targetLeft,y:targetTop},{x:targetRight,y:targetTop},{x:targetRight,y:targetBottom},{x:targetLeft,y:targetBottom}]}:undefined;
        const {hit:_oldHit,...semantic}=observation;
        observations.push({...semantic,value,x:Math.max(left,Math.min(right,x)),y:anchorY,...(point.five??{}),...(hit?{hit}:{})});
      }
      const glyphs:PlanSeries[]=frame.series.map(s=>({id:s.id,name:s.name,color:s.color,commands:ownedSeries.get(s.id)!.commands,...(box?{bars:ownedSeries.get(s.id)!.bars}:{})}));
      return {...frame,family:box?'boxplot':'errorbar',series:glyphs,observations};
    });
    // Empty source tables do not invoke the geometry callback, but still retain
    // their real public family and legend instead of leaking the range adapter.
    return planned.status==='invalid'?planned:freezePlan({...planned,frame:{...planned.frame,family:box?'boxplot':'errorbar'}});
  }catch(error){return planningFailure(error);}
}
