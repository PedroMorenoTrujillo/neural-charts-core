import type { FrameClock } from '../../src/internal/platform/ports.js';
export class FakeClock implements FrameClock {
  private next=0; readonly pending=new Map<number,(timestamp:number)=>void>();readonly cancelled=new Map<number,(timestamp:number)=>void>();
  request(callback:(timestamp:number)=>void):number{const id=this.next++;this.pending.set(id,callback);return id;}
  cancel(id:number):void{const cb=this.pending.get(id);if(cb)this.cancelled.set(id,cb);this.pending.delete(id);}
  flush(timestamp=0):void{const entries=[...this.pending];this.pending.clear();for(const [,cb]of entries)cb(timestamp);}
  get pendingCount():number{return this.pending.size;}
}
