import { invalidPlan } from './diagnostics.js';
import type {PlanFinancialSpec,PlanFinancialPoint,PlanFinancialSeries,PlanFinancialParameters,PlanFinancialValue} from '../public/financial-plan-types.js';
import type {PlanOptions,PlanResult,PlanFrame,PlanSeries,PlanObservation,PlanCommand,PlanBar,PlanCircle,PlanLineSpec} from '../public/plan-types.js';
import {financialFamilies,financialParameterKeys} from '../public/financial-plan-types.js';
import {planCartesianChart} from './cartesian.js';
import {ownPlanInput,freezePlan} from './input.js';
import {planCapacity} from './capacity.js';
import {financialIndicators,type FinancialCalculation} from './financial-indicators.js';
import {createLinearScale} from '../internal/math/linear.js';
import {defaultPalette} from '../internal/chart/presentation.js';

const rawFamilies=new Set(['ohlc','hlc','candlestick','hollowcandlestick','heikinashi','renko','pointandfigure','flags','vbp']);
function validate(spec:PlanFinancialSpec,options:PlanOptions):void {
  const capacity=planCapacity(options.capacity);
  if(!spec||!financialFamilies.includes(spec.family)||typeof spec.title!=='string'||!spec.axes||!spec.axes.x||!['time','linear'].includes(spec.axes.x.type)||!spec.axes.y||spec.axes.y.type!=='linear')throw Error('BAD_FINANCIAL_SPEC');
  if(Object.keys(spec).some(k=>!['family','title','description','axes','series','parameters'].includes(k))||!Array.isArray(spec.series)||spec.series.length>16)throw Error('BAD_FINANCIAL_SPEC');
  let count=0;const ids=new Set<string>();
  for(const s of spec.series){if(!s||typeof s.id!=='string'||!s.id||s.id.length>64||typeof s.name!=='string'||ids.has(s.id)||!Array.isArray(s.data)||Object.keys(s).some(k=>!['id','name','data','color'].includes(k)))throw Error('BAD_FINANCIAL_SERIES');ids.add(s.id);let previous=-Infinity;const points=new Set<string>();
    for(const p of s.data){if(++count>capacity.points)throw Error('INPUT_LIMIT');if(!p||typeof p.id!=='string'||!p.id||p.id.length>64||points.has(p.id)||!Number.isFinite(p.x)||p.x<=previous||Object.keys(p).some(k=>!['id','x','open','high','low','close','volume','title','text'].includes(k)))throw Error('BAD_FINANCIAL_POINT');previous=p.x;points.add(p.id);
      if(spec.axes.x.type==='time'&&(!Number.isInteger(p.x)||Math.abs(p.x)>8.64e15))throw Error('OUTSIDE_DATE_RANGE');
      const values=[p.open,p.high,p.low,p.close];if(values.some(v=>v!==null&&!Number.isFinite(v))||values.some(v=>v===null)&&!values.every(v=>v===null))throw Error('BAD_OHLC');
      if(p.close!==null&&(p.high!<Math.max(p.open!,p.close)||p.low!>Math.min(p.open!,p.close)||p.high!<p.low!))throw Error('BAD_OHLC_RANGE');
      if(p.volume!==undefined&&p.volume!==null&&(!Number.isFinite(p.volume)||p.volume<0))throw Error('BAD_VOLUME');
      for(const key of ['title','text'] as const)if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key]!.length>4096))throw Error('BAD_FINANCIAL_TEXT');
    }
  }
  const parameters=spec.parameters??{};
  if(Object.keys(parameters).some(k=>!financialParameterKeys[spec.family].includes(k as keyof PlanFinancialParameters)))throw Error('UNSUPPORTED_FINANCIAL_PARAMETER');
  for(const k of ['period','shortPeriod','longPeriod','signalPeriod','reversal'] as const){const v=parameters[k];if(v!==undefined&&(!Number.isInteger(v)||v<1||v>4096))throw Error('BAD_FINANCIAL_PERIOD');}
  for(const k of ['multiplier','deviation','boxSize','threshold','xUnit'] as const){const v=parameters[k];if(v!==undefined&&(!Number.isFinite(v)||v<0||(k==='boxSize'||k==='xUnit')&&v===0))throw Error('BAD_FINANCIAL_PARAMETER');}
  if(parameters.index!==undefined&&!['open','high','low','close'].includes(parameters.index))throw Error('BAD_FINANCIAL_INDEX');
  const hidden=options.hiddenSeriesIds??[];if(hidden.some(id=>!ids.has(id)))throw Error('UNKNOWN_SERIES');
}
function heikin(data:readonly PlanFinancialPoint[]):PlanFinancialPoint[]{
  let previous:PlanFinancialPoint|undefined;return data.map(p=>{if(p.close===null){previous=undefined;return p;}const close=p.open!/4+p.high!/4+p.low!/4+p.close/4,open=previous?previous.open!/2+previous.close!/2:p.open!/2+p.close/2;return previous={...p,open,close,high:Math.max(p.high!,open,close),low:Math.min(p.low!,open,close)};});
}
interface DerivedPoint extends PlanFinancialPoint {readonly original?:PlanFinancialPoint;readonly symbols?:readonly number[];}
function bricks(data:readonly PlanFinancialPoint[],parameters:PlanFinancialParameters,limit:number):DerivedPoint[]{
  const finite=data.filter(p=>p.close!==null);if(!finite.length)return [];const highs=finite.map(p=>p.high!),lows=finite.map(p=>p.low!),size=parameters.boxSize??Math.max((Math.max(...highs)-Math.min(...lows))/20,1e-6);if(!Number.isFinite(size)||size<=0)throw Error('BAD_BOX_SIZE');
  let previous=finite[0]!.close!;const out:DerivedPoint[]=[];
  for(const p of data){if(p.close===null)continue;let ordinal=0;while(Math.abs(p.close-previous)>=size){if(out.length>=limit)throw Error('DERIVED_POINT_LIMIT');const next=previous+Math.sign(p.close-previous)*size;if(next===previous||!Number.isFinite(next))throw Error('UNREPRESENTABLE_FINANCIAL_VALUE');out.push({...p,original:p,id:p.id+':'+ordinal++,open:previous,close:next,high:Math.max(previous,next),low:Math.min(previous,next)});previous=next;}}
  return out;
}
function pointFigure(data:readonly PlanFinancialPoint[],parameters:PlanFinancialParameters,limit:number):DerivedPoint[]{
  const valid=data.filter(p=>p.close!==null);if(!valid.length)return [];let min=Infinity,max=-Infinity;for(const p of valid){min=Math.min(min,p.low!);max=Math.max(max,p.high!);}const box=parameters.boxSize??Math.max((max-min)/20,1e-6),reversal=parameters.reversal??3;
  const columns:DerivedPoint[]=[],levels:number[][]=[];let anchor=valid[0]!.close!,direction=0,boxes=0;
  const append=(p:PlanFinancialPoint,target:number,sign:number,newColumn:boolean)=>{let list=levels.at(-1);if(newColumn||!list){list=[];levels.push(list);columns.push({...p,id:p.id+':'+columns.length,original:p,open:anchor,high:anchor,low:anchor,close:anchor,symbols:list});}while(sign>0?anchor+box<=target:anchor-box>=target){if(++boxes>limit)throw Error('DERIVED_POINT_LIMIT');const next=anchor+sign*box;if(next===anchor||!Number.isFinite(next))throw Error('UNREPRESENTABLE_FINANCIAL_VALUE');anchor=next;list.push(anchor);}const c=columns.at(-1)!;columns[columns.length-1]={...c,close:anchor,high:Math.max(c.high!,anchor),low:Math.min(c.low!,anchor)};};
  for(const p of data){if(p.close===null){direction=0;continue;}if(direction===0){if(Math.abs(p.close-anchor)>=box){direction=Math.sign(p.close-anchor);append(p,p.close,direction,true);}}else if(direction>0?p.close>=anchor+box:p.close<=anchor-box)append(p,p.close,direction,false);else if(direction>0?p.close<=anchor-reversal*box:p.close>=anchor+reversal*box){direction=-direction;append(p,p.close,direction,true);}}
  return columns.filter(column=>column.symbols?.length);
}
interface Computed {source:PlanFinancialSeries;points:readonly DerivedPoint[];calculation?:FinancialCalculation;}
function financialXAxis(spec:PlanFinancialSpec,coordinates:readonly number[],ordinal:boolean,padded:boolean):PlanFinancialSpec['axes']['x']{
  const axis:PlanFinancialSpec['axes']['x']=ordinal?{type:'linear'}:spec.axes.x;
  if(!padded||axis.domain!==undefined||coordinates.length<2)return axis;
  let gap=Infinity;for(let i=1;i<coordinates.length;i++)gap=Math.min(gap,coordinates[i]!-coordinates[i-1]!);
  let minimum=coordinates[0]!-gap/2,maximum=coordinates.at(-1)!+gap/2;
  if(axis.type==='time'){minimum=Math.max(-8.64e15,Math.floor(minimum));maximum=Math.min(8.64e15,Math.ceil(maximum));}
  return Number.isFinite(minimum)&&Number.isFinite(maximum)&&minimum<maximum?{...axis,domain:[minimum,maximum]}:axis;
}
function volumeProfile(spec:PlanFinancialSpec,options:PlanOptions):PlanResult {
  const bins=spec.parameters?.period??12;if(bins>256)return invalidPlan('VOLUME_PROFILE_BIN_LIMIT');
  const all=spec.series.flatMap(s=>s.data).filter(p=>p.close!==null);if(all.some(p=>p.volume===undefined))return invalidPlan('VOLUME_REQUIRED');
  let min=Infinity,max=-Infinity;for(const p of all){min=Math.min(min,p.low!);max=Math.max(max,p.high!);}if(!all.length){min=0;max=1;}if(min===max){min-=.5;max+=.5;}
  const step=(max-min)/bins,categories=Array.from({length:bins},(_,i)=>({id:'price-'+i,label:String(min+step*i)+'–'+String(min+step*(i+1))}));
  const series=spec.series.map(s=>{const values=Array(bins).fill(0) as number[];for(const p of s.data)if(p.close!==null&&p.volume!==null){const price=p.high!/3+p.low!/3+p.close/3,index=Math.max(0,Math.min(bins-1,Math.floor((price-min)/step)));values[index]!+=p.volume??0;}return {id:s.id,name:s.name,...(s.color?{color:s.color}:{}),data:values.map((y,i)=>({id:'price-'+i,x:'price-'+i,y}))};});
  const result=planCartesianChart({family:'column',title:spec.title,...(spec.description?{description:spec.description}:{}),axes:{x:{type:'category',values:categories},y:{type:'linear'}},orientation:'horizontal',series},{...options,capacity:{...options.capacity,categories:Math.max(bins,options.capacity?.categories??64)}});
  return result.status==='invalid'?result:freezePlan({...result,frame:{...result.frame,family:spec.family,financial:{layout:'volume-profile' as const}}});
}

