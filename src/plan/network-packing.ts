import {array,color,fail,number,record,text,ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {createLinearScale} from '../internal/math/linear.js';
import {withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {preparePlanViewport,planViewportState} from './viewport.js';
import {freezePlan} from './input.js';
import type {PlanAnnotation,PlanCircle,PlanCommand,PlanNetworkgraphSpec,PlanObservation,PlanOptions,PlanPackedBubbleSpec,PlanResult,PlanSeries} from '../public/plan-types.js';

type Vertex=Readonly<{x:number;y:number}>;
type Plot=Readonly<{x:number;y:number;width:number;height:number}>;
type Disc=Readonly<{id:string;radius:number;index:number}>;
type Placed=Disc&Readonly<{x:number;y:number}>;
const insideDisc=(p:Vertex,radius:number,plot:Plot)=>Math.hypot(p.x-Math.max(plot.x,Math.min(plot.x+plot.width,p.x)),p.y-Math.max(plot.y,Math.min(plot.y+plot.height,p.y)))<radius;
const shortLabel=(label:string,width:number)=>{const characters=Array.from(label),cap=Math.max(1,Math.floor(width/7));return characters.length<=cap?label:characters.slice(0,Math.max(1,cap-1)).join('')+'…';};
const key=(seriesId:string,pointId:string)=>JSON.stringify([seriesId,pointId]);

function clip(a:Vertex,b:Vertex,p:Plot):readonly[Vertex,Vertex]|null{
  let first=0,last=1;
  for(const [axis,low,high]of [['x',p.x,p.x+p.width],['y',p.y,p.y+p.height]] as const){if(a[axis]===b[axis]){if(a[axis]<low||a[axis]>high)return null;continue;}const at=(v:number)=>Number.isFinite(b[axis]-a[axis])&&Number.isFinite(v-a[axis])?(v-a[axis])/(b[axis]-a[axis]):(v/2-a[axis]/2)/(b[axis]/2-a[axis]/2),u=at(low),v=at(high);first=Math.max(first,Math.min(u,v));last=Math.min(last,Math.max(u,v));if(last<=first)return null;}
  const at=(t:number):Vertex=>({x:Math.max(p.x,Math.min(p.x+p.width,a.x*(1-t)+b.x*t)),y:Math.max(p.y,Math.min(p.y+p.height,a.y*(1-t)+b.y*t))}),start=at(first),end=at(last);return start.x===end.x&&start.y===end.y?null:[start,end];
}

/** Input-sized force budget: at most 160 iterations and one million n² work
 * units. No RNG, timer or physics service is retained; no timing claim is made.
 * Edge orientation has no effect on the undirected layout. */
function force(nodes:readonly Readonly<{id:string;index:number}>[],edges:readonly Readonly<{from:string;to:string}>[]):ReadonlyMap<string,Vertex>{
  if(!nodes.length)return new Map();if(nodes.length===1)return new Map([[nodes[0]!.id,{x:.5,y:.5}]]);
  const index=new Map(nodes.map((n,i)=>[n.id,i])),positions=nodes.map((n,i)=>{let hash=2166136261;for(const c of n.id)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;const angle=Math.PI*2*i/nodes.length+(hash%997)/997*.08,radius=.4+(hash%113)/113*.03;return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
  const pairs=edges.map(e=>{const a=index.get(e.from)!,b=index.get(e.to)!;return a<b?[a,b] as const:[b,a] as const;}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),ideal=Math.sqrt(1/nodes.length),iterations=Math.min(160,Math.max(1,Math.floor(1000000/(nodes.length*nodes.length))));
  for(let iteration=0;iteration<iterations;iteration++){
    const forces=positions.map(()=>({x:0,y:0}));
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
      let dx=positions[i]!.x-positions[j]!.x,dy=positions[i]!.y-positions[j]!.y,distance=Math.hypot(dx,dy);if(distance<1e-9){const angle=(i*131+j*17)*2.399963229728653;dx=Math.cos(angle)*1e-6;dy=Math.sin(angle)*1e-6;distance=1e-6;}
      const magnitude=ideal*ideal/distance,fx=dx/distance*magnitude,fy=dy/distance*magnitude;forces[i]!.x+=fx;forces[i]!.y+=fy;forces[j]!.x-=fx;forces[j]!.y-=fy;
    }
    for(const [a,b]of pairs){const dx=positions[a]!.x-positions[b]!.x,dy=positions[a]!.y-positions[b]!.y,distance=Math.hypot(dx,dy);if(distance===0)continue;const magnitude=distance*distance/ideal,fx=dx/distance*magnitude,fy=dy/distance*magnitude;forces[a]!.x-=fx;forces[a]!.y-=fy;forces[b]!.x+=fx;forces[b]!.y+=fy;}
    const temperature=.12*(1-iteration/iterations)+.001;
    for(let i=0;i<positions.length;i++){const p=positions[i]!,f=forces[i]!;f.x-=p.x*.2;f.y-=p.y*.2;const length=Math.hypot(f.x,f.y),step=Math.min(temperature,length);if(length){p.x=Math.max(-1,Math.min(1,p.x+f.x/length*step));p.y=Math.max(-1,Math.min(1,p.y+f.y/length*step));}}
  }
  // A deterministic final separation handles coincident clamped corners without
  // adding or dropping nodes, or changing any source metric.
  for(let i=0;i<positions.length;i++){const origin={...positions[i]!};for(let attempt=0;attempt<128;attempt++){if(positions.slice(0,i).every(p=>Math.hypot(p.x-positions[i]!.x,p.y-positions[i]!.y)>1e-5))break;const angle=(i*131+attempt)*2.399963229728653;positions[i]={x:origin.x+Math.cos(angle)*(attempt+1)*1e-4,y:origin.y+Math.sin(angle)*(attempt+1)*1e-4};}}
  const minX=Math.min(...positions.map(p=>p.x)),maxX=Math.max(...positions.map(p=>p.x)),minY=Math.min(...positions.map(p=>p.y)),maxY=Math.max(...positions.map(p=>p.y));
  return new Map(nodes.map((n,i)=>[n.id,{x:minX===maxX ? .5 : .08+(positions[i]!.x-minX)/(maxX-minX)*.84,y:minY===maxY ? .5 : .08+(positions[i]!.y-minY)/(maxY-minY)*.84}]));
}

function hull(circles:readonly Placed[]):readonly Placed[]{
  if(circles.length<=2)return circles;
  const sorted=[...circles].sort((a,b)=>a.x-b.x||a.y-b.y||a.index-b.index),cross=(a:Vertex,b:Vertex,c:Vertex)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),low:Placed[]=[],high:Placed[]=[];
  for(const p of sorted){while(low.length>=2&&cross(low[low.length-2]!,low[low.length-1]!,p)<=0)low.pop();low.push(p);}
  for(const p of [...sorted].reverse()){while(high.length>=2&&cross(high[high.length-2]!,high[high.length-1]!,p)<=0)high.pop();high.push(p);}low.pop();high.pop();return [...low,...high];
}

/** Tangency candidates on the current centre hull, checked against a spatial
 * grid. If the finite candidate budget expires, an exterior placement is
 * constructively disjoint from the entire current enclosing disc. No radius
 * is changed to make a fit. The helper's numerical normalization is undone. */
function pack(input:readonly Disc[],effort:{remaining:number}):Readonly<{circles:readonly Placed[];radius:number}>{
  if(!input.length)return {circles:[],radius:0};
  const maximum=Math.max(...input.map(p=>p.radius));if(!(maximum>0)||!Number.isFinite(maximum))fail('series.data','UNREPRESENTABLE_PACKED_RADIUS');
  const source=[...input].sort((a,b)=>b.radius-a.radius||a.index-b.index),rawRadius=new Map(input.map(p=>[p.id,p.radius])),placed:Placed[]=[],grid=new Map<string,Placed[]>(),gap=1e-6;let enclosing=0;
  const insert=(circle:Placed)=>{placed.push(circle);const k=JSON.stringify([Math.floor(circle.x),Math.floor(circle.y)]),bucket=grid.get(k)??[];bucket.push(circle);grid.set(k,bucket);enclosing=Math.max(enclosing,Math.hypot(circle.x,circle.y)+circle.radius);};
  for(const item of source){
    const radius=item.radius/maximum;if(!(radius>0))fail('series.data','UNREPRESENTABLE_PACKED_RADIUS');
    if(!placed.length){insert({...item,radius,x:0,y:0});continue;}
    let best:Vertex|undefined,bestSize=Infinity;
    if(effort.remaining>0){
      const frontier=hull(placed),candidates:Vertex[]=[];
      for(let i=0;i<frontier.length;i++){
        const a=frontier[i]!,b=frontier[(i+1)%frontier.length]!,dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),ra=a.radius+radius+gap,rb=b.radius+radius+gap;
        const ray=Math.hypot(a.x,a.y);candidates.push({x:a.x+(ray?a.x/ray:1)*ra,y:a.y+(ray?a.y/ray:0)*ra});
        if(distance>0&&distance<=ra+rb&&distance>=Math.abs(ra-rb)){const along=(ra*ra-rb*rb+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,ra*ra-along*along)),ux=dx/distance,uy=dy/distance;candidates.push({x:a.x+ux*along-uy*height,y:a.y+uy*along+ux*height},{x:a.x+ux*along+uy*height,y:a.y+uy*along-ux*height});}
      }
      for(const candidate of candidates){
        if(effort.remaining<=0)break;
        const size=Math.max(enclosing,Math.hypot(candidate.x,candidate.y)+radius);if(size>bestSize)continue;
        let valid=true;const reach=radius+1+gap;
        outer:for(let x=Math.floor(candidate.x-reach);x<=Math.floor(candidate.x+reach);x++)for(let y=Math.floor(candidate.y-reach);y<=Math.floor(candidate.y+reach);y++)for(const other of grid.get(JSON.stringify([x,y]))??[]){if(--effort.remaining<0){valid=false;break outer;}if(Math.hypot(candidate.x-other.x,candidate.y-other.y)<radius+other.radius+gap*.5){valid=false;break outer;}}
        if(valid&&(size<bestSize||size===bestSize&&(!best||candidate.y<best.y||candidate.y===best.y&&candidate.x<best.x))){best=candidate;bestSize=size;}
      }
    }
    insert({...item,radius,x:best?.x??enclosing+radius+gap,y:best?.y??0});
  }
  const left=Math.min(...placed.map(p=>p.x-p.radius)),right=Math.max(...placed.map(p=>p.x+p.radius)),top=Math.min(...placed.map(p=>p.y-p.radius)),bottom=Math.max(...placed.map(p=>p.y+p.radius)),cx=left/2+right/2,cy=top/2+bottom/2;
  const circles=placed.map(p=>({...p,x:(p.x-cx)*maximum,y:(p.y-cy)*maximum,radius:rawRadius.get(p.id)!})),radius=Math.max(...circles.map(p=>Math.hypot(p.x,p.y)+p.radius));return {circles,radius};
}

