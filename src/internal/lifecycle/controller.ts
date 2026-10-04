import { invalid, notify, ok } from '../diagnostics.js';
import type { Diagnostic, Result } from '../diagnostics.js';
import { createBrowserPorts } from '../platform/browser.js';
import { reserveInstance } from '../platform/id.js';
import type { FrameClock, Size, SizeObserver } from '../platform/ports.js';
import { createSvgWriter } from '../scene/svg-writer.js';
import type { PreparedScene } from '../scene/svg-writer.js';
import type { SceneFrame } from '../scene/model.js';
import { validHex, validateSceneFrame } from '../scene/validate.js';
import { createRevisionScheduler } from './scheduler.js';
export type FoundationState=Readonly<{phase:'suspended'|'active'|'faulted'|'destroyed';revision:number;committedRevision:number;size:Size}>;
export interface FoundationController<T> {update(input:unknown):Result<number>;invalidatePaint():Result<number>;getSnapshot():FoundationState;destroy():void;}
export type FoundationOptions<T>={instancePrefix:string;initialSnapshot:T;validateAndCopy(input:unknown):Result<T>;compute(snapshot:T,size:Size,revision:number):Result<SceneFrame>;clock?:FrameClock;sizeObserver?:SizeObserver;onDiagnostic?:(diagnostic:Diagnostic)=>void};
function resolveTokens(host:HTMLElement,frame:SceneFrame):ReadonlyMap<string,string>{
  const names=new Set<string>();for(const commands of Object.values(frame.layers))for(const c of commands)for(const paint of [c.presentation?.fill,c.presentation?.stroke])if(paint?.kind==='token')names.add(paint.name);
  const map=new Map<string,string>();if(!names.size)return map;
  const style=host.ownerDocument.defaultView?.getComputedStyle(host);for(const name of names){const v=style?.getPropertyValue(name).trim();if(validHex(v))map.set(name,v.toLowerCase());}return map;
}
export function mountFoundation<T>(host:HTMLElement,options:FoundationOptions<T>):Result<FoundationController<T>>{
  let validateSnapshot:FoundationOptions<T>['validateAndCopy']|undefined=options.validateAndCopy,computeFrame:FoundationOptions<T>['compute']|undefined=options.compute,diagnosticSink=options.onDiagnostic;
  let initial:Result<T>;try{initial=options.validateAndCopy(options.initialSnapshot);}catch{return invalid('INVALID_CONFIG','BAD_SNAPSHOT','snapshot');}
  if(initial.status==='invalid')return initial;
  const ports=createBrowserPorts(host,{...(options.clock?{clock:options.clock}:{}),...(options.sizeObserver?{sizeObserver:options.sizeObserver}:{})});if(ports.status==='invalid')return ports;
  const reservation=reserveInstance(host,options.instancePrefix);if(reservation.status==='invalid')return reservation;
  const ownedReservation=reservation.value;
  const fallback=host.ownerDocument.createElement('div');fallback.tabIndex=-1;
  try{host.appendChild(fallback);}catch{reservation.value.release();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
  const built=createSvgWriter(fallback,options.instancePrefix);if(built.status==='invalid'){fallback.remove();reservation.value.release();return built;}
  const writer=built.value;let data:T|undefined=initial.value,size:Size=Object.freeze({width:0,height:0}),phase:FoundationState['phase']='suspended',inCommit=false,queuedClear=false,queuedDispose=false,subscription:{disconnect():void}|undefined;
  function disposeDom():void{writer.dispose();fallback.remove();ownedReservation.release();data=undefined;validateSnapshot=undefined;computeFrame=undefined;diagnosticSink=undefined;queuedDispose=false;queuedClear=false;}
  function diagnostic(d:Diagnostic):void{
    if(d.code==='INTERNAL_INVARIANT'||d.code==='LIFECYCLE_ERROR'){if(phase!=='destroyed'){phase='faulted';scheduler.destroy();subscription?.disconnect();subscription=undefined;writer.dispose();}}
    notify(diagnosticSink,d);
  }
  const scheduler=createRevisionScheduler<{data:T;size:Size},PreparedScene>({clock:ports.value.clock,prepare:(snapshot,token)=>{
    const frame=computeFrame!(snapshot.data,snapshot.size,token.revision);if(frame.status==='invalid')return frame;
    if(frame.value.revision!==token.revision||frame.value.width!==snapshot.size.width||frame.value.height!==snapshot.size.height)return invalid('INTERNAL_INVARIANT','FRAME_MISMATCH','frame');
    const valid=validateSceneFrame(frame.value);return valid.status==='invalid'?valid:writer.prepare(valid.value,resolveTokens(host,valid.value));
  },commit:prepared=>{
    inCommit=true;try{return writer.apply(prepared);}finally{inCommit=false;if(queuedDispose)disposeDom();else if(queuedClear){queuedClear=false;writer.clear();}}
  },onDiagnostic:diagnostic});
  const submit=(reason:'data'|'size'|'paint')=>scheduler.submit({data:data!,size},reason,phase==='active');
  const controller:FoundationController<T>={update:input=>{
    if(phase==='destroyed'||phase==='faulted')return invalid('LIFECYCLE_ERROR',phase==='destroyed'?'DESTROYED':'FAULTED','controller');
    let validated:Result<T>;try{validated=validateSnapshot!(input);}catch{return invalid('INVALID_CONFIG','BAD_SNAPSHOT','snapshot');}if(validated.status==='invalid')return validated;
    const prior=data;data=validated.value;const submitted=submit('data');if(submitted.status==='invalid')data=prior;return submitted;
  },invalidatePaint:()=>phase==='destroyed'||phase==='faulted'?invalid('LIFECYCLE_ERROR',phase==='destroyed'?'DESTROYED':'FAULTED','controller'):submit('paint'),getSnapshot:()=>{const s=scheduler.getSnapshot();return Object.freeze({phase,revision:s.revision,committedRevision:s.committedRevision,size:Object.freeze({...size})});},destroy:()=>{
    if(phase==='destroyed')return;phase='destroyed';scheduler.destroy();subscription?.disconnect();subscription=undefined;if(inCommit)queuedDispose=true;else disposeDom();
  }};
  try{
    const first=submit('data');if(first.status==='invalid'){controller.destroy();return first;}
    subscription=ports.value.sizeObserver.observe(host,next=>{
      if(phase==='destroyed'||phase==='faulted')return;
      if(typeof next.width!=='number'||typeof next.height!=='number'||!Number.isFinite(next.width)||!Number.isFinite(next.height)||next.width<0||next.height<0){notify(diagnosticSink,invalid('INVALID_NUMBER','BAD_SIZE','size').diagnostic);return;}
      if(size.width===next.width&&size.height===next.height)return;
      size=Object.freeze({...next});phase=size.width>0&&size.height>0?'active':'suspended';submit('size');
      if(phase==='suspended'){if(inCommit)queuedClear=true;else writer.clear();}
    });
    // An injected observer may deliver its first size synchronously, before its
    // subscription is assigned. Release it if that delivery faulted the clock.
    const mountedPhase=controller.getSnapshot().phase;
    if(mountedPhase==='faulted'||mountedPhase==='destroyed'){subscription.disconnect();subscription=undefined;}
  }catch{controller.destroy();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','sizeObserver');}
  return ok(Object.freeze(controller));
}
