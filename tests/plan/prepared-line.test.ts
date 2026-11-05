import {expect, it} from 'vitest';
import {prepareOwnedLine} from '../../src/plan/prepared-line.js';
import {ownPlanInput} from '../../src/plan/input.js';
import {planChart, type PlanLineSpec} from '../../src/plan.js';

const source = () => ({family: 'line', title: 'Original', axes: {x: {type: 'linear'}, y: {type: 'linear'}}, series: Object.freeze([Object.freeze({id: 's', name: 'Source', data: Object.freeze(Array.from({length: 100}, (_, i) => Object.freeze({id: 'p' + i, x: i, y: i % 7})))})])} as const satisfies PlanLineSpec);

it('reuses immutable normalization while validating every changed field and replacement dataset', () => {
  const spec = ownPlanInput(source()) as PlanLineSpec;
  const before = prepareOwnedLine(spec), same = prepareOwnedLine({...spec});
  expect(before.status).toBe('ok'); expect(same).toEqual(before);
  if (before.status === 'invalid' || same.status === 'invalid') throw Error('Expected preparation');
  expect(same.value).toBe(before.value);
  expect(prepareOwnedLine({...spec, unknown: true}).status).toBe('invalid');
  const renamed = prepareOwnedLine({...spec, title: 'Changed'});
  if (renamed.status === 'invalid') throw Error('Expected changed title');
  expect(renamed.value.input.title).toBe('Changed');
  const replacement = prepareOwnedLine({...spec, series: Object.freeze([{...spec.series[0]!, data: [{id: 'p', x: 0, y: 42}]}])});
  if (replacement.status === 'invalid') throw Error('Expected replacement');
  expect(replacement.value.data.series[0]!.points[0]!.y).toBe(42);
  expect(before.value.data.series[0]!.points[0]!.y).toBe(0);
  const mutable = [{id: 'p', x: 0, y: 1}], shallow = {...spec, series: Object.freeze([{id: 'shallow', name: 'Mutable descendants', data: mutable}])};
  expect(prepareOwnedLine(shallow).status).toBe('ok'); mutable[0]!.y = 9;
  const inspected = prepareOwnedLine(shallow);
  if (inspected.status === 'invalid') throw Error('Expected inspected mutable descendants');
  expect(inspected.value.data.series[0]!.points[0]!.y).toBe(9);
});

it('never bypasses capacity or changed-domain validation after a prepared plan', () => {
  const spec = source(), options = {width: 600, height: 300, capacity: {points: 100}};
  expect(planChart(spec, options).status).not.toBe('invalid');
  expect(planChart({...spec}, {...options, capacity: {points: 10}}).status).toBe('invalid');
  expect(planChart({...spec, axes: {...spec.axes, y: {type: 'linear', domain: [3, 1]}}}, options).status).toBe('invalid');
  const zoom = planChart({...spec}, {...options, viewport: {axes: 'x', value: {x: [20, 60]}}});
  if (zoom.status === 'invalid') throw Error(zoom.diagnostic.reason);
  expect(zoom.frame.viewport?.value.x).toEqual([20, 60]);
  expect(zoom.frame.observations.every(o => o.id.seriesId === 's' && o.value === Number(o.id.pointId.slice(1)) % 7)).toBe(true);
});
