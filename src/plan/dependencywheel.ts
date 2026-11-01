import {number,ValidationFailure} from '../internal/data/validation.js';
import {freezePlan} from './input.js';
import type {PlanAnnotation,PlanCircle,PlanCommand,PlanOptions,PlanSeries} from '../public/plan-types.js';
import type {PlanChordSpec,PlanDependencyWheelSpec,PlanRelationshipObservation,PlanRelationshipResult} from '../public/relationship-types.js';
import {coordinate,ownPolygon,relationshipGraph,shortLabel,vertex,type RelationshipNode,type Vertex} from './relationships-shared.js';

interface NodeArc {node:RelationshipNode;start:number;end:number;cursor:number;}
interface Port {start:number;end:number;}
const TAU=Math.PI*2;
const at=(cx:number,cy:number,radius:number,angle:number)=>vertex(cx+radius*Math.cos(angle),cy+radius*Math.sin(angle));
function arc(cx:number,cy:number,radius:number,start:number,end:number,steps:number):Vertex[] {
  return Array.from({length:steps+1},(_,i)=>at(cx,cy,radius,start+(end-start)*i/steps));
}
function curve(from:Vertex,to:Vertex,center:Vertex):Vertex[] {
  return Array.from({length:13},(_,i)=>{const t=i/12,q=1-t;return vertex(q*q*from.x+2*q*t*center.x+t*t*to.x,q*q*from.y+2*q*t*center.y+t*t*to.y);});
}
function nodeArcCommands(cx:number,cy:number,radius:number,inner:number,start:number,end:number):PlanCommand[]{
  const first=at(cx,cy,radius,start),last=at(cx,cy,radius,end),insideLast=at(cx,cy,inner,end),insideFirst=at(cx,cy,inner,start),largeArc=end-start>Math.PI?1:0;
  return [{kind:'M',...first},{kind:'A',radius,largeArc,sweep:1,...last},{kind:'L',...insideLast},{kind:'A',radius:inner,largeArc,sweep:0,...insideFirst},{kind:'Z'}];
}

