/** Host-neutral Pictorial geometry. All coordinates are logical/normalized, never SVG input. */
import type {PlanPictorialVertex,PlanPictorialMesh} from '../public/pictorial-types.js';
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
// Rounded outlines are precomputed data: no curve subdivision runs while planning.
const outlines:Record<'person'|'bottle'|'heart',{aspectRatio:number;points:readonly (readonly [number,number])[]}>= {
  person:{aspectRatio:0.56,points:[[0.46721311,0],[0.53278689,0],[0.59084699,0.005],[0.64139344,0.015],[0.68442623,0.03],[0.71994536,0.05],[0.7465847,0.071875],[0.76434426,0.095625],[0.77322404,0.12125],[0.77322404,0.14875],[0.76434426,0.174375],[0.7465847,0.198125],[0.73770492,0.21],[0.66666667,0.25],[0.68852459,0.275],[0.80327869,0.285],[0.90710383,0.355],[1,0.485],[1,0.565],[0.90710383,0.595],[0.81967213,0.5625],[0.73770492,0.4675],[0.69398907,0.475],[0.68852459,0.585],[0.72131148,0.73],[0.79234973,0.91],[0.75956284,1],[0.62295082,1],[0.54098361,0.9425],[0.5136612,0.8275],[0.4863388,0.8275],[0.45901639,0.9425],[0.37704918,1],[0.24043716,1],[0.20765027,0.91],[0.27868852,0.73],[0.31147541,0.585],[0.30601093,0.475],[0.26229508,0.4675],[0.18032787,0.5625],[0.09289617,0.595],[0,0.565],[0,0.485],[0.09289617,0.355],[0.19672131,0.285],[0.31147541,0.275],[0.33333333,0.25],[0.2534153,0.198125],[0.23565574,0.174375],[0.22677596,0.14875],[0.22677596,0.12125],[0.23565574,0.095625],[0.2534153,0.071875],[0.28005464,0.05],[0.31557377,0.03],[0.35860656,0.015],[0.40915301,0.005]]},
  bottle:{aspectRatio:0.42,points:[[0.45,0],[0.55,0],[0.625,0.01125],[0.675,0.03375],[0.7,0.0675],[0.7,0.1125],[0.714375,0.154375],[0.743125,0.193125],[0.78625,0.22875],[0.84375,0.26125],[0.89125,0.29125],[0.92875,0.31875],[0.95625,0.34375],[0.97375,0.36625],[0.986875,0.41625],[0.995625,0.49375],[1,0.59875],[1,0.73125],[0.99375,0.835],[0.98125,0.91],[0.9625,0.95625],[0.9375,0.97375],[0.86875,0.986875],[0.75625,0.995625],[0.6,1],[0.4,1],[0.24375,0.995625],[0.13125,0.986875],[0.0625,0.97375],[0.0375,0.95625],[0.01875,0.91],[0.00625,0.835],[0,0.73125],[0,0.59875],[0.004375,0.49375],[0.013125,0.41625],[0.02625,0.36625],[0.04375,0.34375],[0.07125,0.31875],[0.10875,0.29125],[0.15625,0.26125],[0.21375,0.22875],[0.256875,0.193125],[0.285625,0.154375],[0.3,0.1125],[0.3,0.0675],[0.325,0.03375],[0.375,0.01125]]},
  heart:{aspectRatio:1,points:[[0.5675,0.1056338],[0.6125,0.06338028],[0.6575,0.03169014],[0.7025,0.01056338],[0.7475,0],[0.7925,0],[0.835,0.01126761],[0.875,0.03380282],[0.9125,0.06760563],[0.9475,0.11267606],[0.97375,0.15985915],[0.99125,0.20915493],[1,0.26056338],[1,0.31408451],[0.99375,0.36830986],[0.98125,0.42323944],[0.9625,0.47887324],[0.9375,0.53521127],[0.89375,0.60915493],[0.83125,0.70070423],[0.75,0.80985915],[0.5,1],[0.25,0.80985915],[0.16875,0.70070423],[0.10625,0.60915493],[0.0625,0.53521127],[0.0375,0.47887324],[0.01875,0.42323944],[0.00625,0.36830986],[0,0.31408451],[0,0.26056338],[0.00875,0.20915493],[0.02625,0.15985915],[0.0525,0.11267606],[0.0875,0.06760563],[0.125,0.03380282],[0.165,0.01126761],[0.2075,0],[0.2525,0],[0.2975,0.01056338],[0.3425,0.03169014],[0.3875,0.06338028],[0.4325,0.1056338],[0.4775,0.12676056],[0.5225,0.12676056]]},
};
const preparedPresets=new Map<keyof typeof outlines,Mesh>();
export function presetMesh(name:keyof typeof outlines):Mesh {
  const previous=preparedPresets.get(name);if(previous)return previous;
  const outline=outlines[name];if(!outline)throw new Error('shape.preset');
  const vertices=outline.points.map(([x,y])=>({x,y}));
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
