import type {PathCommand} from '../internal/geometry/path.js';
import {MAX_PATH_COMMANDS} from '../internal/geometry/path.js';

type Vertex = Readonly<{x:number;y:number}>;
type Band = Readonly<{id:string;a:Vertex;b:Vertex;c:Vertex;d:Vertex;key:string}>;
/** Common smoothstep interpolation is a convex combination of both signed
 * boundaries. Shared knots preserve adjacent stacks, sums, gaps and zero splits.
 * Endpoint derivatives are zero (C1); the flattening error is at most .25px. */
export function smoothStackBands(fills:ReadonlyMap<string,readonly PathCommand[]>):ReadonlyMap<string,Readonly<{commands:readonly PathCommand[];areaCommands:readonly PathCommand[]}>> {
  const bands:Band[]=[],steps=new Map<string,number>();
  for(const [id,commands]of fills) for(let i=0;i<commands.length;i+=5) {
    const a=commands[i],b=commands[i+1],c=commands[i+2],d=commands[i+3],z=commands[i+4];
    if(a?.kind!=='M'||b?.kind!=='L'||c?.kind!=='L'||d?.kind!=='L'||z?.kind!=='Z')throw Error('INVALID_STACK_BAND');
    const key=JSON.stringify([a.x,b.x]),delta=Math.max(Math.abs(b.y-a.y),Math.abs(c.y-d.y));
    // |y''| <= 6*delta; linear interpolation error <= 6*delta/(8*n*n).
    const n=a.x===b.x?1:Math.max(2,Math.ceil(Math.sqrt(3*delta)));
    steps.set(key,Math.max(steps.get(key)??0,n));bands.push({id,a,b,c,d,key});
  }
  const result=new Map<string,{commands:PathCommand[];areaCommands:PathCommand[]}>();let count=0;
  const mix=(a:number,b:number,t:number)=>a*(1-t)+b*t;
  for(const band of bands) {
    const n=steps.get(band.key)!,value=result.get(band.id)??{commands:[],areaCommands:[]};
    if((count+=3*n+4)>MAX_PATH_COMMANDS)throw Error('RESOURCE_LIMIT');
    for(let j=0;j<=n;j++) {
      const t=j/n,e=t*t*(3-2*t),point={kind:j===0?'M' as const:'L' as const,x:mix(band.a.x,band.b.x,t),y:mix(band.a.y,band.b.y,e)};
      value.commands.push(point);value.areaCommands.push(point);
    }
    for(let j=n;j>=0;j--) {const t=j/n,e=t*t*(3-2*t);value.areaCommands.push({kind:'L',x:mix(band.d.x,band.c.x,t),y:mix(band.d.y,band.c.y,e)});}
    value.areaCommands.push({kind:'Z'});result.set(band.id,value);
  }
  return result;
}
