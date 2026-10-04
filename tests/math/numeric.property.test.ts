import {assertProperty} from '../property-runner.js';
import { expect, test } from 'vitest';
import fc from 'fast-check';
import { value } from '../helpers.js';
import { createLinearScale } from '../../src/internal/math/linear.js';
import { selectNumericTicks } from '../../src/internal/math/numeric-ticks.js';
const runs = Number(process.env.NC_PROPERTY_RUNS ?? 1000);
const settings = { seed: Number(process.env.NC_PROPERTY_SEED ?? 101), numRuns: runs, interruptAfterTimeLimit: 10000, markInterruptAsFailure: true };
test('conditioned projection and clamp', () => assertProperty(fc.property(fc.integer({min:-1000000,max:1000000}),fc.integer({min:1,max:1000000}),fc.integer({min:0,max:1000}), (a,span,i) => {
  const scale = value(createLinearScale([a,a+span],[1000,0],true));
  const x = a + span*i/1000; const mapped = scale.map(x)!;
  expect(Number.isFinite(mapped)).toBe(true); expect(mapped).toBeGreaterThanOrEqual(0); expect(mapped).toBeLessThanOrEqual(1000);
  expect(Math.abs(scale.invert(mapped)!-x)).toBeLessThanOrEqual(32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(a+span)));
}), settings));
test('ticks remain bounded and ordered', () => assertProperty(fc.property(fc.integer({min:-10000,max:10000}),fc.integer({min:1,max:10000}),fc.integer({min:2,max:12}),fc.boolean(), (a,span,target,nice) => {
  const plan=value(selectNumericTicks([a,a+span],{targetCount:target,nice}));
  expect(plan.ticks.length).toBeLessThanOrEqual(200); expect(plan.ticks.every(Number.isFinite)).toBe(true);
  for(let i=1;i<plan.ticks.length;i++) expect(plan.ticks[i]).toBeGreaterThan(plan.ticks[i-1]!);
  if(nice){expect(plan.domain[0]).toBeLessThanOrEqual(a);expect(plan.domain[1]).toBeGreaterThanOrEqual(a+span);} else expect(plan.domain).toEqual([a,a+span]);
}),settings));
