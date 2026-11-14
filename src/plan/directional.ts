import { invalidPlan } from './diagnostics.js';
import type {PlanVectorSpec,PlanWindbarbSpec,PlanVectorPoint,PlanWindbarbPoint,PlanOptions,PlanReference,PlanResult,PlanCommand,PlanObservation,PlanSeries} from '../public/plan-types.js';
import {planAdditional} from './additional.js';
import {freezePlan} from './input.js';

const radians=Math.PI/180;
const paint=(value:number)=>Math.round(value*10000)/10000;
const key=(seriesId:string,pointId:string)=>JSON.stringify([seriesId,pointId]);
const own=(value:object,keys:readonly string[])=>Object.keys(value).every(k=>keys.includes(k));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
type Datum=Readonly<{dx:number;dy:number}>|Readonly<{direction:number|null}>;

/** Directional glyphs reuse scatter domains/projection; no second axis engine. */
export function planDirectional(spec:PlanVectorSpec|PlanWindbarbSpec,options:PlanOptions,references?:readonly PlanReference[]):PlanResult{
  const vector=spec.family==='vector';
  if('unit' in spec&&(typeof spec.unit!=='string'||spec.unit.length>32))return invalidPlan('BAD_UNIT','unit');
  if(!Array.isArray(spec.series)||spec.series.length>16||spec.series.reduce((n,s)=>n+(Array.isArray(s?.data)?s.data.length:2049),0)>2048)return invalidPlan('INPUT_LIMIT','series');
  const data=new Map<string,Datum>();let maximum=0;
  const hidden=new Set(options.hiddenSeriesIds??[]);
  for(const series of spec.series){
    if(!series||typeof series!=='object'||!own(series,['id','name','color','data'])||!Array.isArray(series.data))return invalidPlan('BAD_SERIES','series');
    for(const p of series.data){
      if(!p||typeof p!=='object'||!own(p,vector?['id','x','y','dx','dy']:['id','x','value','direction']))return invalidPlan('UNKNOWN_OPTION','series.data');
      if(p.x!==null&&!finite(p.x)||'y' in p&&p.y!==null&&!finite(p.y))return invalidPlan('BAD_POSITION','series.data');
      if(vector){
        if(!('dx' in p)||!('dy' in p)||(p.dx===null)!==(p.dy===null)||p.dx!==null&&(!finite(p.dx)||!finite(p.dy)||!Number.isFinite(Math.hypot(p.dx,p.dy))))return invalidPlan('BAD_VECTOR','series.data');
        if(p.dx!==null&&p.dy!==null){data.set(key(series.id,p.id),{dx:p.dx,dy:p.dy});if(!hidden.has(series.id)&&p.x!==null&&'y' in p&&p.y!==null)maximum=Math.max(maximum,Math.hypot(p.dx,p.dy));}
      }else{
        if(!('value' in p)||p.value!==null&&(!finite(p.value)||p.value<0||p.value>150))return invalidPlan('BAD_WIND_SPEED','series.data.value');
        if(!('direction' in p)||p.direction!==null&&(!finite(p.direction)||p.direction<0||p.direction>=360))return invalidPlan('BAD_WIND_DIRECTION','series.data.direction');
        data.set(key(series.id,p.id),{direction:p.direction});
      }
    }
  }
  const result=planAdditional({family:'scatter',title:spec.title,...(spec.description===undefined?{}:{description:spec.description}),axes:spec.axes,
    series:spec.series.map(s=>({id:s.id,name:s.name,...(s.color===undefined?{}:{color:s.color}),data:s.data.map((p:PlanVectorPoint|PlanWindbarbPoint)=>({id:p.id,x:p.x,y:'dx' in p?(p.dx===null?null:p.y):p.value}))}))},options.width,options.height,options.hiddenSeriesIds??[],options.viewport,references);
  if(result.status==='invalid')return result;
  const length=Math.min(vector?28:34,options.width/5,options.height/5);
  const commands=new Map<string,PlanCommand[]>(),heads=new Map<string,PlanCommand[]>();
  const observations:PlanObservation[]=[];
  const move=(a:PlanCommand[],x:number,y:number)=>a.push({type:'M',x:paint(x),y:paint(y)});
  const line=(a:PlanCommand[],x:number,y:number)=>a.push({type:'L',x:paint(x),y:paint(y)});
  for(const observation of result.frame.observations){
    const datum=data.get(key(observation.id.seriesId,observation.id.pointId));if(!datum)continue;
    const path=commands.get(observation.id.seriesId)??[],fill=heads.get(observation.id.seriesId)??[];
    commands.set(observation.id.seriesId,path);heads.set(observation.id.seriesId,fill);
    const {x,y}=observation;
    let value=observation.value;
    if('dx' in datum){
      value=Math.hypot(datum.dx,datum.dy);
      // Normalize before screen-space inversion to avoid overflow and honor reversed axes.
      const dx=(spec.axes.x.reversed?-1:1)*(value?datum.dx/value:0),dy=(spec.axes.y.reversed?1:-1)*(value?datum.dy/value:0);
      const size=maximum?length*(value/maximum):0,ex=x+dx*size,ey=y+dy*size;
      if(size>=1){
        const head=Math.min(6,size/2),side=head*.55;
        move(path,x,y);line(path,ex,ey);
        move(fill,ex,ey);line(fill,ex-dx*head-dy*side,ey-dy*head+dx*side);line(fill,ex-dx*head+dy*side,ey-dy*head-dx*side);fill.push({type:'Z'});
      }else circle(path,x,y,Math.min(3,length/4));
      observations.push({...observation,value,yValue:observation.value,vector:datum,hit:{type:'circle',cx:x,cy:y,radius:Math.max(12,size)}});
    }else{
      const knots=Math.round(value*(3600/1852)/5)*5;
      if(knots===0)circle(path,x,y,Math.min(4,length/4));
      else if(datum.direction===null){
        const radius=Math.min(4,length/4);move(path,x,y-radius);line(path,x+radius,y);line(path,x,y+radius);line(path,x-radius,y);path.push({type:'Z'});
      }else{
        const dx=Math.sin(datum.direction*radians),dy=-Math.cos(datum.direction*radians),px=-dy,py=dx;
        const flags=Math.floor(knots/50),full=Math.floor((knots%50)/10),half=knots%10>=5?1:0,count=flags+full+half;
        const step=(length-4)/Math.max(1,count),width=Math.min(10,length*.32);
        move(path,x,y);line(path,x+dx*length,y+dy*length);
        let at=length;
        for(let i=0;i<flags;i++,at-=step){
          move(fill,x+dx*at,y+dy*at);line(fill,x+dx*(at-step*.55)+px*width,y+dy*(at-step*.55)+py*width);line(fill,x+dx*(at-step),y+dy*(at-step));fill.push({type:'Z'});
        }
        for(let i=0;i<full;i++,at-=step){move(path,x+dx*at,y+dy*at);line(path,x+dx*(at-step*.45)+px*width,y+dy*(at-step*.45)+py*width);}
        if(half){move(path,x+dx*at,y+dy*at);line(path,x+dx*(at-step*.225)+px*width*.5,y+dy*(at-step*.225)+py*width*.5);}
      }
      observations.push({...observation,wind:datum,hit:{type:'circle',cx:x,cy:y,radius:Math.max(12,length)}});
    }
  }
  const series:PlanSeries[]=result.frame.series.map(s=>({id:s.id,name:s.name,color:s.color,commands:commands.get(s.id)??[],areaCommands:heads.get(s.id)??[]}));
  return freezePlan({...result,status:observations.length?'ok':'empty',frame:{...result.frame,family:spec.family,unit:spec.family==='vector'?(spec.unit??''):'m/s',series,observations}});
}

function circle(path:PlanCommand[],x:number,y:number,radius:number):void{
  path.push({type:'M',x:paint(x-radius),y:paint(y)},{type:'A',radius:paint(radius),largeArc:1,sweep:0,x:paint(x+radius),y:paint(y)},{type:'A',radius:paint(radius),largeArc:1,sweep:0,x:paint(x-radius),y:paint(y)});
}