/** Port allocation is shared; direction remains explicit in the public semantic metadata. */
export function planRadialRelationships(spec:PlanDependencyWheelSpec|PlanChordSpec,options:PlanOptions,family:'dependencywheel'|'chord'):PlanRelationshipResult {
  try{
    const graph=relationshipGraph(spec,options,family,['startAngle','nodePadding','nodeWidth']),{width,height,input,nodes,edges}=graph;
    const start=(input.startAngle===undefined?0:number(input.startAngle,'startAngle',-360,360))*Math.PI/180-Math.PI/2;
    const padding=(input.nodePadding===undefined?2:number(input.nodePadding,'nodePadding',0,20))*Math.PI/180;
    const radius=Math.max(4,Math.min(width,height)/2-28),nodeWidth=Math.min(radius*.45,input.nodeWidth===undefined?14:number(input.nodeWidth,'nodeWidth',2,64)),inner=radius-nodeWidth;
    const cx=width/2,cy=height/2,center=vertex(cx,cy),gap=Math.min(padding,TAU/Math.max(1,nodes.length)*.3);
    const zeroCount=nodes.filter(node=>node.incident===0).length,totalWeight=nodes.reduce((sum,node)=>sum+node.weight,0);
    const zeroSpan=totalWeight?Math.min(.04,(TAU-gap*nodes.length)/Math.max(1,nodes.length)*.1):0;
    const available=TAU-gap*nodes.length-zeroSpan*zeroCount,scale=totalWeight?available/totalWeight:0;
    let angle=start;
    const arcs=new Map<string,NodeArc>();
    for(const node of nodes){const span=node.weight?node.weight*scale:node.incident===0?zeroSpan:0;arcs.set(node.id,{node,start:angle,end:angle+span,cursor:angle});angle+=totalWeight?span+gap:TAU/Math.max(1,nodes.length);}
    const ports=new Map<string,{from:Port;to:Port}>();
    for(const edge of edges){const from=arcs.get(edge.from.id)!,to=arcs.get(edge.to.id)!,span=edge.weight*scale;ports.set(edge.id,{from:{start:from.cursor,end:from.cursor+span},to:{start:to.cursor,end:to.cursor+span}});from.cursor+=span;to.cursor+=span;}
    const observations:PlanRelationshipObservation[]=[],series:PlanSeries[]=[],annotations:PlanAnnotation[]=[];
    for(const group of graph.groups){
      const areaCommands:PlanCommand[]=[],nodeCommands:PlanCommand[]=[],circles:PlanCircle[]=[],startCount=observations.length;
      for(const edge of edges.filter(edge=>edge.from.groupId===group.id)){
        if(edge.value===null)continue;
        const port=ports.get(edge.id)!,source=arc(cx,cy,inner,port.from.start,port.from.end,4),target=arc(cx,cy,inner,port.to.start,port.to.end,4);
        const shape=ownPolygon([...source,...curve(source.at(-1)!,target[0]!,center).slice(1),...target.slice(1),...curve(target.at(-1)!,source[0]!,center).slice(1)]);
        const visible=edge.value>0&&edge.weight*scale*inner>=.0002&&shape.length>0;
        // Draw the existing port arcs and quadratic connectors analytically.
        // The bounded polygon remains an independent touch approximation; it
        // must not turn the visible ribbon into a faceted 32-segment outline.
        if(visible)areaCommands.push(
          {kind:'M',...source[0]!},
          {kind:'A',radius:inner,largeArc:port.from.end-port.from.start>Math.PI?1:0,sweep:1,...source.at(-1)!},
          {kind:'Q',cx:center.x,cy:center.y,...target[0]!},
          {kind:'A',radius:inner,largeArc:port.to.end-port.to.start>Math.PI?1:0,sweep:1,...target.at(-1)!},
          {kind:'Q',cx:center.x,cy:center.y,...source[0]!},
          {kind:'Z'},
        );
        const from=at(cx,cy,inner,(port.from.start+port.from.end)/2),to=at(cx,cy,inner,(port.to.start+port.to.end)/2),anchor=vertex((from.x+to.x)/4+cx/2,(from.y+to.y)/4+cy/2);
        observations.push({id:{seriesId:group.id,pointId:edge.id},label:edge.from.label+(family==='chord'?' ↔ ':' → ')+edge.to.label,seriesName:group.label,value:edge.value,...anchor,color:group.color,...(visible?{hit:{kind:'polygon' as const,vertices:shape}}:{}),relationship:{kind:'link',from:edge.from.id,to:edge.to.id,fromLabel:edge.from.label,toLabel:edge.to.label,directed:family!=='chord',...(!visible?{geometryOmitted:true as const}:{})}});
      }
      // Append nodes after ribbons so their actual sectors win visual/hit priority.
      for(const node of nodes.filter(node=>node.groupId===group.id)){
        const sector=arcs.get(node.id)!,middle=(sector.start+sector.end)/2,anchor=at(cx,cy,radius-nodeWidth/2,middle);
        const zero=node.incident===0,visible=zero||(sector.end-sector.start)*inner>=.0002;
        if(zero)circles.push({pointId:node.id,cx:anchor.x,cy:anchor.y,radius:Math.min(3,nodeWidth/2)});
        else if(visible)nodeCommands.push(...nodeArcCommands(cx,cy,radius,inner,sector.start,sector.end));
        // Shared sector hits use clockwise radians from twelve o'clock.
        const hit=zero?{kind:'circle' as const,cx:anchor.x,cy:anchor.y,radius:Math.min(3,nodeWidth/2)}:{kind:'sector' as const,cx,cy,radius,innerRadius:inner,start:sector.start+Math.PI/2,end:sector.end+Math.PI/2};
        observations.push({id:{seriesId:group.id,pointId:node.id},label:node.label,seriesName:group.label,value:node.incident,...anchor,color:group.color,...(visible?{hit}:{}),relationship:{kind:'node',incoming:node.incoming,outgoing:node.outgoing,incident:node.incident,...(!visible?{geometryOmitted:true as const}:{})},...(node.incomplete?{incomplete:true}:{})});
        const span=(sector.end-sector.start)*(radius-nodeWidth/2),labelWidth=Math.min(90,span);
        if(labelWidth>=18)annotations.push({...anchor,text:shortLabel(node.label,labelWidth),role:'label',box:{width:coordinate(labelWidth),height:16,seriesId:group.id}});
      }
      if(areaCommands.length||nodeCommands.length||circles.length||observations.length>startCount)series.push({id:group.id,name:group.label,color:group.color,...(areaCommands.length?{areaCommands}:{}),...(nodeCommands.length?{nodeCommands}:{}),...(circles.length?{circles}:{}),fill:true});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family,title:graph.title,description:graph.description,unit:'',width,height,legend:graph.legend,series,observations,annotations,grid:[],labels:[]}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
export const planDependencyWheel=(spec:PlanDependencyWheelSpec,options:PlanOptions)=>planRadialRelationships(spec,options,'dependencywheel');
