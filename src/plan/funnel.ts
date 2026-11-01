import {array,choice,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan} from './input.js';
import type {PlanCommand,PlanFunnelSpec,PlanObservation,PlanOptions,PlanPyramidSpec,PlanResult,PlanSeries} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;

/**
 * Section HEIGHT encodes the share of the visible values; polygon area does not.
 * Source order is always top-to-bottom. Reversal reflects only the envelope:
 * funnel defaults to a bottom neck, pyramid defaults to an apex at the top.
 * Neck dimensions are fractions of the plot, not pixels. A full-height neck is
 * a rectangle; a zero-width full-height neck has no drawable area or hit target.
 */
export function planFunnel(spec:PlanFunnelSpec|PlanPyramidSpec,options:PlanOptions):PlanResult{
  try{
    const input=record(spec,['family','title','description','data','reversed','neckWidth','neckHeight'],['family','title','data'],'spec');
    const family=choice(input.family,['funnel','pyramid'],'family');
    if(family==='pyramid'&&(Object.hasOwn(input,'neckWidth')||Object.hasOwn(input,'neckHeight')))fail('spec','PYRAMID_HAS_NO_NECK');
    const title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',4096,true):'';
    if(Object.hasOwn(input,'reversed')&&typeof input.reversed!=='boolean')fail('reversed');
    const reversed=(input.reversed??(family==='pyramid')) as boolean;
    const neckWidth=family==='pyramid'?0:Object.hasOwn(input,'neckWidth')?number(input.neckWidth,'neckWidth',0,1):.3;
    const neckHeight=family==='pyramid'?0:Object.hasOwn(input,'neckHeight')?number(input.neckHeight,'neckHeight',0,1):.25;
    const opts=record(options,['width','height','hiddenSeriesIds','stacking','viewport','references'],['width','height'],'options');
    const width=number(opts.width,'options.width',64,10000),height=number(opts.height,'options.height',64,10000);
    for(const key of ['stacking','viewport','references'])if(Object.hasOwn(opts,key))fail('options.'+key,'UNSUPPORTED_'+key.toUpperCase());
    const hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,16,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];
    if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const ids=new Set<string>(),palette=defaultPalette('light',false).series;
    const data=array(input.data,16,'data').map((raw,i)=>{
      const path='data['+i+']',p=record(raw,['id','label','value','color'],['id','label','value'],path);
      const id=text(p.id,path+'.id',128);if(ids.has(id))fail(path+'.id','DUPLICATE_ID');ids.add(id);
      return {id,label:text(p.label,path+'.label',1024),value:number(p.value,path+'.value',0),color:Object.hasOwn(p,'color')?color(p.color,path+'.color'):palette[i%palette.length]!};
    });
    if(hidden.some(id=>!ids.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    const visible=data.filter(p=>!hidden.includes(p.id)),maximum=Math.max(0,...visible.map(p=>p.value));
    // Every summand is in [0,1], so even finite MAX_VALUE inputs cannot overflow.
    // Compensated summation also preserves small shares where IEEE-754 permits.
    let total=0,correction=0;
    const sum=(value:number)=>{const term=value-correction,next=total+term;correction=(next-total)-term;total=next;};
    for(const p of visible)sum(maximum===0?0:p.value/maximum);
    const denominator=total;
    let lastPositive=-1;for(const [i,p]of visible.entries())if(p.value>0)lastPositive=i;
    const plot={x:16,y:14,width:width-32,height:height-28},cx=width/2,shoulder=1-neckHeight;
    const halfWidth=(t:number)=>{
      const q=reversed?1-t:t;
      return plot.width/2*(shoulder===0?neckWidth:q>=shoulder?neckWidth:1-(1-neckWidth)*q/shoulder);
    };
    const transition=reversed?neckHeight:shoulder;
    const series:PlanSeries[]=[],observations:PlanObservation[]=[];
    let cursor=0;total=0;correction=0;
    for(const [i,p]of visible.entries()){
      const share=denominator===0?0:(p.value/maximum)/denominator,start=cursor;
      sum(share);cursor=i===lastPositive?1:Math.max(start,Math.min(1,total));
      const end=cursor;
      // A zero-width neck is a line, not part of the painted polygon. Clip it
      // out rather than leaving a retraced centre-line spur in the hit shape.
      const shapeStart=neckWidth===0&&reversed?Math.max(start,neckHeight):start;
      const shapeEnd=neckWidth===0&&!reversed?Math.min(end,shoulder):end;
      const levels=shapeEnd>shapeStart?[shapeStart,...(shapeStart<transition&&transition<shapeEnd?[transition]:[]),shapeEnd]:[];
      const raw=[...levels.map(t=>({x:cx-halfWidth(t),y:plot.y+t*plot.height})),...[...levels].reverse().map(t=>({x:cx+halfWidth(t),y:plot.y+t*plot.height}))];
      const vertices:Vertex[]=raw.filter((p,j)=>j===0||p.x!==raw[j-1]!.x||p.y!==raw[j-1]!.y);
      if(vertices.length>1&&vertices[0]!.x===vertices.at(-1)!.x&&vertices[0]!.y===vertices.at(-1)!.y)vertices.pop();
      // A positive value may still underflow to a zero-height/zero-width shape.
      // Keep its semantic observation, but never invent an invisible tap target.
      const origin=vertices[0];let twiceArea=0;
      if(origin)for(let j=1;j<vertices.length-1;j++){const a=vertices[j]!,b=vertices[j+1]!;twiceArea+=(a.x-origin.x)*(b.y-origin.y)-(a.y-origin.y)*(b.x-origin.x);}
      const hasArea=Math.abs(twiceArea)>0;
      const commands:PlanCommand[]=hasArea?[...vertices.map((v,j):PlanCommand=>({kind:j?'L':'M',...v})),{kind:'Z'}]:[];
      series.push({id:p.id,name:p.label,color:p.color,commands,fill:true});
      observations.push({id:{seriesId:p.id,pointId:p.id},label:p.label,seriesName:title,value:p.value,...(denominator>0?{percentage:share*100}:{}),x:cx,y:plot.y+(hasArea?shapeStart+(shapeEnd-shapeStart)/2:start+(end-start)/2)*plot.height,color:p.color,...(hasArea?{hit:{kind:'polygon' as const,vertices}}:{})});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family,title,description,unit:'',width,height,legend:data.map(p=>({id:p.id,name:p.label,color:p.color,visible:!hidden.includes(p.id)})),series,observations,grid:[],labels:[]}});
  }catch(error){
    return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};
  }
}
