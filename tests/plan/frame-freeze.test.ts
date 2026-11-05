import {expect, it} from 'vitest';
import {freezePlan} from '../../src/plan/input.js';

it('freezes the complete owned frame graph, including array entries and shared identities', () => {
  const id = {seriesId: 's', pointId: 'p'}, group = {key: 'x:1', label: 'Point', coordinate: 1};
  const frame = {series: [{id: 's', commands: [{type: 'M', x: 0, y: 1}]}], observations: [{id, group}, {id, group}]};
  expect(freezePlan(frame)).toBe(frame);
  expect(Object.isFrozen(frame)).toBe(true);expect(Object.isFrozen(frame.observations)).toBe(true);
  expect(Object.isFrozen(frame.series[0]!.commands[0])).toBe(true);expect(Object.isFrozen(id)).toBe(true);expect(Object.isFrozen(group)).toBe(true);
  expect(frame.observations[0]!.id).toBe(frame.observations[1]!.id);
});

it('preserves Object.values own-enumerable semantics without entering prototypes or hidden properties', () => {
  const inherited = {value: 1}, hidden = {value: 2}, symbol = {value: 3};
  const object = Object.create({inherited, get accessor() {throw Error('Inherited getter must not run');}}) as Record<string | symbol, unknown>;
  object.visible = {value: 4};Object.defineProperty(object, 'hidden', {value: hidden});object[Symbol('private')] = symbol;
  freezePlan(object);
  expect(Object.isFrozen(object.visible)).toBe(true);expect(Object.isFrozen(inherited)).toBe(false);expect(Object.isFrozen(hidden)).toBe(false);expect(Object.isFrozen(symbol)).toBe(false);
});
