import {describe, expect, it} from 'vitest';
import {planXRange, MAX_XRANGE_POINTS, MAX_XRANGE_ROWS} from '../../src/plan/xrange.js';
import {transformPlanViewport} from '../../src/plan/viewport.js';
import type {PlanOptions} from '../../src/public/plan-types.js';
import type {PlanXRangeResult, PlanXRangeSpec} from '../../src/public/xrange-plan-types.js';

const options = {width: 390, height: 300} satisfies PlanOptions;
const spec = (): PlanXRangeSpec => ({family: 'xrange', title: 'Measured intervals',
  axes: {x: {kind: 'linear', domain: [0, 100]}, y: {kind: 'category', values: [{id: 'a', label: 'Row A'}, {id: 'b', label: 'Row B'}]}},
  series: [{id: 's', name: 'Actual', data: [{id: 'p', rowId: 'a', start: 20, end: 40}, {id: 'q', rowId: 'b', start: 60, end: 80}]}]});
const frame = (result: PlanXRangeResult) => {
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic));
  return result.frame;
};
const unsafe = (input: unknown) => input as PlanXRangeSpec;

describe('X-range source intervals and geometry', () => {
  it('projects independent start/end values rather than cumulative columns', () => {
    const result = frame(planXRange(spec(), options)), [a, b] = result.series[0]!.bars!;
    expect(a!.width).toBeCloseTo(b!.width);
    expect(b!.x - a!.x).toBeCloseTo(a!.width * 2);
    expect(result.observations.map(point => point.value)).toEqual([20, 20]);
    expect(result.observations[0]!.interval).toMatchObject({start: 20, end: 40, rowId: 'a', duration: 20});
    expect(result.yLabels?.map(row => row.label)).toEqual(['Row A', 'Row B']);
  });
  it('fills progress inside the original contour and keeps a full interval hit region', () => {
    const data = spec();
    const progress = {...data, series: [{...data.series[0]!, data: [{...data.series[0]!.data[0]!, completed: .5}]}]};
    const full = frame(planXRange(data, options)), half = frame(planXRange(progress, options));
    expect(half.series[0]!.bars![0]!.width).toBeCloseTo(full.series[0]!.bars![0]!.width / 2);
    expect(half.series[0]!.commands).toEqual(full.series[0]!.commands!.slice(0, 5));
    expect(half.observations[0]!.hit).toEqual(full.observations[0]!.hit);
    expect(half.observations[0]!.interval.completed).toBe(.5);
  });
  it('distinguishes zero and unknown progress without assigning a false completion', () => {
    for (const completed of [0, null] as const) {
      const data = spec(), point = {...data.series[0]!.data[0]!, completed};
      const result = frame(planXRange({...data, series: [{...data.series[0]!, data: [point]}]}, options));
      expect(result.series[0]!.bars).toHaveLength(0);
      expect(result.series[0]!.commands).toHaveLength(5);
      expect(result.observations[0]!.interval.completed).toBe(completed);
    }
  });
  it('preserves missing endpoints as source summaries without fabricated observations', () => {
    const data = spec();
    const result = frame(planXRange({...data, series: [{...data.series[0]!, data: [
      {id: 'missing-start', rowId: 'a', start: null, end: 40},
      {id: 'missing-end', rowId: 'b', start: 20, end: null},
    ]}]}, options));
    expect(result.observations).toHaveLength(0);
    expect(result.intervals.map(point => [point.start, point.end, point.duration, point.missing])).toEqual([[null, 40, null, true], [20, null, null, true]]);
  });
  it('represents a zero-duration interval at its actual coordinate with a separate hit target', () => {
    const data = spec();
    const result = frame(planXRange({...data, series: [{...data.series[0]!, data: [{id: 'zero', rowId: 'a', start: 0, end: 0}]}]}, options));
    expect(result.series[0]!.bars).toHaveLength(0);
    expect(result.series[0]!.circles).toHaveLength(1);
    expect(result.observations[0]!.interval.duration).toBe(0);
    expect(result.observations[0]!.xValue).toBe(0);
    expect(result.observations[0]!.hit?.kind).toBe('polygon');
  });
  it('clips intervals and completion against the window without changing source endpoints', () => {
    const data = spec();
    const input = {...data, series: [{...data.series[0]!, data: [{id: 'long', rowId: 'a', start: 0, end: 100, completed: .25}]}]};
    const result = frame(planXRange(input, {...options, viewport: {axes: 'x', value: {x: [50, 100]}}}));
    expect(result.series[0]!.bars).toHaveLength(0);
    expect(result.series[0]!.commands).toHaveLength(5);
    expect(result.observations[0]!.interval).toMatchObject({start: 0, end: 100, duration: 100, completed: .25});
    expect(result.viewport!.bounds.y.kind).toBe('category');
    expect(result.viewport!.displayed.x).toEqual([50, 100]);
    expect(transformPlanViewport(result.viewport!, {kind: 'zoom', factor: 2}).status).toBe('ok');
  });
  it('preserves progress direction when the X axis is reversed', () => {
    const data = spec(), point = {...data.series[0]!.data[0]!, completed: .5};
    const normal = frame(planXRange({...data, series: [{...data.series[0]!, data: [point]}]}, options));
    const reversed = frame(planXRange({...data, axes: {...data.axes, x: {...data.axes.x, reversed: true}}, series: [{...data.series[0]!, data: [point]}]}, options));
    expect(reversed.series[0]!.bars![0]!.width).toBeCloseTo(normal.series[0]!.bars![0]!.width);
    const command = reversed.series[0]!.commands![0]!;
    if (command.kind !== 'M') throw new Error('Expected interval contour');
    expect(reversed.series[0]!.bars![0]!.x).toBeGreaterThan(command.x);
  });
  it('groups series in separate row lanes and recomputes lanes after hide/restore', () => {
    const data = spec(), first = data.series[0]!;
    const input = {...data, series: [first, {...first, id: 'other', name: 'Other'}]};
    const both = frame(planXRange(input, options));
    expect(both.series[0]!.bars![0]!.y).not.toBe(both.series[1]!.bars![0]!.y);
    const hidden = frame(planXRange(input, {...options, hiddenSeriesIds: ['s']}));
    expect(hidden.series[0]!.bars![0]!.height).toBeGreaterThan(both.series[1]!.bars![0]!.height);
    expect(hidden.series[0]!.color).toBe(both.series[1]!.color);
    expect(frame(planXRange(input, options))).toEqual(both);
  });
  it('allows legitimate overlapping intervals and same point IDs in different series', () => {
    const data = spec(), first = data.series[0]!;
    const result = frame(planXRange({...data, grouping: 'overlap', series: [first, {...first, id: 'other', name: 'Other'}]}, options));
    expect(result.observations).toHaveLength(4);
    expect(result.series[0]!.bars![0]!.y).toBe(result.series[1]!.bars![0]!.y);
    expect(result.observations.map(point => point.id.seriesId)).toEqual(['s', 's', 'other', 'other']);
  });
  it('owns source summaries and preserves IDs across updates', () => {
    const data = structuredClone(spec());
    const first = frame(planXRange(data, options));
    const updated = {...data, series: [{...data.series[0]!, data: [{...data.series[0]!.data[0]!, start: 25, end: 45}]}]};
    const second = frame(planXRange(updated, options));
    expect(second.observations[0]!.id).toEqual(first.observations[0]!.id);
    expect(first.observations[0]!.interval.start).toBe(20);
    expect(second.observations[0]!.interval.start).toBe(25);
    expect(Object.isFrozen(first.intervals[0]!.id)).toBe(true);
  });
  it('keeps Unix zero as a timestamp and formats UTC labels', () => {
    const data = spec();
    const result = frame(planXRange({...data, axes: {...data.axes, x: {kind: 'time', domain: [0, 86_400_000]}}, series: [{...data.series[0]!, data: [{id: 'epoch', rowId: 'a', start: 0, end: 3_600_000}]}]}, options));
    expect(result.observations[0]!.interval.kind).toBe('time');
    expect(result.observations[0]!.interval.start).toBe(0);
    expect(result.unit).toBe('ms');
    expect(result.labels.length).toBeGreaterThan(0);
  });
  it('projects X references and rejects references on categorical rows', () => {
    const result = frame(planXRange(spec(), {...options, references: [{id: 'inside', axis: 'x', value: 50}, {id: 'outside', axis: 'x', value: 200}]}));
    expect(result.references?.map(reference => reference.status)).toEqual(['visible', 'outside']);
    expect(planXRange(spec(), {...options, references: [{id: 'row', axis: 'y', value: 1}]}).status).toBe('invalid');
  });
  it('has explicit empty/all-hidden states while retaining semantic source summaries', () => {
    const data = spec();
    const hidden = planXRange(data, {...options, hiddenSeriesIds: ['s']});
    expect(hidden.status).toBe('empty');
    expect(frame(hidden).intervals.every(point => !point.visible)).toBe(true);
    expect(planXRange({...data, axes: {...data.axes, y: {kind: 'category', values: []}}, series: []}, options).status).toBe('empty');
  });
  it('recomputes the numeric domain after hiding an extreme series', () => {
    const data = spec();
    const input: PlanXRangeSpec = {...data, axes: {...data.axes, x: {kind: 'linear'}}, series: [
      {id: 'big', name: 'Big', data: [{id: 'b', rowId: 'a', start: 1e308, end: 1.1e308}]},
      {id: 'small', name: 'Small', data: [{id: 's', rowId: 'a', start: 0, end: Number.MIN_VALUE}]},
    ]};
    const result = planXRange(input, {...options, hiddenSeriesIds: ['big']});
    expect(result.status).toBe('ok');
    expect(frame(result).series[0]!.bars![0]!.width).toBeGreaterThan(100);
    expect(frame(result).observations[0]!.value).toBe(Number.MIN_VALUE);
  });
});

