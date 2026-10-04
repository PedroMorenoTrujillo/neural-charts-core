import { expect, test } from 'vitest';
import fc from 'fast-check';
import { value } from '../helpers.js';
import { createBandScale, createCategoryFrame, createPointScale } from '../../src/internal/math/category.js';
import { floorUtc, advanceUtc, enumerateUtc, UTC_INTERVALS } from '../../src/internal/math/utc.js';
import { selectTimeTicks } from '../../src/internal/math/time.js';
const settings={seed:Number(process.env.NC_PROPERTY_SEED??102),numRuns:Number(process.env.NC_PROPERTY_RUNS??1000),interruptAfterTimeLimit:10000,markInterruptAsFailure:true};
test('shared categories and directed non-overlap',()=>fc.assert(fc.property(fc.integer({min:0,max:256}),fc.integer({min:1,max:1000000}),fc.boolean(),fc.integer({min:0,max:9}),(n,length,reversed,g)=>{
  const frame=value(createCategoryFrame(Array.from({length:n},(_,i)=>String(i)),reversed?[length,0]:[0,length],.5)),point=createPointScale(frame),bands=value(createBandScale(frame,g/10));
  expect(bands.frame).toBe(point.frame);let last=-Infinity;
  for(const id of frame.ids){const b=bands.band(id)!;expect(point.center(id)).toBe(b.center);expect(b.width).toBeGreaterThanOrEqual(0);const leading=frame.direction*(b.start-frame.range[0]),trailing=frame.direction*(b.end-frame.range[0]);expect(leading).toBeGreaterThanOrEqual(last);expect(trailing).toBeLessThanOrEqual(length);last=trailing;expect(point.categoryAt(b.center)).toBe(id);if(b.width>0)expect(bands.bandAt(b.center)?.id).toBe(id);}
}),settings));
test('UTC bounds and calendar monotonicity',()=>fc.assert(fc.property(fc.integer({min:-10000000000000,max:10000000000000}),fc.integer({min:0,max:UTC_INTERVALS.length-1}),(t,index)=>{
  const interval=UTC_INTERVALS[index]!,floor=floorUtc(t,interval);if(floor!==null){expect(floor).toBeLessThanOrEqual(t);const next=advanceUtc(floor,interval);if(next!==null)expect(next).toBeGreaterThan(floor);}
  const ticks=enumerateUtc(t,t+86400000,interval,false);if(ticks){expect(ticks.length).toBeLessThanOrEqual(200);for(let i=0;i<ticks.length;i++){expect(ticks[i]).toBeGreaterThanOrEqual(t);expect(ticks[i]).toBeLessThanOrEqual(t+86400000);if(i)expect(ticks[i]).toBeGreaterThan(ticks[i-1]!);}}
}),settings));
test('time tick plan monotone and explicit domain preserved',()=>fc.assert(fc.property(fc.integer({min:-100000000000,max:100000000000}),fc.integer({min:1,max:100000000}),fc.integer({min:2,max:12}),(a,span,target)=>{
  const plan=value(selectTimeTicks([a,a+span],{nice:false,targetCount:target}));expect(plan.domain).toEqual([a,a+span]);expect(plan.ticks.length).toBeLessThanOrEqual(200);for(let i=0;i<plan.ticks.length;i++){expect(Number.isInteger(plan.ticks[i])).toBe(true);if(i)expect(plan.ticks[i]).toBeGreaterThan(plan.ticks[i-1]!);}
}),settings));
