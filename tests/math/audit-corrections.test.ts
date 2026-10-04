import {expect,test} from 'vitest';
import {createCategoryFrame,createBandScale,createPointScale} from '../../src/internal/math/category.js';
import {floorUtc,advanceUtc,enumerateUtc,validInterval,UTC_INTERVALS,MIN_DATE,MAX_DATE} from '../../src/internal/math/utc.js';
import {selectNumericTicks,type TickPlan} from '../../src/internal/math/numeric-ticks.js';
import {selectTimeTicks,type TimeTickPlan} from '../../src/internal/math/time.js';
import type {DevelopmentNotice} from '../../src/internal/diagnostics.js';
import {value} from '../helpers.js';

test('F04 represented bands are disjoint or rejected, with shared centers',()=>{
  const ids=['a','b','c','d','e'];
  for(const range of [[1e16,1e16+16],[1e16+16,1e16],[0,100],[100,0],[0,100*Number.MIN_VALUE],[100*Number.MIN_VALUE,0]] as const){
    const frame=value(createCategoryFrame(ids,range,.5)),point=createPointScale(frame);
    for(const gap of [0,.1,.5]){
      const result=createBandScale(frame,gap);
      if(Math.abs(range[0])===1e16&&gap===.1){expect(result.status).toBe('invalid');continue;}
      if(result.status==='invalid'){expect(result.diagnostic.reason).toBe('UNREPRESENTABLE');continue;}
      let previous:number|undefined;
      for(const id of ids){const b=result.value.band(id)!;expect(b.center).toBe(point.center(id));
        if(previous!==undefined)expect(frame.direction*(b.start-previous)).toBeGreaterThanOrEqual(0);
        previous=b.end;
      }
    }
  }
});

test('F05 UTC descriptor corpus rejects invalid values without exceptions',()=>{
  const bad=[null,{},[],{unit:['day'],step:1},{unit:{toString:()=> 'day'},step:1},
    ...['constructor','toString','__proto__','unknown',null,0].map(unit=>({unit,step:1})),
    ...[undefined,null,'1',new Number(1),NaN,Infinity,0,-1,1.5].map(step=>({unit:'day',step}))];
  for(const interval of bad){expect(validInterval(interval as any)).toBe(false);expect(floorUtc(0,interval as any)).toBeNull();expect(advanceUtc(0,interval as any)).toBeNull();expect(enumerateUtc(0,1000,interval as any,false)).toBeNull();}
  for(const interval of UTC_INTERVALS){expect(validInterval(interval)).toBe(true);const floor=floorUtc(0,interval);expect(floor).not.toBeNull();expect(floor!).toBeLessThanOrEqual(0);const next=advanceUtc(floor!,interval);if(next!==null)expect(next).toBeGreaterThan(floor!);expect(()=>enumerateUtc(0,1000,interval,false)).not.toThrow();}
});

for(const [name,select] of [['numeric',selectNumericTicks],['time',selectTimeTicks]] as const){
  test(`F06 ${name} supplied malformed option corpus cannot default`,()=>{
    for(const targetCount of [undefined,null,false,0,'', '6',NaN,1,13])expect(select([0,10],{nice:false,targetCount} as any).status).toBe('invalid');
    for(const manual of [undefined,null,false,0,'',{},[NaN],[null],[1,1],[11]])expect(select([0,10],{nice:false,manual} as any).status).toBe('invalid');
    expect(value<TickPlan|TimeTickPlan>(select([0,10],{nice:false,manual:[]})).ticks).toEqual([]);
    expect(value<TickPlan|TimeTickPlan>(select([0,10],{nice:false})).fallback).toBe(false);
  });
  test(`F11 ${name} notices are exactly once, contained and numerically inert`,()=>{
    const domain=name==='numeric'?[1,1.0000000000000002] as const:[MIN_DATE,MAX_DATE] as const;
    const options={nice:name==='time'};
    const baseline=value<TickPlan|TimeTickPlan>(select(domain,options));expect(baseline.fallback).toBe(true);expect(baseline.ticks).toEqual(domain);expect(baseline.ticks.every(Number.isFinite)).toBe(true);
    if('step'in baseline)expect(baseline.step).toBeNull();else expect(baseline.interval).toBeNull();
    const notices:DevelopmentNotice[]=[];
    expect(value<TickPlan|TimeTickPlan>(select(domain,options,n=>notices.push(n)))).toEqual(baseline);
    expect(notices).toHaveLength(1);expect(notices[0]).toMatchObject({kind:'development-notice',reason:'TICK_RESOLUTION_FALLBACK',path:'ticks'});expect(notices[0]!.message.length).toBeLessThanOrEqual(512);
    let calls=0;expect(value<TickPlan|TimeTickPlan>(select(domain,options,()=>{calls++;throw Error('sink');}))).toEqual(baseline);expect(calls).toBe(1);
    notices.length=0;select([0,10],{nice:false},n=>notices.push(n));select([0,10],{nice:false,manual:[]},n=>notices.push(n));expect(notices).toEqual([]);
  });
}
