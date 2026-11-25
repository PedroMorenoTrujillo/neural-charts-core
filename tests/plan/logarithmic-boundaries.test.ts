import { describe, expect, it } from 'vitest';
import { planChart, transformPlanViewport } from '../../src/plan.js';
import type { PlanOptions, PlanSpec, PlanViewportState } from '../../src/plan.js';
import { checkedLogDomain, logDistance, logDomain, logTicks, logValue } from '../../src/plan/log-scale.js';
import { planLogarithmic } from '../../src/plan/logarithmic.js';
import { prepareLogScatter } from '../../src/plan/log-scatter-source.js';

describe('logarithmic scatter input ownership', () => {
  const options: PlanOptions = {width: 380, height: 280, scales: {y: {type: 'log'}}};
  const axes = {x: {type: 'linear', domain: [1, 10]}, y: {type: 'linear', domain: [1, 100]}} as const;
  const point = {id: 'original', x: 2, y: 10, z: 0};
  const source = {family: 'bubble', title: 'Rate', description: 'Original measures', axes, series: [{id: 's', name: 'Source', data: [point]}]} as const;

  it('keeps zero and default point identity while rejecting malformed optional fields', () => {
    const result = planChart(source, options);
    if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
    expect(result.frame).toMatchObject({description: 'Original measures',
      observations: [{id: {seriesId: 's', pointId: 'original'}, label: 'original', value: 10}]});
    for (const [extra, reason, path] of [
      [{z: -1}, 'BAD_BUBBLE_SIZE', 'series.data.z'],
      [{z: 'high'}, 'BAD_BUBBLE_SIZE', 'series.data.z'],
      [{label: 0}, 'BAD_BUBBLE_LABEL', 'series.data.label'],
      [{label: 'x'.repeat(201)}, 'BAD_BUBBLE_LABEL', 'series.data.label'],
      [{size: 10}, 'UNKNOWN_OPTION', 'series.data'],
    ] as const) {
      const spec = {...source, series: [{...source.series[0], data: [{...point, ...extra}]}]} as unknown as PlanSpec;
      expect(planLogarithmic(spec, options, prepareLogScatter)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
    }
  });

  it('rejects unknown fields at the original series and propagates scatter identity diagnostics', () => {
    const cases = [
      [{...source.series[0], axis: 2}, 'UNKNOWN_OPTION', 'series'],
      [{...source.series[0], data: [point, {...point, x: 4}]}, 'DUPLICATE_POINT_ID', 'series[0].data[1].id'],
    ] as const;
    for (const [series, reason, path] of cases) {
      expect(planLogarithmic({...source, series: [series]}, options, prepareLogScatter)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
    }
  });
});

describe('original units in finite logarithmic scales', () => {
  it.each([0, -1, Infinity, NaN])('rejects nonpositive or nonfinite endpoints (%s)', endpoint => {
    expect(() => logDistance(1, endpoint)).toThrow('NONPOSITIVE_LOG_VALUE');
    expect(() => logDistance(endpoint, 1)).toThrow('NONPOSITIVE_LOG_VALUE');
    expect(() => logDomain([endpoint], undefined, false)).toThrow('NONPOSITIVE_LOG_VALUE');
  });

  it.each([undefined, null, [1], [1, 10, 100], [1, Infinity], [1, '10'], [1, 1], [10, 1]])(
    'rejects malformed, unordered or nonfinite domains (case %#)', domain => {
      expect(() => checkedLogDomain(domain)).toThrow('BAD_LOG_DOMAIN');
    },
  );

  it('keeps outer decades only when representable and does not infer an empty domain', () => {
    expect(logDomain([], undefined, true)).toBeNull();
    expect(logDomain([7, 90, 800], undefined, true)).toEqual([1, 1000]);
    expect(logDomain([Number.MIN_VALUE, 10], undefined, true)).toEqual([Number.MIN_VALUE, 10]);
    expect(logDomain([1, Number.MAX_VALUE], undefined, true)).toEqual([1, Number.MAX_VALUE]);
    expect(logDomain([1, 1000], [5, 30], true)).toEqual([5, 30]);
  });

  it('returns bounded distinct ticks for a single subnormal interval and for normal decades', () => {
    expect(logTicks([Number.MIN_VALUE, 2 * Number.MIN_VALUE], 12)).toEqual([Number.MIN_VALUE, 2 * Number.MIN_VALUE]);
    expect(logTicks([10, 1000], 4)).toEqual([10, 100, 1000]);
    const ticks = logTicks([2, 7], 4);
    expect(ticks[0]).toBe(2);
    expect(ticks.at(-1)).toBe(7);
    expect(ticks[1]! / ticks[0]!).toBeCloseTo(ticks[2]! / ticks[1]!);
  });

  it('fails rather than returning infinity or zero when decoding beyond the representable range', () => {
    expect(() => logValue(Number.MAX_VALUE, Math.log(2))).toThrow('UNREPRESENTABLE_LOG_VALUE');
    expect(() => logValue(Number.MIN_VALUE, Math.log(0.25))).toThrow('UNREPRESENTABLE_LOG_VALUE');
    expect(logValue(10, logDistance(10, 12))).toBeCloseTo(12);
  });
});

const first = Date.UTC(2026, 0, 1), day = 86_400_000;
const points = [1, 10, 100].map((value, index) => ({id: 'p' + index, x: first + index * day, y: value}));
const line = {
  family: 'line', title: 'Original decades', axes: { x: {type: 'time'}, y: {type: 'linear', domain: [1, 100]} },
  series: [{id: 's', name: 'Readings', data: points}],
} as const satisfies PlanSpec;
const size = {width: 480, height: 340, scales: {y: {type: 'log'}}} as const satisfies PlanOptions;
const viewport = {axes: 'xy', value: {x: [first + day, first + 2 * day], y: [10, 100]}} as const;

describe('log viewport data and adapter state', () => {
  it('scopes a timestamp X axis and logarithmic Y axis in original units together', () => {
    const frame = planChart(line, {...size, viewport});
    if (frame.status !== 'ok') throw Error(JSON.stringify(frame));
    expect(frame.frame.viewport?.displayed).toEqual(viewport.value);
    expect(frame.frame.observations.map(point => [point.id.pointId, point.value])).toEqual([['p1', 10], ['p2', 100]]);
    expect(frame.frame.labels.length).toBeGreaterThan(1);
    expect(frame.frame.labels.every(tick => String(tick.label).includes('2026'))).toBe(true);
    const shifted = transformPlanViewport(frame.frame.viewport!, {type: 'transform', factor: 2, anchor: {x: 0, y: 0}, delta: {y: 0.25}});
    if (shifted.status !== 'ok') throw Error(JSON.stringify(shifted));
    expect(shifted.value.x).toEqual([first + day, first + 1.5 * day]);
    expect(shifted.value.y![1] / shifted.value.y![0]).toBeCloseTo(Math.sqrt(10));
  });

  it('rejects stale displayed bounds without transforming or mutating the retained viewport', () => {
    const frame = planChart(line, {...size, viewport});
    if (frame.status !== 'ok' || !frame.frame.viewport) throw Error(JSON.stringify(frame));
    const state = frame.frame.viewport;
    for (const [y, value, message] of [
      [null, state.value, 'BAD_LOG_DOMAIN'],
      [[10, 90], state.value, 'INCONSISTENT_LOG_VIEWPORT'],
      [[9, 101], {...state.value, y: [9, 101]}, 'LOG_WINDOW_OUTSIDE_DOMAIN'],
      [[0, 50], state.value, 'BAD_LOG_DOMAIN'],
    ] as const) {
      const altered: PlanViewportState = {...state, value, displayed: {...state.displayed, y}};
      const before = structuredClone(altered);
      expect(transformPlanViewport(altered, {type: 'zoom', factor: 2})).toMatchObject({
        status: 'invalid', diagnostic: {reason: 'BAD_LOG_VIEWPORT', path: 'viewport', message},
      });
      expect(altered).toEqual(before);
    }
    expect(transformPlanViewport(state, {type: 'zoom', factor: 0})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_ZOOM', path: 'intent.factor'},
    });
  });

  it('retains legend identity for all-missing or hidden data and rejects unknown legend IDs', () => {
    const missing = {...line, series: [{...line.series[0], data: points.map(point => ({...point, y: null}))}]};
    expect(planChart(missing, size)).toMatchObject({
      status: 'empty', frame: {series: [], observations: [], legend: [expect.objectContaining({id: 's', visible: true})]},
    });
    expect(planChart(line, {...size, hiddenSeriesIds: ['s']})).toMatchObject({
      status: 'empty', frame: {series: [], observations: [], legend: [expect.objectContaining({id: 's', visible: false})]},
    });
    expect(planChart(line, {...size, hiddenSeriesIds: ['unknown']})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNKNOWN_SERIES', path: 'options.hiddenSeriesIds'},
    });
  });
});