function viewport(options:PlanOptions,plot:Plot,isotropic:boolean){
  const config=options.viewport??{axes:'xy' as const};if(config.axes!=='xy')fail('options.viewport.axes','XY_VIEWPORT_REQUIRED');
  const axes={x:{type:'linear' as const,domain:[0,1] as const,nice:false},y:{type:'linear' as const,domain:[0,1] as const,nice:false,reversed:true}},domains={x:[0,1] as const,y:[0,1] as const},prepared=preparePlanViewport(axes,domains,config);if(prepared.status==='invalid')throw new ValidationFailure(prepared.diagnostic);
  const view=prepared.value,displayed=withViewportDomains(domains,view),spanX=displayed.x![1]-displayed.x![0],spanY=displayed.y![1]-displayed.y![0];
  if(isotropic&&(Math.abs(spanX-spanY)>Math.max(spanX,spanY)*1e-10||spanX<.125-1e-12||spanY<.125-1e-12))fail('options.viewport','PACKED_ISOTROPIC_VIEWPORT_LIMIT');
  const x=createLinearScale(displayed.x!,[plot.x,plot.x+plot.width],false),y=createLinearScale(displayed.y!,[plot.y,plot.y+plot.height],false);if(x.status==='invalid')throw new ValidationFailure(x.diagnostic);if(y.status==='invalid')throw new ValidationFailure(y.diagnostic);
  const state=planViewportState(view,{x:displayed.x,y:displayed.y},axes,plot)!;
  const bounded=isotropic?{...state,bounds:{x:{...state.bounds.x,limits:{minSpan:.125}},y:{...state.bounds.y,limits:{minSpan:.125}}}}:state;
  const map=(p:Vertex):Vertex=>{const px=x.value.map(p.x),py=y.value.map(p.y);if(px===null||py===null)fail('options.viewport','UNREPRESENTABLE_LAYOUT_GEOMETRY');return {x:px,y:py};};return {state:bounded,map,span:spanX};
}

