import { invalid, ok } from '../diagnostics.js';
import type { Diagnostic, Result } from '../diagnostics.js';
import { isFiniteNumber, normalizeZero } from '../math/finite.js';
export type PathCommand = Readonly<{type:'M';x:number;y:number}> | Readonly<{type:'L';x:number;y:number}>
  | Readonly<{type:'A';radius:number;largeArc:0|1;sweep:0|1;x:number;y:number}> | Readonly<{type:'Z'}>;
export const MAX_PATH_COMMANDS=1_000_000, MAX_PAYLOAD_BYTES=32*1024*1024;
export function serializePath(commands: readonly PathCommand[]): Result<string> {
  if(!Array.isArray(commands)||commands.length>MAX_PATH_COMMANDS)return invalid('INVALID_CONFIG','RESOURCE_LIMIT','path');
  let open=false, x=0, y=0, size=0;
  const parts:string[]=[];
  for(let i=0;i<commands.length;i++){
    const c=commands[i], prefix=`path[${i}]`;
    if(!c||typeof c!=='object')return invalid('INVALID_CONFIG','BAD_PATH',prefix);
    const allowed=c.type==='A'?['type','radius','largeArc','sweep','x','y']:c.type==='Z'?['type']:['type','x','y'];
    if(Object.keys(c).some(k=>!allowed.includes(k)))return invalid('INVALID_CONFIG','BAD_PATH',prefix);
    let part:string;
    if(c.type==='Z'){if(!open)return invalid('INVALID_CONFIG','BAD_PATH_GRAMMAR',prefix);open=false;part='Z';}
    else{
      if(c.type!=='M'&&c.type!=='L'&&c.type!=='A')return invalid('INVALID_CONFIG','BAD_PATH',prefix);
      if(!isFiniteNumber(c.x)||!isFiniteNumber(c.y))return invalid('INVALID_NUMBER','NONFINITE',prefix);
      if(c.type!=='M'&&!open)return invalid('INVALID_CONFIG','BAD_PATH_GRAMMAR',prefix);
      const sx=String(normalizeZero(c.x)),sy=String(normalizeZero(c.y));
      if(sx.length>32||sy.length>32)return invalid('INTERNAL_INVARIANT','BAD_SERIALIZATION',prefix);
      if(c.type==='A'){
        if(!isFiniteNumber(c.radius)||c.radius<=0||(c.largeArc!==0&&c.largeArc!==1)||(c.sweep!==0&&c.sweep!==1)||(x===c.x&&y===c.y))return invalid('INVALID_CONFIG','BAD_ARC',prefix);
        const r=String(c.radius);if(r.length>32)return invalid('INTERNAL_INVARIANT','BAD_SERIALIZATION',prefix);
        part=`A ${r} ${r} 0 ${c.largeArc} ${c.sweep} ${sx} ${sy}`;
      }else part=`${c.type} ${sx} ${sy}`;
      x=c.x;y=c.y;open=true;
    }
    size+=part.length+(parts.length?1:0);if(size>MAX_PAYLOAD_BYTES)return invalid('INVALID_CONFIG','RESOURCE_LIMIT','path');parts.push(part);
  }
  return ok(parts.join(' '));
}
export interface PathBuilder { moveTo(x:number,y:number):void;lineTo(x:number,y:number):void;arcTo(radius:number,largeArc:0|1,sweep:0|1,x:number,y:number):void;close():void;finish():Result<readonly PathCommand[]>; }
export function createPathBuilder():PathBuilder{
  const commands:PathCommand[]=[];let sealed=false,error:Diagnostic|undefined,open=false,x=0,y=0;
  function add(c:PathCommand):void{
    if(sealed){error=invalid('LIFECYCLE_ERROR','BUILDER_SEALED','path').diagnostic;return;}
    if(error)return;
    if(commands.length>=MAX_PATH_COMMANDS){error=invalid('INVALID_CONFIG','RESOURCE_LIMIT','path').diagnostic;return;}
    if(c.type==='Z'){if(!open){error=invalid('INVALID_CONFIG','BAD_PATH_GRAMMAR','path').diagnostic;return;}open=false;}
    else{
      if(!isFiniteNumber(c.x)||!isFiniteNumber(c.y)){error=invalid('INVALID_NUMBER','NONFINITE','path').diagnostic;return;}
      if(c.type!=='M'&&!open){error=invalid('INVALID_CONFIG','BAD_PATH_GRAMMAR','path').diagnostic;return;}
      if(c.type==='A'&&(!isFiniteNumber(c.radius)||c.radius<=0||(c.largeArc!==0&&c.largeArc!==1)||(c.sweep!==0&&c.sweep!==1)||(x===c.x&&y===c.y))){error=invalid('INVALID_CONFIG','BAD_ARC','path').diagnostic;return;}
      open=true;x=c.x;y=c.y;
    }
    commands.push(Object.freeze(c));
  }
  return Object.freeze({moveTo:(x:number,y:number)=>add({type:'M',x,y}),lineTo:(x:number,y:number)=>add({type:'L',x,y}),arcTo:(radius:number,largeArc:0|1,sweep:0|1,x:number,y:number)=>add({type:'A',radius,largeArc,sweep,x,y}),close:()=>add({type:'Z'}),finish:()=>{
    if(sealed)return invalid('LIFECYCLE_ERROR','BUILDER_SEALED','path');sealed=true;
    if(error)return {status:'invalid' as const,diagnostic:error};
    const output=Object.freeze(commands.slice()),validated=serializePath(output);commands.length=0;
    return validated.status==='invalid'?validated:ok(output);
  }});
}
