import { readPlanTitle } from './plan-presentation.js';
import { planningFailure } from './diagnostics.js';
import {array,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createLinearScale} from '../internal/math/linear.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {freezePlan} from './input.js';
import type {PlanAnnotation,PlanBar,PlanCommand,PlanObservation,PlanOptions,PlanResult,PlanSankeySpec,PlanSeries} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Plot=Readonly<{x:number;y:number;width:number;height:number}>;
interface Node {
  id:string;label:string;groupId:string;index:number;layer:number;
  incoming:Edge[];outgoing:Edge[];incomplete:boolean;
  incomingValue:number;outgoingValue:number;value:number;weight:number;
  main:number;cross:number;length:number;
}
interface Edge {id:string;from:Node;to:Node;value:number|null;weight:number;index:number;fromCross:number;toCross:number;}
interface Layer {nodes:Node[];}
const round=(value:number)=>Math.round(value*10000)/10000;
const point=(value:Vertex):Vertex=>({x:round(value.x),y:round(value.y)});
const shortLabel=(value:string,width:number)=>{
  const characters=Array.from(value),count=Math.max(1,Math.floor(width/7));
  return characters.length<=count?value:characters.slice(0,Math.max(0,count-1)).join('')+'…';
};

/** Scale before summing so individually finite values never silently overflow. */
function total(values:readonly number[],path:string):number {
  let largest=0;for(const value of values)largest=Math.max(largest,value);
  if(!largest)return 0;
  let sum=0,correction=0;
  for(const value of values){const add=value/largest-correction,next=sum+add;correction=(next-sum)-add;sum=next;}
  const result=sum*largest;if(!Number.isFinite(result))fail(path,'UNREPRESENTABLE_FLOW_TOTAL');return result;
}

/** A deterministic O(nodes + links) DAG pass, including missing/zero links. */
function layersFor(nodes:readonly Node[]):Layer[] {
  const degrees=new Map(nodes.map(node=>[node.id,node.incoming.length])),queue=nodes.filter(node=>!node.incoming.length);
  let visited=0,lastLayer=0;
  for(let cursor=0;cursor<queue.length;cursor++){
    const node=queue[cursor]!;visited++;
    for(const edge of node.outgoing){edge.to.layer=Math.max(edge.to.layer,node.layer+1);lastLayer=Math.max(lastLayer,edge.to.layer);const count=degrees.get(edge.to.id)!-1;degrees.set(edge.to.id,count);if(!count)queue.push(edge.to);}
  }
  if(visited!==nodes.length)fail('links','CYCLIC_FLOW');
  const layers:Layer[]=Array.from({length:lastLayer+1},()=>({nodes:[]}));
  for(const node of nodes){if(node.incoming.length&&!node.outgoing.length)node.layer=lastLayer;layers[node.layer]!.nodes.push(node);}
  // Six bounded barycentric sweeps reduce crossings without a retained solver.
  const ranks=new Map<string,number>();
  const refresh=()=>{for(const layer of layers)for(const [index,node]of layer.nodes.entries())ranks.set(node.id,(index+.5)/Math.max(1,layer.nodes.length));};
  refresh();
  for(let pass=0;pass<6;pass++){
    const forward=pass%2===0,ordered=forward?layers:[...layers].reverse();
    for(const layer of ordered){
      const score=(node:Node)=>{
        const edges=forward?node.incoming:node.outgoing;if(!edges.length)return ranks.get(node.id)!;
        let weighted=0,weight=0;for(const edge of edges){const factor=edge.weight||1e-12;weighted+=ranks.get((forward?edge.from:edge.to).id)!*factor;weight+=factor;}
        return weighted/weight;
      };
      const scores=new Map(layer.nodes.map(node=>[node.id,score(node)]));
      layer.nodes.sort((a,b)=>scores.get(a.id)!-scores.get(b.id)!||a.index-b.index);refresh();
    }
  }
  return layers;
}

