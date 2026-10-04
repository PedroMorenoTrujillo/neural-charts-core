import { invalid, notify, ok } from '../diagnostics.js';
import type { Diagnostic, Result } from '../diagnostics.js';
import type { FrameClock } from '../platform/ports.js';
export type DirtyReason='data'|'size'|'paint';
export type RevisionToken=Readonly<{revision:number;generation:number}>;
export interface RevisionScheduler<S> {submit(snapshot:S,reason:DirtyReason,runnable:boolean):Result<number>;isCurrent(token:RevisionToken):boolean;getSnapshot():Readonly<{revision:number;committedRevision:number;pending:boolean;destroyed:boolean}>;destroy():void;}
export function createRevisionScheduler<S,F>(options:{clock:FrameClock;prepare(snapshot:S,token:RevisionToken,reasons:ReadonlySet<DirtyReason>):Result<F>;commit(candidate:F,token:RevisionToken):Result<void>;onDiagnostic?:(diagnostic:Diagnostic)=>void},initialState?:Readonly<{revision:number}>):RevisionScheduler<S>{
  let callbacks:typeof options|undefined=options;
  let revision=initialState?.revision??0,committedRevision=0,generation=0,latest:S|undefined,runnable=false,executing=false,destroyed=false,dirty=new Set<DirtyReason>();
  let scheduled:{handle:number;generation:number}|null=null;
  function cancel():void{const token=scheduled;scheduled=null;if(token!==null){try{callbacks!.clock.cancel(token.handle);}catch{notify(callbacks?.onDiagnostic,invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','clock').diagnostic);}}}
  function schedule():void{
    if(destroyed||executing||!runnable||!dirty.size||scheduled!==null)return;
    const token={handle:0,generation};scheduled=token;
    try{token.handle=callbacks!.clock.request(()=>{
      if(destroyed||scheduled!==token||token.generation!==generation)return;
      scheduled=null;executing=true;const r=revision,g=generation,input=latest!,captured=dirty;dirty=new Set();
      try{
        const result=callbacks!.prepare(input,Object.freeze({revision:r,generation:g}),captured);
        if(destroyed||generation!==g||revision!==r||!runnable){for(const reason of captured)dirty.add(reason);return;}
        if(result.status==='invalid'){notify(callbacks?.onDiagnostic,result.diagnostic);return;}
        const committed=callbacks!.commit(result.value,{revision:r,generation:g});
        if(committed.status==='invalid')notify(callbacks?.onDiagnostic,committed.diagnostic);
        else if(!destroyed&&generation===g)committedRevision=r;
      }catch{notify(callbacks?.onDiagnostic,invalid('INTERNAL_INVARIANT','FRAME_FAILED','scheduler').diagnostic);}
      finally{executing=false;if(!destroyed)schedule();}
    });}catch{scheduled=null;dirty.clear();notify(callbacks?.onDiagnostic,invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','clock').diagnostic);}
  }
  return Object.freeze({submit:(snapshot:S,reason:DirtyReason,canRun:boolean)=>{
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','scheduler');
    if(revision===Number.MAX_SAFE_INTEGER)return invalid('LIFECYCLE_ERROR','REVISION_EXHAUSTED','revision');
    revision++;latest=snapshot;runnable=canRun;dirty.add(reason);if(!runnable)cancel();else schedule();return ok(revision);
  },isCurrent:(token:RevisionToken)=>!destroyed&&token.revision===revision&&token.generation===generation,getSnapshot:()=>Object.freeze({revision,committedRevision,pending:scheduled!==null,destroyed}),destroy:()=>{
    if(destroyed)return;destroyed=true;generation++;latest=undefined;dirty.clear();cancel();callbacks=undefined;
  }});
}
