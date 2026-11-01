import {describe, expect, it} from 'vitest';
import {planTimeline, MAX_TIMELINE_LABELS, MAX_TIMELINE_POINTS} from '../../src/plan/timeline.js';
import type {PlanOptions} from '../../src/public/plan-types.js';
import type {PlanTimelineResult, PlanTimelineSpec} from '../../src/public/timeline-plan-types.js';

const options = {width: 390, height: 300} satisfies PlanOptions;
const spec = (): PlanTimelineSpec => ({family: 'timeline', title: 'Measured events', axes: {x: {kind: 'time', domain: [0, 1000]}},
  series: [{id: 's', name: 'Releases', data: [{id: 'late', x: 1000, title: 'Later'}, {id: 'epoch', x: 0, title: 'Epoch'}, {id: 'unknown', x: null, title: 'Unscheduled'}]}]});
const frame = (result: PlanTimelineResult) => {
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic));
  return result.frame;
};
const unsafe = (input: unknown) => input as PlanTimelineSpec;

describe('Timeline event semantics and real geometry', () => {
  it('uses original event coordinates while preserving source order and Unix zero', () => {
    const result = frame(planTimeline(spec(), options));
    expect(result.observations.map(point => point.id.pointId)).toEqual(['late', 'epoch']);
    expect(result.observations.map(point => point.value)).toEqual([1000, 0]);
    expect(result.observations[0]!.x).toBeGreaterThan(result.observations[1]!.x);
    expect(result.observations[1]!.event).toEqual({kind: 'time', coordinate: 0, title: 'Epoch'});
    expect(result.series[0]!.circles?.map(point => point.pointId)).toEqual(['late', 'epoch']);
  });
  it('retains missing-coordinate events without fabricating a dated observation', () => {
    const result = frame(planTimeline(spec(), options));
    expect(result.events).toHaveLength(3);
    expect(result.events[2]).toMatchObject({x: null, missing: true, title: 'Unscheduled'});
    expect(result.observations.some(point => point.id.pointId === 'unknown')).toBe(false);
    const data = spec();
    expect(planTimeline({...data, series: [{...data.series[0]!, data: [data.series[0]!.data[2]!]}]}, options).status).toBe('empty');
  });
  it('retains distinct simultaneous events with coherent shared-tooltip group metadata', () => {
    const data = spec();
    const result = frame(planTimeline({...data, series: [{...data.series[0]!, data: [
      {id: 'a', x: 200, title: 'First title'}, {id: 'b', x: 200, title: 'Different title'},
    ]}]}, options));
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]!.group).toEqual(result.observations[1]!.group);
    expect(result.observations.map(point => point.label)).toEqual(['First title', 'Different title']);
    expect(result.series[0]!.circles).toHaveLength(2);
  });
  it('keeps full long source text and descriptions even when a label is shortened', () => {
    const data = spec(), title = '📈測定結果'.repeat(30), description = 'An exact source description. '.repeat(30);
    const result = frame(planTimeline({...data, series: [{...data.series[0]!, data: [{id: 'long', x: 500, title, description}]}]}, options));
    expect(result.annotations![0]!.text.length).toBeLessThan(title.length);
    expect(result.observations[0]!.event).toMatchObject({title, description});
    expect(result.events[0]!.title).toBe(title);
  });
  it('bounds label boxes and omits collisions without dropping data', () => {
    const data = spec();
    const result = frame(planTimeline({...data, series: [{...data.series[0]!, data: Array.from({length: 20}, (_, index) => ({id: 'e' + index, x: 500, title: 'Long simultaneous event ' + index}))}]}, options));
    expect(result.observations).toHaveLength(20);
    expect(result.annotations!.length).toBeLessThan(20);
    for (const label of result.annotations!) {
      expect(label.x - label.box!.width / 2).toBeGreaterThanOrEqual(24);
      expect(label.x + label.box!.width / 2).toBeLessThanOrEqual(378);
      expect(label.y - label.box!.height / 2).toBeGreaterThanOrEqual(18);
      expect(label.y + label.box!.height / 2).toBeLessThanOrEqual(256);
    }
    const boxes = result.annotations!;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      const overlap = Math.abs(a.x - b.x) < (a.box!.width + b.box!.width) / 2 && Math.abs(a.y - b.y) < (a.box!.height + b.box!.height) / 2;
      expect(overlap).toBe(false);
    }
  });
  it('caps rendered labels while retaining dense source events and markers', () => {
    const data = spec();
    const result = frame(planTimeline({...data, axes: {x: {kind: 'linear', domain: [0, MAX_TIMELINE_POINTS]}}, series: [{id: 's', name: 's', data: Array.from({length: MAX_TIMELINE_POINTS}, (_, x) => ({id: 'e' + x, x, title: 'Event ' + x}))}]}, {width: 10000, height: 1000}));
    expect(result.observations).toHaveLength(MAX_TIMELINE_POINTS);
    expect(result.series[0]!.circles).toHaveLength(MAX_TIMELINE_POINTS);
    expect(result.annotations!.length).toBeLessThanOrEqual(MAX_TIMELINE_LABELS);
  });
  it('changes label position without moving semantic event coordinates', () => {
    const data = spec(), input = {...data, series: [{...data.series[0]!, data: [{id: 'e', x: 500, title: 'Event'}]}]};
    const above = frame(planTimeline({...input, labelPosition: 'above'}, options));
    const below = frame(planTimeline({...input, labelPosition: 'below'}, options));
    expect(above.observations).toEqual(below.observations);
    expect(above.annotations![0]!.y).toBeLessThan(above.observations[0]!.y);
    expect(below.annotations![0]!.y).toBeGreaterThan(below.observations[0]!.y);
    expect(frame(planTimeline({...input, labelPosition: 'above'}, options))).toEqual(above);
  });
  it('clips viewport markers without discarding source events or rewriting timestamps', () => {
    const data = spec(), input = {...data, series: [{...data.series[0]!, data: [{id: 'before', x: 100, title: 'Before'}, {id: 'inside', x: 500, title: 'Inside'}, {id: 'after', x: 900, title: 'After'}]}]};
    const result = frame(planTimeline(input, {...options, viewport: {axes: 'x', value: {x: [400, 600]}}}));
    expect(result.events).toHaveLength(3);
    expect(result.observations.map(point => point.id.pointId)).toEqual(['inside']);
    expect(result.observations[0]!.xValue).toBe(500);
    expect(result.viewport!.displayed.x).toEqual([400, 600]);
    expect(result.viewport!.bounds.y.kind).toBe('category');
  });
  it('supports reversed numeric axes without reversing original observations', () => {
    const data = spec();
    const result = frame(planTimeline({...data, axes: {x: {kind: 'linear', domain: [0, 1000], reversed: true, unit: 'm'}}}, options));
    expect(result.observations.map(point => point.id.pointId)).toEqual(['late', 'epoch']);
    expect(result.observations[0]!.x).toBeLessThan(result.observations[1]!.x);
    expect(result.unit).toBe('m');
  });
  it('uses genuine series rows and recomputes their layout after hide/restore', () => {
    const data = spec(), first = data.series[0]!;
    const input = {...data, series: [first, {...first, id: 'other', name: 'Other'}]};
    const both = frame(planTimeline(input, options));
    expect(both.yLabels?.map(label => label.id)).toEqual(['s', 'other']);
    expect(both.observations[0]!.y).not.toBe(both.observations[2]!.y);
    const hidden = frame(planTimeline(input, {...options, hiddenSeriesIds: ['s']}));
    expect(hidden.series[0]!.color).toBe(both.series[1]!.color);
    expect(hidden.events.filter(event => event.id.seriesId === 's').every(event => !event.visible)).toBe(true);
    expect(frame(planTimeline(input, options))).toEqual(both);
  });
  it('projects X reference lines and explicitly rejects Y references', () => {
    const result = frame(planTimeline(spec(), {...options, references: [{id: 'release', axis: 'x', value: 500}, {id: 'future', axis: 'x', value: 2000}]}));
    expect(result.references?.map(reference => reference.status)).toEqual(['visible', 'outside']);
    expect(planTimeline(spec(), {...options, references: [{id: 'y', axis: 'y', value: 1}]}).status).toBe('invalid');
  });
  it('owns source descriptions and keeps identity when an event moves', () => {
    const data = spec(), first = frame(planTimeline(data, options));
    const updated = {...data, series: [{...data.series[0]!, data: [{...data.series[0]!.data[1]!, x: 50}]}]};
    const next = frame(planTimeline(updated, options));
    expect(next.observations[0]!.id).toEqual(first.observations[1]!.id);
    expect(next.observations[0]!.event.coordinate).toBe(50);
    expect(first.events[1]!.x).toBe(0);
    expect(Object.isFrozen(first.events[0]!.id)).toBe(true);
  });
  it('has explicit all-hidden and empty source states', () => {
    expect(planTimeline(spec(), {...options, hiddenSeriesIds: ['s']}).status).toBe('empty');
    expect(planTimeline({...spec(), series: []}, options).status).toBe('empty');
  });
});