describe('X-range strict runtime boundaries', () => {
  it('rejects duplicate row/series/point identities and unknown rows', () => {
    const data = spec(), first = data.series[0]!;
    for (const input of [
      {...data, axes: {...data.axes, y: {kind: 'category', values: [data.axes.y.values[0]!, data.axes.y.values[0]!]}}},
      {...data, series: [first, first]},
      {...data, series: [{...first, data: [first.data[0]!, first.data[0]!]}]},
      {...data, series: [{...first, data: [{...first.data[0]!, rowId: 'unknown'}]}]},
    ]) expect(planXRange(unsafe(input), options).status).toBe('invalid');
  });
  it('validates all source intervals even if their series is hidden', () => {
    const data = spec();
    for (const point of [
      {id: 'p', rowId: 'a', start: 40, end: 20},
      {id: 'p', rowId: 'a', start: NaN, end: 20},
      {id: 'p', rowId: 'a', start: -1e308, end: 1e308},
      {id: 'p', rowId: 'a', start: 0, end: 20, completed: 1.1},
    ]) expect(planXRange(unsafe({...data, series: [{...data.series[0]!, data: [point]}]}), {...options, hiddenSeriesIds: ['s']}).status).toBe('invalid');
  });
  it('rejects invalid timestamps, unknown fields, incompatible stacking and Y zoom', () => {
    const data = spec();
    expect(planXRange(unsafe({...data, axes: {...data.axes, x: {kind: 'time'}}, series: [{...data.series[0]!, data: [{id: 'p', rowId: 'a', start: .5, end: 2}]}]}), options).status).toBe('invalid');
    expect(planXRange(unsafe({...data, unsupported: true}), options).status).toBe('invalid');
    expect(planXRange(data, {...options, stacking: 'sum'}).status).toBe('invalid');
    expect(planXRange(data, {...options, viewport: {axes: 'xy'}}).status).toBe('invalid');
    expect(planXRange(data, {...options, hiddenSeriesIds: ['absent']}).status).toBe('invalid');
  });
  it('enforces combined source, row and series budgets before creating geometry', () => {
    const data = spec();
    expect(planXRange({...data, series: [{id: 's', name: 's', data: Array.from({length: MAX_XRANGE_POINTS + 1}, (_, i) => ({id: 'p' + i, rowId: 'a', start: i, end: i + 1}))}]}, options).status).toBe('invalid');
    expect(planXRange({...data, axes: {...data.axes, y: {kind: 'category', values: Array.from({length: MAX_XRANGE_ROWS + 1}, (_, i) => ({id: 'r' + i, label: 'Row'}))}}}, options).status).toBe('invalid');
    expect(planXRange({...data, series: Array.from({length: 17}, (_, i) => ({id: 's' + i, name: 'Series', data: []}))}, options).status).toBe('invalid');
  });
});