describe('nonlogarithmic axes combined with a log axis', () => {
  const categories = [{id: 'a'}, {id: 'b', label: 'Kept B'}, {id: 'c'}, {id: 'd'}];
  const categorical = {...line, axes: {x: {type: 'category', values: categories}, y: {type: 'linear', nice: true}},
    series: [{...line.series[0], data: [2,5,20,80].map((y, index) => ({id: 'cat' + index, x: categories[index]!.id, y}))}],
  } as const satisfies PlanSpec;
  it('keeps categorical ticks and identity after cropping a positive nice logarithmic scale', () => {
    const full = planChart(categorical, {...size, viewport: {axes: 'xy'}});
    if (full.status !== 'ok') throw Error(JSON.stringify(full));
    expect(full.frame.viewport?.bounds.y).toMatchObject({type: 'log', domain: [1,100]});
    expect(full.frame.labels.map(tick => tick.label)).toEqual(['a','Kept B','c','d']);
    const current = planChart(categorical, {...size, viewport: {
      axes: 'xy', value: {x: {firstId: 'b', lastId: 'c'}, y: [2,50]},
    }, references: [{id: 'retained', axis: 'x', value: 'b'}]});
    if (current.status !== 'ok') throw Error(JSON.stringify(current));
    expect(current.frame.labels.map(tick => tick.label)).toEqual(['Kept B','c']);
    expect(current.frame.observations.map(point => [point.id.pointId, point.value])).toEqual([['cat1',5], ['cat2',20]]);
    expect(current.frame.references?.[0]).toMatchObject({status: 'visible', id: 'retained'});
  });

  it('returns an explicit adapter diagnostic for an incompatible family, source metadata or log mode', () => {
    const planned = (spec: unknown, options: unknown = size) => planLogarithmic(spec as PlanSpec, options as PlanOptions);
    const cases = [
      [{family: 'pie', title: 'Share', data: []}, size, 'UNSUPPORTED_LOG_FAMILY', 'options.scales'],
      [line, {...size, stacking: 'sum'}, 'INCOMPATIBLE_LOG_OPTION', 'options'],
      [line, {...size, stackGroups: []}, 'INCOMPATIBLE_LOG_OPTION', 'options'],
      [line, {...size, circular: {}}, 'INCOMPATIBLE_LOG_OPTION', 'options'],
      [{...line, margins: {}}, size, 'UNKNOWN_OPTION', 'spec'],
      [{...categorical, axes: {...categorical.axes, x: {...categorical.axes.x, values: Array.from({length: 65}, (_, i) => ({id: String(i)}))}}},
        size, 'LABEL_LIMIT', 'axes.x.values'],
      [{...line, series: [{...line.series[0], data: null}]}, size, 'INPUT_LIMIT', 'series'],
      [{family: 'scatter', title: 'Positive', axes: {x: {type: 'linear'}, y: {type: 'linear'}}, series: []},
        size, 'UNSUPPORTED_LOG_FAMILY', 'family'],
    ] as const;
    for (const [source, options, reason, path] of cases) {
      expect(planned(source, options)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
    }
  });
});
