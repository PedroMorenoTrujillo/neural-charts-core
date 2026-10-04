import {expect,test}from'vitest';
import {createRevisionScheduler}from'../../src/internal/lifecycle/scheduler.js';
import {invalid,ok}from'../../src/internal/diagnostics.js';
import {FakeClock}from'./fake-clock.js';
test('latest snapshot, stale work and handle zero',()=>{
  const clock=new FakeClock(),writes:number[]=[],reasons:string[][]=[];let reenter=false;
  const scheduler=createRevisionScheduler<number,number>({clock,prepare:(v,token,dirty)=>{reasons.push([...dirty]);expect(scheduler.isCurrent(token)).toBe(true);if(reenter){reenter=false;scheduler.submit(30,'paint',true);expect(scheduler.isCurrent(token)).toBe(false);}return ok(v);},commit:v=>{writes.push(v);return ok(undefined);}});
  expect(scheduler.getSnapshot().revision).toBe(0);scheduler.submit(1,'data',true);expect(clock.pending.has(0)).toBe(true);for(let i=2;i<=10;i++)scheduler.submit(i,'data',true);expect(clock.pendingCount).toBe(1);clock.flush();expect(writes).toEqual([10]);expect(scheduler.getSnapshot().committedRevision).toBe(10);
  reenter=true;scheduler.submit(20,'size',true);clock.flush();expect(writes).toEqual([10]);expect(clock.pendingCount).toBe(1);clock.flush();expect(writes).toEqual([10,30]);expect(reasons.at(-1)).toEqual(['paint','size']);
  scheduler.submit(40,'data',true);scheduler.submit(50,'size',false);const old=[...clock.cancelled.values()].at(-1)!;scheduler.submit(60,'size',true);old(1);expect(clock.pendingCount).toBe(1);clock.flush();expect(writes.at(-1)).toBe(60);
  scheduler.submit(70,'data',true);scheduler.destroy();scheduler.destroy();for(const cb of clock.cancelled.values())cb(1);expect(clock.pendingCount).toBe(0);expect(scheduler.submit(80,'data',true).status).toBe('invalid');expect(scheduler.isCurrent({revision:14,generation:0})).toBe(false);
});
test('errors are bounded and no retry loop',()=>{
  for(const phase of ['prepare','commit','throw']as const){const clock=new FakeClock(),diagnostics:any[]=[];const s=createRevisionScheduler({clock,prepare:()=>{if(phase==='throw')throw Error('bad');return phase==='prepare'?invalid('INVALID_CONFIG','BAD'):ok(1);},commit:()=>invalid('INVALID_CONFIG','BAD'),onDiagnostic:d=>diagnostics.push(d)});s.submit(1,'data',true);clock.flush();expect(diagnostics).toHaveLength(1);expect(clock.pendingCount).toBe(0);s.destroy();}
  const clock=new FakeClock(),s=createRevisionScheduler({clock,prepare:()=>ok(1),commit:()=>ok(undefined)},{revision:Number.MAX_SAFE_INTEGER});expect(s.submit(1,'data',true)).toMatchObject({diagnostic:{reason:'REVISION_EXHAUSTED'}});
  const bad=createRevisionScheduler({clock:{request:()=>{throw Error('clock');},cancel:()=>{}},prepare:()=>ok(1),commit:()=>ok(undefined)});bad.submit(1,'data',true);expect(bad.getSnapshot().pending).toBe(false);bad.destroy();
});
test('a throwing cancellation releases pending ownership and still destroys',()=>{
  const diagnostics:any[]=[];
  const scheduler=createRevisionScheduler({clock:{request:()=>0,cancel:()=>{throw Error('cancel failed');}},prepare:()=>ok(1),commit:()=>ok(undefined),onDiagnostic:d=>diagnostics.push(d)});
  scheduler.submit(1,'data',true);scheduler.destroy();scheduler.destroy();
  expect(scheduler.getSnapshot()).toMatchObject({destroyed:true,pending:false});
  expect(diagnostics).toHaveLength(1);expect(diagnostics[0]).toMatchObject({code:'LIFECYCLE_ERROR',reason:'PLATFORM_UNAVAILABLE',path:'clock'});
});
