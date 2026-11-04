import {expect, it} from 'vitest';
import {ownPlanInput} from '../../src/plan/input.js';
import {planChart, type PlanLineSpec} from '../../src/plan.js';

it('reuses immutable large-series identity metadata across viewports without stale values or coordinates', () => {
  const data = Object.freeze(Array.from({length: 3000}, (_, i) => Object.freeze({id: 'p' + i, x: i, y: i % 17})));
  const spec = ownPlanInput(Object.freeze({family: 'line', title: 'Large', axes: Object.freeze({x: Object.freeze({kind: 'linear'}), y: Object.freeze({kind: 'linear'})}), series: Object.freeze([Object.freeze({id: 's', name: 'Source', data})])})) as PlanLineSpec;
  const options = {width: 700, height: 300, capacity: {points: 3000}},full = planChart(spec, options), zoom = planChart(spec, {...options, viewport: {axes: 'x', value: {x: [1000, 2000]}}});
  if(full.status==='invalid'||zoom.status==='invalid')throw Error('Expected plan');
  const before=full.frame.observations.find(o=>o.id.pointId==='p1200')!,after=zoom.frame.observations.find(o=>o.id.pointId==='p1200')!;
  expect(after.id).toBe(before.id);expect(after.group!.key).toBe(before.group!.key);expect(after.x).not.toBe(before.x);expect(after.value).toBe(1200%17);
  expect(Object.isFrozen(after)).toBe(true);expect(Object.isFrozen(after.group)).toBe(true);expect(Object.isFrozen(after.id)).toBe(true);
  const changed=planChart({...spec,series:[{...spec.series[0]!,data:data.map(p=>p.id==='p1200'?{...p,y:42}:p)}]},options);
  if(changed.status==='invalid')throw Error(changed.diagnostic.reason);
  expect(changed.frame.observations.find(o=>o.id.pointId==='p1200')!.value).toBe(42);expect(before.value).toBe(1200%17);
});
