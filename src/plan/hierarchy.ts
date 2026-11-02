import {array,choice,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createLinearScale} from '../internal/math/linear.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {flattenCubics} from '../spline/interpolate.js';
import type {CubicSegment} from '../spline/interpolate.js';
import {validateTreemap} from '../treemap/validate.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {freezePlan} from './input.js';
import type {PlanAnnotation,PlanBar,PlanCircle,PlanCommand,PlanNodeGraphSpec,PlanObservation,PlanOptions,PlanResult,PlanSeries,PlanSunburstSpec} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Plot=Readonly<{x:number;y:number;width:number;height:number}>;
/** The whole horizontal text rectangle must remain inside its annular sector. */
function ringLabelFits(p:Vertex,width:number,height:number,cx:number,cy:number,inner:number,outer:number,start:number,end:number):boolean{
 const halfWidth=width/2,halfHeight=height/2,padding=2,span=end-start,mid=(start+end)/2;
 const nearest=Math.hypot(Math.max(0,Math.abs(p.x-cx)-halfWidth),Math.max(0,Math.abs(p.y-cy)-halfHeight));
 if(inner>0&&nearest<inner+padding)return false;
 const anglePadding=padding/Math.max(1,Math.hypot(p.x-cx,p.y-cy));
 for(const x of [p.x-halfWidth,p.x+halfWidth])for(const y of [p.y-halfHeight,p.y+halfHeight]){
  if(Math.hypot(x-cx,y-cy)>outer-padding)return false;
  if(span<Math.PI*2-1e-10){const angle=Math.atan2(x-cx,cy-y),delta=((angle-mid+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;if(Math.abs(delta)>span/2-anglePadding)return false;}
 }return true;
}
const blend=(a:Vertex,b:Vertex):Vertex=>({x:a.x/2+b.x/2,y:a.y/2+b.y/2});
const split=(s:CubicSegment):readonly[CubicSegment,CubicSegment]=>{const ab=blend(s.a,s.b),bc=blend(s.b,s.c),cd=blend(s.c,s.d),abc=blend(ab,bc),bcd=blend(bc,cd),mid=blend(abc,bcd);return [{a:s.a,b:ab,c:abc,d:mid},{a:mid,b:bcd,c:cd,d:s.d}];};
const ratio=(v:number,a:number,b:number)=>Number.isFinite(b-a)&&Number.isFinite(v-a)?(v-a)/(b-a):(v/2-a/2)/(b/2-a/2);
function clip(a:Vertex,b:Vertex,p:Plot):readonly[Vertex,Vertex]|null{
  let low=0,high=1;
  for(const [axis,start,end]of [['x',p.x,p.x+p.width],['y',p.y,p.y+p.height]] as const){if(a[axis]===b[axis]){if(a[axis]<start||a[axis]>end)return null;continue;}const t1=ratio(start,a[axis],b[axis]),t2=ratio(end,a[axis],b[axis]);low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(high<=low)return null;}
  const at=(t:number):Vertex=>({x:Math.max(p.x,Math.min(p.x+p.width,a.x*(1-t)+b.x*t)),y:Math.max(p.y,Math.min(p.y+p.height,a.y*(1-t)+b.y*t))});const first=at(low),last=at(high);return first.x===last.x&&first.y===last.y?null:[first,last];
}
function connector(curve:CubicSegment,plot:Plot,commands:PlanCommand[]):void{
  const pending=[{curve,depth:0}];
  while(pending.length){
    const item=pending.pop()!,points=[item.curve.a,item.curve.b,item.curve.c,item.curve.d],xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    if(right<plot.x||left>plot.x+plot.width||bottom<plot.y||top>plot.y+plot.height)continue;
    // Cull exterior Bezier hulls before flattening: extreme zoom must not
    // generate invisible interpolation samples or unbounded planning work.
    if(right-left>plot.width*2||bottom-top>plot.height*2){if(item.depth>=32)fail('options.viewport','GRAPH_VIEWPORT_LIMIT');const halves=split(item.curve);pending.push({curve:halves[1],depth:item.depth+1},{curve:halves[0],depth:item.depth+1});continue;}
    // The frozen flattener accepts increasing X only. Reversing all Bezier
    // controls preserves the exact connector curve; links have no arrowheads.
    const segment=item.curve.d.x<item.curve.a.x?{a:item.curve.d,b:item.curve.c,c:item.curve.b,d:item.curve.a}:item.curve;
    const flat=flattenCubics([segment],.3,Math.floor((1000000-commands.length)/2));if(flat.status==='invalid')throw new ValidationFailure(flat.diagnostic);
    let previous:Vertex|undefined;
    for(const point of flat.value){if(point.kind==='Z'||point.kind==='A')continue;if(previous){const line=clip(previous,point,plot);if(line)commands.push({kind:'M',...line[0]},{kind:'L',...line[1]});}previous=point;}
    if(commands.length>1000000)fail('links','RESOURCE_LIMIT');
  }
}
const boundedLabel=(label:string,width:number)=>{const characters=Array.from(label),cap=Math.max(1,Math.floor(width/7));return characters.length<=cap?label:characters.slice(0,Math.max(1,cap-1)).join('')+'…';};

export function planHierarchy(spec:PlanSunburstSpec|PlanNodeGraphSpec,options:PlanOptions):PlanResult{
  try{
    const family=record(spec,['family','title','description','root','nodes','links','groups'],['family'],'spec').family;
    if(!['sunburst','treegraph','organization'].includes(family as string))fail('family');
    const input=record(spec,family==='sunburst'?['family','title','description','root']:['family','title','description','nodes','links','groups'],['family','title',...(family==='sunburst'?['root']:['nodes','links'])],'spec');
    const title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',4096,true):'';
    const opts=record(options,['width','height','hiddenSeriesIds','stacking','viewport','references','hierarchy'],['width','height'],'options'),width=number(opts.width,'options.width',64,10000),height=number(opts.height,'options.height',64,10000),plot={x:16,y:14,width:width-32,height:height-28};
    const layout=Object.hasOwn(opts,'hierarchy')?record(opts.hierarchy,['orientation'],[],'options.hierarchy'):{};
    const horizontal=Object.hasOwn(layout,'orientation')?choice(layout.orientation,['horizontal','vertical'],'options.hierarchy.orientation')==='horizontal':false;
    if(Object.hasOwn(opts,'stacking')||Object.hasOwn(opts,'references'))fail('options','UNSUPPORTED_HIERARCHY_OPTION');
    const hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,15,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const palette=defaultPalette('light',false).series;
    if(family==='sunburst'){
      if(Object.hasOwn(opts,'viewport'))fail('options.viewport','SUNBURST_HAS_NO_VIEWPORT');
      const checked=validateTreemap({family:'treemap',title,...(description?{description}:{}),root:input.root});if(checked.status==='invalid')return checked;
      const original=checked.value.hierarchy,root=original.nodes[0]!;
      if(original.nodes.length>512||original.nodes.some(r=>r.depth>8)||root.children.length>15)fail('root','SUNBURST_TREE_LIMIT');
      for(const r of original.nodes)if(Object.hasOwn(r.node,'datum')||Object.hasOwn(r.node,'colorValue')||(r.node.label?.length??0)>200)fail('root','UNSUPPORTED_TREE_FIELD');
      const branches=root.children.length?root.children.map(i=>original.nodes[i]!):[root],legend=branches.map((r,i)=>({id:r.node.id,name:r.node.label??r.node.id,color:palette[i%palette.length]!,visible:!hidden.includes(r.node.id)}));
      if(hidden.some(id=>!legend.some(l=>l.id===id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
      const base={schema:'nc-plan/1' as const,family:'sunburst' as const,title,description,unit:'',width,height,legend};
      if(legend.length&&legend.every(l=>!l.visible))return freezePlan({status:'empty',frame:{...base,series:[],observations:[],grid:[],labels:[]}});
      let hierarchy=original;
      if(hidden.length&&root.node.children!==undefined){const filtered=validateTreemap({family:'treemap',title,root:{...root.node,children:root.node.children.filter(n=>!hidden.includes(n.id))}});if(filtered.status==='invalid')return filtered;hierarchy=filtered.value.hierarchy;}
      const depth=Math.max(...hierarchy.nodes.map(r=>r.depth)),outer=Math.min(plot.width,plot.height)/2,band=outer/(depth+1),cx=width/2,cy=height/2;
      const angles=new Map<number,readonly[number,number]>([[0,[0,Math.PI*2]]]);
      for(const r of hierarchy.nodes){const [start,end]=angles.get(r.index)??[0,0];let cursor=start,last=-1;for(const child of r.children)if(hierarchy.nodes[child]!.weight>0)last=child;for(const child of r.children){const c=hierarchy.nodes[child]!,next=r.weight>0?(child===last?end:Math.min(end,cursor+(end-start)*(c.weight/r.weight))):cursor;angles.set(child,[cursor,next]);cursor=next;}}
      const groups=new Map<string,{id:string;name:string;color:string;commands:PlanCommand[]}>(),observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
      for(const r of hierarchy.nodes){
        const branch=r.node.children!==undefined;if(!branch&&r.node.value===null)continue;
        const groupId=r.depth===0?r.node.id:r.groupId,legendItem=legend.find(l=>l.id===groupId),color=r.depth===0&&root.children.length?'#DDE5EF':legendItem?.color??palette[0]!,name=legendItem?.name??(r.node.label??r.node.id);
        let group=groups.get(groupId);if(!group){group={id:groupId,name,color,commands:[]};groups.set(groupId,group);}
        const [start,end]=angles.get(r.index)!,inner=r.depth*band,radius=(r.depth+1)*band,mid=start/2+end/2,anchor=inner/2+radius/2;
        const point=(a:number,length:number):Vertex=>({x:cx+Math.sin(a)*length,y:cy-Math.cos(a)*length});
        const painted=r.weight>0&&end>start,full=end-start===Math.PI*2;
        if(painted){
          if(full){const top=point(0,radius),bottom=point(Math.PI,radius);group.commands.push({kind:'M',...top},{kind:'A',radius,largeArc:0,sweep:1,...bottom},{kind:'A',radius,largeArc:0,sweep:1,...top});if(inner>0){const itop=point(0,inner),ibottom=point(Math.PI,inner);group.commands.push({kind:'Z'},{kind:'M',...itop},{kind:'A',radius:inner,largeArc:0,sweep:0,...ibottom},{kind:'A',radius:inner,largeArc:0,sweep:0,...itop});}group.commands.push({kind:'Z'});}
          else{group.commands.push({kind:'M',...point(start,inner)},{kind:'L',...point(start,radius)},{kind:'A',radius,largeArc:end-start>Math.PI?1:0,sweep:1,...point(end,radius)},{kind:'L',...point(end,inner)});if(inner>0)group.commands.push({kind:'A',radius:inner,largeArc:end-start>Math.PI?1:0,sweep:0,...point(start,inner)});group.commands.push({kind:'Z'});}
        }
        const label=r.node.label??r.node.id,p=r.depth===0?{x:cx,y:cy}:point(mid,anchor);
        observations.push({id:{seriesId:groupId,pointId:r.node.id},label,seriesName:name,value:branch?r.weight:r.node.value!,x:p.x,y:p.y,color,...(branch?{subtotal:true}:{}),...(r.missing?{incomplete:true}:{}),...(painted?{hit:{kind:'sector' as const,cx,cy,radius,innerRadius:inner,start,end}}:{})});
        let labelWidth=r.depth===0?radius*1.5:Math.min(100,(end-start)*anchor*.8),labelHeight=Math.min(20,band*.7);
        if(painted&&labelHeight>=14&&!ringLabelFits(p,labelWidth,labelHeight,cx,cy,inner,radius,start,end)){let low=0,high=labelWidth;for(let i=0;i<7;i++){const width=(low+high)/2;if(ringLabelFits(p,width,labelHeight,cx,cy,inner,radius,start,end))low=width;else high=width;}labelWidth=low;}
        if(painted&&annotations.length<64&&labelWidth>=36&&labelHeight>=14&&ringLabelFits(p,labelWidth,labelHeight,cx,cy,inner,radius,start,end)&&p.x-labelWidth/2>=plot.x&&p.x+labelWidth/2<=plot.x+plot.width&&p.y-labelHeight/2>=plot.y&&p.y+labelHeight/2<=plot.y+plot.height)annotations.push({x:p.x,y:p.y,text:boundedLabel(label,labelWidth),role:'label',box:{width:labelWidth,height:labelHeight,seriesId:groupId}});
      }
      const series:PlanSeries[]=[...groups.values()].map(g=>({...g,fill:true}));return freezePlan({status:observations.length?'ok':'empty',frame:{...base,series,observations,annotations,grid:[],labels:[]}});
    }
    const groups=new Map<string,{id:string;label:string}>();
    if(Object.hasOwn(input,'groups'))for(const [i,raw]of array(input.groups,15,'groups').entries()){const p='groups['+i+']',g=record(raw,['id','label'],['id','label'],p),id=text(g.id,p+'.id',128);if(id==='links'||groups.has(id))fail(p+'.id','BAD_GROUP_ID');groups.set(id,{id,label:text(g.label,p+'.label',256)});}
    const nodeIds=new Set<string>(),nodes=array(input.nodes,128,'nodes').map((raw,i)=>{const p='nodes['+i+']',n=record(raw,['id','label','groupId'],['id','label'],p),id=text(n.id,p+'.id',128);if(nodeIds.has(id))fail(p+'.id','DUPLICATE_NODE_ID');nodeIds.add(id);const groupId=Object.hasOwn(n,'groupId')?text(n.groupId,p+'.groupId',128):'nodes';if(groupId==='links'||groupId!=='nodes'&&!groups.has(groupId))fail(p+'.groupId','UNKNOWN_GROUP');return {id,label:text(n.label,p+'.label',256),groupId,index:i};});
    if(nodes.some(n=>n.groupId==='nodes')&&!groups.has('nodes'))groups.set('nodes',{id:'nodes',label:'Nodes'});if(groups.size>15)fail('groups','GRAPH_GROUP_LIMIT');
    if(hidden.some(id=>!groups.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
    const linkIds=new Set<string>(),pairs=new Set<string>(),links=array(input.links,512,'links').map((raw,i)=>{const p='links['+i+']',l=record(raw,['id','from','to'],['id','from','to'],p),id=text(l.id,p+'.id',128),from=text(l.from,p+'.from',128),to=text(l.to,p+'.to',128),pair=JSON.stringify([from,to]);if(linkIds.has(id)||pairs.has(pair)||from===to||!nodeIds.has(from)||!nodeIds.has(to))fail(p,'BAD_GRAPH_LINK');linkIds.add(id);pairs.add(pair);return {id,from,to};});
    const topology=(active:typeof nodes,edges:typeof links)=>{
      const byId=new Map(active.map(n=>[n.id,n])),incoming=new Map(active.map(n=>[n.id,[] as string[]])),outgoing=new Map(active.map(n=>[n.id,[] as string[]]));for(const l of edges){incoming.get(l.to)!.push(l.from);outgoing.get(l.from)!.push(l.to);}
      for(const list of [...incoming.values(),...outgoing.values()])list.sort((a,b)=>byId.get(a)!.index-byId.get(b)!.index);
      if(family==='treegraph'&&[...incoming.values()].some(list=>list.length>1))fail('links','TREEGRAPH_REQUIRES_FOREST');
      const pending=active.filter(n=>incoming.get(n.id)!.length===0),remaining=new Map(active.map(n=>[n.id,incoming.get(n.id)!.length])),depth=new Map(active.map(n=>[n.id,0])),order:string[]=[];
      while(pending.length){pending.sort((a,b)=>a.index-b.index);const node=pending.shift()!;order.push(node.id);for(const child of outgoing.get(node.id)!){depth.set(child,Math.max(depth.get(child)!,depth.get(node.id)!+1));remaining.set(child,remaining.get(child)!-1);if(remaining.get(child)===0)pending.push(byId.get(child)!);}}
      if(order.length!==active.length)fail('links','CYCLIC_GRAPH');return {byId,incoming,outgoing,depth,order};
    };
    topology(nodes,links); // Hidden groups never make invalid source topology valid.
    const visible=nodes.filter(n=>!hidden.includes(n.groupId)),visibleIds=new Set(visible.map(n=>n.id)),edges=links.filter(l=>visibleIds.has(l.from)&&visibleIds.has(l.to)),graph=topology(visible,edges),positions=new Map<string,Vertex>();
    const maxDepth=Math.max(0,...graph.depth.values());
    if(family==='treegraph'){
      let leaf=0;const roots=visible.filter(n=>graph.incoming.get(n.id)!.length===0),post:string[]=[],pending=roots.map(n=>n.id).reverse();while(pending.length){const id=pending.pop()!;post.push(id);const children=graph.outgoing.get(id)!;for(let i=children.length-1;i>=0;i--)pending.push(children[i]!);}
      const leafX=new Map<string,number>();for(const id of post)if(graph.outgoing.get(id)!.length===0)leafX.set(id,leaf++ + .5);
      for(let i=post.length-1;i>=0;i--){const id=post[i]!,children=graph.outgoing.get(id)!,x=children.length?(positions.get(children[0]!)!.x+positions.get(children[children.length-1]!)!.x)/2:leafX.get(id)!/Math.max(1,leaf);positions.set(id,{x,y:(graph.depth.get(id)!+.5)/(maxDepth+1)});}
    }else{
      const rows=Array.from({length:maxDepth+1},()=>[] as typeof visible);for(const n of visible)rows[graph.depth.get(n.id)!]!.push(n);
      const assign=()=>{for(const row of rows)for(const [i,n]of row.entries())positions.set(n.id,{x:(i+1)/(row.length+1),y:(graph.depth.get(n.id)!+.5)/(maxDepth+1)});};assign();
      for(let pass=0;pass<4;pass++){for(let rank=1;rank<rows.length;rank++){const score=(id:string)=>{const parents=graph.incoming.get(id)!;return parents.length?parents.reduce((sum,parent)=>sum+positions.get(parent)!.x,0)/parents.length:positions.get(id)!.x;};rows[rank]!.sort((a,b)=>score(a.id)-score(b.id)||a.index-b.index);assign();}}
    }
    if(horizontal)for(const [id,position]of positions)positions.set(id,{x:position.y,y:position.x});
    const config=options.viewport??{axes:'xy' as const};if(config.axes!=='xy')fail('options.viewport.axes','NODEGRAPH_XY_VIEWPORT_ONLY');
    const axes={x:{kind:'linear' as const,domain:[0,1] as const,nice:false},y:{kind:'linear' as const,domain:[0,1] as const,nice:false,reversed:true}},domains={x:[0,1] as const,y:[0,1] as const},prepared=preparePlanViewport(axes,domains,config);if(prepared.status==='invalid')return prepared;
    const view=prepared.value,displayed=withViewportDomains(domains,view),xScale=createLinearScale(displayed.x!,[plot.x,plot.x+plot.width],false),yScale=createLinearScale(displayed.y!,[plot.y,plot.y+plot.height],false);if(xScale.status==='invalid')return xScale;if(yScale.status==='invalid')return yScale;
    const map=(id:string):Vertex=>{const p=positions.get(id)!,x=xScale.value.map(p.x),y=yScale.value.map(p.y);if(x===null||y===null)fail('options.viewport','UNREPRESENTABLE_GRAPH_GEOMETRY');return {x,y};};
    const pixels=new Map(visible.map(n=>[n.id,map(n.id)])),rows=new Map<number,number[]>();for(const n of visible){const p=pixels.get(n.id)!;if(p.x>=plot.x-96&&p.x<=plot.x+plot.width+96&&p.y>=plot.y-32&&p.y<=plot.y+plot.height+32){const rank=graph.depth.get(n.id)!,row=rows.get(rank)??[];row.push(horizontal?p.y:p.x);rows.set(rank,row);}}
    let horizontalGap=Infinity;for(const row of rows.values()){row.sort((a,b)=>a-b);for(let i=1;i<row.length;i++)horizontalGap=Math.min(horizontalGap,row[i]!-row[i-1]!);}
    const rankGap=horizontal?plot.width/(maxDepth+1)/(displayed.x![1]-displayed.x![0]):plot.height/(maxDepth+1)/(displayed.y![1]-displayed.y![0]);
    const radius=Math.min(12,plot.width/3,plot.height/3,horizontalGap/3,rankGap/3),boxWidth=Math.min(96,plot.width*.78,horizontal?rankGap*.6:horizontalGap*.78),boxHeight=Math.min(32,plot.height*.6,horizontal?horizontalGap*.78:rankGap*.6);
    if(!(radius>0)||!(boxWidth>0)||!(boxHeight>0))fail('options.viewport','UNREPRESENTABLE_GRAPH_GEOMETRY');
    const linkCommands:PlanCommand[]=[];
    for(const l of edges){const from=pixels.get(l.from)!,to=pixels.get(l.to)!,offset=family==='treegraph'?radius:horizontal?boxWidth/2:boxHeight/2,start=horizontal?{x:from.x+offset,y:from.y}:{x:from.x,y:from.y+offset},end=horizontal?{x:to.x-offset,y:to.y}:{x:to.x,y:to.y-offset},middle=horizontal?start.x/2+end.x/2:start.y/2+end.y/2,first=horizontal?{x:middle,y:start.y}:{x:start.x,y:middle},last=horizontal?{x:middle,y:end.y}:{x:end.x,y:middle};
      if(family==='treegraph')connector({a:start,b:first,c:last,d:end},plot,linkCommands);
      else{const points=[start,first,last,end];for(let i=1;i<points.length;i++){const segment=clip(points[i-1]!,points[i]!,plot);if(segment)linkCommands.push({kind:'M',...segment[0]},{kind:'L',...segment[1]});}}
    }
    const legend=[...groups.values()].map((g,i)=>({id:g.id,name:g.label,color:palette[i%palette.length]!,visible:!hidden.includes(g.id)})),marks=new Map<string,{circles:PlanCircle[];bars:PlanBar[]}>(),observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];for(const g of legend)if(g.visible)marks.set(g.id,{circles:[],bars:[]});
    for(const n of visible){
      const p=pixels.get(n.id)!,group=legend.find(g=>g.id===n.groupId)!,paint=marks.get(n.groupId)!;let hit:PlanObservation['hit'];
      const anchor={x:Math.max(plot.x,Math.min(plot.x+plot.width,p.x)),y:Math.max(plot.y,Math.min(plot.y+plot.height,p.y))};
      if(family==='treegraph'){if(Math.hypot(p.x-anchor.x,p.y-anchor.y)>=radius)continue;paint.circles.push({pointId:n.id,cx:p.x,cy:p.y,radius});hit={kind:'circle',cx:p.x,cy:p.y,radius};}
      else{const x=Math.max(plot.x,p.x-boxWidth/2),y=Math.max(plot.y,p.y-boxHeight/2),right=Math.min(plot.x+plot.width,p.x+boxWidth/2),bottom=Math.min(plot.y+plot.height,p.y+boxHeight/2);if(right<=x||bottom<=y)continue;paint.bars.push({pointId:n.id,x,y,width:right-x,height:bottom-y});hit={kind:'polygon',vertices:[{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}]};}
      const incoming=graph.incoming.get(n.id)!.length,outgoing=graph.outgoing.get(n.id)!.length;observations.push({id:{seriesId:n.groupId,pointId:n.id},label:n.label,seriesName:group.name,value:incoming+outgoing,node:{incoming,outgoing,depth:graph.depth.get(n.id)!},x:anchor.x,y:anchor.y,color:group.color,hit});
      const labelWidth=family==='organization'?boxWidth-8:Math.min(120,plot.width*.9,horizontal?rankGap*.9:horizontalGap*.9),labelHeight=16,labelY=family==='organization'?p.y:p.y+radius+11;
      const rowGap=horizontal?horizontalGap:plot.height/(maxDepth+1)/(displayed.y![1]-displayed.y![0]);
      if(annotations.length<64&&labelWidth>=32&&(family==='organization'?boxHeight>=20:rowGap>=radius*2+22)&&p.x-labelWidth/2>=plot.x&&p.x+labelWidth/2<=plot.x+plot.width&&labelY-labelHeight/2>=plot.y&&labelY+labelHeight/2<=plot.y+plot.height)annotations.push({x:p.x,y:labelY,text:boundedLabel(n.label,labelWidth),role:'label',box:{width:labelWidth,height:labelHeight,seriesId:n.groupId}});
    }
    const series:PlanSeries[]=[...(linkCommands.length?[{id:'links',name:'Links',color:'#8190A5',commands:linkCommands}]:[]),...legend.filter(g=>g.visible).map(g=>({id:g.id,name:g.name,color:g.color,...(family==='treegraph'?{circles:marks.get(g.id)!.circles}:{bars:marks.get(g.id)!.bars})}))];
    return freezePlan({status:observations.length||linkCommands.length?'ok':'empty',frame:{schema:'nc-plan/1',family:family as 'treegraph'|'organization',title,description,unit:'Connections',width,height,legend,series,observations,annotations,grid:[],labels:[],viewport:planViewportState(view,{x:displayed.x,y:displayed.y},axes,plot)!}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
