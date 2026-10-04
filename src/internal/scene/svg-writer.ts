import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import { serializePath } from '../geometry/path.js';
import { clipId } from '../platform/id.js';
import { LAYERS, validHex, validateSceneFrame } from './validate.js';
import type { ClipDef, Layer, Paint, SceneCommand, SemanticBinding } from './model.js';
const NS='http://www.w3.org/2000/svg';
function primitive(doc:Document,kind:SceneCommand['kind']):SVGElement{
  switch(kind){
    case 'rect':return doc.createElementNS(NS,'rect');
    case 'path':return doc.createElementNS(NS,'path');
    case 'line':return doc.createElementNS(NS,'line');
    case 'circle':return doc.createElementNS(NS,'circle');
    case 'text':return doc.createElementNS(NS,'text');
  }
}
type Cache={kind:string;element:SVGElement;attributes:Readonly<Record<string,string>>};
type Planned={key:string;kind:string;attributes:Readonly<Record<string,string>>;text:string|null;semantic:SemanticBinding|undefined;node:SVGElement};
export interface PreparedScene {readonly revision:number;}
export interface SceneWriter {prepare(frame:unknown,resolvedTokens:ReadonlyMap<string,string>):Result<PreparedScene>;apply(scene:PreparedScene):Result<void>;clear():void;dispose():void;}
function paint(p:Paint,tokens:ReadonlyMap<string,string>):string{
  if(p.kind==='none')return 'none';if(p.kind==='solid')return p.value.toLowerCase();const v=tokens.get(p.name);return validHex(v)?v.toLowerCase():p.fallback.value.toLowerCase();
}
function attributes(c:SceneCommand,tokens:ReadonlyMap<string,string>,prefix:string):Record<string,string>{
  const a:Record<string,string>={class:['nc-primitive',...new Set(c.classes??[])].join(' ')};
  const number=(key:string,v:number|undefined)=>{if(v!==undefined)a[key]=String(v);};
  if(c.kind==='path'){const p=serializePath(c.commands);if(p.status==='ok')a.d=p.value;}
  else if(c.kind==='rect'){number('x',c.x);number('y',c.y);number('width',c.width);number('height',c.height);number('rx',c.rx);}
  else if(c.kind==='line'){number('x1',c.x1);number('y1',c.y1);number('x2',c.x2);number('y2',c.y2);}
  else if(c.kind==='circle'){number('cx',c.cx);number('cy',c.cy);number('r',c.r);}
  else{number('x',c.x);number('y',c.y);number('font-size',c.fontSize);if(c.anchor)a['text-anchor']=c.anchor;if(c.baseline)a['dominant-baseline']=c.baseline;if(c.fontFamily)a['font-family']=c.fontFamily;if(c.fontWeight)a['font-weight']=String(c.fontWeight);}
  const p=c.presentation;
  if(p){if(p.fill)a.fill=paint(p.fill,tokens);if(p.stroke)a.stroke=paint(p.stroke,tokens);number('stroke-width',p.strokeWidth);number('opacity',p.opacity);number('fill-opacity',p.fillOpacity);number('stroke-opacity',p.strokeOpacity);if(p.dash?.length)a['stroke-dasharray']=p.dash.join(' ');if(p.lineCap)a['stroke-linecap']=p.lineCap;if(p.lineJoin)a['stroke-linejoin']=p.lineJoin;}
  if(c.clipKey)a['clip-path']=`url(#${clipId(prefix,c.clipKey)})`;
  if(c.translate)a.transform=`translate(${String(c.translate.x)} ${String(c.translate.y)})`;
  return a;
}
export function createSvgWriter(host:HTMLElement,instancePrefix:string):Result<SceneWriter>{
  const doc=host.ownerDocument,svg=doc.createElementNS(NS,'svg'),defs=doc.createElementNS(NS,'defs');
  const groups=new Map<Layer,SVGGElement>(),maps=new Map<Layer,Map<string,Cache>>(),clips=new Map<string,Cache>();
  let prepared=new WeakMap<object,{generation:number;width:number;height:number;layers:Map<Layer,Planned[]>;defs:readonly ClipDef[]}>();
  let disposed=false,generation=0,lastRevision=0,semantics=new Map<string,SemanticBinding>();
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.appendChild(defs);
  for(const layer of LAYERS){const g=doc.createElementNS(NS,'g');g.setAttribute('data-nc-layer',layer);g.setAttribute('fill','none');g.setAttribute('stroke','none');g.setAttribute('stroke-width','1');g.setAttribute('opacity','1');groups.set(layer,g);maps.set(layer,new Map());svg.appendChild(g);}
  try{host.appendChild(svg);}catch{return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
  function dispose():void{if(disposed)return;disposed=true;generation++;prepared=new WeakMap();svg.remove();svg.replaceChildren();for(const map of maps.values())map.clear();clips.clear();semantics.clear();groups.clear();maps.clear();}
  function focusFallback(node:Element):void{if(doc.activeElement&&node.contains(doc.activeElement))host.focus({preventScroll:true});}
  function patchAttributes(node:Element,wanted:Readonly<Record<string,string>>,previous:Readonly<Record<string,string>>):void{
    for(const [key,v]of Object.entries(wanted))if(previous[key]!==v)node.setAttribute(key,v);
    for(const key of Object.keys(previous))if(!(key in wanted))node.removeAttribute(key);
  }
  const writer:SceneWriter={
    prepare:(input,tokens)=>{
      if(disposed)return invalid('LIFECYCLE_ERROR','DESTROYED','writer');
      const validated=validateSceneFrame(input);if(validated.status==='invalid')return validated;
      const frame=validated.value;if(frame.revision<=lastRevision)return invalid('INVALID_CONFIG','STALE_REVISION','revision');
      const refs=new Set<string>(),layers=new Map<Layer,Planned[]>();
      for(const layer of LAYERS){const items:Planned[]=[];for(const c of frame.layers[layer]){
        if(c.clipKey)refs.add(c.clipKey);const existing=maps.get(layer)!.get(c.key),node=existing?.kind===c.kind?existing.element:primitive(doc,c.kind);
        items.push({key:c.key,kind:c.kind,attributes:attributes(c,tokens,instancePrefix),text:c.kind==='text'?c.text:null,semantic:c.semantic,node});
      }layers.set(layer,items);}
      const used=frame.defs.filter(d=>refs.has(d.key));
      for(const d of used){const id=clipId(instancePrefix,d.key),found:Element|null=doc.getElementById(id);if(found&&found!==clips.get(d.key)?.element)return invalid('INVALID_CONFIG','ID_COLLISION','defs');}
      const token=Object.freeze({revision:frame.revision});prepared.set(token,{generation,width:frame.width,height:frame.height,layers,defs:used});return ok(token);
    },
    apply:scene=>{
      if(disposed)return invalid('LIFECYCLE_ERROR','DESTROYED','writer');
      const plan=prepared.get(scene);if(!plan||plan.generation!==generation||scene.revision<=lastRevision)return invalid('INVALID_CONFIG','STALE_REVISION','revision');
      prepared.delete(scene);
      try{
        if(svg.parentNode!==host||defs.parentNode!==svg||LAYERS.some(l=>groups.get(l)!.parentNode!==svg))throw new Error('Owned DOM missing');
        const nextClips=new Map<string,Cache>();
        for(const d of plan.defs){let cached=clips.get(d.key);if(cached&&cached.element.parentNode!==defs)throw new Error('Owned clip missing');if(!cached){const clip=doc.createElementNS(NS,'clipPath'),rect=doc.createElementNS(NS,'rect');clip.setAttribute('id',clipId(instancePrefix,d.key));clip.setAttribute('clipPathUnits','userSpaceOnUse');clip.appendChild(rect);cached={kind:'clip-rect',element:clip,attributes:{}};defs.appendChild(clip);}
          const attrs={x:String(d.x),y:String(d.y),width:String(d.width),height:String(d.height)};patchAttributes(cached.element.firstElementChild!,attrs,cached.attributes);nextClips.set(d.key,{...cached,attributes:attrs});}
        const nextMaps=new Map<Layer,Map<string,Cache>>(),nextSemantics=new Map<string,SemanticBinding>();
        const active=doc.activeElement;
        for(const layer of LAYERS){const group=groups.get(layer)!,previous=maps.get(layer)!,items=plan.layers.get(layer)!,next=new Map<string,Cache>();let cursor=group.firstChild;
          for(const item of items){const old=previous.get(item.key);if(old&&old.element.parentNode!==group)throw new Error('Owned mark missing');
            if(old&&old.element!==item.node){focusFallback(old.element);if(cursor===old.element)cursor=old.element.nextSibling;old.element.remove();}
            patchAttributes(item.node,item.attributes,old?.element===item.node?old.attributes:{});
            if(item.text!==null&&item.node.textContent!==item.text)item.node.textContent=item.text;
            if(item.node!==cursor)group.insertBefore(item.node,cursor);cursor=item.node.nextSibling;
            next.set(item.key,{kind:item.kind,element:item.node,attributes:item.attributes});if(item.semantic)nextSemantics.set(`${layer}:${item.key}`,item.semantic);
          }
          for(const [key,entry]of previous)if(!next.has(key)){focusFallback(entry.element);entry.element.remove();}
          nextMaps.set(layer,next);
        }
        for(const [key,entry]of clips)if(!nextClips.has(key))entry.element.remove();
        svg.setAttribute('width',String(plan.width));svg.setAttribute('height',String(plan.height));svg.setAttribute('viewBox',`0 0 ${plan.width} ${plan.height}`);
        if(active&&svg.contains(active)&&doc.activeElement!==active&&'focus'in active)(active as SVGElement).focus({preventScroll:true});
        for(const [layer,map]of nextMaps)maps.set(layer,map);clips.clear();for(const [key,entry]of nextClips)clips.set(key,entry);semantics=nextSemantics;lastRevision=scene.revision;
        return ok(undefined);
      }catch{dispose();return invalid('INTERNAL_INVARIANT','DOM_COMMIT_FAILED','writer');}
    },
    clear:()=>{if(disposed)return;generation++;prepared=new WeakMap();for(const map of maps.values()){for(const entry of map.values()){focusFallback(entry.element);entry.element.remove();}map.clear();}for(const clip of clips.values())clip.element.remove();clips.clear();semantics.clear();svg.setAttribute('width','0');svg.setAttribute('height','0');svg.removeAttribute('viewBox');},dispose
  };
  return ok(Object.freeze(writer));
}