export function planNetworkPacking(spec:PlanNetworkgraphSpec|PlanPackedBubbleSpec,options:PlanOptions):PlanResult{
  try{
    const family=record(spec,['family','title','description','nodes','links','groups','series','splitSeries'],['family'],'spec').family;if(family!=='networkgraph'&&family!=='packedbubble')fail('family');
    const input=record(spec,family==='networkgraph'?['family','title','description','nodes','links','groups']:['family','title','description','series','splitSeries'],['family','title',...(family==='networkgraph'?['nodes','links']:['series'])],'spec'),title=text(input.title,'title'),description=Object.hasOwn(input,'description')?text(input.description,'description',4096,true):'';
    const opts=record(options,['width','height','hiddenSeriesIds','viewport','references','stacking'],['width','height'],'options');if(Object.hasOwn(opts,'references')||Object.hasOwn(opts,'stacking'))fail('options','UNSUPPORTED_LAYOUT_OPTION');
    const width=number(opts.width,'options.width',64,10000),height=number(opts.height,'options.height',64,10000),full={x:16,y:14,width:width-32,height:height-28},hidden=Object.hasOwn(opts,'hiddenSeriesIds')?array(opts.hiddenSeriesIds,16,'options.hiddenSeriesIds').map((id,i)=>text(id,'options.hiddenSeriesIds['+i+']',128)):[];if(new Set(hidden).size!==hidden.length)fail('options.hiddenSeriesIds','BAD_VISIBILITY');
    const palette=defaultPalette('light',false).series;
    if(family==='networkgraph'){
      const groups=new Map<string,{id:string;label:string}>();if(Object.hasOwn(input,'groups'))for(const [i,raw]of array(input.groups,15,'groups').entries()){const path='groups['+i+']',g=record(raw,['id','label'],['id','label'],path),id=text(g.id,path+'.id',128);if(id==='links'||groups.has(id))fail(path,'BAD_GROUP_ID');groups.set(id,{id,label:text(g.label,path+'.label',256)});}
      const ids=new Set<string>(),nodes=array(input.nodes,128,'nodes').map((raw,index)=>{const path='nodes['+index+']',n=record(raw,['id','label','groupId'],['id','label'],path),id=text(n.id,path+'.id',128),groupId=Object.hasOwn(n,'groupId')?text(n.groupId,path+'.groupId',128):'nodes';if(ids.has(id))fail(path,'DUPLICATE_NODE_ID');ids.add(id);if(groupId==='links'||groupId!=='nodes'&&!groups.has(groupId))fail(path+'.groupId','UNKNOWN_GROUP');return {id,label:text(n.label,path+'.label',256),groupId,index};});
      if(nodes.some(n=>n.groupId==='nodes')&&!groups.has('nodes'))groups.set('nodes',{id:'nodes',label:'Nodes'});if(groups.size>15)fail('groups','GRAPH_GROUP_LIMIT');if(hidden.some(id=>!groups.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');
      const linkIds=new Set<string>(),pairs=new Set<string>(),links=array(input.links,512,'links').map((raw,i)=>{const path='links['+i+']',l=record(raw,['id','from','to'],['id','from','to'],path),id=text(l.id,path+'.id',128),from=text(l.from,path+'.from',128),to=text(l.to,path+'.to',128),pair=JSON.stringify([from,to].sort());if(linkIds.has(id)||pairs.has(pair)||from===to||!ids.has(from)||!ids.has(to))fail(path,'BAD_UNDIRECTED_LINK');linkIds.add(id);pairs.add(pair);return {id,from,to};});
      const visible=nodes.filter(n=>!hidden.includes(n.groupId)),visibleIds=new Set(visible.map(n=>n.id)),edges=links.filter(l=>visibleIds.has(l.from)&&visibleIds.has(l.to)),layout=force(visible,edges),view=viewport(options,full,false),pixels=new Map(visible.map(n=>[n.id,view.map(layout.get(n.id)!)]));
      const near=visible.filter(n=>{const p=pixels.get(n.id)!;return p.x>=full.x-12&&p.x<=full.x+full.width+12&&p.y>=full.y-12&&p.y<=full.y+full.height+12;});let distance=Infinity;for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++){const a=pixels.get(near[i]!.id)!,b=pixels.get(near[j]!.id)!;distance=Math.min(distance,Math.hypot(a.x-b.x,a.y-b.y));}
      const radius=Math.min(12,full.width/3,full.height/3,distance/3);if(!(radius>0))fail('nodes','UNREPRESENTABLE_NETWORK_LAYOUT');
      const incoming=new Map(visible.map(n=>[n.id,0])),outgoing=new Map(visible.map(n=>[n.id,0]));for(const l of edges){incoming.set(l.to,incoming.get(l.to)!+1);outgoing.set(l.from,outgoing.get(l.from)!+1);}
      const commands:PlanCommand[]=[];for(const l of edges){const a=pixels.get(l.from)!,b=pixels.get(l.to)!,length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length,line=clip({x:a.x+dx*radius,y:a.y+dy*radius},{x:b.x-dx*radius,y:b.y-dy*radius},full);if(line)commands.push({type:'M',...line[0]},{type:'L',...line[1]});}
      const legend=[...groups.values()].map((g,i)=>({id:g.id,name:g.label,color:palette[i%palette.length]!,visible:!hidden.includes(g.id)})),marks=new Map(legend.filter(g=>g.visible).map(g=>[g.id,[] as PlanCircle[]])),observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
      const painted=near.filter(n=>insideDisc(pixels.get(n.id)!,radius,full));
      for(const n of painted){const p=pixels.get(n.id)!,g=legend.find(l=>l.id===n.groupId)!,inc=incoming.get(n.id)!,out=outgoing.get(n.id)!;marks.get(n.groupId)!.push({pointId:n.id,cx:p.x,cy:p.y,radius});observations.push({id:{seriesId:n.groupId,pointId:n.id},label:n.label,seriesName:g.name,value:inc+out,node:{incoming:inc,outgoing:out,directed:false},x:Math.max(full.x,Math.min(full.x+full.width,p.x)),y:Math.max(full.y,Math.min(full.y+full.height,p.y)),color:g.color,hit:{type:'circle',cx:p.x,cy:p.y,radius}});
        const labelWidth=Math.min(120,full.width*.8,distance*.7),labelY=p.y+radius+11,box={left:p.x-labelWidth/2,right:p.x+labelWidth/2,top:labelY-8,bottom:labelY+8};
        const overlapsNode=painted.some(other=>{if(other.id===n.id)return false;const q=pixels.get(other.id)!;return Math.hypot(q.x-Math.max(box.left,Math.min(box.right,q.x)),q.y-Math.max(box.top,Math.min(box.bottom,q.y)))<radius+2;}),overlapsLabel=annotations.some(a=>Math.abs(a.x-p.x)<(a.box!.width+labelWidth)/2&&Math.abs(a.y-labelY)<16);
        if(annotations.length<64&&labelWidth>=32&&box.left>=full.x&&box.right<=full.x+full.width&&box.top>=full.y&&box.bottom<=full.y+full.height&&!overlapsNode&&!overlapsLabel)annotations.push({x:p.x,y:labelY,text:shortLabel(n.label,labelWidth),role:'label',box:{width:labelWidth,height:16,seriesId:n.groupId}});
      }
      const series:PlanSeries[]=[...(commands.length?[{id:'links',name:'Links',color:'#8190A5',commands}]:[]),...legend.filter(g=>g.visible).map(g=>({id:g.id,name:g.name,color:g.color,circles:marks.get(g.id)!}))];return freezePlan({status:observations.length||commands.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'networkgraph',title,description,unit:'Connections',width,height,legend,series,observations,annotations,grid:[],labels:[],viewport:view.state}});
    }
    if(Object.hasOwn(input,'splitSeries')&&typeof input.splitSeries!=='boolean')fail('splitSeries');const splitSeries=input.splitSeries!==false,seriesIds=new Set<string>();let count=0,index=0;
    const source=array(input.series,16,'series').map((raw,i)=>{const path='series['+i+']',s=record(raw,['id','name','color','data'],['id','name','data'],path),id=text(s.id,path+'.id',128),name=text(s.name,path+'.name');if(seriesIds.has(id))fail(path+'.id','DUPLICATE_SERIES_ID');seriesIds.add(id);const ids=new Set<string>(),data=array(s.data,256,path+'.data').map((raw,j)=>{if(++count>256)fail('series.data','PACKED_POINT_LIMIT');const pp=path+'.data['+j+']',p=record(raw,['id','label','value'],['id','value'],pp),pid=text(p.id,pp+'.id',128);if(ids.has(pid))fail(pp+'.id','DUPLICATE_POINT_ID');ids.add(pid);return {id:pid,label:Object.hasOwn(p,'label')?text(p.label,pp+'.label',200):undefined,value:p.value===null?null:number(p.value,pp+'.value',0),index:index++};});return {id,name,color:Object.hasOwn(s,'color')?color(s.color,path+'.color'):palette[i%palette.length]!,data};});
    if(hidden.some(id=>!seriesIds.has(id)))fail('options.hiddenSeriesIds','UNKNOWN_SERIES');const visible=source.filter(s=>!hidden.includes(s.id)),maximum=Math.max(0,...visible.flatMap(s=>s.data.map(p=>p.value??0))),effort={remaining:2000000};
    const raw=new Map<string,Placed>();
    if(maximum>0){
      const discs=(s:typeof source[number]):Disc[]=>s.data.flatMap(p=>p.value!==null&&p.value>0?[{id:key(s.id,p.id),radius:Math.sqrt(p.value)/Math.sqrt(maximum),index:p.index}]:[]);
      if(splitSeries){const clusters=visible.map((s,i)=>({series:s,index:i,packing:pack(discs(s),effort)})).filter(c=>c.packing.circles.length),parents=pack(clusters.map(c=>({id:c.series.id,radius:c.packing.radius,index:c.index})),effort),positions=new Map(parents.circles.map(p=>[p.id,p]));for(const c of clusters){const parent=positions.get(c.series.id)!;for(const p of c.packing.circles)raw.set(p.id,{...p,x:p.x+parent.x,y:p.y+parent.y});}}
      else for(const p of pack(visible.flatMap(discs),effort).circles)raw.set(p.id,p);
    }
    const all=[...raw.values()];let enclosing=Math.max(0,...all.map(p=>Math.hypot(p.x,p.y)+p.radius));if(all.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!(p.radius>0))||!Number.isFinite(enclosing))fail('series.data','UNREPRESENTABLE_PACKED_GEOMETRY');
    const normalized=new Map(all.map(p=>[p.id,{...p,x:.5+p.x/enclosing*.47,y:.5+p.y/enclosing*.47,radius:p.radius/enclosing*.47}]));
    const packed=[...normalized.values()];for(let i=0;i<packed.length;i++)for(let j=i+1;j<packed.length;j++)if(Math.hypot(packed[i]!.x-packed[j]!.x,packed[i]!.y-packed[j]!.y)<packed[i]!.radius+packed[j]!.radius)fail('series.data','UNREPRESENTABLE_PACKED_GEOMETRY');
    const side=Math.min(full.width,full.height),plot={x:width/2-side/2,y:height/2-side/2,width:side,height:side},view=viewport(options,plot,true),legend=source.map(s=>({id:s.id,name:s.name,color:s.color,visible:!hidden.includes(s.id)})),series:PlanSeries[]=[],observations:PlanObservation[]=[],annotations:PlanAnnotation[]=[];
    for(const s of visible){const circles:PlanCircle[]=[];for(const p of s.data){if(p.value===null)continue;if(p.value===0){observations.push({id:{seriesId:s.id,pointId:p.id},label:p.label??p.id,seriesName:s.name,value:0,x:width/2,y:height/2,color:s.color});continue;}const disc=normalized.get(key(s.id,p.id))!,center=view.map(disc),radius=disc.radius*side/view.span;if(!(radius>0)||!Number.isFinite(radius))fail('series.data','UNREPRESENTABLE_PACKED_RADIUS');if(!insideDisc(center,radius,plot))continue;circles.push({pointId:p.id,cx:center.x,cy:center.y,radius});observations.push({id:{seriesId:s.id,pointId:p.id},label:p.label??p.id,seriesName:s.name,value:p.value,x:Math.max(plot.x,Math.min(plot.x+side,center.x)),y:Math.max(plot.y,Math.min(plot.y+side,center.y)),color:s.color,hit:{type:'circle',cx:center.x,cy:center.y,radius}});
        const labelWidth=Math.min(120,radius*1.4);if(p.label&&annotations.length<64&&radius>=14&&labelWidth>=32&&center.x-labelWidth/2>=plot.x&&center.x+labelWidth/2<=plot.x+side&&center.y-8>=plot.y&&center.y+8<=plot.y+side)annotations.push({x:center.x,y:center.y,text:shortLabel(p.label,labelWidth),role:'label',box:{width:labelWidth,height:16,seriesId:s.id}});
      }series.push({id:s.id,name:s.name,color:s.color,circles});}
    return freezePlan({status:observations.length?'ok':'empty',frame:{schema:'nc-plan/1',family:'packedbubble',title,description,unit:'',width,height,legend,series,observations,annotations,grid:[],labels:[],viewport:view.state}});
  }catch(error){return error instanceof ValidationFailure?{status:'invalid',diagnostic:error.diagnostic}:{status:'invalid',diagnostic:{code:'INVALID_CONFIG',reason:'BAD_SPEC',path:'spec',message:'BAD_SPEC'}};}
}
