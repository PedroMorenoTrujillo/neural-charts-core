/** Host-neutral Pictorial geometry. All coordinates are logical/normalized, never SVG input. */
import type {PlanPictorialVertex,PlanPictorialMesh} from '../public/pictorial-types.js';
import {pictorialOutlines} from './pictorial-outlines.generated.js';
export type Vertex=PlanPictorialVertex;
export type Mesh=PlanPictorialMesh;
export interface FilledBand {readonly pieces:readonly (readonly Vertex[])[];readonly loops:readonly (readonly Vertex[])[];readonly area:number;}
const EPS=1e-10;
const cross=(a:Vertex,b:Vertex,c:Vertex)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function signedArea(poly:readonly Vertex[]):number {
  let value=0;const origin=poly[0];if(!origin)return 0;
  for(let i=1;i<poly.length-1;i++)value+=cross(origin,poly[i]!,poly[i+1]!);
  return value/2;
}
function overlap(a:readonly Vertex[],b:readonly Vertex[]):boolean {
  // Relative edge orientation avoids cancellation in absolute dot projections:
  // shared endpoint/edge cross products are exactly zero, not a false sliver.
  for(const [poly,other]of [[a,b],[b,a]])for(let i=0;i<poly!.length;i++)if(other!.every(v=>cross(poly![i]!,poly![(i+1)%poly!.length]!,v)<=0))return false;
  return true;
}
export function validateMesh(mesh:Mesh):Mesh {
  if(typeof mesh.id!=='string'||!mesh.id.length||mesh.id.length>128)throw new Error('mesh.id');
  if(!Number.isFinite(mesh.aspectRatio)||mesh.aspectRatio<.1||mesh.aspectRatio>10)throw new Error('mesh.aspectRatio');
  if(!Array.isArray(mesh.vertices)||mesh.vertices.length<3||mesh.vertices.length>192)throw new Error('mesh.vertices');
  if(!Array.isArray(mesh.triangles)||!mesh.triangles.length||mesh.triangles.length>64)throw new Error('mesh.triangles');
  const vertices=mesh.vertices.map(v=>{
    if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.x<0||v.x>1||v.y<0||v.y>1)throw new Error('mesh.vertex');
    return{x:v.x,y:v.y};
  });
  for(let i=0;i<vertices.length;i++)for(let j=0;j<i;j++)if(Math.hypot(vertices[i]!.x-vertices[j]!.x,vertices[i]!.y-vertices[j]!.y)<=EPS)throw new Error('mesh.nearCoincidentVertices');
  if(Math.min(...vertices.map(v=>v.x))>EPS||Math.max(...vertices.map(v=>v.x))<1-EPS||Math.min(...vertices.map(v=>v.y))>EPS||Math.max(...vertices.map(v=>v.y))<1-EPS)throw new Error('mesh.bounds');
  const used=new Set<number>(),keys=new Set<string>();
  const triangles=mesh.triangles.map(t=>{
    if(!Array.isArray(t)||t.length!==3||t.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length)||new Set(t).size!==3)throw new Error('mesh.triangle');
    const [a,b,c]=t as [number,number,number],area=cross(vertices[a]!,vertices[b]!,vertices[c]!);
    if(Math.abs(area)<=EPS)throw new Error('mesh.degenerate');
    const key=[...t].sort((a,b)=>a-b).join(':');if(keys.has(key))throw new Error('mesh.duplicate');keys.add(key);t.forEach(i=>used.add(i));
    return(area>0?[a,b,c]:[a,c,b]) as [number,number,number];
  });
  if(used.size!==vertices.length)throw new Error('mesh.unusedVertex');
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(const triangle of triangles)for(let i=0;i<3;i++){
    const a=triangle[i]!,b=triangle[(i+1)%3]!,key=a<b?a+':'+b:b+':'+a,edge=edges.get(key);
    if(edge){if(++edge.count>2||edge.a===a)throw new Error('mesh.nonManifoldEdge');}
    else edges.set(key,{a,b,count:1});
  }
  for(const edge of edges.values())for(let i=0;i<vertices.length;i++)if(i!==edge.a&&i!==edge.b){
    const a=vertices[edge.a]!,b=vertices[edge.b]!,v=vertices[i]!,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),projection=((v.x-a.x)*dx+(v.y-a.y)*dy)/length;
    if(projection>EPS&&projection<length-EPS&&Math.abs(cross(a,b,v))/length<=EPS)throw new Error('mesh.tJunction');
  }
  const incoming=new Map<number,number>(),outgoing=new Map<number,number>();
  for(const edge of edges.values())if(edge.count===1){incoming.set(edge.b,(incoming.get(edge.b)??0)+1);outgoing.set(edge.a,(outgoing.get(edge.a)??0)+1);}
  for(const i of used)if((incoming.get(i)??0)!==(outgoing.get(i)??0)||(incoming.get(i)??0)>1)throw new Error('mesh.nonManifoldBoundary');
  for(let i=0;i<triangles.length;i++)for(let j=0;j<i;j++)if(overlap(triangles[i]!.map(n=>vertices[n]!),triangles[j]!.map(n=>vertices[n]!)))throw new Error('mesh.overlap');
  return {id:mesh.id,aspectRatio:mesh.aspectRatio,vertices,triangles};
}
/** Deliberately limited to non-self-intersecting preset outlines owned in this module. */
function triangulate(points:readonly Vertex[]):readonly (readonly [number,number,number])[] {
  const remaining=points.map((_,i)=>i);if(signedArea(points)<0)remaining.reverse();
  const result:[number,number,number][]=[];
  while(remaining.length>3){
    let found=false;
    for(let i=0;i<remaining.length;i++){
      const a=remaining[(i+remaining.length-1)%remaining.length]!,b=remaining[i]!,c=remaining[(i+1)%remaining.length]!;
      if(cross(points[a]!,points[b]!,points[c]!)<=EPS)continue;
      const blocked=remaining.some(n=>n!==a&&n!==b&&n!==c&&cross(points[a]!,points[b]!,points[n]!)>=-EPS&&cross(points[b]!,points[c]!,points[n]!)>=-EPS&&cross(points[c]!,points[a]!,points[n]!)>=-EPS);
      if(blocked)continue;
      result.push([a,b,c]);remaining.splice(i,1);found=true;break;
    }
    if(!found)throw new Error('preset.triangulation');
  }
  result.push([remaining[0]!,remaining[1]!,remaining[2]!]);return result;
}
const outlines=pictorialOutlines;
const preparedPresets=new Map<keyof typeof outlines,Mesh>();
export function presetMesh(name:keyof typeof outlines):Mesh {
  const previous=preparedPresets.get(name);if(previous)return previous;
  const outline=outlines[name];if(!outline)throw new Error('shape.preset');
  const vertices=outline.points.map(([x,y])=>({x,y}));
  // The generator verifies the exact eight-decimal vertices and winding.
  const reflected=vertices.slice(1,name==='bottle'?undefined:-1).reverse()
    .map(({x,y})=>({x:Math.round((1-x)*1e8)/1e8,y}));
  if(name==='bottle'){
    const first=vertices[0]!;
    vertices.unshift({x:Math.round((1-first.x)*1e8)/1e8,y:first.y});
  }
  vertices.push(...reflected);
  const mesh=validateMesh({id:'neural-'+name,aspectRatio:outline.aspectRatio,vertices,triangles:triangulate(vertices)});
  const owned=Object.freeze({...mesh,vertices:Object.freeze(mesh.vertices.map(vertex=>Object.freeze(vertex))),triangles:Object.freeze(mesh.triangles.map(triangle=>Object.freeze(triangle)))});
  preparedPresets.set(name,owned);
  return owned;
}
const key=(v:Vertex)=>v.x+','+v.y;
function unionBoundary(pieces:readonly (readonly Vertex[])[]):Vertex[][] {
  const edges=new Map<string,{a:Vertex;b:Vertex}>();
  for(const poly of pieces)for(let i=0;i<poly.length;i++){
    const a=poly[i]!,b=poly[(i+1)%poly.length]!;if(key(a)===key(b))continue;
    const direct=key(a)+'|'+key(b),reverse=key(b)+'|'+key(a);
    if(edges.has(reverse))edges.delete(reverse);else if(edges.has(direct))throw new Error('mesh.duplicateBoundary');else edges.set(direct,{a,b});
  }
  const starts=new Map<string,{a:Vertex;b:Vertex}[]>();
  for(const edge of edges.values()){const k=key(edge.a),list=starts.get(k)??[];list.push(edge);starts.set(k,list);}
  const loops:Vertex[][]=[];
  while(edges.size){
    const first=edges.values().next().value as {a:Vertex;b:Vertex};const loop:Vertex[]=[first.a];let edge=first;
    for(let step=0;step<=pieces.length*5;step++){
      edges.delete(key(edge.a)+'|'+key(edge.b));loop.push(edge.b);
      if(key(edge.b)===key(first.a))break;
      const next=starts.get(key(edge.b))?.find(e=>edges.has(key(e.a)+'|'+key(e.b)));
      if(!next)throw new Error('mesh.openBoundary');edge=next;
    }
    if(key(loop[0]!)!==key(loop[loop.length-1]!))throw new Error('mesh.boundaryBudget');
    loop.pop();if(loop.length>=3)loops.push(loop);
  }
  return loops;
}
/** Fraction 0 starts at the silhouette's bottom; fraction 1 reaches its top. */
export function fillBand(mesh:Mesh,low:number,high:number):FilledBand {
  if(!Number.isFinite(low)||!Number.isFinite(high)||low<0||high>1||high<low)throw new Error('band');
  if(low===high)return{pieces:[],loops:[],area:0};
  const top=1-high,bottom=1-low;
  if(top===bottom)return{pieces:[],loops:[],area:0};
  const cache=new Map<string,Vertex>();
  const pieces=mesh.triangles.map(triangle=>{
    const candidates=new Map<string,Vertex>();
    const add=(v:Vertex)=>candidates.set(key(v),v);
    for(const i of triangle){const v=mesh.vertices[i]!;if(v.y>=top&&v.y<=bottom)add(v);}
    for(let i=0;i<3;i++)for(const boundary of [top,bottom]){
      // Always interpolate the original edge in the same index direction. Adjacent
      // triangles receive the exact same vertex object, without coordinate rounding.
      const ia=triangle[i]!,ib=triangle[(i+1)%3]!,a=mesh.vertices[Math.min(ia,ib)]!,b=mesh.vertices[Math.max(ia,ib)]!;
      if(boundary<=Math.min(a.y,b.y)||boundary>=Math.max(a.y,b.y))continue;
      const ck=Math.min(ia,ib)+':'+Math.max(ia,ib)+':'+boundary;
      let v=cache.get(ck);if(!v){v={x:a.x+(b.x-a.x)*((boundary-a.y)/(b.y-a.y)),y:boundary};cache.set(ck,v);}add(v);
    }
    const poly=[...candidates.values()];
    if(poly.length<3)return[];
    const cx=poly.reduce((s,p)=>s+p.x,0)/poly.length,cy=poly.reduce((s,p)=>s+p.y,0)/poly.length;
    poly.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
    return poly;
  }).filter(p=>p.length>=3&&signedArea(p)>0);
  const area=pieces.reduce((sum,p)=>sum+signedArea(p),0);
  return{pieces,loops:unionBoundary(pieces),area};
}
export function hitBand(band:FilledBand,point:Vertex):boolean {
  return band.pieces.some(poly=>poly.every((a,i)=>cross(a,poly[(i+1)%poly.length]!,point)>=0));
}
