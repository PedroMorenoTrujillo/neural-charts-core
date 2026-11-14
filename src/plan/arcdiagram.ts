import { planningFailure } from './diagnostics.js';
import {fail,number} from '../internal/data/validation.js';
import {freezePlan} from './input.js';
import type {PlanAnnotation,PlanCircle,PlanCommand,PlanOptions,PlanSeries} from '../public/plan-types.js';
import type {PlanArcDiagramSpec,PlanRelationshipObservation,PlanRelationshipResult} from '../public/relationship-types.js';
import {ownPolygon,relationshipGraph,shortLabel,vertex,type Vertex} from './relationships-shared.js';

/** Fixed node order and bounded elliptical ribbons make updates deterministic. */
export function planArcDiagram(spec:PlanArcDiagramSpec,options:PlanOptions):PlanRelationshipResult {
  try{
    const graph=relationshipGraph(spec,options,'arcdiagram',['nodeRadius','linkWidth','reversed']),{width,height,input,nodes,edges}=graph;
    const requestedRadius=input.nodeRadius===undefined?6:number(input.nodeRadius,'nodeRadius',2,24),linkWidth=input.linkWidth===undefined?12:number(input.linkWidth,'linkWidth',1,48);
    const reversed=input.reversed??false;if(typeof reversed!=='boolean')fail('reversed');
    const marginX=Math.min(width/2,Math.max(requestedRadius+4,24)),spacing=(width-marginX*2)/Math.max(1,nodes.length-1);
    // Requested radius is a maximum: distinct ordered nodes must not overlap.
    const nodeRadius=nodes.length>1?Math.min(requestedRadius,spacing*.45):requestedRadius;
    const marginY=Math.min(height/2,Math.max(nodeRadius+22,30)),baseline=reversed?marginY:height-marginY,sign=reversed?1:-1;
    const positions=new Map(nodes.map((node,index)=>[node.id,nodes.length===1?width/2:marginX+spacing*index]));
    const series:PlanSeries[]=[],observations:PlanRelationshipObservation[]=[],annotations:PlanAnnotation[]=[];
    for(const group of graph.groups){
      const areaCommands:PlanCommand[]=[],circles:PlanCircle[]=[],startCount=observations.length;
      for(const edge of edges.filter(edge=>edge.from.groupId===group.id)){
        if(edge.value===null)continue;
        const from=positions.get(edge.from.id)!,to=positions.get(edge.to.id)!,left=Math.min(from,to),right=Math.max(from,to),cx=(left+right)/2,rx=(right-left)/2,ry=Math.max(0,Math.min(rx,height-marginY*2-nodeRadius)),thickness=Math.min(linkWidth,ry)*edge.weight;
        const side=(outer:boolean):Vertex[]=>Array.from({length:17},(_,i)=>{const angle=Math.PI*i/16,sine=Math.sin(angle),offset=(outer?1:-1)*thickness/2*sine;return vertex(cx-rx*Math.cos(angle),baseline+sign*(ry*sine+offset));});
        const shape=ownPolygon([...side(true),...side(false).reverse()]);
        const visible=edge.value>0&&thickness>=.0002&&shape.length>0;
        // The two tapered sides are exact axis-aligned half ellipses. Keep
        // the bounded hit polygon, but never render its sample edges as ink.
        if(visible)areaCommands.push(
          {type:'M',...vertex(left,baseline)},
          {type:'A',radius:rx,radiusY:ry+thickness/2,largeArc:0,sweep:reversed?0:1,...vertex(right,baseline)},
          {type:'A',radius:rx,radiusY:ry-thickness/2,largeArc:0,sweep:reversed?1:0,...vertex(left,baseline)},
          {type:'Z'},
        );
        observations.push({id:{seriesId:group.id,pointId:edge.id},label:edge.from.label+' ↔ '+edge.to.label,seriesName:group.label,value:edge.value,...vertex(cx,baseline+sign*ry),color:group.color,...(visible?{hit:{type:'polygon' as const,vertices:shape}}:{}),relationship:{type:'link',from:edge.from.id,to:edge.to.id,fromLabel:edge.from.label,toLabel:edge.to.label,directed:false,...(!visible?{geometryOmitted:true as const}:{})}});
      }
      for(const node of nodes.filter(node=>node.groupId===group.id)){
        const cx=positions.get(node.id)!,cy=baseline;circles.push({pointId:node.id,cx,cy,radius:nodeRadius});
        observations.push({id:{seriesId:group.id,pointId:node.id},label:node.label,seriesName:group.label,value:node.incident,x:cx,y:cy,color:group.color,hit:{type:'circle',cx,cy,radius:nodeRadius},relationship:{type:'node',incoming:node.incoming,outgoing:node.outgoing,incident:node.incident},...(node.incomplete?{incomplete:true}:{})});
        const labelWidth=Math.min(100,spacing*.9,cx*2,(width-cx)*2),labelY=cy-sign*(nodeRadius+12);if(labelWidth>=18&&labelY>=8&&labelY<=height-8)annotations.push({x:cx,y:labelY,text:shortLabel(node.label,labelWidth),role:'label',box:{width:labelWidth,height:16,seriesId:group.id}});
      }
      if(areaCommands.length||circles.length||observations.length>startCount)series.push({id:group.id,name:group.label,color:group.color,...(areaCommands.length?{areaCommands}:{}),...(circles.length?{circles}:{}),fill:true});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'arcdiagram',title:graph.title,description:graph.description,unit:'',width,height,legend:graph.legend,series,observations,annotations,grid:[],labels:[]}});
  }catch(error){return planningFailure(error);}
}
