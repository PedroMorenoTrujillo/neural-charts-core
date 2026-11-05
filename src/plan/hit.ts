import type {PlanFrame,PlanHitRegion,PlanObservation} from '../public/plan-types.js';

/** Exact membership in Core-projected geometry; no DOM, labels or pointer state. */
export function containsPlanHit(hit:PlanHitRegion,x:number,y:number):boolean{
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(hit.type==='circle')return Math.hypot(x-hit.cx,y-hit.cy)<=hit.radius;
  if(hit.type==='compoundPolygon')return hit.polygons.some(vertices=>containsPlanHit({type:'polygon',vertices},x,y));
  if(hit.type==='sector'){
    const radius=Math.hypot(x-hit.cx,y-hit.cy);if(radius<hit.innerRadius||radius>hit.radius)return false;
    const tau=Math.PI*2,normalize=(angle:number)=>(angle%tau+tau)%tau;
    if(Math.abs(hit.end-hit.start)<1e-12)return false;
    return Math.abs(hit.end-hit.start)>=tau-1e-12||normalize(Math.atan2(y-hit.cy,x-hit.cx)-hit.start)<=normalize(hit.end-hit.start);
  }
  let inside=false;const vertices=hit.vertices;if(vertices.length<3)return false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i]!,b=vertices[j]!,cross=(x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);
    if(Math.abs(cross)<=1e-7*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))&&x>=Math.min(a.x,b.x)-1e-7&&x<=Math.max(a.x,b.x)+1e-7&&y>=Math.min(a.y,b.y)-1e-7&&y<=Math.max(a.y,b.y)+1e-7)return true;
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

/** Region families require membership, not nearest-anchor selection. Other
 * families keep their renderer's delegated primitive/point index strategy. */
export function hitTestPlanRegion(frame:PlanFrame,x:number,y:number):PlanObservation|undefined{
  if(!Number.isFinite(x)||!Number.isFinite(y))return undefined;
  if(frame.family==='venn'){
    let mask=0;for(const circle of frame.vennLayout?.circles??[])if(Math.hypot(x-circle.cx,y-circle.cy)<=circle.radius)mask|=circle.bit;
    return mask?frame.observations.find(observation=>observation.venn?.mask===mask):undefined;
  }
  if(frame.family!=='contour'&&frame.family!=='pictorial')return undefined;
  for(let i=frame.observations.length-1;i>=0;i--){const observation=frame.observations[i]!;if(observation.hit&&containsPlanHit(observation.hit,x,y))return observation;}
  return undefined;
}

interface Bounds {left:number;top:number;right:number;bottom:number;}
interface Entry {readonly observation:PlanObservation;readonly hit:PlanHitRegion;readonly rank:number;readonly bounds:Bounds;}
interface Branch {readonly bounds:Bounds;readonly rank:number;readonly entries?:readonly Entry[];readonly left?:Branch;readonly right?:Branch;}
export interface PlanRegionHitIndex {readonly query:(x:number,y:number)=>PlanObservation|undefined;}
function boundsOf(hit:PlanHitRegion):Bounds|undefined{
  if(hit.type==='circle'||hit.type==='sector')return {left:hit.cx-hit.radius,top:hit.cy-hit.radius,right:hit.cx+hit.radius,bottom:hit.cy+hit.radius};
  const polygons=hit.type==='polygon'?[hit.vertices]:hit.polygons;let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const polygon of polygons)for(const point of polygon){left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);}
  return [left,top,right,bottom].every(Number.isFinite)?{left,top,right,bottom}:undefined;
}
const inBounds=(bounds:Bounds,x:number,y:number)=>x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom;
function branch(entries:Entry[]):Branch{
  const bounds:Bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};let rank=-1;
  for(const entry of entries){bounds.left=Math.min(bounds.left,entry.bounds.left);bounds.top=Math.min(bounds.top,entry.bounds.top);bounds.right=Math.max(bounds.right,entry.bounds.right);bounds.bottom=Math.max(bounds.bottom,entry.bounds.bottom);rank=Math.max(rank,entry.rank);}
  if(entries.length<=8)return {bounds,rank,entries:entries.sort((a,b)=>b.rank-a.rank)};
  const horizontal=bounds.right-bounds.left>=bounds.bottom-bounds.top;
  entries.sort((a,b)=>horizontal?(a.bounds.left/2+a.bounds.right/2)-(b.bounds.left/2+b.bounds.right/2)||a.rank-b.rank:(a.bounds.top/2+a.bounds.bottom/2)-(b.bounds.top/2+b.bounds.bottom/2)||a.rank-b.rank);
  const middle=Math.floor(entries.length/2);return {bounds,rank,left:branch(entries.slice(0,middle)),right:branch(entries.slice(middle))};
}
/** Build once per geometry revision. Bounding hierarchy avoids a dataset scan
 * on each pointer move; rank pruning preserves the last-painted region. */
export function preparePlanRegionHit(frame:PlanFrame):PlanRegionHitIndex|undefined{
  if(frame.family==='venn'){
    const circles=frame.vennLayout?.circles??[],byMask=new Map(frame.observations.filter(observation=>observation.venn).map(observation=>[observation.venn!.mask,observation]));
    return Object.freeze({query(x:number,y:number){if(!Number.isFinite(x)||!Number.isFinite(y))return undefined;let mask=0;for(const circle of circles)if(Math.hypot(x-circle.cx,y-circle.cy)<=circle.radius)mask|=circle.bit;return mask?byMask.get(mask):undefined;}});
  }
  if(frame.family!=='contour'&&frame.family!=='pictorial')return undefined;
  const entries:Entry[]=[];for(const [rank,observation]of frame.observations.entries()){if(!observation.hit)continue;const bounds=boundsOf(observation.hit);if(bounds)entries.push({observation,hit:observation.hit,rank,bounds});}
  const root=entries.length?branch(entries):undefined;
  return Object.freeze({query(x:number,y:number){
    if(!root||!Number.isFinite(x)||!Number.isFinite(y))return undefined;let best:Entry|undefined;
    const visit=(node:Branch)=>{if(node.rank<=(best?.rank??-1)||!inBounds(node.bounds,x,y))return;
      if(node.entries){for(const entry of node.entries){if(entry.rank<=(best?.rank??-1))break;if(inBounds(entry.bounds,x,y)&&containsPlanHit(entry.hit,x,y)){best=entry;break;}}return;}
      const a=node.left!,b=node.right!;if(a.rank>b.rank){visit(a);visit(b);}else{visit(b);visit(a);}
    };visit(root);return best?.observation;
  }});
}