describe('Timeline strict runtime boundaries', () => {
  it('rejects duplicate series and per-series event IDs', () => {
    const data = spec(), source = data.series[0]!;
    expect(planTimeline({...data, series: [source, source]}, options).status).toBe('invalid');
    expect(planTimeline({...data, series: [{...source, data: [source.data[0]!, source.data[0]!]}]}, options).status).toBe('invalid');
  });
  it('validates bad coordinates before applying legend visibility', () => {
    const data = spec();
    for (const x of [NaN, Infinity, 1.5, 8_640_000_000_000_001, '2026-01-01']) {
      const result = planTimeline(unsafe({...data, series: [{id: 's', name: 's', data: [{id: 'bad', x, title: 'Invalid'}]}]}), {...options, hiddenSeriesIds: ['s']});
      expect(result.status).toBe('invalid');
    }
  });
  it('rejects unknown fields and incompatible stacking or Y viewport contracts', () => {
    expect(planTimeline(unsafe({...spec(), unsupported: true}), options).status).toBe('invalid');
    expect(planTimeline(spec(), {...options, stacking: 'sum'}).status).toBe('invalid');
    expect(planTimeline(spec(), {...options, viewport: {axes: 'xy'}}).status).toBe('invalid');
    expect(planTimeline(spec(), {...options, hiddenSeriesIds: ['absent']}).status).toBe('invalid');
    expect(planTimeline({...spec(), markerRadius: -1}, options).status).toBe('invalid');
    expect(planTimeline({...spec(), labelMaxWidth: 0}, options).status).toBe('invalid');
  });
  it('enforces combined event and series limits', () => {
    const data = spec();
    expect(planTimeline({...data, series: [{id: 's', name: 's', data: Array.from({length: MAX_TIMELINE_POINTS + 1}, (_, x) => ({id: 'e' + x, x, title: 'Event'}))}]}, options).status).toBe('invalid');
    expect(planTimeline({...data, series: Array.from({length: 17}, (_, i) => ({id: 's' + i, name: 'Series', data: []}))}, options).status).toBe('invalid');
  });
});