function clipPolygon(vertices:readonly Vertex[],plot:Plot):Vertex[] {
  let output=[...vertices];
  for(const [axis,bound,minimum]of [['x',plot.x,true],['x',plot.x+plot.width,false],['y',plot.y,true],['y',plot.y+plot.height,false]] as const){
    const input=output;output=[];if(!input.length)break;
    let previous=input[input.length-1]!;
    for(const current of input){
      const previousInside=minimum?previous[axis]>=bound:previous[axis]<=bound,currentInside=minimum?current[axis]>=bound:current[axis]<=bound;
      if(previousInside!==currentInside){const fraction=(bound-previous[axis])/(current[axis]-previous[axis]);output.push(axis==='x'?{x:bound,y:previous.y+(current.y-previous.y)*fraction}:{x:previous.x+(current.x-previous.x)*fraction,y:bound});}
      if(currentInside)output.push(current);previous=current;
    }
  }
  const result=output.map(point).filter((vertex,index,list)=>!index||vertex.x!==list[index-1]!.x||vertex.y!==list[index-1]!.y);
  if(result.length>1&&result[0]!.x===result.at(-1)!.x&&result[0]!.y===result.at(-1)!.y)result.pop();
  // Clipping may leave a run of vertices on one plot edge. Keep only its
  // endpoints so ownership never sees a folded or collapsed boundary segment.
  let changed=true;
  while(changed&&result.length>2){changed=false;for(let index=0;index<result.length;index++){
    const previous=result[(index+result.length-1)%result.length]!,current=result[index]!,next=result[(index+1)%result.length]!;
    const cross=(current.x-previous.x)*(next.y-previous.y)-(current.y-previous.y)*(next.x-previous.x);
    if(cross===0&&current.x>=Math.min(previous.x,next.x)&&current.x<=Math.max(previous.x,next.x)&&current.y>=Math.min(previous.y,next.y)&&current.y<=Math.max(previous.y,next.y)){result.splice(index,1);changed=true;break;}
  }}
  return result;
}
function hasArea(vertices:readonly Vertex[]):boolean {
  if(vertices.length<3)return false;
  let area=0;for(let i=0;i<vertices.length;i++){const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!;area+=a.x*b.y-b.x*a.y;}
  return Math.abs(area)>1e-8;
}
const commands=(vertices:readonly Vertex[]):PlanCommand[]=>vertices.length?[...vertices.map((vertex,index)=>({type:index?'L' as const:'M' as const,...vertex})),{type:'Z'}]:[];

function viewport(options:PlanOptions,plot:Plot){
  const config=options.viewport??{axes:'xy' as const};if(config.axes!=='xy')fail('options.viewport.axes','XY_VIEWPORT_REQUIRED');
  const axes={x:{type:'linear' as const,domain:[0,1] as const,nice:false},y:{type:'linear' as const,domain:[0,1] as const,nice:false,reversed:true}},domains={x:[0,1] as const,y:[0,1] as const};
  const prepared=preparePlanViewport(axes,domains,config);if(prepared.status==='invalid')throw new ValidationFailure(prepared.diagnostic);
  const displayed=withViewportDomains(domains,prepared.value),x=createLinearScale(displayed.x!,[plot.x,plot.x+plot.width],false),y=createLinearScale(displayed.y!,[plot.y,plot.y+plot.height],false);
  if(x.status==='invalid')throw new ValidationFailure(x.diagnostic);if(y.status==='invalid')throw new ValidationFailure(y.diagnostic);
  const state=planViewportState(prepared.value,displayed,axes,plot)!;
  const map=(value:Vertex):Vertex=>{const px=x.value.map(value.x),py=y.value.map(value.y);if(px===null||py===null)fail('options.viewport','UNREPRESENTABLE_LAYOUT_GEOMETRY');return{x:px,y:py};};
  return {state,map};
}

