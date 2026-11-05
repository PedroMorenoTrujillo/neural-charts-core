import {array,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan,ownPlanInput} from './input.js';
import {fitVennCircles,vennAnchors,type VennCircle} from './venn-math.js';
import type {PlanOptions,PlanObservation,PlanSeries,PlanAnnotation} from '../public/plan-types.js';
import type {PlanVennSpec,PlanVennResult,PlanVennSummary,PlanVennLayout,PlanVennCircle,PlanVennAreaError} from '../public/venn-types.js';

/** Bounded owner for explicitly measured one/two/three-set relations. */
export function planVenn(input:PlanVennSpec,inputOptions:PlanOptions):PlanVennResult{
  try{
    const raw=record(ownPlanInput(input),['family','title','description','sets','data','padding'],['family','title','sets','data'],'spec');
    if(raw.family!=='venn')fail('spec.family','UNSUPPORTED_FAMILY');
    const title=text(raw.title,'spec.title',512,true),description=raw.description===undefined?'':text(raw.description,'spec.description',4096,true),padding=raw.padding===undefined?12:number(raw.padding,'spec.padding',0,64);
    const setIds=new Set<string>(),palette=defaultPalette('light',false).series;
    const sets=array(raw.sets,3,'spec.sets').map((value,index)=>{
      const path='spec.sets['+index+']',set=record(value,['id','label'],['id','label'],path),id=text(set.id,path+'.id',128),label=text(set.label,path+'.label',256);
      if(setIds.has(id))fail(path+'.id','DUPLICATE_ID');setIds.add(id);return {id,label,color:palette[index]!};
    });
    const ids=new Set<string>(),masks=new Set<number>();
    const measures=array(raw.data,7,'spec.data').map((value,index)=>{
      const path='spec.data['+index+']',row=record(value,['id','sets','value'],['id','sets','value'],path),id=text(row.id,path+'.id',128);
      if(ids.has(id))fail(path+'.id','DUPLICATE_ID');ids.add(id);
      const members=array(row.sets,3,path+'.sets').map((item,i)=>{const id=text(item,path+'.sets['+i+']',128);if(!setIds.has(id))fail(path+'.sets['+i+']','UNKNOWN_SET_ID');return id;});
      if(!members.length||new Set(members).size!==members.length)fail(path+'.sets','INVALID_MEMBERSHIP');
      const mask=sets.reduce((mask,set,i)=>members.includes(set.id)?mask|(1<<i):mask,0);
      if(masks.has(mask))fail(path+'.sets','DUPLICATE_MEMBERSHIP');masks.add(mask);
      return {id,mask,members:sets.filter((_,i)=>(mask&(1<<i))!==0).map(set=>set.id),value:row.value===null?null:number(row.value,path+'.value',0),label:sets.filter((_,i)=>(mask&(1<<i))!==0).map(set=>set.label).join(' ∩ ')};
    });
    if(masks.size!==(1<<sets.length)-1)fail('spec.data','EXPLICIT_INTERSECTIONS_REQUIRED');
    const byMask=new Map(measures.map(m=>[m.mask,m])),maximum=Math.max(0,...measures.map(m=>m.value??0));
    // Check all known subsets even when another source measurement is unknown.
    for(const measure of measures)if(measure.value!==null)for(const parent of measures)if(parent.value!==null&&parent.mask!==measure.mask&&(parent.mask&measure.mask)===parent.mask&&measure.value>parent.value)fail('spec.data','INTERSECTION_EXCEEDS_PARENT');
    if(sets.length===3&&maximum>0){
      const v=(mask:number)=>byMask.get(mask)!.value!/maximum;
      for(let bit=1;bit<=4;bit<<=1){const pairs=[3,5,6].filter(mask=>(mask&bit)!==0);if([bit,...pairs,7].every(mask=>byMask.get(mask)!.value!==null)&&v(bit)-v(pairs[0]!)-v(pairs[1]!)+v(7)<-Number.EPSILON*16)fail('spec.data','NEGATIVE_EXCLUSIVE_MEMBERSHIP');}
    }
    const options=record(ownPlanInput(inputOptions),['width','height','hiddenSeriesIds'],['width','height'],'options');
    const width=number(options.width,'options.width',64,10000),height=number(options.height,'options.height',64,10000),hidden=new Set<string>();
    for(const [index,value]of array(options.hiddenSeriesIds??[],3,'options.hiddenSeriesIds').entries()){
      const id=text(value,'options.hiddenSeriesIds['+index+']',128);if(!setIds.has(id))fail('options.hiddenSeriesIds['+index+']','UNKNOWN_SET_ID');if(hidden.has(id))fail('options.hiddenSeriesIds','DUPLICATE_ID');hidden.add(id);
    }
    const visible=sets.map((set,index)=>({...set,index,bit:1<<index})).filter(set=>!hidden.has(set.id));
    const visibleMask=visible.reduce((mask,set)=>mask|set.bit,0),source:PlanVennSummary[]=measures.map(m=>({id:{seriesId:m.members[0]!,pointId:m.id},sets:m.members,label:m.label,value:m.value,visible:(m.mask&visibleMask)===m.mask}));
    const active=measures.filter(m=>(m.mask&visibleMask)===m.mask),scaleValue=Math.max(0,...visible.map(set=>byMask.get(set.bit)!.value??0));
    const unknown=active.some(m=>m.value===null);
    let circles:PlanVennCircle[]=[],errors:PlanVennAreaError[]=[],maxErrorRatio=0,objectiveEvaluations=0,budgetExhausted=false;
    let status:PlanVennLayout['status']=!sets.length?'noSource':!visible.length?'hidden':unknown?'unknown':scaleValue===0?'allZero':'exact';
    const anchors=new Map<number,Readonly<{x:number;y:number;clearance:number}>>();
    if(status==='exact'){
      const globalMask=(local:number)=>visible.reduce((mask,set,index)=>(local&(1<<index))?mask|set.bit:mask,0);
      const targets=Array.from({length:(1<<visible.length)-1},(_,index)=>index+1).filter(mask=>(mask&(mask-1))!==0).map(mask=>({mask,area:byMask.get(globalMask(mask))!.value!/scaleValue}));
      const fit=fitVennCircles(visible.map(set=>byMask.get(set.bit)!.value!/scaleValue),targets);
      maxErrorRatio=fit.maxError;objectiveEvaluations=fit.objectiveEvaluations;budgetExhausted=fit.budgetExhausted;
      if(maxErrorRatio>1e-7)status='approximate';
      const left=Math.min(...fit.circles.map(c=>c.cx-c.radius)),right=Math.max(...fit.circles.map(c=>c.cx+c.radius)),top=Math.min(...fit.circles.map(c=>c.cy-c.radius)),bottom=Math.max(...fit.circles.map(c=>c.cy+c.radius));
      const inset=Math.min(padding,width/4,height/4),scale=Math.min((width-2*inset)/(right-left),(height-2*inset)/(bottom-top));
      const project=(c:VennCircle)=>({cx:width/2+(c.cx-(left+right)/2)*scale,cy:height/2+(c.cy-(top+bottom)/2)*scale,radius:c.radius*scale});
      circles=fit.circles.map((circle,index)=>({...project(circle),id:visible[index]!.id,bit:visible[index]!.bit,value:byMask.get(visible[index]!.bit)!.value!}));
      for(const [mask,point]of vennAnchors(fit.circles))anchors.set(globalMask(mask),{x:width/2+(point.x-(left+right)/2)*scale,y:height/2+(point.y-(top+bottom)/2)*scale,clearance:point.clearance*scale});
      errors=fit.errors.map(error=>({sets:visible.filter((_,i)=>(error.mask&(1<<i))!==0).map(set=>set.id),expected:error.expected*scaleValue,actual:error.actual*scaleValue}));
    }
    const observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
    for(const measure of active){
      if(measure.value===null)continue;
      const anchor=anchors.get(measure.mask),set=sets.find(set=>set.id===measure.members[0])!;
      observations.push({id:{seriesId:set.id,pointId:measure.id},label:measure.label,seriesName:measure.label,value:measure.value,x:anchor?.x??width/2,y:anchor?.y??height/2,color:set.color,
        venn:{type:'inclusive-intersection',sets:measure.members,mask:measure.mask,geometry:anchor?'placed':'omitted'}});
      if(anchor&&anchor.clearance>=10){const size=anchor.clearance*Math.SQRT2;annotations.push({x:anchor.x,y:anchor.y,text:String(measure.value),role:'value',box:{width:size,height:size,seriesId:set.id}});}
    }
    const series:PlanSeries[]=visible.map(set=>({id:set.id,name:set.label,color:set.color,circles:circles.filter(c=>c.id===set.id&&c.radius>0).map(c=>({pointId:byMask.get(set.bit)!.id,cx:c.cx,cy:c.cy,radius:c.radius}))}));
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'venn',width,height,title,description,unit:'',legend:sets.map(set=>({id:set.id,name:set.label,color:set.color,visible:!hidden.has(set.id)})),series,observations,grid:[],labels:[],annotations,vennData:source,
      vennLayout:{circles,status,errors,maxErrorRatio,objectiveEvaluations,budgetExhausted,omittedAnchors:observations.filter(o=>o.venn!.geometry==='omitted').length}}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'VENN_PLANNING_FAILED',path:'spec',message:'Venn input could not be planned.'}};}
}