/** Public, pure financial planner. Domain/scales/ticks reuse the Cartesian owner. */
export function planFinancialChart(input:PlanFinancialSpec,configuration:PlanOptions):PlanResult {
  try {
    const options=ownPlanInput(configuration) as PlanOptions,capacity=planCapacity(options.capacity),spec=ownPlanInput(input,capacity) as PlanFinancialSpec;
    if(Object.keys(options).some(k=>!['width','height','viewport','hiddenSeriesIds','references','referenceBands','capacity'].includes(k)))return invalidPlan('UNSUPPORTED_FINANCIAL_OPTION','options');
    validate(spec,options);if(spec.family==='vbp')return volumeProfile(spec,options);
    const hidden=new Set(options.hiddenSeriesIds??[]),palette=defaultPalette('light',false).series,computed:Computed[]=spec.series.filter(s=>!hidden.has(s.id)).map(source=>({source,points:spec.family==='heikinashi'?heikin(source.data):spec.family==='renko'?bricks(source.data,spec.parameters??{},capacity.points):spec.family==='pointandfigure'?pointFigure(source.data,spec.parameters??{},capacity.points):source.data,...(!rawFamilies.has(spec.family)?{calculation:financialIndicators(spec.family,source.data,spec.parameters)}:{})}));
    const ordinal=spec.family==='renko'||spec.family==='pointandfigure',grouped=['ohlc','hlc','candlestick','hollowcandlestick','heikinashi','renko','pointandfigure'].includes(spec.family);
    let minimum=Infinity,maximum=-Infinity;const xs=new Set<number>();
    for(const row of computed){for(const [i,p] of row.points.entries()){xs.add(ordinal?i:p.x);if(!row.calculation&&p.close!==null){minimum=Math.min(minimum,p.low!);maximum=Math.max(maximum,p.high!);}}
      if(row.calculation)for(const [key,values] of Object.entries(row.calculation.components))for(const [i,value] of values.entries())if(value!==null){if(!Number.isFinite(value))throw Error('UNREPRESENTABLE_FINANCIAL_VALUE');minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);const shift=row.calculation.shifts?.[key]??0;if(shift){const interval=row.points.length>1?row.points.at(-1)!.x-row.points.at(-2)!.x:1;xs.add(row.points[i+shift]?.x??row.points[i]!.x+shift*interval);}}
    }
    if(Number.isFinite(minimum)&&computed.some(row=>row.calculation?.columns?.length)){minimum=Math.min(0,minimum);maximum=Math.max(0,maximum);}
    const sorted=[...xs].sort((a,b)=>a-b),yAxis={...spec.axes.y,...(spec.axes.y.domain===undefined&&minimum<maximum?{domain:[minimum,maximum] as const}:{})},helper={family:'line' as const,title:spec.title,...(spec.description?{description:spec.description}:{}),axes:{x:financialXAxis(spec,sorted,ordinal,grouped||computed.some(row=>row.calculation?.columns?.length)),y:yAxis},series:[{id:'financial-layout',name:spec.title,data:sorted.map((x,i)=>({id:'x'+i,x,y:Number.isFinite(minimum)?minimum:null}))}]};
    const projected=planCartesianChart(helper as PlanLineSpec,{...options,hiddenSeriesIds:[],viewport:options.viewport??{axes:'xy'},capacity:{...options.capacity,points:Math.max(sorted.length,capacity.points)}});
    if(projected.status==='invalid')return projected;
    const base=projected.frame,legend=spec.series.map((s,i)=>({id:s.id,name:s.name,color:s.color??palette[i%palette.length]!,visible:!hidden.has(s.id)}));
    if(!base.viewport||!Number.isFinite(minimum))return freezePlan({status:'empty',frame:{...base,family:spec.family,legend,series:[],observations:[],financial:{layout:ordinal?'ordinal':rawFamilies.has(spec.family)?'price':'indicator'}}});
    const plot=base.viewport.plot!,xd=base.viewport.displayed.x!,yd=base.viewport.displayed.y!,xScale=createLinearScale(xd,[plot.x,plot.x+plot.width],false),yScale=createLinearScale(yd,base.viewport.reversed.y?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false);
    if(xScale.status==='invalid')return xScale;if(yScale.status==='invalid')return yScale;
    const x=(v:number)=>xScale.value.map(v),y=(v:number)=>yScale.value.map(v),series:PlanSeries[]=[],observations:PlanObservation[]=[];
    let spacing=24;for(let i=1;i<sorted.length;i++)spacing=Math.min(spacing,Math.abs(x(sorted[i]!)!-x(sorted[i-1]!)!));const slotWidth=Math.max(1,Math.min(18,spacing*.7)),width=grouped||computed.some(row=>row.calculation?.columns?.length)?slotWidth/Math.max(1,computed.length)*.85:slotWidth;
    for(const [rank,row] of computed.entries()){
      const color=legend.find(s=>s.id===row.source.id)!.color,commands:PlanCommand[]=[],bars:PlanBar[]=[],circles:PlanCircle[]=[],parts:NonNullable<PlanSeries['parts']>[number][]=[];
      const originals=new Map(row.source.data.map(p=>[p.id,p]));
      if(row.calculation){
        for(const [key,values] of Object.entries(row.calculation.components)){const path:PlanCommand[]=[],columns:PlanBar[]=[];let open=false;for(let i=0;i<values.length;i++){const value=values[i];if(value===null||value===undefined){if(spec.family!=='zigzag'||row.points[i]!.close===null)open=false;continue;}const point=row.points[i]!,shift=row.calculation.shifts?.[key]??0,interval=row.points.length>1?row.points.at(-1)!.x-row.points.at(-2)!.x:1,coordinate=row.points[i+shift]?.x??point.x+shift*interval,px=x(coordinate),py=y(value);if(px===null||py===null){open=false;continue;}
            if(spec.family==='psar'){circles.push({pointId:point.id,cx:px,cy:py,radius:2.5});}
            else if(row.calculation.columns?.includes(key)){const baseline=y(0);if(baseline!==null)columns.push({pointId:point.id,x:px+(rank-(computed.length-1)/2)*slotWidth/Math.max(1,computed.length)-width/2,y:Math.min(py,baseline),width,height:Math.max(1,Math.abs(baseline-py)),direction:value>=0?'rising':'falling'});}
            else {path.push({type:open?'L':'M',x:px,y:py});open=true;}
          }parts.push({key,...(columns.length?{bars:columns}:{}),...(path.length?{commands:path}:{}),...(key!==row.calculation.primary?{dash:'dashed' as const}:{} )});
        }
        if(spec.family==='ikh'){
          const a=row.calculation.components.spanA!,b=row.calculation.components.spanB!,shift=row.calculation.shifts!.spanA!,interval=row.points.length>1?row.points.at(-1)!.x-row.points.at(-2)!.x:1,cloud:PlanCommand[]=[];
          let upper:{x:number;y:number}[]=[],lower:{x:number;y:number}[]=[];
          const flush=()=>{if(upper.length>1){upper.forEach((point,i)=>cloud.push({type:i?'L':'M',...point}));for(let i=lower.length-1;i>=0;i--)cloud.push({type:'L',...lower[i]!});cloud.push({type:'Z'});}upper=[];lower=[];};
          for(let i=0;i<a.length;i++){if(a[i]===null||b[i]===null||a[i]===undefined||b[i]===undefined){flush();continue;}const px=x(row.points[i+shift]?.x??row.points[i]!.x+shift*interval),ay=y(a[i]!),by=y(b[i]!);if(px===null||ay===null||by===null){flush();continue;}upper.push({x:px,y:ay});lower.push({x:px,y:by});}flush();
          if(cloud.length)parts.unshift({key:'cloud',commands:cloud,fill:true,opacity:.14});
        }
      }
      for(const [i,p] of row.points.entries()){
        const value=row.calculation?row.calculation.components[row.calculation.primary]![i]:p.close;if(value===null||value===undefined)continue;
        const center=x(ordinal?i:p.x),px=center===null?null:center+(grouped?(rank-(computed.length-1)/2)*slotWidth/Math.max(1,computed.length):0),py=y(value);if(px===null||py===null)continue;
        if(!row.calculation){const high=y(p.high!),low=y(p.low!),opening=y(p.open!);if(high===null||low===null||opening===null)continue;
          if(spec.family==='ohlc'||spec.family==='hlc') {commands.push({type:'M',x:px,y:high},{type:'L',x:px,y:low});if(spec.family==='ohlc')commands.push({type:'M',x:px-width/2,y:opening},{type:'L',x:px,y:opening});commands.push({type:'M',x:px,y:py},{type:'L',x:px+width/2,y:py});}
          else if(spec.family==='flags'){const flagWidth=Math.max(18,Math.min(64,(p.title?.length??1)*8+12));commands.push({type:'M',x:px,y:py},{type:'L',x:px,y:py-24});bars.push({pointId:p.id,x:px,y:py-38,width:flagWidth,height:16});}
          else if(spec.family==='pointandfigure'){const radius=Math.max(2,width*.3);for(const level of p.symbols??[p.close!]){const yy=y(level);if(yy===null)continue;if(p.close!>=p.open!)commands.push({type:'M',x:px-radius,y:yy-radius},{type:'L',x:px+radius,y:yy+radius},{type:'M',x:px+radius,y:yy-radius},{type:'L',x:px-radius,y:yy+radius});else commands.push({type:'M',x:px+radius,y:yy},{type:'A',radius,largeArc:1,sweep:1,x:px-radius,y:yy},{type:'A',radius,largeArc:1,sweep:1,x:px+radius,y:yy});}}
          else {commands.push({type:'M',x:px,y:high},{type:'L',x:px,y:low});bars.push({pointId:p.id,x:px-width/2,y:Math.min(opening,py),width,height:Math.max(1,Math.abs(opening-py)),direction:p.close!>=p.open!?'rising':'falling',...(spec.family==='hollowcandlestick'&&p.close!>=p.open!?{hollow:true}:{})});}
        }
        if(px>=plot.x&&px<=plot.x+plot.width&&py>=plot.y&&py<=plot.y+plot.height){const raw=p.original??originals.get(p.id)??p,components=row.calculation?Object.fromEntries(Object.entries(row.calculation.components).map(([key,values])=>[key,values[i]??null])):undefined,financial:PlanFinancialValue={open:raw.open,high:raw.high,low:raw.low,close:raw.close,...(raw.volume!==undefined?{volume:raw.volume}:{}),...(components?{components}:{}),...(ordinal?{originalId:raw.id}:{})};observations.push({id:{seriesId:row.source.id,pointId:p.id},seriesName:row.source.name,label:p.title??(spec.axes.x.type==='time'?new Date(p.x).toISOString():String(p.x)),value,x:px,y:py,color,xValue:p.x,group:{key:JSON.stringify(['financial',p.x]),label:String(p.x),coordinate:px},financial});}
      }
      series.push({id:row.source.id,name:row.source.name,color,...(commands.length?{commands}:{}),...(bars.length?{bars}:{}),...(circles.length?{circles}:{}),...(parts.length?{parts}:{} )});void rank;
    }
    const frame:PlanFrame={...base,family:spec.family,legend,series,observations,financial:{layout:ordinal?'ordinal':rawFamilies.has(spec.family)?'price':'indicator'},...(spec.family==='flags'?{annotations:computed.flatMap(row=>row.points.flatMap(p=>p.close===null?[]:[{x:x(p.x)!+10,y:y(p.close)!-26,text:p.title??'•',role:'label' as const}]))}:{})};
    return freezePlan({status:observations.length?'ok':'empty',frame});
  }catch(error){return invalidPlan(error instanceof Error?error.message:'BAD_FINANCIAL_SPEC');}
}
