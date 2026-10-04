import {assertProperty} from '../property-runner.js';
import {expect,it} from 'vitest';
import fc from 'fast-check';
import {selectNumericTicks} from '../../src/internal/math/numeric-ticks.js';
import {createLinearScale} from '../../src/internal/math/linear.js';
import {value} from '../helpers.js';

// Independent bounded oracle: integer thousandths, exhaustive grid enumeration,
// direct lexicographic sorting. It does not import the implementation's lattice.
function oracle(lo:number,hi:number,target:number,nice:boolean){
  const k=Math.floor(Math.log10((hi-lo)/(target-1))),candidates:any[]=[],seen=new Set<number>();
  for(let exponent=k-1;exponent<=k+1;exponent++)for(const mantissa of [1,2,2.5,5,10]){
    const stepUnits=Math.round(mantissa*10**exponent*1000);if(seen.has(stepUnits))continue;seen.add(stepUnits);
    const first=nice?Math.floor(lo*1000/stepUnits):Math.ceil(lo*1000/stepUnits),last=nice?Math.ceil(hi*1000/stepUnits):Math.floor(hi*1000/stepUnits);
    const count=last-first+1;if(count<2||count>200)continue;
    const ticks=Array.from({length:count},(_,i)=>Number(String((first+i)*stepUnits)+'e-3'));
    const expansion=nice?lo*1000-first*stepUnits+last*stepUnits-hi*1000:0;
    const canonical=mantissa===10?1:mantissa,rank=[1,2,5,2.5].indexOf(canonical);
    candidates.push({ticks,step:stepUnits/1000,score:[Math.abs(count-target),expansion,rank,-stepUnits]});
  }
  candidates.sort((a,b)=>{for(let i=0;i<4;i++){const d=a.score[i]-b.score[i];if(d)return d;}return 0;});return candidates[0];
}
it('matches an independently enumerated numeric candidate score',()=>{
  assertProperty(fc.property(fc.integer({min:-1000,max:1000}),fc.integer({min:1,max:1000}),fc.integer({min:2,max:12}),fc.boolean(),(lo,width,target,nice)=>{
    const actual=value(selectNumericTicks([lo,lo+width],{targetCount:target,nice})),expected=oracle(lo,lo+width,target,nice);
    expect(actual.ticks).toEqual(expected.ticks);expect(actual.step).toBe(expected.step);expect(actual.fallback).toBe(false);
  }),{numRuns:1000});
});
it('keeps binary64 adversarial endpoints finite and ticks ordered',()=>{
  const buffer=new ArrayBuffer(8),view=new DataView(buffer);
  const binary=fc.bigInt({min:0n,max:(1n<<64n)-1n}).map(bits=>{view.setBigUint64(0,bits);return view.getFloat64(0);});
  assertProperty(fc.property(binary,binary,(x,y)=>{
    fc.pre(Number.isFinite(x)&&Number.isFinite(y)&&x!==y);const lo=Math.min(x,y),hi=Math.max(x,y);
    const scale=value(createLinearScale([lo,hi],[100,0],false));expect(scale.map(lo)).toBe(100);expect(scale.map(hi)).toBe(0);
    const plan=value(selectNumericTicks([lo,hi],{nice:false}));expect(plan.ticks.length).toBeLessThanOrEqual(200);
    for(let i=0;i<plan.ticks.length;i++){const tick=plan.ticks[i]!;expect(Number.isFinite(tick)).toBe(true);expect(tick).toBeGreaterThanOrEqual(lo);expect(tick).toBeLessThanOrEqual(hi);if(i)expect(tick).toBeGreaterThan(plan.ticks[i-1]!);}
  }),{numRuns:1000});
});