export function planSankey(spec:PlanSankeySpec,options:PlanOptions):PlanResult {
  try{
    const input=record(spec,['family','title','description','nodes','links','groups','orientation','nodeWidth','nodePadding'],['family','title','nodes','links'],'spec');
    if(input.family!=='sankey')fail('family');
    const {title,description}=readPlanTitle(input);
    const width=number(options.width,'options.width',64,10000),height=number(options.height,'options.height',64,10000);
    if(options.references!==undefined||options.stacking!==undefined)fail('options','UNSUPPORTED_LAYOUT_OPTION');
    const orientation=input.orientation??'horizontal';if(orientation!=='horizontal'&&orientation!=='vertical')fail('orientation','BAD_ORIENTATION');
    const requestedWidth=Object.hasOwn(input,'nodeWidth')?number(input.nodeWidth,'nodeWidth',2,64):14;
    const requestedPadding=Object.hasOwn(input,'nodePadding')?number(input.nodePadding,'nodePadding',0,64):12;
    const groups=new Map<string,{id:string;label:string}>();
    if(Object.hasOwn(input,'groups'))for(const [index,value]of array(input.groups,15,'groups').entries()){
      const path='groups['+index+']',group=record(value,['id','label'],['id','label'],path),id=text(group.id,path+'.id',128);
      if(groups.has(id))fail(path+'.id','DUPLICATE_GROUP_ID');groups.set(id,{id,label:text(group.label,path+'.label',256)});
    }
    const identities=new Set<string>(),byId=new Map<string,Node>();
    const nodes=array(input.nodes,128,'nodes').map((value,index):Node=>{
      const path='nodes['+index+']',node=record(value,['id','label','groupId'],['id','label'],path),id=text(node.id,path+'.id',128),groupId=Object.hasOwn(node,'groupId')?text(node.groupId,path+'.groupId',128):'nodes';
      if(identities.has(id))fail(path+'.id','DUPLICATE_NODE_ID');identities.add(id);
      if(groupId==='nodes'&&!groups.has(groupId))groups.set(groupId,{id:groupId,label:title});
      if(!groups.has(groupId))fail(path+'.groupId','UNKNOWN_GROUP');
      const result:Node={id,label:text(node.label,path+'.label',1024),groupId,index,layer:0,incoming:[],outgoing:[],incomplete:false,incomingValue:0,outgoingValue:0,value:0,weight:0,main:0,cross:0,length:0};byId.set(id,result);return result;
    });
    let largest=0;
    const edges=array(input.links,512,'links').map((value,index):Edge=>{
      const path='links['+index+']',link=record(value,['id','from','to','value'],['id','from','to','value'],path),id=text(link.id,path+'.id',128),from=byId.get(text(link.from,path+'.from',128)),to=byId.get(text(link.to,path+'.to',128));
      if(identities.has(id))fail(path+'.id','DUPLICATE_OBSERVATION_ID');identities.add(id);
      if(!from||!to)fail(path,'UNKNOWN_NODE');if(from===to)fail(path,'CYCLIC_FLOW');
      const weight=link.value===null?null:number(link.value,path+'.value',0,Number.MAX_VALUE);largest=Math.max(largest,weight??0);
      const edge:Edge={id,from,to,value:weight,weight:0,index,fromCross:0,toCross:0};from.outgoing.push(edge);to.incoming.push(edge);return edge;
    });
    for(const edge of edges){edge.weight=largest?(edge.value??0)/largest:0;if(edge.value&&edge.weight===0)fail('links['+edge.index+'].value','UNREPRESENTABLE_FLOW_RANGE');}
    // Validate all source relationships even if the host currently hides a group.
    layersFor(nodes);
    const hidden=new Set(options.hiddenSeriesIds??[]);
    for(const id of hidden)if(!groups.has(id))fail('options.hiddenSeriesIds','UNKNOWN_GROUP');
    const visible=nodes.filter(node=>!hidden.has(node.groupId)),visibleIds=new Set(visible.map(node=>node.id));
    const links=edges.filter(edge=>visibleIds.has(edge.from.id)&&visibleIds.has(edge.to.id));
    // Visibility owns a fresh quantitative scale. A hidden extreme must not
    // underflow the remaining diagram's lengths or overflow its inverse scale.
    let visibleLargest=0;for(const edge of links)visibleLargest=Math.max(visibleLargest,edge.value??0);
    for(const edge of links)edge.weight=visibleLargest?(edge.value??0)/visibleLargest:0;
    for(const node of visible){node.layer=0;node.incoming=node.incoming.filter(edge=>visibleIds.has(edge.from.id));node.outgoing=node.outgoing.filter(edge=>visibleIds.has(edge.to.id));node.incomplete=[...node.incoming,...node.outgoing].some(edge=>edge.value===null);node.incomingValue=total(node.incoming.map(edge=>edge.value??0),'nodes.'+node.id);node.outgoingValue=total(node.outgoing.map(edge=>edge.value??0),'nodes.'+node.id);node.value=Math.max(node.incomingValue,node.outgoingValue);node.weight=visibleLargest?node.value/visibleLargest:0;}
    const layers=layersFor(visible),plot:Plot={x:16,y:14,width:width-32,height:height-28},vertical=orientation==='vertical';
    const mainSize=vertical?plot.height:plot.width,crossSize=vertical?plot.width:plot.height;
    const maximumCount=Math.max(1,...layers.map(layer=>layer.nodes.length));
    const nodeWidth=Math.min(requestedWidth/mainSize,1/Math.max(2,layers.length*2)),padding=Math.min(requestedPadding/crossSize,1/(maximumCount*2)),zeroLength=Math.min(4/crossSize,1/(maximumCount*2));
    let scale=Number.POSITIVE_INFINITY;
    for(const layer of layers){const weight=total(layer.nodes.map(node=>node.weight),'layout'),zero=layer.nodes.filter(node=>!node.weight).length;if(weight)scale=Math.min(scale,Math.max(0,1-padding*Math.max(0,layer.nodes.length-1)-zero*zeroLength)/weight);}
    if(!Number.isFinite(scale))scale=0;
    for(const [index,layer]of layers.entries()){
      const lengths=layer.nodes.map(node=>node.weight?node.weight*scale:zeroLength),occupied=total(lengths,'layout')+padding*Math.max(0,layer.nodes.length-1);
      let cursor=Math.max(0,(1-occupied)/2);
      for(const [row,node]of layer.nodes.entries()){node.main=layers.length===1?(1-nodeWidth)/2:index*(1-nodeWidth)/(layers.length-1);node.cross=cursor;node.length=lengths[row]!;cursor+=node.length+padding;}
    }
    for(const node of visible){
      node.outgoing.sort((a,b)=>a.to.cross-b.to.cross||a.index-b.index);node.incoming.sort((a,b)=>a.from.cross-b.from.cross||a.index-b.index);
      let outgoing=node.cross+(node.length-total(node.outgoing.map(edge=>edge.weight*scale),'layout'))/2;
      for(const edge of node.outgoing){edge.fromCross=outgoing;outgoing+=edge.weight*scale;}
      let incoming=node.cross+(node.length-total(node.incoming.map(edge=>edge.weight*scale),'layout'))/2;
      for(const edge of node.incoming){edge.toCross=incoming;incoming+=edge.weight*scale;}
    }
    const view=viewport(options,plot),orient=(main:number,cross:number):Vertex=>vertical?{x:cross,y:main}:{x:main,y:cross};
    const palette=defaultPalette('light',false).series,colors=new Map([...groups.keys()].map((id,index)=>[id,palette[index%palette.length]!]));
    const legend=[...groups.values()].map(group=>({id:group.id,name:group.label,color:colors.get(group.id)!,visible:!hidden.has(group.id)}));
    const series:PlanSeries[]=[],observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
    for(const group of groups.values()){
      if(hidden.has(group.id))continue;
      const groupStart=observations.length,color=colors.get(group.id)!,bars:PlanBar[]=[],areaCommands:PlanCommand[]=[];
      for(const edge of links.filter(link=>link.from.groupId===group.id&&link.value!==null&&link.value>0)){
        const start=edge.from.main+nodeWidth,end=edge.to.main,thickness=edge.weight*scale,top:Vertex[]=[],bottom:Vertex[]=[];
        for(let step=0;step<=16;step++){const t=step/16,smooth=t*t*(3-2*t),main=start+(end-start)*(1.5*t-1.5*t*t+t*t*t),cross=edge.fromCross+(edge.toCross-edge.fromCross)*smooth;top.push(view.map(orient(main,cross)));bottom.push(view.map(orient(main,cross+thickness)));}
        const clipped=clipPolygon([...top,...bottom.reverse()],plot);if(!clipped.length)continue;
        const first=top[0]!,last=bottom.at(-1)!,projectedThickness=vertical?Math.abs(last.x-first.x):Math.abs(last.y-first.y);
        // Two coordinate quanta bound the error introduced at both ribbon edges.
        // Keep the original semantic value; never widen an unpaintable flow.
        const geometryOmitted=projectedThickness<.0002||!hasArea(clipped);
        if(!geometryOmitted)areaCommands.push(...commands(clipped));
        const center=point(view.map(orient((start+end)/2,(edge.fromCross+edge.toCross+thickness)/2)));
        // A clipped ribbon can remain visible while its original midpoint is outside.
        const anchor=center.x>=plot.x&&center.x<=plot.x+plot.width&&center.y>=plot.y&&center.y<=plot.y+plot.height?center:clipped[0]!;
        observations.push({id:{seriesId:group.id,pointId:edge.id},label:edge.from.label+' → '+edge.to.label,seriesName:group.label,value:edge.value!,...anchor,color,...(geometryOmitted?{}:{hit:{type:'polygon' as const,vertices:clipped}}),sankey:{type:'link',from:edge.from.id,to:edge.to.id,fromLabel:edge.from.label,toLabel:edge.to.label,...(geometryOmitted?{geometryOmitted:true as const}:{})}});
      }
      for(const node of visible.filter(value=>value.groupId===group.id)){
        const first=view.map(orient(node.main,node.cross)),last=view.map(orient(node.main+nodeWidth,node.cross+node.length));
        if(Math.max(first.x,last.x)<=plot.x||Math.min(first.x,last.x)>=plot.x+plot.width||Math.max(first.y,last.y)<=plot.y||Math.min(first.y,last.y)>=plot.y+plot.height)continue;
        const x=round(Math.max(plot.x,Math.min(first.x,last.x))),y=round(Math.max(plot.y,Math.min(first.y,last.y))),right=round(Math.min(plot.x+plot.width,Math.max(first.x,last.x))),bottom=round(Math.min(plot.y+plot.height,Math.max(first.y,last.y)));
        const geometryOmitted=right<=x||bottom<=y;
        if(!geometryOmitted)bars.push({pointId:node.id,x,y,width:round(right-x),height:round(bottom-y)});
        const hit:Vertex[]=[{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}];
        observations.push({id:{seriesId:group.id,pointId:node.id},label:node.label,seriesName:group.label,value:node.value,x:round((x+right)/2),y:round((y+bottom)/2),color,...(geometryOmitted?{}:{hit:{type:'polygon' as const,vertices:hit}}),sankey:{type:'node',incoming:node.incomingValue,outgoing:node.outgoingValue,...(geometryOmitted?{geometryOmitted:true as const}:{})},...(node.incomplete?{incomplete:true}:{})});
        const labelWidth=Math.min(110,vertical?right-x:mainSize/Math.max(1,layers.length)-requestedWidth-10);
        if(labelWidth>=14&&bottom-y>=12){const labelX=vertical?(x+right)/2:node.layer===layers.length-1?Math.max(plot.x+labelWidth/2,x-labelWidth/2-4):Math.min(plot.x+plot.width-labelWidth/2,right+labelWidth/2+4);annotations.push({x:round(labelX),y:round((y+bottom)/2),text:shortLabel(node.label,labelWidth),role:'label',box:{width:labelWidth,height:16,seriesId:group.id}});}
      }
      if(bars.length||areaCommands.length||observations.length>groupStart)series.push({id:group.id,name:group.label,color,...(bars.length?{bars}:{}),...(areaCommands.length?{areaCommands}:{}),fill:true});
    }
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'sankey',title,description,unit:'',width,height,legend,series,observations,annotations,grid:[],labels:[],viewport:view.state}});
  }catch(error){return planningFailure(error);}
}
