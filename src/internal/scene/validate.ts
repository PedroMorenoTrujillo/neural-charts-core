import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import { MAX_PAYLOAD_BYTES, serializePath } from '../geometry/path.js';
import { isFiniteNumber } from '../math/finite.js';
import type { Paint, SceneFrame } from './model.js';
export const LAYERS=['background','grid','reference-bands','marks','reference-lines','axes','labels','interaction']as const;
export const validKey=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256;
export const validToken=(value:unknown):value is string=>typeof value==='string'&&/^--nc-[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export const validHex=(value:unknown):value is string=>typeof value==='string'&&/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
function fields(v:unknown,allowed:readonly string[],required:readonly string[]=[]):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).every(k=>allowed.includes(k)&&(v as Record<string,unknown>)[k]!==undefined)&&required.every(k=>Object.hasOwn(v,k));}
export function validPaint(p:unknown):p is Paint{
  if(!fields(p,['kind','value','name','fallback'],['kind']))return false;
  if(p.kind==='none')return Object.keys(p).length===1;
  if(p.kind==='solid')return fields(p,['kind','value'],['kind','value'])&&validHex(p.value);
  return p.kind==='token'&&fields(p,['kind','name','fallback'],['kind','name','fallback'])&&validToken(p.name)&&fields(p.fallback,['kind','value'],['kind','value'])&&p.fallback.kind==='solid'&&validHex(p.fallback.value);
}
const nonnegative=(n:unknown):n is number=>isFiniteNumber(n)&&n>=0;
function presentation(v:unknown):boolean{
  if(!fields(v,['fill','stroke','strokeWidth','opacity','fillOpacity','strokeOpacity','dash','lineCap','lineJoin']))return false;
  for(const key of ['fill','stroke'])if(key in v&&!validPaint(v[key]))return false;
  if('strokeWidth'in v&&!nonnegative(v.strokeWidth))return false;
  for(const key of ['opacity','fillOpacity','strokeOpacity'])if(key in v&&(!isFiniteNumber(v[key])||v[key]<0||v[key]>1))return false;
  if('lineCap'in v&&!['butt','round','square'].includes(v.lineCap as string))return false;
  if('lineJoin'in v&&!['miter','round','bevel'].includes(v.lineJoin as string))return false;
  if('dash'in v&&(!Array.isArray(v.dash)||v.dash.length>32||!v.dash.every(nonnegative)||(v.dash.length>0&&!v.dash.some(n=>n>0))))return false;
  return true;
}
function copy(v:any):any{return Array.isArray(v)?Object.freeze(v.map(copy)):v&&typeof v==='object'?Object.freeze(Object.fromEntries(Object.entries(v).map(([k,n])=>[k,copy(n)]))):v;}
export function validateSceneFrame(input:unknown):Result<SceneFrame>{
  if(!fields(input,['revision','width','height','defs','layers'],['revision','width','height','defs','layers']))return invalid('INVALID_CONFIG','BAD_FRAME','frame');
  if(!Number.isSafeInteger(input.revision)||Number(input.revision)<1)return invalid('INVALID_CONFIG','BAD_REVISION','revision');
  if(!isFiniteNumber(input.width)||!isFiniteNumber(input.height)||input.width<=0||input.height<=0)return invalid('INVALID_NUMBER','BAD_SIZE','size');
  if(!Array.isArray(input.defs)||input.defs.length>10000)return invalid('INVALID_CONFIG','RESOURCE_LIMIT','defs');
  if(!fields(input.layers,LAYERS,LAYERS))return invalid('INVALID_CONFIG','BAD_LAYERS','layers');
  const clips=new Set<string>();
  for(let i=0;i<input.defs.length;i++){
    const d=input.defs[i],path=`defs[${i}]`;
    if(!fields(d,['key','kind','x','y','width','height'],['key','kind','x','y','width','height'])||d.kind!=='clip-rect'||!validKey(d.key)||clips.has(d.key))return invalid('INVALID_CONFIG','BAD_DEF',path);
    if(!isFiniteNumber(d.x)||!isFiniteNumber(d.y)||!nonnegative(d.width)||!nonnegative(d.height))return invalid('INVALID_NUMBER','NONFINITE',path);
    clips.add(d.key);
  }
  let count=0,payload=0;
  const encoder=new TextEncoder();
  for(const layer of LAYERS){
    const list=input.layers[layer],path=`layers.${layer}`;
    if(!Array.isArray(list)||(count+=list.length)>100000)return invalid('INVALID_CONFIG','RESOURCE_LIMIT',path);
    const keys=new Set<string>();
    for(let i=0;i<list.length;i++){
      const c=list[i],p=`${path}[${i}]`;
      if(!c||typeof c!=='object')return invalid('INVALID_CONFIG','BAD_COMMAND',p);
      const specific:Record<string,readonly string[]>={rect:['x','y','width','height','rx'],path:['commands'],line:['x1','y1','x2','y2'],circle:['cx','cy','r'],text:['x','y','text','anchor','baseline','fontSize','fontFamily','fontWeight']};
      const required:Record<string,readonly string[]>={rect:['x','y','width','height'],path:['commands'],line:['x1','y1','x2','y2'],circle:['cx','cy','r'],text:['x','y','text']};
      if(typeof c.kind!=='string'||!Object.hasOwn(specific,c.kind))return invalid('INVALID_CONFIG','BAD_COMMAND',p);
      const allowed=specific[c.kind]!;if(!fields(c,['key','kind','presentation','classes','clipKey','translate','semantic',...allowed],['key','kind',...required[c.kind]!])||!validKey(c.key)||keys.has(c.key))return invalid('INVALID_CONFIG','BAD_COMMAND',p);
      keys.add(c.key);
      if('presentation'in c&&!presentation(c.presentation))return invalid('INVALID_CONFIG','BAD_PRESENTATION',`${p}.presentation`);
      if('classes'in c&&(!Array.isArray(c.classes)||c.classes.length>16||!c.classes.every(n=>typeof n==='string'&&/^nc-[a-z0-9][a-z0-9-]{0,63}$/.test(n))))return invalid('INVALID_CONFIG','BAD_CLASSES',p);
      if('clipKey'in c&&(!validKey(c.clipKey)||!clips.has(c.clipKey)))return invalid('INVALID_CONFIG','MISSING_CLIP',p);
      if('translate'in c&&(!fields(c.translate,['x','y'],['x','y'])||!isFiniteNumber(c.translate.x)||!isFiniteNumber(c.translate.y)))return invalid('INVALID_NUMBER','NONFINITE',p);
      if('semantic'in c&&(!fields(c.semantic,['targetId','seriesId','datumId'],['targetId'])||!Object.values(c.semantic).every(validKey)))return invalid('INVALID_CONFIG','BAD_SEMANTIC',p);
      for(const k of allowed)if(k in c&&['x','y','x1','y1','x2','y2','cx','cy','width','height','r','rx','fontSize'].includes(k)&&!isFiniteNumber(c[k]))return invalid('INVALID_NUMBER','NONFINITE',`${p}.${k}`);
      for(const k of ['width','height','r','rx'])if(k in c&&!nonnegative(c[k]))return invalid('INVALID_CONFIG','NEGATIVE_SIZE',p);
      if(c.kind==='rect'&&'rx'in c&&Number(c.rx)>Math.min(Number(c.width),Number(c.height))/2)return invalid('INVALID_CONFIG','BAD_RADIUS',p);
      if(c.kind==='path'){const result=serializePath(c.commands as any);if(result.status==='invalid')return result;payload+=result.value.length;}
      if(c.kind==='text'){
        if(typeof c.text!=='string'||c.text.length>65536)return invalid('INVALID_CONFIG','RESOURCE_LIMIT',p);
        payload+=encoder.encode(c.text).length;
        if(('anchor'in c&&!['start','middle','end'].includes(c.anchor as string))||('baseline'in c&&!['auto','middle','hanging','alphabetic'].includes(c.baseline as string))||('fontFamily'in c&&!['sans-serif','serif','monospace'].includes(c.fontFamily as string))||('fontWeight'in c&&![400,500,600,700].includes(c.fontWeight as number))||('fontSize'in c&&Number(c.fontSize)<=0))return invalid('INVALID_CONFIG','BAD_TEXT',p);
      }
      if(payload>MAX_PAYLOAD_BYTES)return invalid('INVALID_CONFIG','RESOURCE_LIMIT','payload');
    }
  }
  return ok(copy(input)as SceneFrame);
}
