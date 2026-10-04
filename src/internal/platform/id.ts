import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
const documents=new WeakMap<Document,Map<string,object>>(),hosts=new WeakMap<HTMLElement,object>();
export function clipId(prefix:string,key:string):string{
  let encoded='';for(let i=0;i<key.length;i++)encoded+=key.charCodeAt(i).toString(16).padStart(4,'0');
  return `nc-${prefix}-clip-${encoded}`;
}
export type IdReservation=Readonly<{release():void}>;
export function reserveInstance(host:HTMLElement,prefix:string):Result<IdReservation>{
  if(typeof prefix!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(prefix))return invalid('INVALID_CONFIG','BAD_INSTANCE_PREFIX','instancePrefix');
  const doc=host.ownerDocument;
  if(!host.isConnected||host.getRootNode()!==doc)return invalid('INVALID_CONFIG','UNSUPPORTED_HOST','host');
  const id=`nc-${prefix}-owner`,owners=documents.get(doc)??new Map<string,object>();
  if(hosts.has(host)||owners.has(prefix)||doc.getElementById(id))return invalid('INVALID_CONFIG','ID_COLLISION','instancePrefix');
  const token={};let sentinel:HTMLElement|undefined;
  try{sentinel=doc.createElement('span');sentinel.id=id;sentinel.hidden=true;host.appendChild(sentinel);}catch{try{sentinel?.remove();}catch{try{sentinel?.parentNode?.removeChild(sentinel);}catch{/* No map ownership was acquired. */}}return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
  owners.set(prefix,token);documents.set(doc,owners);hosts.set(host,token);let released=false;
  let owned:{doc:Document;host:HTMLElement;sentinel:HTMLElement}|undefined={doc,host,sentinel:sentinel!};
  return ok(Object.freeze({release:()=>{
    if(released)return;released=true;const current=owned!;owned=undefined;
    if(owners.get(prefix)===token)owners.delete(prefix);if(hosts.get(current.host)===token)hosts.delete(current.host);if(owners.size===0)documents.delete(current.doc);
    try{current.sentinel.remove();}catch{try{current.sentinel.parentNode?.removeChild(current.sentinel);}catch{/* Map ownership was already released. */}}
  }}));
}
